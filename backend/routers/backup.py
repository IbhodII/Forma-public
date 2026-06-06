# -*- coding: utf-8 -*-
"""JSON full backup export/import API."""
from __future__ import annotations

import json
import os
import sqlite3
import uuid
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, BackgroundTasks, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, Response
from pydantic import BaseModel, Field

from backend.database.db_utils import get_current_user_id
from backend.services.backup_export_tasks import (
    BackupExportAlreadyRunningError,
    consume_backup_export_file,
    get_backup_export_task,
    start_backup_export,
)
from backend.services.backup_import_tasks import (
    BackupImportAlreadyRunningError,
    get_backup_import_task,
    start_backup_import,
    start_backup_import_from_spooled_file,
)
from backend.services.database_import_tasks import import_jobs_root
from backend.services.backup_json_service import (
    SCHEMA_VERSION,
    export_full_backup,
    import_full_backup,
    remark_strength_workouts_pending,
)

router = APIRouter(prefix="/backup", tags=["backup"])


class ImportReportResponse(BaseModel):
    imported: dict[str, int] = Field(default_factory=dict)
    updated: dict[str, int] = Field(default_factory=dict)
    skipped: dict[str, int] = Field(default_factory=dict)
    errors: list[str] = Field(default_factory=list)
    skipped_tables: list[str] = Field(default_factory=list)
    fatal_error: str | None = None
    warmup_recommended: bool | None = None
    warmup_task_id: str | None = None
    warmup_auto_error: str | None = None


class ImportStartedResponse(BaseModel):
    task_id: str
    status: str = "running"


class ImportStatusResponse(BaseModel):
    task_id: str
    status: str
    phase: str
    current: int
    total: int
    table: str
    percent: int
    message: str
    error: str | None = None
    report: ImportReportResponse | None = None


class RemarkStrengthResponse(BaseModel):
    sessions: int
    rows_marked: int


class ExportStartedResponse(BaseModel):
    task_id: str
    status: str = "running"


class ExportStatusResponse(BaseModel):
    task_id: str
    status: str
    phase: str
    current: int
    total: int
    table: str
    percent: int
    message: str
    error: str | None = None


@router.get("/schema")
async def backup_schema() -> dict[str, Any]:
    return {
        "schema_version": SCHEMA_VERSION,
        "modes": ["merge", "replace"],
        "description": "Full user data export; excludes cloud_tokens and users.",
    }


@router.post("/export/start", response_model=ExportStartedResponse)
async def backup_export_start() -> ExportStartedResponse:
    uid = int(get_current_user_id())
    try:
        task = start_backup_export(uid)
        return ExportStartedResponse(task_id=task.task_id)
    except BackupExportAlreadyRunningError as err:
        raise HTTPException(
            status_code=409,
            detail={"message": "Экспорт уже выполняется", "task_id": err.task_id},
        ) from err


@router.get("/export/status/{task_id}", response_model=ExportStatusResponse)
async def backup_export_status(task_id: str) -> ExportStatusResponse:
    uid = int(get_current_user_id())
    task = get_backup_export_task(task_id)
    if not task or task.user_id != uid:
        raise HTTPException(status_code=404, detail="Задача экспорта не найдена")
    return ExportStatusResponse(**task.to_dict())


@router.get("/export/result/{task_id}")
async def backup_export_result(
    task_id: str,
    background_tasks: BackgroundTasks,
) -> FileResponse:
    uid = int(get_current_user_id())
    consumed = consume_backup_export_file(task_id, uid)
    if not consumed:
        task = get_backup_export_task(task_id)
        if not task or task.user_id != uid:
            raise HTTPException(status_code=404, detail="Задача экспорта не найдена")
        if task.status == "running":
            raise HTTPException(status_code=409, detail="Экспорт ещё выполняется")
        raise HTTPException(status_code=404, detail="Файл экспорта недоступен")
    path, filename = consumed
    def _remove_export_file(file_path: str = path) -> None:
        try:
            os.remove(file_path)
        except OSError:
            pass

    background_tasks.add_task(_remove_export_file)
    return FileResponse(
        path,
        media_type="application/json",
        filename="forma_backup_v1.json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/export")
