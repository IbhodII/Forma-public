# -*- coding: utf-8 -*-
"""API аналитики."""
from __future__ import annotations

from fastapi import APIRouter, Query

from backend.schemas.analytics import (
    DailyBraceletCalories,
    DailyBraceletCaloriesListResponse,
    DailyBraceletCaloriesSave,
    DailyExpenditureResponse,
    WeekDailyExpenditureResponse,
)
from backend.schemas.models import (
    CaloriesAnalyticsResponse,
    CtlAtlTsbResponse,
    WorkoutExpenditureResponse,
)
from backend.services import analytics_query, analytics_service

router = APIRouter(tags=["analytics"])


@router.get(
    "/calories",
    response_model=CaloriesAnalyticsResponse,
    summary="Калории по дням",
    description="Сумма силовых и кардио калорий за период (аналог query_daily_calories).",
)
def api_get_calories(
    date_from: str = Query(..., description="Начало периода YYYY-MM-DD"),
    date_to: str = Query(..., description="Конец периода YYYY-MM-DD"),
):
    items = analytics_service.get_calories_by_day(date_from, date_to)
    return CaloriesAnalyticsResponse(items=items)


@router.get(
    "/daily-bracelet-calories",
    response_model=DailyBraceletCaloriesListResponse,
    summary="Калории по браслету за период",
)
def api_get_daily_bracelet_calories(
    date_from: str = Query(..., alias="from", description="YYYY-MM-DD"),
    date_to: str = Query(..., alias="to", description="YYYY-MM-DD"),
):
    items = analytics_service.get_daily_bracelet_calories_range(date_from, date_to)
    return DailyBraceletCaloriesListResponse(
        items=[DailyBraceletCalories(**i) for i in items]
    )


@router.post(
    "/daily-bracelet-calories",
    response_model=DailyBraceletCalories,
    summary="Сохранить калории по браслету за день",
)
def api_save_daily_bracelet_calories(body: DailyBraceletCaloriesSave):
    row = analytics_service.save_daily_bracelet_calories(
        body.date, body.total_calories, body.source or "manual"
    )
    return DailyBraceletCalories(**row)


@router.get(
    "/daily-expenditure",
    response_model=DailyExpenditureResponse,
    summary="Расход за день (BMR + TEF + скорректированная активность)",
)
def api_daily_expenditure(
    date: str = Query(..., description="YYYY-MM-DD"),
    phase: str = Query("cut", description="cut | bulk"),
    prefer_chest: bool = Query(True, description="Приоритет пульсометра в формуле"),
    bracelet_calories: int | None = Query(
        None, ge=0, description="Переопределить калории браслета без сохранения"
    ),
):
    return DailyExpenditureResponse(
        **analytics_service.get_daily_expenditure(
            date,
            phase,
            prefer_chest=prefer_chest,
            bracelet_calories=bracelet_calories,
        )
    )


@router.get(
    "/daily-expenditure/week",
    response_model=WeekDailyExpenditureResponse,
    summary="Расход по дням недели (скорректированный, где есть браслет)",
)
def api_week_daily_expenditure(
    anchor_date: str = Query(..., description="Любая дата недели YYYY-MM-DD"),
    phase: str = Query("cut", description="cut | bulk"),
    prefer_chest: bool = Query(True),
):
    data = analytics_service.get_week_daily_expenditure(
        anchor_date, phase, prefer_chest=prefer_chest
    )
    return WeekDailyExpenditureResponse(
        items=[DailyExpenditureResponse(**i) for i in data["items"]],
        days_with_bracelet=data["days_with_bracelet"],
        days_without_bracelet=data["days_without_bracelet"],
        total_corrected_expenditure=data["total_corrected_expenditure"],
    )


@router.get(
    "/workout-expenditure",
    response_model=WorkoutExpenditureResponse,
    summary="Расход по тренировкам (часы / пульсометр)",
    description="Суммы calories_watch, calories_chest и calories_hr по дням за период.",
)
def api_workout_expenditure(
    date_from: str = Query(..., alias="from", description="Начало периода YYYY-MM-DD"),
    date_to: str = Query(..., alias="to", description="Конец периода YYYY-MM-DD"),
):
    items = analytics_service.get_workout_expenditure(date_from, date_to)
    return WorkoutExpenditureResponse(items=items)


@router.get(
    "/ctl",
    response_model=CtlAtlTsbResponse,
    summary="CTL, ATL, TSB по TRIMP (кардио)",
)
def api_get_ctl_atl_tsb(
    days: int = Query(90, ge=7, le=365, description="Число дней в ряду"),
):
    payload = analytics_query.get_ctl_atl_tsb_payload(days)
    return CtlAtlTsbResponse(items=payload["items"], current=payload["current"])


@router.get(
    "/genetic-potential",
    summary="Генетический предел сухой массы (устаревший путь, см. /body/genetic-limit)",
)
def api_genetic_potential():
    from backend.services import body_service

    return body_service.get_genetic_limit()
