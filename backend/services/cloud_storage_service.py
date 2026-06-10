# -*- coding: utf-8 -*-
"""OAuth и файловые операции Яндекс.Диска (yadisk AsyncClient)."""
from __future__ import annotations

import asyncio
import logging
import os
import threading
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Literal, Optional
from urllib.parse import urlencode

import requests

import yadisk
from yadisk import AsyncClient
from yadisk.exceptions import DirectoryExistsError

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.cloud_account_service import (
    STORAGE_YANDEX,
    delete_cloud_tokens_for_user,
    load_cloud_account_tokens,
    save_cloud_account_tokens,
)
from backend.services.yandex_disk_fs import ensure_yandex_dirs_sync

logger = logging.getLogger(__name__)

PROVIDER = "yandex"
# Только app-folder доступ к Яндекс.Диску — работает с приложениями, где включён
# доступ к папке приложения, без широких прав на весь диск.
# login:email / login:info добавляйте в YANDEX_EXTRA_SCOPES в .env, если включили в приложении.
YANDEX_DISK_SCOPES: tuple[str, ...] = (
    "cloud_api:disk.app_folder",
)
YANDEX_LOGIN_SCOPES: tuple[str, ...] = (
    "login:email",
    "login:info",
)
_TOKEN_EXPIRY_BUFFER = timedelta(seconds=60)
_YANDEX_TOKEN_URL = "https://oauth.yandex.ru/token"
_MAX_PENDING_YANDEX_OAUTH = 32
_PENDING_YANDEX_TTL_SEC = 600


def _parse_scope_list(raw: str) -> tuple[str, ...]:
    return tuple(s for s in raw.replace(",", " ").split() if s)


def yandex_oauth_mode() -> str:
    """disk (по умолчанию) или login — только если в oauth.yandex.ru нет прав Диска."""
    from backend.core.env import load_project_env

    load_project_env()
    mode = os.getenv("YANDEX_OAUTH_MODE", "disk").strip().lower()
    return mode if mode in ("disk", "login") else "disk"


def _effective_yandex_scopes() -> tuple[str, ...]:
    """
    Scope для authorize URL.

    - YANDEX_SCOPES — полная подмена (пробелы/запятые).
    - YANDEX_OAUTH_MODE=login — только login:* (без Диска; бэкап на Диск не заработает).
    - иначе cloud_api:disk.* + YANDEX_EXTRA_SCOPES (login:* опционально в консоли).
    """
    from backend.core.env import load_project_env

    load_project_env()
    override = os.getenv("YANDEX_SCOPES", "").strip()
    if override:
        return _parse_scope_list(override)
    if yandex_oauth_mode() == "login":
        extra_raw = os.getenv("YANDEX_EXTRA_SCOPES", "").strip()
        if extra_raw:
            return _parse_scope_list(extra_raw)
        return YANDEX_LOGIN_SCOPES
    extra_raw = os.getenv("YANDEX_EXTRA_SCOPES", "").strip()
    if not extra_raw:
        return YANDEX_DISK_SCOPES
    extra = _parse_scope_list(extra_raw)
    merged: list[str] = list(YANDEX_DISK_SCOPES)
    for scope in extra:
        if scope not in merged:
            merged.append(scope)
    return tuple(merged)


def yandex_oauth_optional_scopes() -> tuple[str, ...]:
    """Необязательные scope (Яндекс ID), если заданы EXTRA при режиме disk."""
    from backend.core.env import load_project_env

    load_project_env()
    if yandex_oauth_mode() != "disk":
        return ()
    extra_raw = os.getenv("YANDEX_EXTRA_SCOPES", "").strip()
    if not extra_raw:
        return ()
    required = set(_effective_yandex_scopes())
    return tuple(s for s in _parse_scope_list(extra_raw) if s not in required)


def _yandex_flow_mode() -> Literal["pkce", "confidential"]:
    from backend.core.env import yandex_oauth_flow_mode

    return yandex_oauth_flow_mode()


