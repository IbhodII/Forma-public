# -*- coding: utf-8 -*-
"""Запуск импорта FIT через API."""
from __future__ import annotations

from typing import Union

from fastapi import APIRouter, Body, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from backend.schemas.models import (
    FitSyncResponse,
    FitSyncStartedResponse,
    FitSyncStats,
    FitSyncTaskStatusResponse,
    IntegrationsSyncResponse,
    PolarSyncFetchResponse,
    PolarUploadResponse,
)
from backend.services.fit_importer_service import (
    FitImportAlreadyRunningError,
    get_fit_import_task,
    start_background_fit_import,
)
from backend.services.integration_sync_service import run_all_integrations
from backend.services.health_connect_sync_service import sync_health_connect_batch
from backend.services.health_connect_debug_service import build_health_connect_debug
from backend.services.health_connect_hub_service import build_health_connect_hub
from backend.services.polar_upload_service import PolarUploadDuplicateError, save_uploaded_polar_workout
from polar_file_parser import ALLOWED_UPLOAD_EXTENSIONS

router = APIRouter(tags=["sync"])


class HealthConnectSleepPayload(BaseModel):
    start_time: str
    end_time: str
    duration_seconds: int = 0
    light_seconds: int = 0
    deep_seconds: int = 0
    rem_seconds: int = 0
    external_id: str | None = None
    source: str = "health_connect"


class HealthConnectWorkoutPayload(BaseModel):
    external_id: str | None = None
    exercise_type: int | None = None
    start_time: str
    end_time: str
    date: str | None = None
    duration_sec: int = 0
    calories_kcal: float | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    distance_m: float | None = None
    steps: int | None = None
    heart_rate_samples: list[dict] | None = None


class HealthConnectData(BaseModel):
    date: str
    steps: int | None = None
    active_calories: float | None = None
    total_calories: float | None = None
    weight_kg: float | None = None
    sleep: HealthConnectSleepPayload | dict | None = None
    workouts: list[HealthConnectWorkoutPayload | dict] | None = None
    heart_rate_samples: list[dict] | None = None


class HealthConnectSyncBody(BaseModel):
    items: list[HealthConnectData] = Field(..., min_length=1)
    audit: dict | None = Field(
        None,
        description="Mobile diagnostics snapshot (permissions, raw/prepared summary) — not used for save logic",
    )
    device_label: str | None = Field(None, description="Phone model / platform label for debug")


class FitSyncBody(BaseModel):
    folder: str | None = Field(
        None,
        description="Папка с .fit; иначе — сохранённый путь из настроек или дефолт",
    )
    folder_path: str | None = Field(
        None,
        description="Alias для folder (обратная совместимость)",
    )
    reimport: bool = False


class IntegrationsSyncBody(BaseModel):
    fit_folder_path: str | None = Field(
        None,
        description="Папка с .fit; иначе — сохранённый путь из настроек или дефолт",
    )
    reimport_fit: bool = Field(
        False,
        description="Переимпорт FIT-файлов, уже учтённых ранее",
    )


def _folder_override(body: FitSyncBody | None) -> str | None:
    if not body:
        return None
    return (body.folder or body.folder_path or "").strip() or None


def _sync_fit_response(body: FitSyncBody | None) -> FitSyncResponse:
    from fit_importer import FitImportError

    from backend.services.fit_import_runner import (
        build_fit_import_message,
        fit_import_status_from_stats,
        run_fit_import,
    )

    override = _folder_override(body)
    reimport = bool(body.reimport) if body else False
    try:
        stats, folder = run_fit_import(override, reimport=reimport)
    except FitImportError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return FitSyncResponse(
        status=fit_import_status_from_stats(stats),
        message=build_fit_import_message(stats),
        stats=FitSyncStats(
            files=int(stats.get("files") or 0),
            imported=int(stats.get("imported") or 0),
            repaired=int(stats.get("repaired") or 0),
            skipped=int(stats.get("skipped") or 0),
            errors=int(stats.get("errors") or 0),
            files_seen=int(stats.get("files_seen") or stats.get("files") or 0),
            skipped_by_filename_date=int(stats.get("skipped_by_filename_date") or 0),
            parsed_files=int(stats.get("parsed_files") or 0),
            imported_files=int(stats.get("imported_files") or stats.get("imported") or 0),
            duplicates_skipped=int(stats.get("duplicates_skipped") or 0),
        ),
        folder=folder,
    )


