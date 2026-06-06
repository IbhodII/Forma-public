# -*- coding: utf-8 -*-
"""
Health Dashboard API (FastAPI).

Запуск из корня проекта:
    uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import sys
import time
from pathlib import Path
from typing import Any

# Корень репозитория в PYTHONPATH (database/, utils/, fit_importer.py)
ROOT = Path(__file__).resolve().parent.parent
BACKEND_DIR = Path(__file__).resolve().parent
_data_dir_env = os.environ.get("FORMA_DATA_DIR", "").strip()
if _data_dir_env:
    LOG_DIR = Path(_data_dir_env).expanduser() / "logs"
else:
    LOG_DIR = BACKEND_DIR / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
LOG_FILE = LOG_DIR / "api.log"

_LOG_FORMAT = "%(asctime)s - %(levelname)s - %(message)s"
logger = logging.getLogger("health_api")
logger.setLevel(logging.INFO)
logger.propagate = False
if not logger.handlers:
    _formatter = logging.Formatter(_LOG_FORMAT)
    _stream = logging.StreamHandler()
    _stream.setFormatter(_formatter)
    _file = logging.FileHandler(LOG_FILE, encoding="utf-8")
    _file.setFormatter(_formatter)
    logger.addHandler(_stream)
    logger.addHandler(_file)
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.core.env import google_oauth_configured, load_project_env, yandex_oauth_configured

_env_path = load_project_env()

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.middleware.user_auth import UserAuthMiddleware
from backend.routers import (
    account_warmup,
    analytics,
    auth,
    backup,
    database_diagnostics,
    database_export,
    database_import,
    mini_database,
    bike_settings,
    body,
    cardio,
    cloud,
    dashboard,
    forma_sync,
    food,
    menstrual_cycle,
    nutrition,
    passive_hr_analytics,
    polar,
    presets,
    steps,
    strength,
    stretching,
    sync,
    user,
    weight,
    sleep,
)

app = FastAPI(
    title="Health Dashboard API",
    description="Бэкенд для React-клиента",
    version="1.0.0",
)

_uploads_dir = BACKEND_DIR / "uploads"
_uploads_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(_uploads_dir)), name="uploads")


def _detail_content(detail: object, default: str) -> str | dict[str, Any] | list[Any]:
    """Preserve structured FastAPI detail (dict/list) for JSON; stringify only scalars."""
    if detail is None:
        return default
    if isinstance(detail, (str, dict, list)):
        return detail
    return str(detail)


def _json_safe_validation_errors(exc: RequestValidationError) -> list[dict[str, Any]]:
    """errors() для JSONResponse (ctx/input без несериализуемых объектов)."""
    try:
        raw = exc.errors()
    except Exception:
        return [{"msg": str(exc)}]
    try:
        return json.loads(json.dumps(raw, default=str))
    except (TypeError, ValueError):
        return [{"msg": "Validation Error"}]


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    """HTTPException (400, 404, …) → JSON {"detail": "..."}."""
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": _detail_content(exc.detail, "Error")},
    )


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    """404 Not Found → JSON."""
    detail = "Not Found"
    if isinstance(exc, HTTPException):
        detail = _detail_content(exc.detail, "Not Found")
    elif getattr(exc, "detail", None) is not None:
        detail = _detail_content(exc.detail, "Not Found")
    return JSONResponse(status_code=404, content={"detail": detail})


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request, exc: RequestValidationError
):
    """Ошибки валидации тела/query → 422."""
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={
            "detail": "Validation Error",
            "errors": _json_safe_validation_errors(exc),
        },
    )


@app.exception_handler(422)
async def unprocessable_entity_handler(request: Request, exc):
    """422 Unprocessable Entity → JSON."""
    if isinstance(exc, RequestValidationError):
        return JSONResponse(
            status_code=422,
            content={
                "detail": "Validation Error",
                "errors": _json_safe_validation_errors(exc),
            },
        )
    return JSONResponse(
        status_code=422,
        content={"detail": _detail_content(exc, "Validation Error")},
    )


@app.exception_handler(500)
async def server_error_handler(request: Request, exc):
    """Явный HTTP 500 → JSON."""
    detail = "Internal Server Error"
    if isinstance(exc, HTTPException):
        detail = _detail_content(exc.detail, "Internal Server Error")
    return JSONResponse(status_code=500, content={"detail": detail})


@app.exception_handler(sqlite3.OperationalError)
async def sqlite_operational_error_handler(request: Request, exc: sqlite3.OperationalError):
    msg = str(exc)
    if "locked" in msg.lower():
        return JSONResponse(
            status_code=503,
            headers={"Retry-After": "2"},
            content={
                "detail": "База занята. Повторите запрос через несколько секунд.",
                "error_code": "db_locked",
            },
        )
    logger.exception("Unhandled sqlite3.OperationalError on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Необработанные исключения → 500 JSON."""
    logger.exception("Unhandled exception on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"detail": "Internal Server Error"},
    )


