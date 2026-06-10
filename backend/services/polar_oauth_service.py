# -*- coding: utf-8 -*-
"""OAuth Polar Flow для локальных пользователей приложения."""
from __future__ import annotations

import logging
import os
import secrets
import time
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import urlparse

from backend.database.db_utils import get_current_user_id
from backend.services.oauth_redirect import normalize_redirect_base, resolve_api_origin
from backend.services.polar_token_service import (
    delete_polar_tokens,
    get_polar_token,
    is_polar_connected,
    save_polar_tokens,
)
from sync_polar import PolarAuth, register_polar_user

logger = logging.getLogger(__name__)

POLAR_CALLBACK_PATH = "/api/polar/callback"
POLAR_FALLBACK_REDIRECT = "http://127.0.0.1:8000/api/polar/callback"

PolarRedirectSource = Literal["env", "public_base", "request", "fallback", "none"]

_OAUTH_STATE: dict[str, tuple[int, float, str]] = {}
_STATE_TTL_SEC = 600


@dataclass
class PolarRedirectResolution:
    redirect_uri: str
    source: PolarRedirectSource
    env_redirect_uri: str | None = None
    legacy_redirect_ignored: bool = False
    warnings: list[str] = field(default_factory=list)


def _load_env() -> None:
    from backend.core.env import load_project_env

    load_project_env()


def _is_valid_api_polar_redirect(uri: str) -> bool:
    raw = (uri or "").strip()
    if not raw:
        return False
    try:
        parsed = urlparse(raw)
    except ValueError:
        return False
    path = (parsed.path or "").rstrip("/")
    return path.endswith("/api/polar/callback") or path == POLAR_CALLBACK_PATH.rstrip("/")


def _public_api_base() -> str:
    _load_env()
    return os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/")


def _parse_origin_port(origin: str | None) -> int | None:
    if not origin:
        return None
    parsed = urlparse(origin if "://" in origin else f"http://{origin}")
    if parsed.port is not None:
        return parsed.port
    if parsed.scheme == "https":
        return 443
    return 80


def _build_polar_callback(origin: str) -> str:
    return f"{origin.rstrip('/')}{POLAR_CALLBACK_PATH}"


