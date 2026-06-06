# -*- coding: utf-8 -*-
"""Сессия пользователя (локальное приложение, X-User-ID)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.database.client_context import is_admin_browser_client
from backend.database.db_utils import get_current_user_id
from backend.services.auth_scope_service import (
    build_scope_debug,
    get_link_candidate,
    rebind_cloud_to_local_profile,
)
from backend.services.auth_user_service import (
    ensure_local_desktop_user,
    get_user_by_id,
    user_session_payload,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/desktop-login")
def auth_desktop_login():
    """
    Основной вход desktop: локальный профиль (по умолчанию user_id=1).
    Не требует OAuth; создаёт users/user_profile при первом запуске.
    """
    from backend.database.client_context import get_request_client_mode

    mode = get_request_client_mode()
    if mode not in ("desktop_app", "admin_browser"):
        raise HTTPException(
            status_code=403,
            detail="Локальный вход доступен только в Forma desktop или admin browser",
        )
    user = ensure_local_desktop_user()
    return user_session_payload(user)


@router.get("/me")
def auth_me():
    """Текущий пользователь по X-User-ID."""
    user = get_user_by_id(get_current_user_id())
    if user is None:
        raise HTTPException(status_code=401, detail="Пользователь не найден")
    return user_session_payload(user)


@router.get("/link-candidate")
def auth_link_candidate():
    """
    Публично: нужно ли при первом OAuth привязать облако к user id=1 (десктоп без сессии).
    """
    return get_link_candidate()


@router.get("/scope-debug")
def auth_scope_debug():
    """Диагностика data scope (admin browser или desktop_app)."""
    from backend.database.client_context import get_request_client_mode

    mode = get_request_client_mode()
    if mode not in ("admin_browser", "desktop_app"):
        raise HTTPException(
            status_code=403,
            detail="scope-debug доступен в admin browser или Forma desktop",
        )
    return build_scope_debug()


@router.post("/rebind-cloud-to-user")
def auth_rebind_cloud_to_user(
    target_user_id: int = Query(1, ge=1, description="Обычно 1 — локальный профиль"),
):
    """
    Перенос облачной привязки и user-scoped строк на целевой профиль.
    Admin browser или desktop_app при scope_mismatch.
    """
    from backend.database.client_context import get_request_client_mode

    debug = build_scope_debug()
    mode = get_request_client_mode()
    allowed = is_admin_browser_client() or (
        mode == "desktop_app" and debug.get("scope_mismatch_suspected")
    )
    if not allowed:
        raise HTTPException(
            status_code=403,
            detail="Перепривязка доступна в admin browser или при подозрении на рассинхрон scope",
        )
    result = rebind_cloud_to_local_profile(target_user_id=target_user_id)
    return result
