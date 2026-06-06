# -*- coding: utf-8 -*-
"""OAuth и файловые операции Яндекс.Диска (yadisk AsyncClient)."""
from __future__ import annotations

import asyncio
import logging
import os
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Optional

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
# Только права Яндекс.Диска — работают без «Яндекс ID» в oauth.yandex.ru.
# login:email / login:info добавляйте в YANDEX_EXTRA_SCOPES в .env, если включили в приложении.
YANDEX_DISK_SCOPES: tuple[str, ...] = (
    "cloud_api:disk.read",
    "cloud_api:disk.write",
)
YANDEX_LOGIN_SCOPES: tuple[str, ...] = (
    "login:email",
    "login:info",
)
_TOKEN_EXPIRY_BUFFER = timedelta(seconds=60)


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


def _yandex_env() -> tuple[str, str, str]:
    from backend.core.env import load_project_env

    load_project_env()
    client_id = os.getenv("YANDEX_CLIENT_ID", "").strip()
    client_secret = os.getenv("YANDEX_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("YANDEX_REDIRECT_URI", "").strip()
    if not client_id:
        raise RuntimeError(
            "Переменная YANDEX_CLIENT_ID не задана. "
            f"Добавьте её в {load_project_env() or 'файл .env в корне проекта'} "
            "и перезапустите API."
        )
    if not client_secret:
        raise RuntimeError(
            "Переменная YANDEX_CLIENT_SECRET не задана (.env). Перезапустите API."
        )
    if not redirect_uri:
        raise RuntimeError(
            "Переменная YANDEX_REDIRECT_URI не задана (.env). Перезапустите API."
        )
    return client_id, client_secret, redirect_uri


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


class YandexDiskService:
    """Асинхронный клиент для Яндекс.Диска."""

    def __init__(self, user_id: int | None = None) -> None:
        self._user_id = int(user_id) if user_id is not None else None
        self._client: AsyncClient | None = None
        self._client_token: str | None = None

    def _oauth_client(self) -> AsyncClient:
        client_id, client_secret, _redirect = _yandex_env()
        return AsyncClient(id=client_id, secret=client_secret)

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

        state = secrets.token_urlsafe(16)
        _cid, _sec, default_redirect = _yandex_env()
        redirect = (redirect_uri or default_redirect).strip()
        with _pending_yandex_lock:
            _pending_yandex_oauth[state] = {
                "link_user_id": int(link_user_id) if link_user_id else None,
                "redirect_uri": redirect,
                "client_mode": (client_mode or "").strip() or None,
            }
        logger.info(
            "oauth oauth_expected_state provider=yandex state_present=%s redirect_uri=%s client_mode=%s",
            bool(state),
            redirect,
            client_mode,
        )
        client = self._oauth_client()
        try:
            optional = yandex_oauth_optional_scopes()
            scopes = _effective_yandex_scopes()
            # Compatibility: different yadisk versions support different kwargs.
            try:
                auth_url = client.get_code_url(
                    redirect_uri=redirect,
                    scope=scopes,
                    optional_scope=optional or None,
                    force_confirm=True,
                    state=state,
                )
                logger.info("oauth yandex_authorize_url provider=yandex url=%s", auth_url)
                return auth_url
            except TypeError:
                try:
                    auth_url = client.get_code_url(
                        redirect_uri=redirect,
                        scope=scopes,
                        force_confirm=True,
                        state=state,
                    )
                    logger.info("oauth yandex_authorize_url provider=yandex url=%s", auth_url)
                    return auth_url
                except TypeError:
                    auth_url = client.get_code_url(
                        redirect_uri=redirect,
                        scope=scopes,
                        state=state,
                    )
                    logger.info("oauth yandex_authorize_url provider=yandex url=%s", auth_url)
                    return auth_url
        finally:
            await client.close()

    async def exchange_code_for_token(
        self,
        code: str,
        *,
        user_id: int | None = None,
        persist: bool = True,
        redirect_uri: str | None = None,
    ) -> dict[str, Any]:
        """Обмен кода авторизации на access/refresh; опционально сохранение в БД."""
        client = self._oauth_client()
        try:
            try:
                token_obj = await client.get_token(code, redirect_uri=redirect_uri)
            except TypeError:
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
        }

    async def _refresh_access_token(self, refresh_token: str) -> str:
        client = self._oauth_client()
        try:
            token_obj = await client.refresh_token(refresh_token)
        finally:
            await client.close()

        access = token_obj.access_token
        if not access:
            raise RuntimeError("Не удалось обновить access_token")

        new_refresh = token_obj.refresh_token or refresh_token
        await asyncio.to_thread(
            _save_tokens_sync,
            access,
            new_refresh,
            token_obj.expires_in,
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
    """link_user_id, redirect_uri и client_mode, использованные при старте OAuth."""
    _cid, _sec, default_redirect = _yandex_env()
    if not state:
        return None, default_redirect, None
    with _pending_yandex_lock:
        raw = _pending_yandex_oauth.pop(state, None)
    if raw is None:
        return None, default_redirect, None
    if isinstance(raw, int):
        return raw, default_redirect, None
    link_user_id = raw.get("link_user_id")
    redirect = str(raw.get("redirect_uri") or default_redirect).strip()
    client_mode = raw.get("client_mode")
    mode = str(client_mode).strip() if client_mode else None
    return link_user_id, redirect or default_redirect, mode or None


def take_yandex_link_user(state: str | None) -> int | None:
    link_user_id, _redirect, _mode = take_yandex_oauth_state(state)
    return link_user_id