app.add_middleware(UserAuthMiddleware)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ],
    # Доступ с телефона/планшета по IP в локальной сети (http://192.168.x.x:5173)
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def database_import_lock_middleware(request: Request, call_next):
    """Блокирует API на время импорта БД (кроме status polling)."""
    path = request.url.path
    if path.startswith("/api") and path != "/api/health" and not path.startswith(
        ("/api/database/import/status/", "/api/database/export/status/", "/api/database/export/result/")
    ):
        try:
            from backend.services.database_import_tasks import is_database_import_in_progress

            if is_database_import_in_progress():
                import_job_id = None
                try:
                    from backend.services.database_import_tasks import _read_lock_task_id, import_lock_path

                    import_job_id = _read_lock_task_id(import_lock_path())
                except Exception:
                    pass
                body: dict = {
                    "detail": "Выполняется импорт базы. Повторите запрос через несколько секунд.",
                    "error_code": "import_in_progress",
                }
                if import_job_id:
                    body["import_job_id"] = import_job_id
                return JSONResponse(
                    status_code=503,
                    headers={"Retry-After": "3"},
                    content=body,
                )
        except Exception:
            pass
    return await call_next(request)


_PROFILE_PATH_PREFIXES = (
    "/api/dashboard/",
    "/api/body/overview",
    "/api/weight/daily",
    "/api/sync/health-connect/hub",
)


@app.middleware("http")
async def log_requests(request: Request, call_next):
    """Лог каждого запроса: метод, путь, статус, время (мс)."""
    path = request.url.path
    profile_detail = any(path.startswith(p) for p in _PROFILE_PATH_PREFIXES)
    if profile_detail:
        from backend.utils.api_profiling import _profile_enabled, reset_sql_profile

        reset_sql_profile()
        _profile_enabled.set(True)
    start = time.perf_counter()
    try:
        response = await call_next(request)
    except sqlite3.OperationalError as err:
        message = str(err).lower()
        should_self_heal = "no such table" in message or "no such column" in message
        if not should_self_heal:
            raise
        logger.warning(
            "SQLite schema issue on %s %s: %s. Running shared legacy repair and retrying once.",
            request.method,
            request.url.path,
            err,
        )
        from backend.database.db_utils import repair_shared_schema

        repair_shared_schema()
        response = await call_next(request)
    duration_ms = (time.perf_counter() - start) * 1000
    logger.info(
        "%s %s -> %s (%.2fms)",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )
    if profile_detail:
        from backend.utils.api_profiling import _profile_enabled, log_request_profile

        _profile_enabled.set(False)
        resp_bytes = None
        try:
            cl = response.headers.get("content-length")
            if cl:
                resp_bytes = int(cl)
        except (TypeError, ValueError):
            pass
        log_request_profile(
            method=request.method,
            path=path,
            status_code=response.status_code,
            duration_ms=duration_ms,
            response_bytes=resp_bytes,
        )
    if os.environ.get("FORMA_DEV_TIMING", "").strip() == "1" or __debug__:
        response.headers["X-Response-Time-Ms"] = f"{duration_ms:.2f}"
    return response


