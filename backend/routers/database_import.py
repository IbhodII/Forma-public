# -*- coding: utf-8 -*-
"""Desktop SQLite database import (staged job directory, background worker)."""
from __future__ import annotations

from pathlib import Path
from typing import Literal

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from backend.database.client_context import get_request_client_mode
from backend.database.db_utils import get_current_user_id
from backend.services.database_import_staging import (
    max_zip_upload_bytes,
    stage_import_from_paths,
    stage_import_from_zip_stream,
)
from backend.services.database_import_tasks import (
    DatabaseImportAlreadyRunningError,
    get_database_import_task,
    load_job_manifest,
    start_database_import,
)

router = APIRouter(prefix="/database/import", tags=["database-import"])


def _require_dev_db_import_client() -> None:
    mode = get_request_client_mode()
    if mode not in ("admin_browser", "desktop_app"):
        raise HTTPException(
            status_code=403,
            detail="Импорт БД через браузер доступен в dev (admin_browser) или desktop",
        )


class DatabaseImportStartRequest(BaseModel):
    job_id: str = Field(..., description="UUID каталога import-jobs/{job_id}")
    mode: Literal["merge", "replace"] | None = None


class DatabaseImportStartedResponse(BaseModel):
    job_id: str
    task_id: str
    status: str = "pending"


class DatabaseImportStatusResponse(BaseModel):
    job_id: str
    task_id: str
    status: str
    stage: str
    progressPercent: int
    processed: int
    total: int
    message: str
    error: str | None = None
    report: dict | None = None
    started_at: str | None = None
    last_progress_at: str | None = None
    recommended_mode: str | None = None


class DatabaseImportStagedResponse(BaseModel):
    job_id: str
    mode: str


@router.post("/stage", response_model=DatabaseImportStagedResponse)
async def database_import_stage(
    mode: str = Form("replace"),
    zip_file: UploadFile | None = File(None),
    workouts_file: UploadFile | None = File(None),
    shared_file: UploadFile | None = File(None),
) -> DatabaseImportStagedResponse:
    """
    Загрузить ZIP или пару .db в import-jobs (dev-браузер без Electron).
    Данные импортируются для текущего X-User-ID при вызове /start.
    """
    _require_dev_db_import_client()
    effective_mode: Literal["merge", "replace"] = "merge" if mode == "merge" else "replace"

    try:
        if zip_file and zip_file.filename:
            try:
                job_id = stage_import_from_zip_stream(
                    zip_file.file,
                    mode=effective_mode,
                    max_bytes=max_zip_upload_bytes(),
                )
            except ValueError as err:
                if "слишком большой" in str(err).lower():
                    raise HTTPException(status_code=413, detail=str(err)) from err
                raise
            return DatabaseImportStagedResponse(job_id=job_id, mode=effective_mode)

        if workouts_file and shared_file:
            import tempfile

            with tempfile.TemporaryDirectory() as tmp:
                tmp_path = Path(tmp)
                w_dest = tmp_path / "workouts.db"
                s_dest = tmp_path / "shared.db"
                w_dest.write_bytes(await workouts_file.read())
                s_dest.write_bytes(await shared_file.read())
                job_id = stage_import_from_paths(
                    workouts_src=w_dest,
                    shared_src=s_dest,
                    mode=effective_mode,
                )
            return DatabaseImportStagedResponse(job_id=job_id, mode=effective_mode)

        raise HTTPException(
            status_code=400,
            detail="Передайте zip_file или оба файла workouts_file и shared_file",
        )
    except HTTPException:
        raise
    except FileNotFoundError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err


@router.post("/start", response_model=DatabaseImportStartedResponse)
async def database_import_start(body: DatabaseImportStartRequest) -> DatabaseImportStartedResponse:
    uid = int(get_current_user_id())
    try:
        load_job_manifest(body.job_id)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err

    try:
        task = start_database_import(body.job_id, uid, mode=body.mode)
    except DatabaseImportAlreadyRunningError as err:
        raise HTTPException(
            status_code=409,
            detail={"message": "Импорт базы уже выполняется", "task_id": err.task_id, "job_id": err.task_id},
        ) from err

    if task.status == "failed":
        raise HTTPException(status_code=400, detail=task.error or "Ошибка импорта базы")

    return DatabaseImportStartedResponse(
        job_id=body.job_id,
        task_id=body.job_id,
        status=task.status,
    )


@router.get("/status/{job_id}", response_model=DatabaseImportStatusResponse)
async def database_import_status(job_id: str) -> DatabaseImportStatusResponse:
    uid = int(get_current_user_id())
    task = get_database_import_task(job_id)
    if not task or task.user_id != uid:
        raise HTTPException(status_code=404, detail="Задача импорта не найдена")
    data = task.to_dict()
    return DatabaseImportStatusResponse(**data)
