# -*- coding: utf-8 -*-
"""Проверка X-User-ID для личных данных API."""
from __future__ import annotations

import sqlite3

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from backend.database.client_context import (
    clear_request_client_mode,
    set_request_client_mode,
)
from backend.database.request_context import clear_current_user_id, set_current_user_id
from backend.services.auth_user_service import get_user_by_id

PUBLIC_PREFIXES = (
    "/api/health",
    "/api/auth/",
    "/api/cloud/auth/",
    "/api/cloud/callback/",
    "/api/polar/auth",
    "/api/polar/callback",
    "/docs",
    "/redoc",
    "/openapi.json",
)


def _is_public_path(path: str) -> bool:
    if path in ("/docs", "/redoc", "/openapi.json"):
        return True
    return any(path.startswith(prefix) for prefix in PUBLIC_PREFIXES)


def _is_task_status_path(path: str) -> bool:
    return (
        path.startswith("/api/backup/import/status/")
        or path.startswith("/api/backup/export/status/")
        or         path.startswith("/api/account/warmup/status/")
        or path == "/api/account/warmup/current"
        or path == "/api/account/warmup/cancel"
        or path.startswith("/api/database/import/status/")
    )


class UserAuthMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        client_mode = request.headers.get("X-Forma-Client", "").strip() or None
        set_request_client_mode(client_mode)
        try:
            return await self._dispatch_authed(request, call_next)
        finally:
            clear_request_client_mode()

    async def _dispatch_authed(self, request: Request, call_next):
        if request.method == "OPTIONS":
            return await call_next(request)

        path = request.url.path
        if not path.startswith("/api") or _is_public_path(path):
            clear_current_user_id()
            return await call_next(request)

        raw = request.headers.get("X-User-ID", "").strip()
        if not raw:
            return JSONResponse(
                status_code=401,
                content={"detail": "Требуется заголовок X-User-ID. Войдите через облако."},
            )
        try:
            user_id = int(raw)
        except ValueError:
            return JSONResponse(
                status_code=401,
                content={"detail": "Некорректный X-User-ID"},
            )

        if _is_task_status_path(path):
            set_current_user_id(user_id)
            try:
                return await call_next(request)
            finally:
                clear_current_user_id()

        try:
            user = get_user_by_id(user_id)
        except sqlite3.OperationalError as err:
            if "locked" in str(err).lower():
                return JSONResponse(
                    status_code=503,
                    headers={"Retry-After": "2"},
                    content={
                        "detail": "База занята. Повторите запрос через несколько секунд.",
                        "error_code": "db_locked",
                    },
                )
            raise

        if user is None:
            return JSONResponse(
                status_code=401,
                content={"detail": "Пользователь не найден"},
            )

        set_current_user_id(user_id)
        try:
            return await call_next(request)
        finally:
            clear_current_user_id()