app.include_router(strength.router, prefix="/api/strength", tags=["strength"])
app.include_router(presets.router, prefix="/api/presets", tags=["presets"])
app.include_router(stretching.router, prefix="/api/stretching", tags=["stretching"])
app.include_router(
    menstrual_cycle.router,
    prefix="/api/menstrual-cycle",
    tags=["menstrual-cycle"],
)
app.include_router(cardio.router, prefix="/api/cardio", tags=["cardio"])
app.include_router(body.router, prefix="/api/body", tags=["body"])
app.include_router(dashboard.router, prefix="/api")
app.include_router(analytics.router, prefix="/api/analytics", tags=["analytics"])
app.include_router(passive_hr_analytics.router)
app.include_router(weight.router, prefix="/api/weight", tags=["weight"])
app.include_router(steps.router, prefix="/api/steps", tags=["steps"])
app.include_router(sleep.router, prefix="/api/sleep", tags=["sleep"])
app.include_router(food.router, prefix="/api/food", tags=["Дневник питания"])
app.include_router(nutrition.router, prefix="/api/nutrition", tags=["nutrition"])
# Совместимость со старым префиксом cut-bulk (десктоп/мобильные сборки).
app.include_router(nutrition.router, prefix="/api/cut-bulk", tags=["nutrition-legacy"])
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(polar.router, prefix="/api/polar", tags=["polar"])
app.include_router(auth.router, prefix="/api")
app.include_router(cloud.router, prefix="/api")
app.include_router(forma_sync.router, prefix="/api")
app.include_router(user.router, prefix="/api/user", tags=["user"])
app.include_router(bike_settings.router, prefix="/api/user", tags=["bike"])
app.include_router(backup.router, prefix="/api")
app.include_router(database_import.router, prefix="/api")
app.include_router(database_export.router, prefix="/api")
app.include_router(database_diagnostics.router, prefix="/api")
app.include_router(mini_database.router, prefix="/api")
app.include_router(account_warmup.router, prefix="/api")


@app.get("/api/health")
def health_check():
    """Проверка доступности API и БД."""
    from backend.database import DB_PATH
    from backend.services import food_service
    from database.connection import SHARED_DB_PATH

    return {
        "status": "ok",
        "database": str(DB_PATH),
        "database_exists": DB_PATH.is_file(),
        "shared_database": str(SHARED_DB_PATH),
        "shared_database_exists": SHARED_DB_PATH.is_file(),
        "food_products_count": food_service.count_products(),
    }


@app.on_event("startup")
def on_startup_db_schema():
    """Схема БД должна быть готова до cloud backup/sync и остальных startup-хуков."""
    forma_dir = os.environ.get("FORMA_DATA_DIR", "").strip()
    if forma_dir:
        logger.info("[API] FORMA_DATA_DIR=%s (workouts.db may be shared with Forma.exe)", forma_dir)
        logger.warning(
            "[API] If Forma.exe is open on the same database, expect 'database is locked' on import/sync. "
            "Use separate FORMA_DATA_DIR for dev or close packaged app."
        )
    try:
        from database.migrations import ensure_all_exercises_catalog, ensure_db_schema

        ensure_db_schema()
    except Exception as err:
        logger.warning("[API] ensure_db_schema: %s", err)
        try:
            from database.migrations import ensure_all_exercises_catalog

            ensure_all_exercises_catalog()
            logger.info("[API] all_exercises catalog ensured after schema error")
        except Exception as cat_err:
            logger.error("[API] ensure_all_exercises_catalog: %s", cat_err)
            return
    try:
        from backend.database.db_utils import repair_forma_sync_tracking, repair_shared_schema

        repair_forma_sync_tracking()
        repair_shared_schema()
    except Exception as err:
        logger.warning("[API] repair_shared_schema: %s", err)
    try:
        from backend.services.database_import_tasks import clear_stale_import_lock

        if clear_stale_import_lock(log=logger):
            logger.info("[API] cleared stale database import lock from previous run")
    except Exception as err:
        logger.warning("[API] import lock cleanup: %s", err)
    try:
        from backend.services import food_service

        n = food_service.ensure_products_catalog()
        if n:
            logger.info("food_products: %s записей в справочнике", n)
    except Exception as err:
        logger.warning("[API] food products auto-import: %s", err)
    logger.info("[API] startup complete — API ready")


