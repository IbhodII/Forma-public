# -*- coding: utf-8 -*-
"""API женского цикла."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from backend.services import menstrual_cycle_service
from backend.services.cycle_access import is_female_profile

router = APIRouter(tags=["menstrual-cycle"])

_CYCLE_FORBIDDEN = (
    "Раздел «Цикл» доступен только при поле «Женский» в настройках профиля"
)


class MenstrualCycleSettingsBody(BaseModel):
    cycle_length_days: int = Field(28, ge=15, le=60)
    period_length_days: int = Field(5, ge=1, le=14)
    last_period_start: str | None = None
    cycle_enabled: bool | None = True


class MenstrualCycleLogBody(BaseModel):
    date: str = Field(..., min_length=10)
    flow_intensity: str | None = None
    symptoms: str | None = None
    notes: str | None = None
    phase: str | None = Field(
        None,
        description="menstrual | follicular | ovulatory | luteal",
    )


def require_female_profile() -> None:
    if not is_female_profile():
        raise HTTPException(status_code=403, detail=_CYCLE_FORBIDDEN)


@router.get("/settings", summary="Настройки цикла", dependencies=[Depends(require_female_profile)])
def api_get_settings():
    return menstrual_cycle_service.get_settings()


@router.post("/settings", summary="Сохранить настройки цикла", dependencies=[Depends(require_female_profile)])
def api_save_settings(body: MenstrualCycleSettingsBody):
    try:
        return menstrual_cycle_service.save_settings(
            cycle_length_days=body.cycle_length_days,
            period_length_days=body.period_length_days,
            last_period_start=body.last_period_start,
            cycle_enabled=body.cycle_enabled,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get("/log", summary="Записи журнала за период", dependencies=[Depends(require_female_profile)])
def api_get_log(
    date_from: str | None = Query(None, alias="from", description="YYYY-MM-DD"),
    date_to: str | None = Query(None, alias="to", description="YYYY-MM-DD"),
):
    return menstrual_cycle_service.get_log(date_from, date_to)


@router.get("/phases", summary="Фазы цикла по дням", dependencies=[Depends(require_female_profile)])
def api_get_phases(
    date_from: str = Query(..., alias="from", description="YYYY-MM-DD"),
    date_to: str = Query(..., alias="to", description="YYYY-MM-DD"),
):
    return menstrual_cycle_service.get_phases_for_range(date_from, date_to)


@router.get("/impact", summary="Влияние цикла на дату (BMR, TRIMP)", dependencies=[Depends(require_female_profile)])
def api_get_impact(
    day: str | None = Query(None, description="YYYY-MM-DD, по умолчанию сегодня"),
):
    from datetime import date as date_cls

    d = (day or date_cls.today().isoformat())[:10]
    return menstrual_cycle_service.get_cycle_impact(d)


@router.post("/log", summary="Добавить или обновить запись на дату", dependencies=[Depends(require_female_profile)])
def api_upsert_log(body: MenstrualCycleLogBody):
    try:
        return menstrual_cycle_service.upsert_log(
            date=body.date,
            flow_intensity=body.flow_intensity,
            symptoms=body.symptoms,
            notes=body.notes,
            phase=body.phase,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/log/{day}", summary="Удалить запись на дату", dependencies=[Depends(require_female_profile)])
def api_delete_log(day: str):
    if not menstrual_cycle_service.delete_log(day):
        raise HTTPException(status_code=404, detail="Запись не найдена")
    return {"ok": True}