def resolve_polar_redirect_uri(
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> PolarRedirectResolution:
    """Redirect URI для Polar OAuth с runtime override при несовпадении порта."""
    _load_env()
    warnings: list[str] = []
    legacy_ignored = False

    api_env = os.getenv("POLAR_API_REDIRECT_URI", "").strip()
    legacy_env = os.getenv("POLAR_REDIRECT_URI", "").strip()
    env_uri = api_env
    if not env_uri and legacy_env:
        if _is_valid_api_polar_redirect(legacy_env):
            env_uri = legacy_env
        else:
            legacy_ignored = True
            warnings.append(
                f"POLAR_REDIRECT_URI ({legacy_env}) игнорирован — "
                "нужен путь /api/polar/callback; задайте POLAR_API_REDIRECT_URI"
            )

    public_base = _public_api_base()
    request_origin = resolve_api_origin(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )

    if env_uri and request_origin:
        request_uri = _build_polar_callback(request_origin)
        if _parse_origin_port(env_uri) != _parse_origin_port(request_origin):
            warnings.append(
                f"POLAR redirect в .env использует порт {_parse_origin_port(env_uri)}, "
                f"текущий API — {_parse_origin_port(request_origin)}; "
                "используется runtime redirect"
            )
            return PolarRedirectResolution(
                redirect_uri=request_uri,
                source="request",
                env_redirect_uri=env_uri,
                legacy_redirect_ignored=legacy_ignored,
                warnings=warnings,
            )

    if env_uri:
        return PolarRedirectResolution(
            redirect_uri=env_uri,
            source="env",
            env_redirect_uri=env_uri,
            legacy_redirect_ignored=legacy_ignored,
            warnings=warnings,
        )

    if public_base:
        origin = normalize_redirect_base(public_base)
        if origin:
            return PolarRedirectResolution(
                redirect_uri=_build_polar_callback(origin),
                source="public_base",
                env_redirect_uri=legacy_env or None,
                legacy_redirect_ignored=legacy_ignored,
                warnings=warnings,
            )

    if request_origin:
        return PolarRedirectResolution(
            redirect_uri=_build_polar_callback(request_origin),
            source="request",
            env_redirect_uri=legacy_env or None,
            legacy_redirect_ignored=legacy_ignored,
            warnings=warnings,
        )

    warnings.append("Polar redirect URI не задан — используется fallback :8000")
    return PolarRedirectResolution(
        redirect_uri=POLAR_FALLBACK_REDIRECT,
        source="fallback",
        env_redirect_uri=legacy_env or None,
        legacy_redirect_ignored=legacy_ignored,
        warnings=warnings,
    )


def get_polar_redirect_uri(
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> str:
    return resolve_polar_redirect_uri(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    ).redirect_uri


def build_polar_oauth_debug(
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> dict[str, Any]:
    _load_env()
    resolution = resolve_polar_redirect_uri(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )
    client_id = os.getenv("POLAR_CLIENT_ID", "").strip()
    client_secret = os.getenv("POLAR_CLIENT_SECRET", "").strip()
    from backend.services.oauth_redirect import mask_client_id

    return {
        "configured": bool(client_id and client_secret),
        "client_id_present": bool(client_id),
        "client_secret_present": bool(client_secret),
        "setup_required": bool(client_id) and not bool(client_secret),
        "client_id_preview": mask_client_id(client_id) if client_id else None,
        "callback_path": POLAR_CALLBACK_PATH,
        "redirect_uri": resolution.redirect_uri or None,
        "redirect_source": resolution.source,
        "env_redirect_uri": resolution.env_redirect_uri,
        "legacy_redirect_ignored": resolution.legacy_redirect_ignored,
        "warnings": resolution.warnings,
    }


def _store_oauth_state(local_user_id: int, redirect_uri: str) -> str:
    state = secrets.token_urlsafe(32)
    _OAUTH_STATE[state] = (int(local_user_id), time.time() + _STATE_TTL_SEC, redirect_uri)
    return state


def _take_oauth_state(state: str | None) -> tuple[int | None, str | None]:
    if not state or state not in _OAUTH_STATE:
        return None, None
    user_id, expires, redirect_uri = _OAUTH_STATE.pop(state)
    if time.time() > expires:
        return None, None
    return user_id, redirect_uri


def get_authorization_url(
    local_user_id: int | None = None,
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> str:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    redirect_uri = get_polar_redirect_uri(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )
    auth = PolarAuth.from_env()
    auth.redirect_uri = redirect_uri
    state = _store_oauth_state(uid, redirect_uri)
    return auth.get_authorization_url(state_override=state)


def exchange_code_and_save(code: str, state: str | None) -> dict[str, Any]:
    local_user_id, redirect_uri = _take_oauth_state(state)
    if local_user_id is None:
        raise ValueError("Недействительный или просроченный state OAuth")

    auth = PolarAuth.from_env()
    auth.redirect_uri = redirect_uri or get_polar_redirect_uri()
    payload = auth.exchange_code_for_token(code)
    x_user_id = payload.get("x_user_id")
    if x_user_id is None:
        raise RuntimeError("Polar не вернул x_user_id в ответе token endpoint.")

    save_polar_tokens(
        local_user_id,
        access_token=str(payload["access_token"]),
        refresh_token=payload.get("refresh_token"),
        polar_user_id=str(x_user_id),
        expires_in=payload.get("expires_in"),
    )
    register_polar_user(str(payload["access_token"]), str(local_user_id))
    logger.info(
        "Polar OAuth: local_user_id=%s polar_user_id=%s redirect_uri=%s",
        local_user_id,
        x_user_id,
        auth.redirect_uri,
    )
    return {
        "local_user_id": local_user_id,
        "polar_user_id": str(x_user_id),
        "connected": True,
    }


def get_connection_status(local_user_id: int | None = None) -> dict[str, Any]:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    row = get_polar_token(uid)
    connected = is_polar_connected(uid)
    return {
        "connected": connected,
        "local_user_id": uid,
        "polar_user_id": row.get("polar_user_id") if row else None,
        "updated_at": row.get("updated_at") if row else None,
        "expires_at": row.get("expires_at") if row else None,
    }


def disconnect_polar(local_user_id: int | None = None) -> None:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    delete_polar_tokens(uid)