async def backup_export(
    user_id: int | None = Query(None, description="Defaults to current X-User-ID"),
) -> Response:
    uid = int(user_id if user_id is not None else get_current_user_id())
    payload = export_full_backup(uid)
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return Response(
        content=body,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{SCHEMA_VERSION}.json"',
        },
    )


@router.post("/import/start", response_model=ImportStartedResponse)
async def backup_import_start(
    mode: Literal["merge", "replace"] = Query("merge"),
    file: UploadFile = File(...),
) -> ImportStartedResponse:
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail="mode must be merge or replace")
    uid = int(get_current_user_id())
    task_id = str(uuid.uuid4())
    job_dir = import_jobs_root() / f"json-{task_id}"
    job_dir.mkdir(parents=True, exist_ok=True)
    dest = job_dir / "backup.json"
    try:
        with dest.open("wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                out.write(chunk)
    except Exception as err:
        raise HTTPException(status_code=400, detail=f"Не удалось сохранить файл: {err}") from err
    try:
        task = start_backup_import_from_spooled_file(uid, dest, mode, task_id=task_id)
    except BackupImportAlreadyRunningError as err:
        raise HTTPException(
            status_code=409,
            detail={"message": "Импорт уже выполняется", "task_id": err.task_id},
        ) from err
    if task.status == "failed":
        raise HTTPException(status_code=400, detail=task.error or "Ошибка импорта")
    return ImportStartedResponse(task_id=task.task_id)


@router.get("/import/status/{task_id}", response_model=ImportStatusResponse)
async def backup_import_status(task_id: str) -> ImportStatusResponse:
    uid = int(get_current_user_id())
    task = get_backup_import_task(task_id)
    if not task or task.user_id != uid:
        raise HTTPException(status_code=404, detail="Задача импорта не найдена")
    data = task.to_dict()
    report = data.pop("report", None)
    if report is not None:
        data["report"] = ImportReportResponse(**report)
    return ImportStatusResponse(**data)


@router.post("/import", response_model=ImportReportResponse)
async def backup_import(
    mode: Literal["merge", "replace"] = Query("merge"),
    file: UploadFile = File(...),
) -> ImportReportResponse:
    """Синхронный импорт (fallback); предпочтительно /import/start + polling."""
    if mode not in ("merge", "replace"):
        raise HTTPException(status_code=400, detail="mode must be merge or replace")
    try:
        raw = await file.read()
        payload = json.loads(raw.decode("utf-8"))
        report = import_full_backup(payload, mode=mode)
        if report.get("fatal_error"):
            err_text = str(report["fatal_error"])
            if "locked" in err_text.lower():
                raise HTTPException(
                    status_code=503,
                    detail={"message": "База занята. Закройте Forma.exe и повторите.", "error_code": "db_locked"},
                )
            raise HTTPException(
                status_code=400,
                detail={"message": err_text, "error_code": "import_failed", "errors": report.get("errors", [])},
            )
        return ImportReportResponse(**report)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except UnicodeDecodeError as err:
        raise HTTPException(status_code=400, detail="Файл должен быть в кодировке UTF-8") from err
    except json.JSONDecodeError as err:
        raise HTTPException(status_code=400, detail="Некорректный JSON") from err
    except sqlite3.Error as err:
        raise HTTPException(
            status_code=503,
            detail={"message": f"Ошибка SQLite: {err}", "error_code": "sqlite_error"},
        ) from err


@router.post("/admin/remark-strength-sync", response_model=RemarkStrengthResponse)
async def remark_strength_sync() -> RemarkStrengthResponse:
    """Mark all local strength workouts pending for FormaSync upload."""
    result = remark_strength_workouts_pending()
    return RemarkStrengthResponse(**result)
