# -*- coding: utf-8 -*-
"""API сушки / набора (прогноз, дефицит, планы)."""
from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

router = APIRouter(tags=["nutrition"])


class CutForecastRequest(BaseModel):
    target_fat_percent: float = Field(..., ge=3, le=60)
    kcal_per_kg_fat: float = Field(..., ge=5, le=35)


class BulkForecastRequest(BaseModel):
    target_weight_kg: float = Field(..., gt=0)
    gain_kg_per_week: float = Field(..., ge=0.05, le=2)
    surplus_calories: float = Field(0, ge=0, le=2000)


class NutritionPlanSave(BaseModel):
    phase: Literal["cut", "bulk"]
    target_fat_percent: float | None = None
    deficit_calories: float | None = None
    target_weight_kg: float | None = None
    gain_rate_kg_per_week: float | None = None
    surplus_calories: float | None = None
    target_date: str | None = None


class NutritionForecastRequest(BaseModel):
    phase: Literal["cut", "bulk"]
    target_weight_kg: float = Field(..., gt=0)
    target_body_fat_percent: float | None = Field(None, ge=3, le=60)
    prefer_chest_workout: bool = True
    target_bulk_grams_per_week: float | None = Field(None, ge=50, le=2000)
    balance_period: Literal["previous_week", "rolling_7", "rolling_14"] = "rolling_14"
    persist_plan: bool = False


class DynamicForecastRequest(BaseModel):
    phase: Literal["cut"] = "cut"
    target_weight_kg: float | None = Field(None, gt=0)
    target_body_fat_percent: float | None = Field(None, ge=3, le=60)
    prefer_chest_workout: bool = True
    balance_period: Literal["previous_week", "rolling_7", "rolling_14"] = "rolling_14"
    persist_plan: bool = False
    max_deficit_per_kg_fat: float | None = Field(None, ge=5, le=60)


