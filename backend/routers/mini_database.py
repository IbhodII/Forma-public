# -*- coding: utf-8 -*-
"""Dev-only mini database export for import testing."""
from __future__ import annotations

import json
import os

from fastapi import APIRouter, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from backend.database.client_context import get_request_client_mode
from backend.database.db_utils import get_current_user_id
from backend.services.database_import_tasks import is_database_import_in_progress
from backend.services.mini_database_service import (
    create_mini_database_export,
    prune_old_mini_exports,
    resolve_mini_database_export,
)

router = APIRouter(prefix="/database/mini-db", tags=["database-mini-db"])


class MiniDbBuildResponse(BaseModel):
    export_id: str
    ok: bool
    report: dict
    download_filename: str
    message: str = Field(
        default="Тестовая mini-база создана. Скачайте ZIP и используйте в импорте БД (merge/replace)."
    )


def _require_dev_client() -> None:
    mode = get_request_client_mode()
    if mode not in ("admin_browser", "desktop_app"):
        raise HTTPException(
            status_code=403,
            detail="Mini-база доступна только в desktop или admin browser (dev)",
        )


@router.post("/build", response_model=MiniDbBuildResponse)
async def mini_database_build() -> MiniDbBuildResponse:
    """
    Создать уменьшенную копию текущей БД (отдельный ZIP).
    Исходные workouts.db / shared.db не изменяются.
    """
    _require_dev_client()
    if is_database_import_in_progress():
        raise HTTPException(
            status_code=409,
            detail="Дождитесь завершения импорта БД перед созданием mini-базы",
        )

    uid = int(get_current_user_id())
    try:
        export_id, zip_path, report = create_mini_database_export(uid)
        prune_old_mini_exports(keep=8)
    except FileNotFoundError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=500, detail=str(err)) from err

    return MiniDbBuildResponse(
        export_id=export_id,
        ok=report.ok,
        report=report.to_dict(),
        download_filename=zip_path.name,
    )


@router.get("/result/{export_id}")
async def mini_database_download(
    export_id: str,
    background_tasks: BackgroundTasks,
) -> FileResponse:
    _require_dev_client()
    uid = int(get_current_user_id())
    zip_path = resolve_mini_database_export(export_id)
    if not zip_path or not zip_path.is_file():
        raise HTTPException(status_code=404, detail="Mini-база не найдена или уже скачана")

    meta_path = zip_path.with_suffix(".json")
    if meta_path.is_file():
        try:
            meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if int(meta.get("report", {}).get("user_id", uid)) != uid:
                raise HTTPException(status_code=403, detail="Доступ запрещён")
        except json.JSONDecodeError:
            pass

    def _cleanup(path: str = str(zip_path), meta: str = str(meta_path)) -> None:
        for p in (path, meta):
            try:
                os.remove(p)
            except OSError:
                pass

    background_tasks.add_task(_cleanup)

    return FileResponse(
        str(zip_path),
        media_type="application/zip",
        filename=zip_path.name,
        headers={"Content-Disposition": f'attachment; filename="{zip_path.name}"'},
    )
