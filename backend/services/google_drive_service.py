# -*- coding: utf-8 -*-
"""Google Drive API (синхронный SDK, вызовы через asyncio.to_thread)."""
from __future__ import annotations

import asyncio
import io
import logging
import mimetypes
import os
import threading
from datetime import datetime, timedelta, timezone
from typing import Any

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from googleapiclient.http import MediaFileUpload, MediaIoBaseDownload

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.cloud_account_service import (
    STORAGE_GOOGLE,
    delete_cloud_tokens_for_user,
    load_cloud_account_tokens,
    save_cloud_account_tokens,
)

logger = logging.getLogger(__name__)

PROVIDER = "google"
SCOPES = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
FOLDER_MIME = "application/vnd.google-apps.folder"
_TOKEN_EXPIRY_BUFFER = timedelta(seconds=60)

# PKCE + link_user_id для привязки облака к локальному профилю.
_pending_google_oauth: dict[str, dict[str, Any]] = {}
_pending_pkce_lock = threading.Lock()
_MAX_PENDING_PKCE = 32


def _google_env() -> tuple[str, str, str]:
    from backend.core.env import load_project_env

    load_project_env()
    client_id = os.getenv("GOOGLE_CLIENT_ID", "").strip()
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET", "").strip()
    redirect_uri = os.getenv("GOOGLE_REDIRECT_URI", "").strip()
    if not client_id:
        raise RuntimeError(
            "GOOGLE_CLIENT_ID не задан (.env в корне проекта). Перезапустите API."
        )
    if not client_secret:
        raise RuntimeError("GOOGLE_CLIENT_SECRET не задан (.env). Перезапустите API.")
    if not redirect_uri:
        raise RuntimeError("GOOGLE_REDIRECT_URI не задан (.env). Перезапустите API.")
    return client_id, client_secret, redirect_uri


def _client_config(effective_redirect_uri: str | None = None) -> dict[str, Any]:
    client_id, client_secret, default_redirect = _google_env()
    redirect_uri = (effective_redirect_uri or default_redirect).strip()
    return {
        "web": {
            "client_id": client_id,
            "client_secret": client_secret,
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "redirect_uris": [redirect_uri],
        }
    }


def _parse_expires_at(raw: str | None) -> datetime | None:
    if not raw:
        return None
    try:
        return datetime.fromisoformat(raw)
    except ValueError:
        return None


def _expiry_iso(expiry: datetime | None) -> str | None:
    if expiry is None:
        return None
    if expiry.tzinfo is not None:
        expiry = expiry.astimezone(timezone.utc).replace(tzinfo=None)
    return expiry.isoformat()


def _expires_in_seconds(expiry: datetime | None) -> int | None:
    if expiry is None:
        return None
    now = datetime.now(expiry.tzinfo) if expiry.tzinfo else datetime.now()
    return max(0, int((expiry - now).total_seconds()))


