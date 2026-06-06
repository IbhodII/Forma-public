# -*- coding: utf-8 -*-
"""Polar AccessLink: OAuth, очередь тренировок, привязка."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query, Request
from fastapi.responses import HTMLResponse, RedirectResponse

from backend.services.oauth_popup_html import oauth_popup_html
from backend.schemas.models import (
    PolarAttachBody,
    PolarAttachResponse,
    PolarConnectionStatus,
    PolarPendingListResponse,
    PolarPendingWorkout,
)
from backend.services import polar_attach_service
from backend.services.auth_user_service import get_user_by_id
from backend.services.polar_oauth_service import (
    disconnect_polar,
    exchange_code_and_save,
    get_authorization_url,
    get_connection_status,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["polar"])


@router.get(
    "/status",
    response_model=PolarConnectionStatus,
    summary="Статус подключения Polar Flow",
)
def api_polar_status():
    return PolarConnectionStatus(**get_connection_status())


@router.get(
    "/auth",
    summary="Начать OAuth Polar Flow",
)
def api_polar_auth(
    request: Request,
    link_user: int | None = Query(None, ge=1),
    redirect_base: str | None = Query(
        None,
        description="Базовый URL API (например http://127.0.0.1:8000) для OAuth callback",
    ),
):
    if link_user is not None:
        if get_user_by_id(link_user) is None:
            raise HTTPException(status_code=404, detail="Пользователь не найден")
        local_user_id = link_user
    else:
        local_user_id = None
    try:
        url = get_authorization_url(
            local_user_id,
            redirect_base_query=redirect_base,
            request_base=str(request.base_url).rstrip("/"),
        )
    except (ValueError, RuntimeError) as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    return RedirectResponse(url)


@router.get(
    "/callback",
    summary="OAuth callback Polar Flow",
    include_in_schema=False,
)
def api_polar_callback(
    code: str | None = None,
    error: str | None = None,
    state: str | None = None,
):
    if error:
        return HTMLResponse(
            oauth_popup_html("polar-auth", "error", f"Ошибка Polar: {error}"),
            status_code=400,
        )
    if not code:
        raise HTTPException(status_code=400, detail="Параметр code обязателен")
    try:
        exchange_code_and_save(code, state)
    except Exception as exc:
        logger.exception("Polar OAuth callback failed")
        return HTMLResponse(
            oauth_popup_html("polar-auth", "error", f"Ошибка: {exc}"),
            status_code=400,
        )
    return HTMLResponse(
        oauth_popup_html("polar-auth", "success", "Polar Flow подключён"),
    )


@router.delete(
    "/disconnect",
    summary="Отключить аккаунт Polar",
)
def api_polar_disconnect():
    disconnect_polar()
    return {"message": "ok", "connected": False}


@router.get(
    "/pending/list",
    response_model=PolarPendingListResponse,
    summary="Список неимпортированных тренировок Polar",
)
def api_list_polar_pending():
    rows = polar_attach_service.list_pending_workouts()
    items = [dict(r) for r in rows]
    return PolarPendingListResponse(items=items, total=len(items))


@router.delete(
    "/pending",
    summary="Удалить непривязанную тренировку из очереди Polar",
)
def api_delete_polar_pending(
    polar_transaction_id: str = Query(..., min_length=1),
):
    try:
        polar_attach_service.delete_pending_workout(polar_transaction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "ok"}


@router.delete(
    "/pending/manual",
    summary="Удалить вручную загруженную тренировку из очереди",
    deprecated=True,
)
def api_delete_manual_polar_pending(
    polar_transaction_id: str = Query(..., min_length=1, description="upload:…"),
):
    try:
        polar_attach_service.delete_manual_pending_workout(polar_transaction_id)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": "ok"}


@router.get(
    "/pending/{date}",
    response_model=PolarPendingWorkout,
    summary="Первая неимпортированная тренировка Polar за дату",
)
def api_get_polar_pending(
    date: str,
    type: str = Query(..., description="бег | вело | бассейн | силовая"),
):
    try:
        row = polar_attach_service.get_pending_workout(date, type)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if row is None:
        raise HTTPException(
            status_code=404,
            detail="Нет неимпортированной тренировки Polar за эту дату и тип",
        )
    return PolarPendingWorkout.model_validate(row)
