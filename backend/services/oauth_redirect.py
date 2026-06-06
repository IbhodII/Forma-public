# -*- coding: utf-8 -*-
"""Redirect URI для OAuth (Yandex / Google) — единая логика и диагностика."""
from __future__ import annotations

import ipaddress
import os
from dataclasses import dataclass, field
from typing import Any, Literal
from urllib.parse import quote, urlparse

Provider = Literal["yandex", "google"]
RedirectSource = Literal["env", "public_base", "request", "none"]

YANDEX_CALLBACK_PATH = "/api/cloud/callback/yandex"
GOOGLE_CALLBACK_PATH = "/api/cloud/callback/google"

_CALLBACK_PATHS: dict[Provider, str] = {
    "yandex": YANDEX_CALLBACK_PATH,
    "google": GOOGLE_CALLBACK_PATH,
}

_ENV_REDIRECT_KEYS: dict[Provider, str] = {
    "yandex": "YANDEX_REDIRECT_URI",
    "google": "GOOGLE_REDIRECT_URI",
}

_ENV_CLIENT_ID_KEYS: dict[Provider, str] = {
    "yandex": "YANDEX_CLIENT_ID",
    "google": "GOOGLE_CLIENT_ID",
}

_ENV_CLIENT_SECRET_KEYS: dict[Provider, str] = {
    "yandex": "YANDEX_CLIENT_SECRET",
    "google": "GOOGLE_CLIENT_SECRET",
}

_AUTH_URL_BASE: dict[Provider, str] = {
    "yandex": "https://oauth.yandex.ru/authorize",
    "google": "https://accounts.google.com/o/oauth2/auth",
}


def _load_env() -> None:
    from backend.core.env import load_project_env

    load_project_env()


def _is_allowed_oauth_host(hostname: str | None) -> bool:
    if not hostname:
        return False
    host = hostname.lower()
    if host in ("localhost", "127.0.0.1", "::1"):
        return True
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback


def normalize_redirect_base(redirect_base: str | None) -> str | None:
    if not redirect_base:
        return None
    raw = redirect_base.strip().rstrip("/")
    if not raw:
        return None
    if not raw.startswith(("http://", "https://")):
        raw = f"http://{raw}"
    parsed = urlparse(raw)
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return None
    if not _is_allowed_oauth_host(parsed.hostname):
        return None
    return f"{parsed.scheme}://{parsed.netloc}"


def _origin_from_request_base(request_base: str | None) -> str | None:
    if not request_base:
        return None
    return normalize_redirect_base(request_base.rstrip("/"))


