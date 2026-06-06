# -*- coding: utf-8 -*-
"""Account data warmup API."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.database.client_context import get_request_client_mode, is_admin_browser_client
from backend.database.db_utils import get_current_user_id
from backend.services.account_warmup_tasks import (
    AccountWarmupAlreadyRunningError,
    cancel_account_warmup,
    get_account_warmup_task_for_user,
    get_running_warmup_task_for_user,
    reconcile_stale_warmup_checkpoint,
    start_account_warmup,
)

router = APIRouter(prefix="/account/warmup", tags=["account-warmup"])

WarmupMode = Literal["light", "full"]


class WarmupStageStatus(BaseModel):
    id: str
    label: str
    status: str
    elapsed_ms: int = 0
    detail: str | None = None


class WarmupStartedResponse(BaseModel):
    task_id: str
    job_id: str | None = None
    status: str = "running"


class WarmupStatusResponse(BaseModel):
    task_id: str
    job_id: str | None = None
    status: str
    phase: str
    current: int
    total: int
    stage: str = ""
    currentSection: str = ""
    percent: int
    message: str
    error: str | None = None
    elapsed_sec: int = 0
    stages: list[WarmupStageStatus] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    summary: dict[str, Any] | None = None
    processed_units: int = 0
    total_units: int = 0
    processed: int = 0
    lastHeartbeatAt: str | None = None


class WarmupCurrentResponse(BaseModel):
    status: str = "idle"
    task_id: str | None = None
    task: WarmupStatusResponse | None = None


class WarmupCancelResponse(BaseModel):
    status: str
    task_id: str | None = None
    message: str = "Отмена запрошена"


def _vacuum_allowed() -> bool:
    if is_admin_browser_client():
        return True
    return get_request_client_mode() == "desktop_app"


def _task_to_response(task) -> WarmupStatusResponse:
    data = task.to_dict()
    stages = data.pop("stages", [])
    data["stages"] = [WarmupStageStatus(**s) for s in stages]
    return WarmupStatusResponse(**data)


@router.post("/start", response_model=WarmupStartedResponse)
async def api_account_warmup_start(
    mode: WarmupMode = Query("full"),
    include_vacuum: bool = Query(False),
    resume: bool = Query(True),
) -> WarmupStartedResponse:
    if include_vacuum and not _vacuum_allowed():
        raise HTTPException(
            status_code=403,
            detail="VACUUM доступен только в admin browser или desktop app",
        )
    uid = int(get_current_user_id())
    try:
        task = start_account_warmup(uid, mode=mode, include_vacuum=include_vacuum, resume=resume)
    except AccountWarmupAlreadyRunningError as err:
        raise HTTPException(
            status_code=409,
            detail={"message": str(err), "task_id": err.task_id},
        ) from err
    return WarmupStartedResponse(
        task_id=task.task_id,
        job_id=task.task_id,
        status=task.status,
    )


@router.post("/retry", response_model=WarmupStartedResponse)
async def api_account_warmup_retry(
    mode: WarmupMode = Query("full"),
    include_vacuum: bool = Query(False),
) -> WarmupStartedResponse:
    """Resume warmup from checkpoint after failed/cancelled run."""
    return await api_account_warmup_start(mode=mode, include_vacuum=include_vacuum, resume=True)


@router.get("/current", response_model=WarmupCurrentResponse)
async def api_account_warmup_current() -> WarmupCurrentResponse:
    uid = int(get_current_user_id())
    reconcile_stale_warmup_checkpoint(uid)
    task = get_running_warmup_task_for_user(uid)
    if not task:
        return WarmupCurrentResponse(status="idle")
    return WarmupCurrentResponse(
        status="running",
        task_id=task.task_id,
        task=_task_to_response(task),
    )


@router.post("/cancel", response_model=WarmupCancelResponse)
async def api_account_warmup_cancel() -> WarmupCancelResponse:
    uid = int(get_current_user_id())
    task = cancel_account_warmup(uid)
    if not task:
        return WarmupCancelResponse(status="idle", message="Нет активного прогрева")
    if task.status == "cancelled":
        return WarmupCancelResponse(
            status="cancelled",
            task_id=task.task_id,
            message="Прогрев остановлен",
        )
    return WarmupCancelResponse(status="cancelling", task_id=task.task_id)


@router.get("/status/{task_id}", response_model=WarmupStatusResponse)
async def api_account_warmup_status(task_id: str) -> WarmupStatusResponse:
    uid = int(get_current_user_id())
    task = get_account_warmup_task_for_user(uid, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Задача прогрева не найдена")
    return _task_to_response(task)