def _serialize_forecast(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in data.items():
        if hasattr(v, "isoformat"):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


@router.get("/snapshot", summary="Вес и % жира для сушки/набора")
def api_nutrition_snapshot(on_date: str | None = None):
    from database.db_utils import get_nutrition_input_snapshot

    body = get_nutrition_input_snapshot(on_date)
    if not body.get("weight_kg"):
        raise HTTPException(
            status_code=400,
            detail="Нет веса. Добавьте запись на вкладке «Тело» или в разделе веса.",
        )
    if body.get("body_fat_percent") is None:
        raise HTTPException(
            status_code=400,
            detail="Нет % жира в body_metrics. Добавьте замер во вкладке «Тело».",
        )
    return body


@router.get("/plan/{phase}", summary="Сохранённый план cut | bulk")
def api_get_plan(phase: Literal["cut", "bulk"]):
    from database.db_utils import load_nutrition_plan

    return load_nutrition_plan(phase)


@router.post("/plan", summary="Сохранить план сушки или набора")
def api_save_plan(body: NutritionPlanSave):
    from database.db_utils import save_nutrition_plan

    fields = body.model_dump(exclude={"phase"}, exclude_none=True)
    save_nutrition_plan(body.phase, **fields)
    return {"message": "ok"}


@router.post("/cut/forecast", summary="Прогноз сушки")
def api_cut_forecast(body: CutForecastRequest):
    from database.db_utils import (
        compute_cut_forecast,
        get_nutrition_input_snapshot,
    )

    snap = get_nutrition_input_snapshot()
    weight = float(snap["weight_kg"])
    fat_pct = float(snap["body_fat_percent"])
    if body.target_fat_percent >= fat_pct:
        raise HTTPException(
            status_code=400,
            detail="Целевой % жира должен быть ниже текущего.",
        )
    forecast = compute_cut_forecast(
        weight, fat_pct, body.target_fat_percent, body.kcal_per_kg_fat
    )
    return _serialize_forecast(forecast)


@router.get("/analytics/progress", summary="Прогноз по трендам (сушка/набор)")
def api_progress_analytics(phase: Literal["cut", "bulk"] = "cut"):
    from backend.services import nutrition_analytics_service

    return nutrition_analytics_service.get_progress_analytics(phase)


@router.post("/forecast/dynamic", summary="Динамический прогноз сушки (лимит дефицита × жир)")
def api_dynamic_forecast(body: DynamicForecastRequest):
    from backend.services.nutrition_service import build_dynamic_cut_forecast_response

    if body.target_weight_kg is None and body.target_body_fat_percent is None:
        raise HTTPException(
            status_code=400,
            detail="Укажите целевой вес и/или целевой % жира.",
        )
    return build_dynamic_cut_forecast_response(
        target_weight_kg=body.target_weight_kg,
        target_body_fat_percent=body.target_body_fat_percent,
        prefer_chest_workout=body.prefer_chest_workout,
        balance_period=body.balance_period,
        max_deficit_per_kg_fat=body.max_deficit_per_kg_fat,
        persist_plan=body.persist_plan,
    )


@router.post("/forecast", summary="Прогноз по фактическому потреблению и расходу (14 дн. до вчера)")
def api_nutrition_forecast(body: NutritionForecastRequest):
    from backend.services import nutrition_balance_service, nutrition_forecast_service
    from database.db_utils import get_nutrition_input_snapshot

    snap = get_nutrition_input_snapshot()
    if snap.get("body_fat_percent") is not None and body.target_body_fat_percent is None:
        raise HTTPException(
            status_code=400,
            detail=(
                "Укажите целевой % жира: в базе есть данные о текущем проценте жира."
            ),
        )

    bulk_g = body.target_bulk_grams_per_week
    if body.phase == "bulk" and bulk_g is None:
        bulk_g = nutrition_balance_service.get_calorie_control_defaults()[
            "target_bulk_grams_per_week"
        ]
    return nutrition_forecast_service.compute_forecast(
        body.phase,
        body.target_weight_kg,
        body.target_body_fat_percent,
        prefer_chest_workout=body.prefer_chest_workout,
        target_bulk_grams_per_week=bulk_g if body.phase == "bulk" else None,
        balance_period=body.balance_period,
        persist_plan=body.persist_plan,
    )


@router.get("/forecast-readiness", summary="Готовность данных для прогноза (2 недели питания)")
def api_forecast_readiness(phase: Literal["cut", "bulk"] = "cut"):
    from backend.services import nutrition_balance_service

    return nutrition_balance_service.get_forecast_readiness(phase)


@router.get("/cut/deficit-control", summary="Контроль дефицита при сушке (14 дн. до вчера)")
def api_cut_deficit_control(
    prefer_chest: bool = True,
    max_deficit_per_kg_fat: float | None = None,
):
    from backend.services import nutrition_balance_service

    return nutrition_balance_service.get_cut_deficit_control(
        max_deficit_per_kg_fat=max_deficit_per_kg_fat,
        prefer_chest=prefer_chest,
    )


@router.get("/bulk/gain-control", summary="Контроль цели набора (7 дней)")
def api_bulk_gain_control(
    prefer_chest: bool = True,
    target_grams_per_week: float | None = None,
):
    from backend.services import nutrition_balance_service

    return nutrition_balance_service.get_bulk_gain_control(
        target_grams_per_week=target_grams_per_week,
        prefer_chest=prefer_chest,
    )


@router.post("/bulk/forecast", summary="Прогноз набора")
def api_bulk_forecast(body: BulkForecastRequest):
    from database.db_utils import compute_bulk_forecast, get_nutrition_input_snapshot

    snap = get_nutrition_input_snapshot()
    weight = float(snap["weight_kg"])
    if body.target_weight_kg <= weight:
        raise HTTPException(
            status_code=400,
            detail="Целевой вес должен быть выше текущего.",
        )
    forecast = compute_bulk_forecast(
        weight, body.target_weight_kg, body.gain_kg_per_week
    )
    out = _serialize_forecast(forecast)
    out["surplus_calories"] = body.surplus_calories
    return out