def resolve_api_origin(
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> str | None:
    """Базовый origin API (scheme + host + port) без пути."""
    return (
        normalize_redirect_base(redirect_base_query)
        or _origin_from_request_base(request_base)
    )


def _env_redirect_uri(provider: Provider) -> str:
    _load_env()
    return os.getenv(_ENV_REDIRECT_KEYS[provider], "").strip()


def _public_api_base() -> str:
    _load_env()
    return os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/")


def _callback_path(provider: Provider) -> str:
    return _CALLBACK_PATHS[provider]


def _build_callback_uri(origin: str, provider: Provider) -> str:
    return f"{origin.rstrip('/')}{_callback_path(provider)}"


def _parse_origin_port(origin: str | None) -> int | None:
    if not origin:
        return None
    parsed = urlparse(origin if "://" in origin else f"http://{origin}")
    if parsed.port is not None:
        return parsed.port
    if parsed.scheme == "https":
        return 443
    return 80


@dataclass
class RedirectResolution:
    redirect_uri: str
    source: RedirectSource
    warnings: list[str] = field(default_factory=list)


def resolve_redirect_uri(
    provider: Provider,
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> RedirectResolution:
    """
    Приоритет redirect URI:
    1. YANDEX_REDIRECT_URI / GOOGLE_REDIRECT_URI из .env
    2. PUBLIC_API_BASE_URL + callback path
    3. redirect_base query или request.base_url
    """
    warnings: list[str] = []
    env_uri = _env_redirect_uri(provider)
    public_base = _public_api_base()
    request_origin = resolve_api_origin(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )

    if env_uri and request_origin:
        request_uri = _build_callback_uri(request_origin, provider)
        env_port = _parse_origin_port(env_uri)
        req_port = _parse_origin_port(request_origin)
        if env_port != req_port:
            warnings.append(
                f"{_ENV_REDIRECT_KEYS[provider]} в .env использует порт {env_port}, "
                f"текущий API — {req_port}; используется runtime redirect"
            )
            return RedirectResolution(
                redirect_uri=request_uri,
                source="request",
                warnings=warnings,
            )
        if request_uri != env_uri:
            warnings.append(
                f"Redirect из .env ({env_uri}) отличается от текущего запроса "
                f"({request_uri})"
            )

    if env_uri:
        return RedirectResolution(
            redirect_uri=env_uri,
            source="env",
            warnings=warnings,
        )

    if public_base:
        origin = normalize_redirect_base(public_base)
        if origin:
            return RedirectResolution(
                redirect_uri=_build_callback_uri(origin, provider),
                source="public_base",
                warnings=warnings,
            )

    if request_origin:
        return RedirectResolution(
            redirect_uri=_build_callback_uri(request_origin, provider),
            source="request",
            warnings=warnings,
        )

    warnings.append(
        f"Redirect URI для {provider} не задан: укажите {_ENV_REDIRECT_KEYS[provider]} "
        "или PUBLIC_API_BASE_URL в .env"
    )
    return RedirectResolution(redirect_uri="", source="none", warnings=warnings)


def resolve_yandex_callback_uri(
    redirect_base: str | None = None,
    *,
    request_base: str | None = None,
) -> str:
    """Обратная совместимость: только redirect URI строкой."""
    resolution = resolve_redirect_uri(
        "yandex",
        redirect_base_query=redirect_base,
        request_base=request_base or redirect_base,
    )
    return resolution.redirect_uri


def resolve_google_callback_uri(
    redirect_base: str | None = None,
    *,
    request_base: str | None = None,
) -> str:
    """Обратная совместимость: только redirect URI строкой."""
    resolution = resolve_redirect_uri(
        "google",
        redirect_base_query=redirect_base,
        request_base=request_base or redirect_base,
    )
    return resolution.redirect_uri


def mask_client_id(client_id: str) -> str:
    cid = (client_id or "").strip()
    if len(cid) <= 8:
        return "…" if cid else ""
    return f"{cid[:4]}…{cid[-4:]}"


def mask_auth_url_preview(
    provider: Provider,
    *,
    client_id: str,
    redirect_uri: str,
) -> str:
    cid = mask_client_id(client_id)
    encoded_redirect = quote(redirect_uri, safe="")
    base = _AUTH_URL_BASE[provider]
    return f"{base}?client_id={cid}&redirect_uri={encoded_redirect}&…"


def _provider_env_status(provider: Provider) -> dict[str, Any]:
    _load_env()
    client_id = os.getenv(_ENV_CLIENT_ID_KEYS[provider], "").strip()
    client_secret = os.getenv(_ENV_CLIENT_SECRET_KEYS[provider], "").strip()
    env_redirect = _env_redirect_uri(provider)
    from backend.core.env import yandex_oauth_configured, google_oauth_configured

    configured = (
        yandex_oauth_configured() if provider == "yandex" else google_oauth_configured()
    )
    return {
        "configured": configured,
        "client_id_present": bool(client_id),
        "client_secret_present": bool(client_secret),
        "client_id_preview": mask_client_id(client_id),
        "env_redirect_uri": env_redirect or None,
    }


def _alternate_redirect_uris() -> list[str]:
    origins = [
        "http://127.0.0.1:8000",
        "http://127.0.0.1:8002",
        "http://localhost:8000",
        "http://localhost:8002",
    ]
    public_base = _public_api_base()
    if public_base:
        origin = normalize_redirect_base(public_base)
        if origin and origin not in origins:
            origins.insert(0, origin)
    uris: list[str] = []
    for origin in origins:
        uris.append(_build_callback_uri(origin, "yandex"))
        uris.append(_build_callback_uri(origin, "google"))
    # dedupe preserving order
    seen: set[str] = set()
    out: list[str] = []
    for uri in uris:
        if uri not in seen:
            seen.add(uri)
            out.append(uri)
    return out


def _runtime_mode(
    *,
    redirect_base_query: str | None,
    request_base: str | None,
    api_origin: str | None,
) -> str:
    if redirect_base_query:
        return "explicit"
    if api_origin and ":8002" in api_origin:
        return "forma_desktop"
    if api_origin and ":8000" in api_origin:
        return "dev_browser"
    return "unknown"


def build_oauth_debug_snapshot(
    *,
    redirect_base_query: str | None = None,
    request_base: str | None = None,
) -> dict[str, Any]:
    """Снимок OAuth-конфигурации для GET /api/cloud/oauth-debug."""
    from backend.core.env import load_project_env

    env_path = load_project_env()
    api_origin = resolve_api_origin(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )
    api_base_url = api_origin or _public_api_base() or None

    all_warnings: list[str] = []
    providers_out: dict[str, Any] = {}

    for provider in ("yandex", "google"):
        resolution = resolve_redirect_uri(
            provider,
            redirect_base_query=redirect_base_query,
            request_base=request_base,
        )
        env_status = _provider_env_status(provider)
        client_id = os.getenv(_ENV_CLIENT_ID_KEYS[provider], "").strip()
        all_warnings.extend(resolution.warnings)

        providers_out[provider] = {
            **env_status,
            "callback_path": _callback_path(provider),
            "redirect_uri": resolution.redirect_uri or None,
            "redirect_source": resolution.source,
            "auth_url_preview": (
                mask_auth_url_preview(
                    provider,
                    client_id=client_id,
                    redirect_uri=resolution.redirect_uri,
                )
                if resolution.redirect_uri and client_id
                else None
            ),
        }

    all_warnings.append(
        "127.0.0.1 и localhost — разные хосты для OAuth; регистрируйте точный URI из блока выше"
    )
    if not providers_out["google"]["client_id_present"]:
        all_warnings.append("GOOGLE_CLIENT_ID не задан в .env")
    if not providers_out["yandex"]["client_id_present"]:
        all_warnings.append("YANDEX_CLIENT_ID не задан в .env")

    from backend.services.polar_oauth_service import build_polar_oauth_debug

    polar_debug = build_polar_oauth_debug(
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )
    all_warnings.extend(polar_debug.get("warnings") or [])
    if polar_debug.get("legacy_redirect_ignored"):
        all_warnings.append(
            "POLAR_REDIRECT_URI (legacy CLI) игнорирован — используйте POLAR_API_REDIRECT_URI"
        )
    if not polar_debug.get("client_id_present"):
        all_warnings.append("POLAR_CLIENT_ID не задан в .env")

    seen_w: set[str] = set()
    unique_warnings: list[str] = []
    for w in all_warnings:
        if w not in seen_w:
            seen_w.add(w)
            unique_warnings.append(w)

    return {
        "api_base_url": api_base_url,
        "runtime_mode": _runtime_mode(
            redirect_base_query=redirect_base_query,
            request_base=request_base,
            api_origin=api_origin,
        ),
        "env_file_loaded": env_path is not None,
        "env_file_path": str(env_path) if env_path else None,
        "public_api_base_url": _public_api_base() or None,
        "yandex": providers_out["yandex"],
        "google": providers_out["google"],
        "polar": polar_debug,
        "alternate_redirect_uris": _alternate_redirect_uris(),
        "warnings": unique_warnings,
    }
