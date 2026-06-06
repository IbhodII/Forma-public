# -*- coding: utf-8 -*-
"""API замеров тела."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.models import (
    BodyMetricCreate,
    BodyMetricCreateResponse,
    BodyMetricsResponse,
    GeneticLimitResponse,
    PaginatedMeta,
)
from backend.services import body_service

router = APIRouter(tags=["body"])


@router.get("/latest", summary="Последний замер тела")
def api_get_latest():
    row = body_service.get_latest()
    return row or {}


@router.get("/field-reference", summary="Последние значения по каждому полю из истории")
def api_get_field_reference():
    return body_service.get_field_reference()


@router.get("/summary", summary="Сводка: последние значения по метрикам")
def api_get_metrics_summary():
    return body_service.get_metrics_summary()


@router.get(
    "/overview/summary",
    summary="Обзор тела: 7д HC + вес за N дней",
    description="Без полного hub и без weekly-агрегации всей истории веса.",
)
def api_body_overview_summary(
    weight_days: int = Query(30, ge=7, le=90, description="Окно веса для мини-графика"),
):
    from backend.services.body_overview_service import build_body_overview_summary

    return build_body_overview_summary(weight_days=weight_days)


@router.get(
    "/genetic-limit",
    response_model=GeneticLimitResponse,
    summary="Генетический предел сухой массы (FFMI=25)",
)
def api_get_genetic_limit():
    return GeneticLimitResponse(**body_service.get_genetic_limit())


@router.get(
    "/metrics",
    response_model=BodyMetricsResponse,
    summary="Замеры тела",
    description="Пагинация и фильтр по дате (включительно), сортировка date DESC.",
)
def api_get_metrics(
    limit: int = Query(20, ge=1, le=10_000, description="Размер страницы"),
    offset: int = Query(0, ge=0, description="Смещение"),
    date_from: str | None = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: str | None = Query(None, description="Конец периода YYYY-MM-DD"),
    control_day_only: bool = Query(
        False,
        description="Только контрольные замеры (первый день недели, полный набор)",
    ),
    body_measurements_only: bool = Query(
        False,
        description="Только строки с фактическими замерами тела (окружности), без записей только веса",
    ),
):
    items, total = body_service.get_metrics(
        limit,
        offset,
        date_from=date_from,
        date_to=date_to,
        control_day_only=control_day_only,
        body_measurements_only=body_measurements_only,
    )
    return BodyMetricsResponse(
        items=items,
        meta=PaginatedMeta(total=total, limit=limit, offset=offset),
    )


@router.post(
    "/metrics",
    response_model=BodyMetricCreateResponse,
    summary="Добавить замер тела",
)
def api_post_metric(body: BodyMetricCreate):
    status = body_service.create_metric(body.to_service_payload())
    return BodyMetricCreateResponse(status=status)


@router.get(
    "/metrics/weekly",
    summary="Средние замеры по неделям",
    description="Неделя с субботы по пятницу; опциональный фильтр date_from / date_to.",
)
def api_get_weekly_metrics(
    date_from: str | None = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: str | None = Query(None, description="Конец периода YYYY-MM-DD"),
):
    weekly, current_week = body_service.get_weekly_metrics(
        date_from=date_from,
        date_to=date_to,
    )
    return {"weekly": weekly, "current_week": current_week}


@router.delete(
    "/metrics/{date}",
    summary="Удалить замер тела",
)
def api_delete_metric(date: str):
    if not body_service.delete_metric(date):
        raise HTTPException(status_code=404, detail="Замер не найден")
    return {"status": "ok"}