def _default_yandex_redirect_uri() -> str:
    from backend.core.env import load_project_env

    load_project_env()
    redirect_uri = os.getenv("YANDEX_REDIRECT_URI", "").strip()
    if redirect_uri:
        return redirect_uri
    public_base = os.getenv("PUBLIC_API_BASE_URL", "").strip().rstrip("/")
    if public_base:
        return f"{public_base}/api/cloud/callback/yandex"
    raise RuntimeError(
        "Переменная YANDEX_REDIRECT_URI не задана (.env). "
        "Задайте YANDEX_REDIRECT_URI или PUBLIC_API_BASE_URL и перезапустите API."
    )


def _yandex_public_env() -> tuple[str, str]:
    from backend.core.env import load_project_env

    load_project_env()
    client_id = os.getenv("YANDEX_CLIENT_ID", "").strip()
    if not client_id:
        raise RuntimeError(
            "Переменная YANDEX_CLIENT_ID не задана. "
            f"Добавьте её в {load_project_env() or 'файл .env в корне проекта'} "
            "и перезапустите API."
        )
    return client_id, _default_yandex_redirect_uri()


def _yandex_confidential_env() -> tuple[str, str, str]:
    client_id, redirect_uri = _yandex_public_env()
    from backend.core.env import load_project_env

    load_project_env()
    client_secret = os.getenv("YANDEX_CLIENT_SECRET", "").strip()
    if not client_secret:
        raise RuntimeError(
            "YANDEX_OAUTH_FLOW=confidential требует YANDEX_CLIENT_SECRET в .env. "
            "Для PKCE без секрета удалите YANDEX_OAUTH_FLOW или задайте pkce."
        )
    return client_id, client_secret, redirect_uri


def _yandex_env() -> tuple[str, str, str]:
    """Legacy helper — confidential flow only."""
    return _yandex_confidential_env()


def _oauth_client_for_flow(flow: Literal["pkce", "confidential"]) -> AsyncClient:
    if flow == "confidential":
        client_id, client_secret, _redirect = _yandex_confidential_env()
        return AsyncClient(id=client_id, secret=client_secret)
    client_id, _redirect = _yandex_public_env()
    return AsyncClient(id=client_id, secret="")


def _refresh_yandex_token_pkce(client_id: str, refresh_token: str) -> dict[str, Any]:
    response = requests.post(
        _YANDEX_TOKEN_URL,
        data=urlencode(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": client_id,
            }
        ),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=30,
    )
    if response.status_code >= 400:
        raise RuntimeError(
            f"Яндекс.OAuth refresh failed ({response.status_code}): {response.text[:240]}"
        )
    payload = response.json()
    access = str(payload.get("access_token") or "").strip()
    if not access:
        raise RuntimeError("Яндекс.OAuth refresh не вернул access_token")
    return payload


def _expires_at_iso(expires_in: int | None) -> str | None:
    if expires_in is None:
        return None
    return (datetime.now() + timedelta(seconds=int(expires_in))).isoformat()


def _parse_expires_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _token_expired(expires_at: str | None) -> bool:
    parsed = _parse_expires_at(expires_at)
    if parsed is None:
        return True
    return parsed <= datetime.now() + _TOKEN_EXPIRY_BUFFER