@app.on_event("startup")
def on_startup_log_env():
    if _env_path:
        logger.info("[API] .env loaded from %s", _env_path)
    else:
        logger.warning("[API] .env not found (expected at %s)", ROOT / ".env")
    if yandex_oauth_configured():
        logger.info("[API] Yandex Disk OAuth: configured")
    else:
        logger.warning("[API] Yandex Disk OAuth: YANDEX_CLIENT_ID missing in .env")
    if google_oauth_configured():
        logger.info("[API] Google Drive OAuth: configured")
    else:
        logger.warning("[API] Google Drive OAuth: GOOGLE_CLIENT_ID missing in .env")


@app.on_event("startup")
async def on_startup_cloud_auto_backup():
    try:
        from backend.services.cloud_auto_backup_service import resume_auto_backup_if_enabled

        await resume_auto_backup_if_enabled()
    except Exception as err:
        logger.warning("[API] cloud auto-backup: %s", err)


@app.on_event("startup")
async def on_startup_forma_sync_download():
    """Fire-and-forget FormaSync download when Yandex is connected."""
    import asyncio
    import threading

    def _run() -> None:
        try:
            from backend.database.db_utils import get_current_user_id
            from backend.services.forma_sync import sync_meta
            from backend.services.forma_sync.engine import download_forma_sync_only
            from backend.services.forma_sync.sync_state import is_sync_in_flight
            from backend.services.forma_sync.yandex_api import is_yandex_connected

            uid = get_current_user_id()
            if not sync_meta.is_auto_enabled():
                return
            if is_sync_in_flight():
                return
            if not is_yandex_connected(uid):
                return
            asyncio.run(download_forma_sync_only(uid))
        except Exception as err:
            logger.debug("[API] forma-sync startup download: %s", err)

    threading.Thread(target=_run, name="forma-sync-startup", daemon=True).start()


@app.on_event("startup")
def on_startup_local_backup_scheduler():
    try:
        from backend.services.local_backup_scheduler import start_local_backup_scheduler

        start_local_backup_scheduler()
    except Exception as err:
        logger.warning("[API] local backup scheduler: %s", err)


@app.on_event("shutdown")
def on_shutdown_local_backup_scheduler():
    try:
        from backend.services.local_backup_scheduler import stop_local_backup_scheduler

        stop_local_backup_scheduler()
    except Exception as err:
        logger.warning("[API] local backup scheduler shutdown: %s", err)


def _resolve_frontend_static_dir() -> Path | None:
    env_dir = os.environ.get("FORMA_STATIC_DIR")
    if env_dir:
        p = Path(env_dir)
        if p.exists():
            return p

    if getattr(sys, "frozen", False):
        frozen_dir = Path(getattr(sys, "_MEIPASS", "")) / "frontend" / "dist"
        if frozen_dir.exists():
            return frozen_dir
        return None

    web_dist = ROOT / "frontend" / "dist"
    if web_dist.exists():
        return web_dist
    return None


if os.environ.get("FORMA_SERVE_STATIC", "").strip() == "1":
    _frontend_dist = _resolve_frontend_static_dir()
    if _frontend_dist:
        app.mount("/", StaticFiles(directory=str(_frontend_dist), html=True), name="frontend")
