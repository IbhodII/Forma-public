# -*- coding: utf-8 -*-
"""API истории шагов."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.models import (
    StepsHistoryResponse,
    StepsHistoryUpsert,
    StepsHistoryUpsertResponse,
)
from backend.services import steps_service

router = APIRouter(tags=["steps"])


@router.get(
    "/history",
    response_model=StepsHistoryResponse,
    summary="Месячная история шагов",
)
def api_steps_history(
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
):
    data = steps_service.get_steps_history(date_from, date_to)
    return StepsHistoryResponse(**data)


@router.post(
    "/history",
    response_model=StepsHistoryUpsertResponse,
    summary="Добавить или обновить месячные шаги",
)
def api_upsert_steps_history(body: StepsHistoryUpsert):
    try:
        item, status = steps_service.upsert_steps_month(
            body.date,
            body.steps,
            step_length_m=body.step_length_m,
            distance_km=body.distance_km,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StepsHistoryUpsertResponse(status=status, item=item)