@router.post(
    "/health-connect",
    summary="Синхронизация данных Health Connect",
    description=(
        "Принимает пакеты по дням (шаги, калории, сон, тренировки, пульс, вес) "
        "и сохраняет в workouts.db."
    ),
)
def api_sync_health_connect(body: HealthConnectSyncBody):
    try:
        payload = [item.model_dump() for item in body.items]
        return sync_health_connect_batch(
            payload,
            mobile_audit=body.audit,
            device_label=body.device_label,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get(
    "/health-connect/debug",
    summary="Отладка Health Connect: каталог полей и последняя синхронизация",
)
def api_sync_health_connect_debug():
    from backend.database.client_context import is_admin_browser_client

    if not is_admin_browser_client():
        raise HTTPException(status_code=403, detail="HC debug доступен только в admin browser")
    return build_health_connect_debug()


@router.get(
    "/health-connect/hub",
    summary="Health Connect hub: данные, источники, статус синхронизации",
)
def api_sync_health_connect_hub():
    return build_health_connect_hub()


@router.post(
    "/integrations",
    response_model=IntegrationsSyncResponse,
    summary="Запустить все интеграции",
    description=(
        "Принудительный запуск подключённых интеграций: "
        "FIT (Coospo) и загрузка новых тренировок Polar в очередь pending."
    ),
)
def api_sync_integrations(body: IntegrationsSyncBody | None = Body(None)):
    reimport_fit = bool(body.reimport_fit) if body else False
    fit_folder: str | None = None
    if body and body.fit_folder_path is not None:
        fit_folder = body.fit_folder_path.strip() or None
    result = run_all_integrations(
        reimport_fit=reimport_fit,
        fit_folder_path=fit_folder,
    )
    return IntegrationsSyncResponse(**result)


@router.post(
    "/fit",
    response_model=Union[FitSyncResponse, FitSyncStartedResponse],
    summary="Импорт FIT-файлов",
    description=(
        "По умолчанию — фоновый импорт (status=started, task_id). "
        "Опрос: GET /api/sync/fit/status/{task_id}. "
        "Синхронный режим: ?sync=true (блокирует до завершения)."
    ),
)
def api_sync_fit(
    sync: bool = Query(
        False,
        description="Синхронный импорт (отладка); иначе — фоновая задача",
    ),
    body: FitSyncBody | None = Body(None),
):
    if sync:
        return _sync_fit_response(body)

    override = _folder_override(body)
    reimport = bool(body.reimport) if body else False
    try:
        task = start_background_fit_import(override, reimport=reimport)
    except FitImportAlreadyRunningError as exc:
        raise HTTPException(
            status_code=409,
            detail={
                "message": str(exc),
                "task_id": exc.task_id,
            },
        ) from exc
    return FitSyncStartedResponse(
        status="started",
        task_id=task.task_id,
        message="Импорт FIT запущен в фоне",
    )


@router.get(
    "/fit/status/{task_id}",
    response_model=FitSyncTaskStatusResponse,
    summary="Статус фонового импорта FIT",
)
def api_sync_fit_status(task_id: str):
    task = get_fit_import_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача импорта не найдена")
    data = task.to_dict()
    return FitSyncTaskStatusResponse(**data)


@router.post(
    "/polar/fetch",
    response_model=PolarSyncFetchResponse,
    summary="Загрузить новые тренировки Polar",
    description=(
        "Запрашивает Polar AccessLink API и сохраняет новые тренировки "
        "в polar_pending_workouts (imported=0)."
    ),
)
def api_sync_polar_fetch():
    try:
        from sync_polar import sync_new_workouts

        new_count = sync_new_workouts()
    except RuntimeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        import requests

        if isinstance(exc, requests.RequestException):
            raise HTTPException(status_code=502, detail=f"Polar API: {exc}") from exc
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    if new_count > 0:
        message = f"Найдено {new_count} новых тренировок"
    else:
        message = "Нет новых тренировок"
    return PolarSyncFetchResponse(
        status="ok",
        new_count=new_count,
        message=message,
    )


@router.post(
    "/polar/upload",
    response_model=PolarUploadResponse,
    summary="Импорт тренировки Polar из файла (TCX, GPX, FIT)",
    description=(
        "Парсит файл и добавляет запись в polar_pending_workouts (imported=0). "
        "Повторная загрузка того же файла или тренировки за ту же дату и тип отклоняется."
    ),
)
async def api_sync_polar_upload(file: UploadFile = File(...)):
    filename = file.filename or ""
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""
    if f".{ext}" not in ALLOWED_UPLOAD_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail="Неподдерживаемый формат. Допустимы файлы .tcx, .gpx, .fit",
        )
    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="Файл пустой")
    max_bytes = 50 * 1024 * 1024
    if len(content) > max_bytes:
        raise HTTPException(status_code=400, detail="Файл слишком большой (максимум 50 МБ)")

    try:
        saved = save_uploaded_polar_workout(content, filename)
    except PolarUploadDuplicateError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except ImportError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return PolarUploadResponse(
        status="ok",
        message=(
            "Тренировка успешно импортирована и добавлена в список ожидания. "
            "Вы можете привязать её к тренировке в дашборде."
        ),
        polar_transaction_id=saved.get("polar_transaction_id"),
        date=saved.get("date"),
        type=saved.get("type"),
    )