def _save_tokens_sync(
    access_token: str,
    refresh_token: str | None,
    expires_at: str | None,
    *,
    user_id: int | None = None,
    account_cloud_provider: str | None = None,
    account_cloud_user_id: str | None = None,
    link_user_id: int | None = None,
) -> None:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    acct_provider = str(account_cloud_provider or "").strip().lower() or None
    acct_id = str(account_cloud_user_id or "").strip().lower() or None
    if not acct_provider or not acct_id:
        from backend.services.cloud_account_service import resolve_cloud_account

        resolved = resolve_cloud_account(STORAGE_GOOGLE, uid)
        if resolved:
            acct_provider, acct_id = resolved
    if acct_provider and acct_id:
        save_cloud_account_tokens(
            STORAGE_GOOGLE,
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
    return load_cloud_account_tokens(STORAGE_GOOGLE, user_id)


def _delete_tokens_sync(*, user_id: int | None = None) -> None:
    delete_cloud_tokens_for_user(STORAGE_GOOGLE, user_id)


def google_status_sync(*, user_id: int | None = None) -> dict[str, Any]:
    empty_account = {
        "account_email": None,
        "account_name": None,
        "account_label": None,
    }
    row = load_cloud_account_tokens(STORAGE_GOOGLE, user_id)
    if row is None:
        return {"connected": False, "expires_at": None, **empty_account}
    _access, refresh, expires_at = row
    parsed = _parse_expires_at(expires_at)
    expired = parsed is None or parsed <= datetime.now() + _TOKEN_EXPIRY_BUFFER
    return {
        "connected": (not expired) or bool(refresh),
        "expires_at": expires_at,
        **empty_account,
    }


def _remember_oauth_state(
    state: str | None,
    code_verifier: str | None,
    link_user_id: int | None = None,
    redirect_uri: str | None = None,
    client_mode: str | None = None,
) -> None:
    if not state or not code_verifier:
        return
    _client_id, _client_secret, default_redirect = _google_env()
    with _pending_pkce_lock:
        _pending_google_oauth[state] = {
            "verifier": code_verifier,
            "link_user_id": int(link_user_id) if link_user_id else None,
            "redirect_uri": (redirect_uri or default_redirect).strip(),
            "client_mode": (client_mode or "").strip() or None,
        }
        if len(_pending_google_oauth) > _MAX_PENDING_PKCE:
            for key in list(_pending_google_oauth.keys())[:-_MAX_PENDING_PKCE]:
                _pending_google_oauth.pop(key, None)


def _take_oauth_state(state: str | None) -> dict[str, Any] | None:
    if not state:
        return None
    with _pending_pkce_lock:
        return _pending_google_oauth.pop(state, None)


def _build_flow(redirect_uri: str | None = None) -> Flow:
    _client_id, _client_secret, default_redirect = _google_env()
    effective = (redirect_uri or default_redirect).strip()
    flow = Flow.from_client_config(_client_config(effective), scopes=SCOPES)
    flow.redirect_uri = effective
    return flow


def _credentials_from_row(
    access_token: str,
    refresh_token: str | None,
    expires_at: str | None,
) -> Credentials:
    client_id, client_secret, _redirect = _google_env()
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=client_id,
        client_secret=client_secret,
        scopes=SCOPES,
    )
    parsed = _parse_expires_at(expires_at)
    if parsed is not None:
        creds.expiry = parsed
    return creds


def _get_credentials_sync(user_id: int | None = None) -> Credentials | None:
    row = _load_tokens_sync(user_id=user_id)
    if row is None:
        return None
    access_token, refresh_token, expires_at = row
    creds = _credentials_from_row(access_token, refresh_token, expires_at)

    if creds.expired and creds.refresh_token:
        logger.info("Токен Google Drive истёк, обновляем…")
        creds.refresh(Request())
        new_refresh = creds.refresh_token or refresh_token
        _save_tokens_sync(
            creds.token,
            new_refresh,
            _expiry_iso(creds.expiry),
            user_id=user_id,
        )

    return creds


def _build_service_sync(creds: Credentials):
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _escape_query_value(value: str) -> str:
    return value.replace("\\", "\\\\").replace("'", "\\'")


def _find_folder_sync(service, folder_name: str, parent_id: str = "root") -> str | None:
    safe_name = _escape_query_value(folder_name)
    q = (
        f"name = '{safe_name}' and '{parent_id}' in parents and "
        f"mimeType = '{FOLDER_MIME}' and trashed = false"
    )
    results = (
        service.files()
        .list(q=q, fields="files(id)", pageSize=1, supportsAllDrives=True)
        .execute()
    )
    files = results.get("files", [])
    return files[0]["id"] if files else None


def _create_folder_sync(service, folder_name: str, parent_id: str = "root") -> str:
    metadata = {
        "name": folder_name,
        "mimeType": FOLDER_MIME,
        "parents": [parent_id],
    }
    folder = service.files().create(body=metadata, fields="id").execute()
    folder_id = folder.get("id")
    if not folder_id:
        raise RuntimeError(f"Не удалось создать папку {folder_name}")
    return folder_id


def _get_or_create_folder_sync(
    service,
    folder_name: str,
    parent_id: str = "root",
) -> str:
    existing = _find_folder_sync(service, folder_name, parent_id)
    if existing:
        return existing
    return _create_folder_sync(service, folder_name, parent_id)


def _upload_file_sync(
    service,
    local_path: str,
    parent_id: str,
    mime_type: str,
) -> str:
    file_name = os.path.basename(local_path)
    media = MediaFileUpload(local_path, mimetype=mime_type, resumable=True)
    metadata = {"name": file_name, "parents": [parent_id]}
    created = (
        service.files()
        .create(body=metadata, media_body=media, fields="id")
        .execute()
    )
    return str(created.get("id", ""))


