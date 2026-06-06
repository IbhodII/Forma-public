# -*- coding: utf-8 -*-
"""OAuth и операции с облачным хранилищем (Яндекс.Диск, Google Drive)."""
from __future__ import annotations

import logging
from urllib.parse import parse_qs, urlparse

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query, Request
from fastapi.responses import FileResponse, HTMLResponse, RedirectResponse
from pydantic import BaseModel, Field

from backend.schemas.models import OAuthDebugResponse

from backend.services.cloud_auto_backup_service import (
    configure_auto_backup,
    get_auto_backup_status,
)
from backend.database.db_utils import get_current_user_id
from backend.services.auth_user_service import find_or_create_cloud_user, user_session_payload
from backend.services.cloud_backup_service import (
    backup_to_google,
    backup_to_yandex,
    download_workouts_from_google,
    download_workouts_from_yandex,
    get_remote_backup_status,
    list_cloud_backups,
    download_cloud_backup_file,
    restore_database_from_cloud,
    sync_workouts_to_google,
    sync_workouts_to_yandex,
)
from backend.services.cloud_identity_service import fetch_google_identity, fetch_yandex_identity
from backend.services.cloud_storage_service import (
    YandexDiskService,
    _save_tokens_sync as save_yandex_tokens_sync,
    take_yandex_oauth_state,
)
from backend.services.oauth_popup_html import oauth_popup_html
from backend.services.oauth_redirect import (
    build_oauth_debug_snapshot,
    resolve_redirect_uri,
)
from backend.services.google_drive_service import (
    GoogleDriveService,
    _save_tokens_sync as save_google_tokens_sync,
    _expiry_iso,
    _take_oauth_state,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cloud", tags=["Cloud Storage"])
yandex_service = YandexDiskService()
google_service = GoogleDriveService()


class BackupRequest(BaseModel):
    provider: str = Field(..., description="'yandex' или 'google'")
    backup_type: str = Field(..., description="'database' или 'workouts'")
    auto_backup: bool = False


class SyncRequest(BaseModel):
    provider: str
    direction: str = Field(..., description="'upload' или 'download'")


class AutoBackupRequest(BaseModel):
    enable: bool = True


class RestoreBackupRequest(BaseModel):
    provider: str = Field(..., description="'yandex' или 'google'")
    filename: str | None = Field(None, description="Имя файла бэкапа; если пусто — последний")


def _yandex_oauth_error_message(error: str, redirect_uri: str | None = None) -> str:
    code = (error or "").strip().lower()
    redirect_hint = ""
    if redirect_uri:
        redirect_hint = (
            f" Зарегистрируйте в oauth.yandex.ru: {redirect_uri} "
            "(Настройки → Синхронизация → OAuth)."
        )
    hints = {
        "unauthorized_client": (
            "Приложение OAuth не разрешает запрошенные права. На oauth.yandex.ru откройте "
            "ваше приложение → «Доступ к данным» → включите «Яндекс.Диск» "
            "(cloud_api:disk.read и cloud_api:disk.write)."
            + redirect_hint
            + " Если в приложении только «Яндекс ID», задайте в .env: YANDEX_OAUTH_MODE=login."
        ),
        "invalid_scope": (
            "Неверный scope. Уберите YANDEX_EXTRA_SCOPES из .env или включите те же права "
            "в oauth.yandex.ru. По умолчанию нужны только права Яндекс.Диска."
        ),
        "access_denied": "Вы отменили доступ. Повторите вход и подтвердите права приложения.",
        "redirect_uri_mismatch": (
            "Redirect URI не совпадает с Callback URL в oauth.yandex.ru."
            + redirect_hint
        ),
    }
    hint = hints.get(code)
    if hint:
        return f"{error}: {hint}"
    return f"Ошибка авторизации: {error}"


def _google_oauth_error_message(error: str, redirect_uri: str | None = None) -> str:
    code = (error or "").strip().lower()
    redirect_hint = ""
    if redirect_uri:
        redirect_hint = (
            f" Зарегистрируйте в Google Cloud Console: {redirect_uri} "
            "(Настройки → Синхронизация → OAuth)."
        )
    hints = {
        "access_denied": "Вы отменили доступ. Повторите вход и подтвердите права приложения.",
        "redirect_uri_mismatch": (
            "Redirect URI не совпадает с зарегистрированным в Google Cloud Console."
            + redirect_hint
            + " 127.0.0.1 и localhost — разные URI. "
            "Если приложение в режиме Testing, добавьте email в Test users."
        ),
        "invalid_client": (
            "Неверный OAuth client. Проверьте GOOGLE_CLIENT_ID и GOOGLE_CLIENT_SECRET в .env."
        ),
    }
    hint = hints.get(code)
    if hint:
        return f"{error}: {hint}"
    return f"Ошибка авторизации: {error}"


def _resolve_oauth_redirect(
    provider: str,
    *,
    redirect_base_query: str | None,
    request_base: str,
) -> tuple[str, str, list[str]]:
    resolution = resolve_redirect_uri(
        "yandex" if provider == "yandex" else "google",
        redirect_base_query=redirect_base_query,
        request_base=request_base,
    )
    if not resolution.redirect_uri:
        raise HTTPException(
            status_code=503,
            detail=(
                f"Redirect URI для {provider} не настроен. "
                f"Задайте {'YANDEX' if provider == 'yandex' else 'GOOGLE'}_REDIRECT_URI "
                "или PUBLIC_API_BASE_URL в .env. "
                "См. GET /api/cloud/oauth-debug"
            ),
        )
    return resolution.redirect_uri, resolution.source, resolution.warnings


def _resolve_oauth_client_mode(
    request: Request,
    client_mode_query: str | None = None,
) -> str | None:
    from backend.database.client_context import get_request_client_mode

    explicit = (client_mode_query or "").strip().lower()
    if explicit in ("admin_browser", "desktop_app", "mobile_app"):
        return explicit
    return get_request_client_mode()


@router.get("/status/yandex")
async def yandex_status():
    """Проверка, подключён ли Яндекс.Диск для текущего локального пользователя."""
    return await YandexDiskService(user_id=get_current_user_id()).get_status()


@router.get("/status/google")
async def google_status():
    """Проверка, подключён ли Google Drive для текущего локального пользователя."""
    return await GoogleDriveService(user_id=get_current_user_id()).get_status()


@router.get("/auto-backup")
async def auto_backup_status():
    return await get_auto_backup_status()


@router.post("/backup/auto")
async def enable_auto_backup(body: AutoBackupRequest):
    """Включает или отключает ежедневный бэкап БД в Яндекс.Диск."""
    return await configure_auto_backup(body.enable)


def _oauth_html_auto_close(client_mode: str | None) -> int | None:
    """Desktop Electron closes popup from main process after IPC."""
    return None if client_mode == "desktop_app" else 800


@router.get("/oauth-status", summary="Диагностика OAuth для текущего пользователя")
async def oauth_status():
    """Проверка token/link без секретов (desktop debug)."""
    from backend.database import get_db
    from backend.services.cloud_account_service import load_cloud_account_tokens
    from backend.services.cloud_storage_service import yandex_status_sync
    from utils.constants import STORAGE_YANDEX

    uid = get_current_user_id()
    conn = get_db()
    try:
        link_row = conn.execute(
            """
            SELECT storage_provider, account_cloud_provider, account_cloud_user_id, updated_at
            FROM user_cloud_links
            WHERE user_id = ? AND storage_provider = ?
            LIMIT 1
            """,
            (uid, STORAGE_YANDEX),
        ).fetchone()
    finally:
        conn.close()

    token_row = load_cloud_account_tokens(STORAGE_YANDEX, uid)
    yandex = yandex_status_sync(user_id=uid)
    return {
        "user_id": uid,
        "yandex": {
            **yandex,
            "has_token_row": token_row is not None,
            "has_cloud_link": link_row is not None,
            "cloud_link": (
                {
                    "storage_provider": link_row["storage_provider"],
                    "account_cloud_provider": link_row["account_cloud_provider"],
                    "account_cloud_user_id": link_row["account_cloud_user_id"],
                    "updated_at": link_row["updated_at"],
                }
                if link_row
                else None
            ),
        },
    }


@router.get("/oauth-debug", response_model=OAuthDebugResponse)
async def oauth_debug(
    request: Request,
    redirect_base: str | None = Query(
        None,
        description="Базовый URL API для предпросмотра redirect (как в /auth/*)",
    ),
):
    """Диагностика OAuth redirect URI (без секретов)."""
    from backend.database.client_context import get_request_client_mode

    if get_request_client_mode() not in ("admin_browser", "desktop_app"):
        raise HTTPException(
            status_code=403,
            detail="OAuth debug доступен только в admin browser или desktop",
        )
    snapshot = build_oauth_debug_snapshot(
        redirect_base_query=redirect_base,
        request_base=str(request.base_url).rstrip("/"),
    )
    return OAuthDebugResponse(**snapshot)


@router.get("/auth/yandex")
async def auth_yandex(
    request: Request,
    link_user: int | None = Query(None, ge=1),
    redirect_base: str | None = Query(
        None,
        description="Базовый URL API (например http://192.168.31.210:8000) для входа с телефона",
    ),
    client_mode: str | None = Query(None, description="desktop_app | admin_browser | mobile_app"),
):
    """Начинает OAuth2-авторизацию для Яндекс.Диска."""
    request_base = str(request.base_url).rstrip("/")
    resolved_client_mode = _resolve_oauth_client_mode(request, client_mode)
    callback_uri, source, warnings = _resolve_oauth_redirect(
        "yandex",
        redirect_base_query=redirect_base,
        request_base=request_base,
    )
    for w in warnings:
        logger.warning("Yandex OAuth redirect: %s", w)
    logger.info(
        "Yandex OAuth start: redirect_uri=%s source=%s request_base=%s redirect_base=%s client_mode=%s",
        callback_uri,
        source,
        request_base,
        redirect_base,
        resolved_client_mode,
    )
    try:
        auth_url = await yandex_service.get_authorization_url(
            link_user_id=link_user,
            redirect_uri=callback_uri,
            client_mode=resolved_client_mode,
        )
        parsed_auth = urlparse(auth_url)
        auth_query = parse_qs(parsed_auth.query)
        logger.info(
            "oauth oauth_start_redirect_uri provider=yandex redirect_uri=%s source=%s client_mode=%s",
            (auth_query.get("redirect_uri") or [""])[0],
            source,
            resolved_client_mode,
        )
        logger.info("oauth yandex_authorize_url_full provider=yandex url=%s", auth_url)
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Yandex OAuth authorize URL build failed")
        raise HTTPException(status_code=500, detail=f"Yandex OAuth init failed: {exc}") from exc
    return RedirectResponse(auth_url)


@router.get("/callback/yandex")
async def callback_yandex(
    request: Request,
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
):
    """Callback URL для Яндекс.OAuth (HTML для закрытия popup)."""
    client_mode: str | None = None
    oauth_redirect: str | None = None
    logger.info(
        "oauth raw_callback_url provider=yandex url=%s query=%s",
        str(request.url),
        dict(request.query_params),
    )
    logger.info(
        "oauth callback_request_received provider=yandex request_url=%s query_params=%s code_present=%s state_present=%s error_present=%s",
        str(request.url),
        dict(request.query_params),
        bool(code),
        bool(state),
        bool(error),
    )
    if error:
        try:
            _link_user_id, stored_redirect, client_mode = take_yandex_oauth_state(state)
        except Exception:
            _link_user_id, stored_redirect, client_mode = None, oauth_redirect, None
        logger.warning(
            "oauth token_exchange_failed provider=yandex step=callback_error error=%s state=%s redirect_uri=%s",
            error,
            state,
            stored_redirect,
        )
        return HTMLResponse(
            oauth_popup_html(
                "yandex-disk-auth",
                "error",
                _yandex_oauth_error_message(error, stored_redirect),
                use_custom_scheme=client_mode != "desktop_app",
                auto_close_ms=_oauth_html_auto_close(client_mode),
            ),
            status_code=400,
        )
    if not code:
        raise HTTPException(status_code=400, detail="Параметр code обязателен")
    try:
        import asyncio

        link_user_id, oauth_redirect, client_mode = take_yandex_oauth_state(state)
        logger.info("oauth oauth_state_validated provider=yandex link_user_id=%s", link_user_id)
        logger.info("oauth oauth_code_extracted provider=yandex")
        logger.info(
            "oauth token_exchange_started provider=yandex link_user_id=%s redirect_uri=%s client_mode=%s",
            link_user_id,
            oauth_redirect,
            client_mode,
        )
        token_data = await yandex_service.exchange_code_for_token(
            code,
            persist=False,
            redirect_uri=oauth_redirect,
        )
        logger.info("oauth token_exchange_success provider=yandex")
        identity = fetch_yandex_identity(token_data["access_token"])
        acct_id = identity["cloud_user_id"]
        acct_provider = "yandex"

        if link_user_id:
            await asyncio.to_thread(
                save_yandex_tokens_sync,
                token_data["access_token"],
                token_data.get("refresh_token"),
                token_data.get("expires_in"),
                user_id=link_user_id,
                account_cloud_provider=acct_provider,
                account_cloud_user_id=acct_id,
                link_user_id=link_user_id,
            )
            user = None
            session_user_id = link_user_id
            linked_only = True
            logger.info("oauth token_saved provider=yandex user_id=%s linked_only=1", link_user_id)
            logger.info("oauth cloud_link_saved provider=yandex user_id=%s", link_user_id)
            logger.info(
                "Яндекс OAuth: облако привязано к локальному user_id=%s (account=%s)",
                link_user_id,
                acct_id,
            )
        else:
            user = find_or_create_cloud_user(
                cloud_provider=acct_provider,
                cloud_user_id=acct_id,
                display_email=identity.get("display_email"),
                display_name=identity.get("display_name"),
            )
            session_user_id = int(user["id"])
            await asyncio.to_thread(
                save_yandex_tokens_sync,
                token_data["access_token"],
                token_data.get("refresh_token"),
                token_data.get("expires_in"),
                user_id=session_user_id,
                account_cloud_provider=acct_provider,
                account_cloud_user_id=acct_id,
                link_user_id=session_user_id,
            )
            linked_only = False
            logger.info("oauth token_saved provider=yandex user_id=%s linked_only=0", session_user_id)
            logger.info("oauth cloud_link_saved provider=yandex user_id=%s", session_user_id)
            logger.info("Яндекс OAuth: вход user_id=%s account=%s", session_user_id, acct_id)

        session = user_session_payload(user) if user else {
            "user_id": session_user_id,
            "email": identity.get("display_email"),
            "cloud_provider": acct_provider,
        }
    except Exception as exc:
        logger.exception("oauth token_exchange_failed provider=yandex")
        return HTMLResponse(
            oauth_popup_html(
                "yandex-disk-auth",
                "error",
                f"Ошибка: {exc}",
                use_custom_scheme=client_mode != "desktop_app",
                auto_close_ms=_oauth_html_auto_close(client_mode),
            ),
            status_code=400,
        )
    return HTMLResponse(
        oauth_popup_html(
            "yandex-disk-auth",
            "success",
            "Яндекс.Диск подключён",
            user_id=session.get("user_id"),
            email=session.get("email"),
            cloud_provider="yandex",
            linked_only=linked_only,
            use_custom_scheme=client_mode != "desktop_app",
            auto_close_ms=_oauth_html_auto_close(client_mode),
        )
    )


@router.get("/auth/google")
async def auth_google(
    request: Request,
    link_user: int | None = Query(None, ge=1),
    redirect_base: str | None = Query(None),
    client_mode: str | None = Query(None, description="desktop_app | admin_browser | mobile_app"),
):
    """Начинает OAuth2-авторизацию Google Drive."""
    request_base = str(request.base_url).rstrip("/")
    resolved_client_mode = _resolve_oauth_client_mode(request, client_mode)
    callback_uri, source, warnings = _resolve_oauth_redirect(
        "google",
        redirect_base_query=redirect_base,
        request_base=request_base,
    )
    for w in warnings:
        logger.warning("Google OAuth redirect: %s", w)
    logger.info(
        "Google OAuth start: redirect_uri=%s source=%s request_base=%s redirect_base=%s client_mode=%s",
        callback_uri,
        source,
        request_base,
        redirect_base,
        resolved_client_mode,
    )
    try:
        auth_url = await google_service.get_authorization_url(
            link_user_id=link_user,
            redirect_uri=callback_uri,
            client_mode=resolved_client_mode,
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(auth_url)


@router.get("/callback/google")
async def callback_google(
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
):
    """Callback URL для Google OAuth."""
    if error:
        pending = _take_oauth_state(state)
        stored_redirect = (pending or {}).get("redirect_uri")
        client_mode = (pending or {}).get("client_mode")
        logger.warning(
            "Google OAuth callback error: error=%s state=%s redirect_uri=%s",
            error,
            state,
            stored_redirect,
        )
        return HTMLResponse(
            oauth_popup_html(
                "google-drive-auth",
                "error",
                _google_oauth_error_message(error, stored_redirect),
                use_custom_scheme=client_mode != "desktop_app",
            ),
            status_code=400,
        )
    if not code:
        raise HTTPException(status_code=400, detail="Параметр code обязателен")
    client_mode = None
    try:
        import asyncio

        token_data = await google_service.exchange_code_for_token(
            code,
            state=state,
            persist=False,
        )
        client_mode = token_data.get("client_mode")
        link_user_id = token_data.get("link_user_id")
        creds = token_data.get("credentials")
        if creds is None:
            raise RuntimeError("Google OAuth не вернул credentials")
        identity = fetch_google_identity(creds)
        acct_id = identity["cloud_user_id"]
        acct_provider = "google"

        if link_user_id:
            await asyncio.to_thread(
                save_google_tokens_sync,
                creds.token,
                creds.refresh_token,
                _expiry_iso(creds.expiry),
                user_id=link_user_id,
                account_cloud_provider=acct_provider,
                account_cloud_user_id=acct_id,
                link_user_id=link_user_id,
            )
            user = None
            session_user_id = link_user_id
            linked_only = True
            logger.info(
                "Google OAuth: облако привязано к локальному user_id=%s (account=%s)",
                link_user_id,
                acct_id,
            )
        else:
            user = find_or_create_cloud_user(
                cloud_provider=acct_provider,
                cloud_user_id=acct_id,
                display_email=identity.get("display_email"),
                display_name=identity.get("display_name"),
            )
            session_user_id = int(user["id"])
            await asyncio.to_thread(
                save_google_tokens_sync,
                creds.token,
                creds.refresh_token,
                _expiry_iso(creds.expiry),
                user_id=session_user_id,
                account_cloud_provider=acct_provider,
                account_cloud_user_id=acct_id,
                link_user_id=session_user_id,
            )
            linked_only = False

        session = user_session_payload(user) if user else {
            "user_id": session_user_id,
            "email": identity.get("display_email"),
            "cloud_provider": acct_provider,
        }
    except Exception as exc:
        logger.exception("Google OAuth callback failed")
        return HTMLResponse(
            oauth_popup_html(
                "google-drive-auth",
                "error",
                f"Ошибка: {exc}",
                use_custom_scheme=client_mode != "desktop_app",
            ),
            status_code=400,
        )
    return HTMLResponse(
        oauth_popup_html(
            "google-drive-auth",
            "success",
            "Google Drive подключён",
            user_id=session.get("user_id"),
            email=session.get("email"),
            cloud_provider="google",
            linked_only=linked_only,
            use_custom_scheme=client_mode != "desktop_app",
        )
    )


async def _run_backup(provider: str, backup_type: str, user_id: int) -> None:
    try:
        if provider == "yandex":
            result = await backup_to_yandex(backup_type, user_id=user_id)
        else:
            result = await backup_to_google(backup_type, user_id=user_id)
        logger.info("Фоновый бэкап завершён: %s", result)
    except Exception:
        logger.exception("Фоновый бэкап failed user_id=%s provider=%s", user_id, provider)


@router.post("/backup/google")
async def backup_google_endpoint(
    request: BackupRequest,
    background_tasks: BackgroundTasks,
):
    """Запускает бэкап в Google Drive."""
    if request.provider != "google":
        raise HTTPException(status_code=400, detail="Provider must be 'google'")
    if request.backup_type not in ("database", "workouts"):
        raise HTTPException(status_code=400, detail="backup_type must be database or workouts")

    user_id = get_current_user_id()
    logger.info(
        "Запуск бэкапа Google: type=%s user_id=%s",
        request.backup_type,
        user_id,
    )
    background_tasks.add_task(_run_backup, "google", request.backup_type, user_id)
    return {
        "status": "started",
        "message": f"Бэкап {request.backup_type} в Google Drive запущен (профиль user_id={user_id})",
        "user_id": user_id,
    }


@router.post("/backup")
async def backup_data(request: BackupRequest, background_tasks: BackgroundTasks):
    """Запускает бэкап в фоне для текущего локального пользователя."""
    if request.backup_type not in ("database", "workouts"):
        raise HTTPException(status_code=400, detail="backup_type must be database or workouts")

    user_id = get_current_user_id()
    provider = request.provider
    if provider not in ("yandex", "google"):
        raise HTTPException(status_code=400, detail="Provider not supported")

    logger.info(
        "Запуск бэкапа: provider=%s type=%s user_id=%s",
        provider,
        request.backup_type,
        user_id,
    )
    background_tasks.add_task(_run_backup, provider, request.backup_type, user_id)
    return {
        "status": "started",
        "message": (
            f"Бэкап {request.backup_type} ({provider}) запущен для профиля user_id={user_id}"
        ),
        "user_id": user_id,
    }


@router.post("/sync")
async def sync_files(request: SyncRequest):
    """Синхронизирует файлы тренировок с облаком."""
    user_id = get_current_user_id()
    if request.direction == "upload":
        if request.provider == "yandex":
            count = await sync_workouts_to_yandex(user_id=user_id)
            logger.info("Upload yandex: %s files user_id=%s", count, user_id)
            return {"status": "success", "uploaded": count, "user_id": user_id}
        if request.provider == "google":
            count = await sync_workouts_to_google(user_id=user_id)
            return {"status": "success", "uploaded": count, "user_id": user_id}
    elif request.direction == "download":
        if request.provider == "yandex":
            count = await download_workouts_from_yandex(user_id=user_id)
            return {"status": "success", "downloaded": count, "user_id": user_id}
        if request.provider == "google":
            count = await download_workouts_from_google(user_id=user_id)
            return {"status": "success", "downloaded": count, "user_id": user_id}

    raise HTTPException(
        status_code=400,
        detail="provider must be yandex or google; direction upload or download",
    )


@router.post("/revoke/yandex")
async def revoke_yandex():
    """Отключает аккаунт Яндекс.Диска для текущего профиля."""
    await YandexDiskService(user_id=get_current_user_id()).revoke_token()
    return {
        "status": "success",
        "message": "Аккаунт Яндекс.Диска отключён",
    }


@router.post("/revoke/google")
async def revoke_google():
    """Отключает аккаунт Google Drive для текущего профиля."""
    await GoogleDriveService(user_id=get_current_user_id()).revoke_token()
    return {
        "status": "success",
        "message": "Аккаунт Google Drive отключён",
    }


@router.get("/backup/list")
async def backup_list(provider: str = Query(..., pattern="^(yandex|google)$")):
    """Список бэкапов БД в облаке (общие для аккаунта Яндекс/Google)."""
    items = await list_cloud_backups(provider)
    return {"backups": items, "user_id": get_current_user_id()}


@router.get("/backup/remote-status")
async def remote_backup_status(provider: str = Query(..., pattern="^(yandex|google)$")):
    """Проверка наличия бэкапов в облаке."""
    return await get_remote_backup_status(provider)


@router.get("/backup/download")
async def download_backup_file(
    provider: str = Query(..., pattern="^(yandex|google)$"),
    filename: str | None = Query(None),
):
    """Download cloud workouts.db backup for diagnostics (does not restore locally)."""
    tmp_path, target_name, _size = await download_cloud_backup_file(provider, filename)
    return FileResponse(
        path=str(tmp_path),
        filename=target_name,
        media_type="application/octet-stream",
        background=None,
    )


@router.post("/backup/restore")
async def restore_backup(body: RestoreBackupRequest):
    """
    Восстановление workouts.db из облака (перезаписывает локальную БД).
    После восстановления перезапустите API.
    """
    return await restore_database_from_cloud(body.provider, body.filename)