def _save_tokens_sync(
    access_token: str,
    refresh_token: str | None,
    expires_in: int | None,
    *,
    user_id: int | None = None,
    account_cloud_provider: str | None = None,
    account_cloud_user_id: str | None = None,
    link_user_id: int | None = None,
) -> None:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    expires_at = _expires_at_iso(expires_in)
    acct_provider = str(account_cloud_provider or "").strip().lower() or None
    acct_id = str(account_cloud_user_id or "").strip().lower() or None
    if not acct_provider or not acct_id:
        from backend.services.cloud_account_service import resolve_cloud_account

        resolved = resolve_cloud_account(STORAGE_YANDEX, uid)
        if resolved:
            acct_provider, acct_id = resolved
    if acct_provider and acct_id:
        save_cloud_account_tokens(
            STORAGE_YANDEX,
            access_token,
            refresh_token,
            expires_at,
            account_cloud_provider=acct_provider,
            account_cloud_user_id=acct_id,
            link_user_id=link_user_id,
            legacy_user_id=uid,
        )
        return
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO cloud_tokens (
                user_id, provider, access_token, refresh_token, expires_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                updated_at = CURRENT_TIMESTAMP
            """,
            (uid, PROVIDER, access_token, refresh_token, expires_at),
        )
        conn.commit()
    finally:
        conn.close()


def _load_tokens_sync(*, user_id: int | None = None) -> tuple[str, str | None, str | None] | None:
    return load_cloud_account_tokens(STORAGE_YANDEX, user_id)


def yandex_status_sync(*, user_id: int | None = None) -> dict[str, Any]:
    """Статус подключения Яндекс.Диска для API (по привязке к облачному аккаунту)."""
    empty_account = {
        "account_email": None,
        "account_name": None,
        "account_label": None,
    }
    row = load_cloud_account_tokens(STORAGE_YANDEX, user_id)
    if row is None:
        return {"connected": False, "expires_at": None, **empty_account}
    _access, _refresh, expires_at = row
    connected = not _token_expired(expires_at) or bool(_refresh)
    return {"connected": connected, "expires_at": expires_at, **empty_account}


def _delete_tokens_sync(*, user_id: int | None = None) -> None:
    delete_cloud_tokens_for_user(STORAGE_YANDEX, user_id)


def _token_row_expired_sync(*, user_id: int | None = None) -> bool:
    row = load_cloud_account_tokens(STORAGE_YANDEX, user_id)
    if row is None:
        return True
    return _token_expired(row[2])


_pending_yandex_oauth: dict[str, dict[str, Any]] = {}
_pending_yandex_lock = threading.Lock()


def _prune_pending_yandex_oauth() -> None:
    now = time.time()
    expired = [
        key
        for key, value in _pending_yandex_oauth.items()
        if now - float(value.get("created_at", 0)) > _PENDING_YANDEX_TTL_SEC
    ]
    for key in expired:
        _pending_yandex_oauth.pop(key, None)
    while len(_pending_yandex_oauth) > _MAX_PENDING_YANDEX_OAUTH:
        oldest = next(iter(_pending_yandex_oauth))
        _pending_yandex_oauth.pop(oldest, None)


def _remember_yandex_oauth_state(
    state: str,
    *,
    link_user_id: int | None,
    redirect_uri: str,
    client_mode: str | None,
    flow: Literal["pkce", "confidential"],
    code_verifier: str | None = None,
) -> None:
    with _pending_yandex_lock:
        _prune_pending_yandex_oauth()
        _pending_yandex_oauth[state] = {
            "link_user_id": int(link_user_id) if link_user_id else None,
            "redirect_uri": redirect_uri,
            "client_mode": (client_mode or "").strip() or None,
            "flow": flow,
            "code_verifier": code_verifier,
            "created_at": time.time(),
        }


def _pop_yandex_oauth_pending(state: str | None) -> dict[str, Any] | None:
    if not state:
        return None
    with _pending_yandex_lock:
        return _pending_yandex_oauth.pop(state, None)


def _peek_yandex_oauth_pending(state: str | None) -> dict[str, Any] | None:
    if not state:
        return None
    with _pending_yandex_lock:
        raw = _pending_yandex_oauth.get(state)
        return dict(raw) if isinstance(raw, dict) else None


def _log_yandex_authorize_runtime_config(
    *,
    client_id: str,
    oauth_mode: str,
    flow: Literal["pkce", "confidential"],
    scopes: tuple[str, ...],
    optional_scopes: tuple[str, ...],
    auth_url: str,
) -> None:
    final_requested_scopes = tuple(dict.fromkeys((*scopes, *optional_scopes)))
    logger.info(
        "oauth yandex_runtime_config provider=yandex "
        "YANDEX_CLIENT_ID=%s YANDEX_OAUTH_MODE=%s flow=%s "
        "final_requested_scopes=%s scopes=%s optional_scopes=%s authorize_url=%s",
        client_id,
        oauth_mode,
        flow,
        " ".join(final_requested_scopes),
        " ".join(scopes),
        " ".join(optional_scopes),
        auth_url,
    )


class YandexDiskService:
    """Асинхронный клиент для Яндекс.Диска."""

    def __init__(self, user_id: int | None = None) -> None:
        self._user_id = int(user_id) if user_id is not None else None
        self._client: AsyncClient | None = None
        self._client_token: str | None = None

    def _oauth_client(self, flow: Literal["pkce", "confidential"] | None = None) -> AsyncClient:
        mode = flow or _yandex_flow_mode()
        return _oauth_client_for_flow(mode)

    async def _close_client(self) -> None:
        if self._client is not None:
            await self._client.close()
            self._client = None
            self._client_token = None

    async def get_authorization_url(
        self,
        link_user_id: int | None = None,
        *,
        redirect_uri: str | None = None,
        client_mode: str | None = None,
    ) -> str:
        """URL для редиректа пользователя на страницу авторизации Яндекса."""
        import secrets

        from backend.core.pkce import generate_pkce_pair

        flow = _yandex_flow_mode()
        client_id, default_redirect = _yandex_public_env()
        oauth_mode = yandex_oauth_mode()
        redirect = (redirect_uri or default_redirect).strip()
        state = secrets.token_urlsafe(16)
        code_verifier: str | None = None
        code_challenge: str | None = None
        if flow == "pkce":
            code_verifier, code_challenge = generate_pkce_pair()
        _remember_yandex_oauth_state(
            state,
            link_user_id=link_user_id,
            redirect_uri=redirect,
            client_mode=client_mode,
            flow=flow,
            code_verifier=code_verifier,
        )
        logger.info(
            "oauth oauth_expected_state provider=yandex flow=%s state_present=%s redirect_uri=%s client_mode=%s",
            flow,
            bool(state),
            redirect,
            client_mode,
        )
        client = self._oauth_client(flow)
        try:
            optional = yandex_oauth_optional_scopes()
            scopes = _effective_yandex_scopes()
            pkce_kwargs: dict[str, Any] = {}
            if flow == "pkce" and code_challenge:
                pkce_kwargs["code_challenge"] = code_challenge
                pkce_kwargs["code_challenge_method"] = "S256"
            # Compatibility: different yadisk versions support different kwargs.
            try:
                auth_url = client.get_code_url(
                    redirect_uri=redirect,
                    scope=scopes,
                    optional_scope=optional or None,
                    force_confirm=True,
                    state=state,
                    **pkce_kwargs,
                )
                _log_yandex_authorize_runtime_config(
                    client_id=client_id,
                    oauth_mode=oauth_mode,
                    flow=flow,
                    scopes=scopes,
                    optional_scopes=optional,
                    auth_url=auth_url,
                )
                return auth_url
            except TypeError:
                try:
                    auth_url = client.get_code_url(
                        redirect_uri=redirect,
                        scope=scopes,
                        force_confirm=True,
                        state=state,
                        **pkce_kwargs,
                    )
                    _log_yandex_authorize_runtime_config(
                        client_id=client_id,
                        oauth_mode=oauth_mode,
                        flow=flow,
                        scopes=scopes,
                        optional_scopes=(),
                        auth_url=auth_url,
                    )
                    return auth_url
                except TypeError:
                    auth_url = client.get_code_url(
                        redirect_uri=redirect,
                        scope=scopes,
                        state=state,
                        **pkce_kwargs,
                    )
                    _log_yandex_authorize_runtime_config(
                        client_id=client_id,
                        oauth_mode=oauth_mode,
                        flow=flow,
                        scopes=scopes,
                        optional_scopes=(),
                        auth_url=auth_url,
                    )
                    return auth_url
        finally:
            await client.close()

    async def exchange_code_for_token(
        self,
        code: str,
        *,
        state: str | None = None,
        user_id: int | None = None,
        persist: bool = True,
        redirect_uri: str | None = None,
    ) -> dict[str, Any]:
        """Обмен кода авторизации на access/refresh; опционально сохранение в БД."""
        pending = _pop_yandex_oauth_pending(state)
        flow: Literal["pkce", "confidential"] = (
            pending.get("flow") if pending else None
        ) or _yandex_flow_mode()
        effective_redirect = (
            (redirect_uri or (pending or {}).get("redirect_uri") or "").strip()
            or _default_yandex_redirect_uri()
        )
        code_verifier = (pending or {}).get("code_verifier") if pending else None
        if flow == "pkce" and not code_verifier:
            raise RuntimeError(
                "PKCE code_verifier не найден (истёкший или повторный callback). "
                "Начните вход заново."
            )

        client = self._oauth_client(flow)
        try:
            token_kwargs: dict[str, Any] = {}
            if flow == "pkce":
                token_kwargs["code_verifier"] = code_verifier
            try:
                token_obj = await client.get_token(
                    code,
                    redirect_uri=effective_redirect,
                    **token_kwargs,
                )
            except TypeError:
                if flow == "pkce":
                    token_obj = await client.get_token(code, code_verifier=code_verifier)
                else:
                    token_obj = await client.get_token(code)
        finally:
            await client.close()

        access = token_obj.access_token
        if not access:
            raise RuntimeError("Яндекс.OAuth не вернул access_token")

        refresh = token_obj.refresh_token
        expires_in = token_obj.expires_in
        if persist:
            await asyncio.to_thread(
                _save_tokens_sync,
                access,
                refresh,
                expires_in,
                user_id=user_id,
                link_user_id=user_id,
            )
        await self._close_client()

        return {
            "access_token": access,
            "refresh_token": refresh,
            "expires_in": expires_in,
            "token_type": token_obj.token_type,
            "link_user_id": (pending or {}).get("link_user_id"),
            "client_mode": (pending or {}).get("client_mode"),
            "redirect_uri": effective_redirect,
            "flow": flow,
        }

    async def _refresh_access_token(self, refresh_token: str) -> str:
        flow = _yandex_flow_mode()
        if flow == "pkce":
            client_id, _redirect = _yandex_public_env()
            payload = await asyncio.to_thread(
                _refresh_yandex_token_pkce,
                client_id,
                refresh_token,
            )
            access = str(payload.get("access_token") or "").strip()
            new_refresh = payload.get("refresh_token") or refresh_token
            expires_in = payload.get("expires_in")
        else:
            client = self._oauth_client("confidential")
            try:
                token_obj = await client.refresh_token(refresh_token)
            finally:
                await client.close()
            access = token_obj.access_token
            if not access:
                raise RuntimeError("Не удалось обновить access_token")
            new_refresh = token_obj.refresh_token or refresh_token
            expires_in = token_obj.expires_in

        await asyncio.to_thread(
            _save_tokens_sync,
            access,
            new_refresh,
            expires_in,
            user_id=self._user_id,
        )
        return access

    async def _get_client(self) -> AsyncClient:
        """Клиент с актуальным access_token."""
        if self._client is not None and self._client_token:
            expired = await asyncio.to_thread(
                _token_row_expired_sync, user_id=self._user_id
            )
            if not expired:
                return self._client

        row = await asyncio.to_thread(_load_tokens_sync, user_id=self._user_id)
        if row is None:
            raise RuntimeError(
                "Токены для Яндекс.Диска не найдены. Выполните авторизацию."
            )

        access_token, refresh_token, expires_at = row
        if _token_expired(expires_at):
            if not refresh_token:
                raise RuntimeError(
                    "Токен Яндекс.Диска истёк, refresh_token отсутствует. "
                    "Повторите авторизацию."
                )
            logger.info("Токен Яндекс.Диска истёк, обновляем...")
            access_token = await self._refresh_access_token(refresh_token)

        if self._client is not None and self._client_token == access_token:
            return self._client

        await self._close_client()
        self._client = AsyncClient(token=access_token)
        self._client_token = access_token
        return self._client

    async def upload_file(self, local_path: str, cloud_path: str) -> bool:
        try:
            if cloud_path.startswith(("app:", "disk:")):
                parent = cloud_path.rsplit("/", 1)[0] if "/" in cloud_path[5:] else ""
                if parent:
                    await asyncio.to_thread(
                        ensure_yandex_dirs_sync,
                        self._user_id,
                        [parent],
                    )
            elif cloud_path.startswith("/"):
                parent = str(Path(cloud_path).parent).replace("\\", "/")
                if parent and parent != "/":
                    await self.create_folder(parent)
            client = await self._get_client()
            await client.upload(local_path, cloud_path, overwrite=True)
            logger.info("Файл %s загружен в %s", local_path, cloud_path)
            return True
        except Exception as exc:
            logger.error("Ошибка загрузки в Яндекс.Диск: %s", exc)
            return False

    async def download_file(self, cloud_path: str, local_path: str) -> bool:
        try:
            client = await self._get_client()
            local = Path(local_path)
            local.parent.mkdir(parents=True, exist_ok=True)
            await client.download(cloud_path, str(local))
            logger.info("Файл %s скачан в %s", cloud_path, local_path)
            return True
        except Exception as exc:
            logger.error("Ошибка скачивания с Яндекс.Диска: %s", exc)
            return False

    async def list_files(self, cloud_path: str = "/") -> list[dict[str, Any]]:
        try:
            client = await self._get_client()
            items: list[dict[str, Any]] = []
            async for item in client.listdir(cloud_path):
                items.append(
                    {
                        "name": item.name,
                        "path": item.path,
                        "size": item.size,
                        "modified": item.modified,
                        "is_dir": item.type == "dir",
                    }
                )
            return items
        except Exception as exc:
            logger.error("Ошибка listdir Яндекс.Диска: %s", exc)
            return []

    async def file_exists(self, cloud_path: str) -> bool:
        try:
            client = await self._get_client()
            return await client.exists(cloud_path)
        except Exception:
            return False

    async def create_folder(self, cloud_path: str) -> bool:
        """Создаёт папку и промежуточные каталоги при необходимости."""
        path = cloud_path.strip().rstrip("/")
        if not path or path == "/":
            return True

        if path.startswith(("app:", "disk:")):
            try:
                await asyncio.to_thread(ensure_yandex_dirs_sync, self._user_id, [path])
                logger.info("Папка %s доступна", path)
                return True
            except Exception as exc:
                logger.error("Ошибка создания папки %s: %s", cloud_path, exc)
                return False

        norm = path if path.startswith("/") else f"/{path}"
        if norm == "/":
            return True

        try:
            client = await self._get_client()
            parts = [p for p in norm.split("/") if p]
            current = ""
            for part in parts:
                current = f"{current}/{part}"
                try:
                    await client.mkdir(current)
                except DirectoryExistsError:
                    pass
            logger.info("Папка %s доступна", norm)
            return True
        except Exception as exc:
            logger.error("Ошибка создания папки %s: %s", cloud_path, exc)
            return False

    async def get_status(self) -> dict[str, Any]:
        status = await asyncio.to_thread(yandex_status_sync, user_id=self._user_id)
        if not status.get("connected"):
            return status
        try:
            from backend.services.cloud_identity_service import (
                account_fields_for_status,
                try_yandex_identity,
            )

            client = await self._get_client()
            token = self._client_token
            if not token:
                return status
            identity = await asyncio.to_thread(try_yandex_identity, token)
            if identity:
                status.update(account_fields_for_status(identity))
        except Exception as exc:
            logger.debug("Yandex status account label failed: %s", exc)
        return status

    async def revoke_token(self) -> bool:
        try:
            client = await self._get_client()
            await client.revoke_token()
        except Exception as exc:
            logger.error("Ошибка отзыва токена Яндекс: %s", exc)
        finally:
            await asyncio.to_thread(_delete_tokens_sync, user_id=self._user_id)
            await self._close_client()
        return True


def take_yandex_oauth_state(state: str | None) -> tuple[int | None, str, str | None]:
    """link_user_id, redirect_uri и client_mode; снимает pending state (не трогает cloud_tokens)."""
    try:
        default_redirect = _default_yandex_redirect_uri()
    except RuntimeError:
        default_redirect = ""
    raw = _pop_yandex_oauth_pending(state)
    if raw is None:
        return None, default_redirect, None
    if isinstance(raw, int):
        return raw, default_redirect, None
    link_user_id = raw.get("link_user_id")
    redirect = str(raw.get("redirect_uri") or default_redirect).strip()
    client_mode = raw.get("client_mode")
    mode = str(client_mode).strip() if client_mode else None
    return link_user_id, redirect or default_redirect, mode or None


def peek_yandex_oauth_client_mode(state: str | None) -> str | None:
    """Read client_mode for error HTML without consuming PKCE verifier for a retry."""
    raw = _peek_yandex_oauth_pending(state)
    if not raw:
        return None
    client_mode = raw.get("client_mode")
    return str(client_mode).strip() if client_mode else None


def discard_yandex_oauth_state(state: str | None) -> None:
    """Drop pending OAuth attempt after user cancel/error; stored tokens unchanged."""
    _pop_yandex_oauth_pending(state)


def take_yandex_link_user(state: str | None) -> int | None:
    link_user_id, _redirect, _mode = take_yandex_oauth_state(state)
    return link_user_id
