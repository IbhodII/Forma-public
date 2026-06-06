# -*- coding: utf-8 -*-
"""FormaSync REST API — incremental cloud sync via Yandex Disk."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.database.client_context import client_allows_sync_debug
from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.engine import (
    download_forma_sync_only,
    get_forma_sync_status,
    list_conflicts,
    resolve_conflict_by_id,
    sync_forma_sync,
    upload_forma_sync_only,
)

logger = logging.getLogger("health_api")

router = APIRouter(prefix="/cloud/forma-sync", tags=["FormaSync"])


def _forma_sync_http_error(action: str, err: Exception) -> HTTPException:
    if not isinstance(err, RuntimeError):
        err = RuntimeError(str(err).strip() or err.__class__.__name__)
    logger.warning("forma_sync %s: %s", action, err, exc_info=True)
    return HTTPException(status_code=409, detail=str(err))



class FormaSyncStatusResponse(BaseModel):
    yandex_connected: bool
    yandex_uid: str | None = None
    local_revision: int
    remote_revision: int | None = None
    pending_changes: int
    conflict_count: int
    last_upload_at: str | None = None
    last_download_at: str | None = None
    last_error: str | None = None
    sync_in_flight: bool
    auto_enabled: bool
    baseline_required: bool = False
    cloud_folder_web: str | None = None
    debug_plan: dict[str, Any] | None = None


class FormaSyncActionResponse(BaseModel):
    uploaded: bool
    downloaded: bool
    message: str


class AutoSyncRequest(BaseModel):
    enabled: bool = Field(..., description="Enable startup / auto download")


@router.get("/status", response_model=FormaSyncStatusResponse)
async def forma_sync_status(
    debug: bool = Query(False, description="Include debug_plan (admin clients only)"),
) -> FormaSyncStatusResponse:
    include_debug = client_allows_sync_debug(query_debug=debug)
    status = await get_forma_sync_status(
        get_current_user_id(),
        include_debug=include_debug,
    )
    return FormaSyncStatusResponse(**status.__dict__)


@router.post("/sync", response_model=FormaSyncActionResponse)
async def forma_sync_full() -> FormaSyncActionResponse:
    try:
        result = await sync_forma_sync(get_current_user_id())
        return FormaSyncActionResponse(**result.__dict__)
    except Exception as err:
        raise _forma_sync_http_error("sync", err) from err


@router.post("/upload", response_model=FormaSyncActionResponse)
async def forma_sync_upload(force: bool = False) -> FormaSyncActionResponse:
    try:
        result = await upload_forma_sync_only(get_current_user_id(), force=force)
        return FormaSyncActionResponse(**result.__dict__)
    except Exception as err:
        raise _forma_sync_http_error("upload", err) from err


@router.post("/download", response_model=FormaSyncActionResponse)
async def forma_sync_download() -> FormaSyncActionResponse:
    try:
        result = await download_forma_sync_only(get_current_user_id())
        return FormaSyncActionResponse(**result.__dict__)
    except Exception as err:
        raise _forma_sync_http_error("download", err) from err


@router.get("/conflicts")
async def forma_sync_conflicts() -> list[dict[str, Any]]:
    return list_conflicts()


@router.post("/conflicts/{conflict_id}/resolve")
async def forma_sync_resolve_conflict(conflict_id: int) -> dict[str, str]:
    resolve_conflict_by_id(conflict_id)
    return {"status": "ok"}


@router.post("/auto")
async def forma_sync_set_auto(body: AutoSyncRequest) -> dict[str, bool]:
    sync_meta.set_auto_enabled(body.enabled)
    return {"auto_enabled": sync_meta.is_auto_enabled()}