def _download_file_sync(service, file_id: str, local_path: str) -> None:
    from pathlib import Path

    dest = Path(local_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    request = service.files().get_media(fileId=file_id)
    with io.FileIO(str(dest), "wb") as fh:
        downloader = MediaIoBaseDownload(fh, request)
        done = False
        while not done:
            _, done = downloader.next_chunk()


def _list_files_sync(service, folder_id: str) -> list[dict[str, Any]]:
    results = (
        service.files()
        .list(
            q=f"'{folder_id}' in parents and trashed=false",
            fields="files(id, name, mimeType, size, modifiedTime, createdTime)",
            pageSize=200,
        )
        .execute()
    )
    files = results.get("files", [])
    return [
        {
            "id": item["id"],
            "name": item["name"],
            "mime_type": item.get("mimeType"),
            "size": int(item.get("size") or 0),
            "modified": item.get("modifiedTime"),
            "created": item.get("createdTime"),
            "is_dir": item.get("mimeType") == FOLDER_MIME,
        }
        for item in files
    ]


def _revoke_credentials_sync(creds: Credentials) -> None:
    try:
        creds.revoke(Request())
    except Exception as exc:
        logger.warning("Отзыв токена Google (revoke): %s", exc)


class GoogleDriveService:
    """OAuth и файловые операции Google Drive."""

    SCOPES = SCOPES

    def __init__(self, user_id: int | None = None) -> None:
        self._user_id = int(user_id) if user_id is not None else None

    async def get_authorization_url(
        self,
        link_user_id: int | None = None,
        *,
        redirect_uri: str | None = None,
        client_mode: str | None = None,
    ) -> str:
        def _auth_url() -> str:
            ru = (redirect_uri or _google_env()[2]).strip()
            flow = _build_flow(ru)
            url, state = flow.authorization_url(
                access_type="offline",
                include_granted_scopes="true",
                prompt="consent",
            )
            _remember_oauth_state(
                state,
                flow.code_verifier,
                link_user_id,
                ru,
                client_mode=client_mode,
            )
            return url

        return await asyncio.to_thread(_auth_url)

    async def exchange_code_for_token(
        self,
        code: str,
        state: str | None = None,
        *,
        user_id: int | None = None,
        persist: bool = True,
    ) -> dict[str, Any]:
        def _exchange() -> dict[str, Any]:
            pending = _take_oauth_state(state)
            ru = (pending.get("redirect_uri") if pending else None) or _google_env()[2]
            flow = _build_flow(ru)
            if pending and pending.get("verifier"):
                flow.code_verifier = pending["verifier"]
            flow.fetch_token(code=code)
            creds = flow.credentials
            if not creds or not creds.token:
                raise RuntimeError("Google OAuth не вернул access_token")
            if persist:
                link_uid = pending.get("link_user_id") if pending else None
                _save_tokens_sync(
                    creds.token,
                    creds.refresh_token,
                    _expiry_iso(creds.expiry),
                    user_id=user_id,
                    link_user_id=link_uid or user_id,
                )
            return {
                "access_token": creds.token,
                "refresh_token": creds.refresh_token,
                "expires_in": _expires_in_seconds(creds.expiry),
                "credentials": creds,
                "link_user_id": pending.get("link_user_id") if pending else None,
                "client_mode": pending.get("client_mode") if pending else None,
            }

        return await asyncio.to_thread(_exchange)

    async def get_status(self) -> dict[str, Any]:
        status = await asyncio.to_thread(google_status_sync, user_id=self._user_id)
        if not status.get("connected"):
            return status
        try:
            from backend.services.cloud_identity_service import (
                account_fields_for_status,
                try_google_identity,
            )

            creds = await asyncio.to_thread(_get_credentials_sync, self._user_id)
            if creds is None:
                return status
            identity = await asyncio.to_thread(try_google_identity, creds)
            if identity:
                status.update(account_fields_for_status(identity))
        except Exception as exc:
            logger.debug("Google status account label failed: %s", exc)
        return status

    async def _get_service(self):
        creds = await asyncio.to_thread(_get_credentials_sync, self._user_id)
        if creds is None:
            raise RuntimeError(
                "Токены Google Drive не найдены. Выполните авторизацию."
            )
        return await asyncio.to_thread(_build_service_sync, creds)

    async def upload_file(
        self,
        local_path: str,
        cloud_path: str,
        mime_type: str | None = None,
    ) -> bool:
        """cloud_path: имя папки на Drive или «папка/файл» (используется только имя файла)."""
        try:
            service = await self._get_service()
            folder_name = cloud_path.strip("/").split("/")[0] if cloud_path else "root"
            parent_id = (
                await asyncio.to_thread(_get_or_create_folder_sync, service, folder_name)
                if folder_name and folder_name != os.path.basename(local_path)
                else "root"
            )
            guessed, _ = mimetypes.guess_type(local_path)
            effective_mime = mime_type or guessed or "application/octet-stream"

            file_id = await asyncio.to_thread(
                _upload_file_sync,
                service,
                local_path,
                parent_id,
                effective_mime,
            )
            logger.info("Файл %s загружен в Google Drive (id=%s)", local_path, file_id)
            return True
        except Exception as exc:
            logger.error("Ошибка загрузки в Google Drive: %s", exc)
            return False

    async def upload_file_to_folder(
        self,
        local_path: str,
        folder_id: str,
        mime_type: str | None = None,
    ) -> bool:
        try:
            service = await self._get_service()
            guessed, _ = mimetypes.guess_type(local_path)
            effective_mime = mime_type or guessed or "application/octet-stream"
            await asyncio.to_thread(
                _upload_file_sync,
                service,
                local_path,
                folder_id,
                effective_mime,
            )
            return True
        except Exception as exc:
            logger.error("Ошибка загрузки в Google Drive: %s", exc)
            return False

    async def download_file(self, file_id: str, local_path: str) -> bool:
        try:
            service = await self._get_service()
            await asyncio.to_thread(_download_file_sync, service, file_id, local_path)
            logger.info("Файл %s скачан в %s", file_id, local_path)
            return True
        except Exception as exc:
            logger.error("Ошибка скачивания из Google Drive: %s", exc)
            return False

    async def list_files(self, folder_id: str = "root") -> list[dict[str, Any]]:
        try:
            service = await self._get_service()
            if folder_id != "root":
                return await asyncio.to_thread(_list_files_sync, service, folder_id)
            return await asyncio.to_thread(_list_files_sync, service, "root")
        except Exception as exc:
            logger.error("Ошибка list Google Drive: %s", exc)
            return []

    async def list_files_in_folder(self, folder_name: str) -> list[dict[str, Any]]:
        try:
            service = await self._get_service()
            folder_id = await asyncio.to_thread(
                _find_folder_sync, service, folder_name, "root"
            )
            if not folder_id:
                return []
            return await asyncio.to_thread(_list_files_sync, service, folder_id)
        except Exception as exc:
            logger.error("Ошибка list Google Drive: %s", exc)
            return []

    async def create_folder(self, folder_name: str, parent_id: str = "root") -> str | None:
        try:
            service = await self._get_service()
            folder_id = await asyncio.to_thread(
                _get_or_create_folder_sync,
                service,
                folder_name,
                parent_id,
            )
            logger.info("Папка %s (id=%s)", folder_name, folder_id)
            return folder_id
        except HttpError as exc:
            logger.error("Ошибка создания папки Google Drive: %s", exc)
            return None
        except Exception as exc:
            logger.error("Ошибка создания папки Google Drive: %s", exc)
            return None

    async def get_or_create_folder(self, folder_name: str, parent_id: str = "root") -> str | None:
        return await self.create_folder(folder_name, parent_id)

    async def ensure_folder_path(self, path: str) -> str | None:
        """Создаёт вложенные папки (например MyHealthDashboard/Backups) и возвращает id листа."""
        parts = [p for p in path.strip("/").split("/") if p]
        if not parts:
            return "root"
        parent_id = "root"
        for part in parts:
            folder_id = await self.create_folder(part, parent_id)
            if not folder_id:
                return None
            parent_id = folder_id
        return parent_id

    async def list_files_in_folder_by_id(self, folder_id: str) -> list[dict[str, Any]]:
        return await self.list_files(folder_id)

    async def file_exists_in_folder(self, folder_name: str, file_name: str) -> bool:
        items = await self.list_files_in_folder(folder_name)
        return any(item.get("name") == file_name and not item.get("is_dir") for item in items)

    async def revoke_token(self) -> bool:
        creds = await asyncio.to_thread(_get_credentials_sync, self._user_id)
        if creds is not None:
            await asyncio.to_thread(_revoke_credentials_sync, creds)
        await asyncio.to_thread(_delete_tokens_sync, user_id=self._user_id)
        return True
