# -*- coding: utf-8 -*-
"""API кардио."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query

from backend.schemas.models import (
    CardioWorkout,
    CardioWorkoutCreate,
    CardioWorkoutCreateResponse,
    CardioWorkoutUpdate,
    CardioWorkoutsResponse,
    DailyTrimpResponse,
    ZoneTimeResponse,
    HeartRatePoint,
    HeartRateResponse,
    WorkoutSensorsResponse,
    WorkoutPowerResponse,
    WorkoutSourceView,
    PaginatedMeta,
    PolarAttachBody,
    PolarAttachResponse,
)
from backend.services import bike_power_service, cardio_service, cardio_type_service, polar_attach_service
from backend.services import source_resolver_service
from backend.services.hr_response_service import build_heart_rate_response

router = APIRouter(tags=["cardio"])


@router.post(
    "/workout",
    response_model=CardioWorkoutCreateResponse,
    summary="Сохранить кардио (ручной ввод)",
)
def api_post_cardio_workout(body: CardioWorkoutCreate):
    workout_id = cardio_service.create_workout(body.model_dump())
    return CardioWorkoutCreateResponse(id=workout_id)


@router.put(
    "/{workout_id}",
    response_model=CardioWorkout,
    summary="Обновить кардио-тренировку",
    description=(
        "Частичное обновление полей. Для FIT (data_source=fit_coospo) "
        "data_source, start_time и связанные HR/GPS/sensors не изменяются."
    ),
)
def api_update_cardio_workout(workout_id: int, body: CardioWorkoutUpdate):
    try:
        updated = cardio_service.update_workout(
            workout_id, body.model_dump(exclude_unset=True)
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if updated is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    return CardioWorkout.model_validate(updated)


@router.get(
    "/types",
    response_model=list[str],
    summary="Уникальные типы кардио",
)
def api_list_cardio_types():
    active = cardio_type_service.list_active_tab_types()
    if active:
        return active
    return cardio_service.list_cardio_types()


@router.get(
    "/tab-settings",
    summary="Настройки вкладок кардио (бассейн, вело, бег)",
)
def api_list_cardio_tab_settings(
    active_only: bool | None = Query(None, description="True=активные, False=архив"),
):
    return cardio_type_service.list_tab_settings(active_only=active_only)


@router.post(
    "/tab-settings/{cardio_type}/archive",
    summary="Архивировать вкладку кардио",
)
def api_archive_cardio_tab(cardio_type: str):
    try:
        return cardio_type_service.archive_tab_type(cardio_type)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post(
    "/tab-settings/{cardio_type}/restore",
    summary="Восстановить вкладку кардио",
)
def api_restore_cardio_tab(cardio_type: str):
    try:
        return cardio_type_service.restore_tab_type(cardio_type)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get(
    "/recent",
    summary="Последние тренировки по типу",
)
def api_recent_workouts(
    type: str = Query(..., description="Тип кардио, например «бег»"),
    limit: int = Query(5, ge=1, le=20),
):
    items, _ = cardio_service.get_workouts(
        limit,
        0,
        workout_type=type,
    )
    return {"items": items}


@router.get(
    "/workouts",
    response_model=CardioWorkoutsResponse,
    summary="Список кардио-тренировок",
    description=(
        "Пагинация limit/offset. Фильтры: date_from, date_to (включительно), "
        "type — точное совпадение; exclude_type, fit_only — как раньше."
    ),
)
def api_get_workouts(
    limit: int = Query(20, ge=1, le=500),
    offset: int = Query(0, ge=0),
    date_from: str | None = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: str | None = Query(None, description="Конец периода YYYY-MM-DD"),
    workout_type: str | None = Query(
        None,
        alias="type",
        description='Тип кардио, точное совпадение (например "вело")',
    ),
    exclude_type: str | None = Query(None),
    fit_only: bool = Query(False),
):
    items, total = cardio_service.get_workouts(
        limit,
        offset,
        workout_type=workout_type,
        exclude_type=exclude_type,
        fit_only=fit_only,
        date_from=date_from,
        date_to=date_to,
    )
    return CardioWorkoutsResponse(
        items=[CardioWorkout.model_validate(row) for row in items],
        meta=PaginatedMeta(total=total, limit=limit, offset=offset),
    )


@router.get(
    "/availability",
    summary="Наличие пульса, GPS и датчиков у списка тренировок",
)
def api_cardio_availability(ids: str = Query(..., description="Id через запятую")):
    raw = [p.strip() for p in ids.split(",") if p.strip()]
    workout_ids = [int(x) for x in raw]
    hr_ids = set(cardio_service.workouts_with_heart_rate(workout_ids))
    gps_ids = set(cardio_service.workouts_with_gps(workout_ids))
    sensor_ids = set(cardio_service.workouts_with_sensors(workout_ids))
    return {
        "heart_rate_ids": sorted(hr_ids),
        "gps_ids": sorted(gps_ids),
        "sensor_ids": sorted(sensor_ids),
        "items": [
            {
                "id": wid,
                "has_hr": wid in hr_ids,
                "has_gps": wid in gps_ids,
                "has_sensors": wid in sensor_ids,
            }
            for wid in workout_ids
        ],
    }


@router.get(
    "/{workout_id}/sources",
    response_model=WorkoutSourceView,
    summary="Источники данных тренировки",
)
def api_get_workout_sources(workout_id: int):
    view = source_resolver_service.resolve_workout_view(workout_id)
    if not view:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    return WorkoutSourceView(**view)


@router.get(
    "/{workout_id}/power",
    response_model=WorkoutPowerResponse,
    summary="Мощность велотренировки",
)
def api_get_workout_power(workout_id: int):
    data = bike_power_service.get_workout_power(workout_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена или не вело")
    return WorkoutPowerResponse(**data)


@router.post(
    "/backfill-power",
    summary="Рассчитать мощность для старых велотренировок",
    description=(
        "Один раз обрабатывает велотренировки без сохранённой мощности "
        "и записывает оценку в БД."
    ),
)
def api_backfill_bike_power(limit: int = Query(500, ge=1, le=2000)):
    return bike_power_service.backfill_missing_bike_power(limit=limit)


@router.post(
    "/{workout_id}/estimate-power",
    response_model=WorkoutPowerResponse,
    summary="Рассчитать предполагаемую мощность",
)
def api_estimate_workout_power(workout_id: int):
    try:
        data = bike_power_service.estimate_workout_power(workout_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    if data is None:
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    return WorkoutPowerResponse(**data)


@router.get(
    "/{workout_id}/hr",
    response_model=HeartRateResponse,
    summary="Пульс по тренировке",
    description="Данные из workout_heart_rate: seconds, heart_rate.",
)
def api_get_heart_rate(workout_id: int):
    raw = cardio_service.get_heart_rate_data(workout_id)
    return build_heart_rate_response(workout_id, raw)


@router.get(
    "/{workout_id}/gps",
    summary="GeoJSON GPS-трека",
    description=(
        "Трек из gps_tracks (GeoJSON FeatureCollection). "
        "В properties точек: elapsed_sec, speed_kmh, cadence, elevation_m, "
        "temperature_c, heart_rate, distance_m."
    ),
)
def api_get_gps(workout_id: int):
    geo = cardio_service.get_gps(workout_id)
    if geo is None:
        raise HTTPException(status_code=404, detail="Нет GPS-трека")
    return geo


@router.get(
    "/{workout_id}/sensors",
    response_model=WorkoutSensorsResponse,
    summary="Датчики велотренировки (каденс, высота, температура)",
)
def api_get_sensors(
    workout_id: int,
    downsample: int = Query(
        2,
        ge=0,
        le=3600,
        description="1=все точки, 0=1/сек, N>=2 — 1 точка каждые N сек (по умолчанию 2)",
    ),
):
    return WorkoutSensorsResponse(
        **cardio_service.get_sensors(workout_id, interval_sec=downsample)
    )


@router.get(
    "/{workout_id}/points",
    summary="Точки карты велотренировки (с downsample)",
)
def api_get_points(
    workout_id: int,
    downsample: int = Query(
        2,
        ge=0,
        le=3600,
        description="1=все точки, 0=1/сек, N>=2 — 1 точка каждые N сек (по умолчанию 2)",
    ),
):
    try:
        return cardio_service.get_points(workout_id, interval_sec=downsample)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@router.get(
    "/zone-time",
    response_model=ZoneTimeResponse,
    summary="Время в зонах пульса за период",
)
def api_zone_time(
    days: int = Query(30, ge=1, le=365),
    workout_type: str | None = Query(
        None,
        alias="type",
        description="Тип кардио, __strength__ для силовых, пусто — все с пульсом",
    ),
):
    data = cardio_service.get_zone_time_distribution(days=days, workout_type=workout_type)
    return ZoneTimeResponse(**data)


@router.get(
    "/trimp",
    response_model=DailyTrimpResponse,
    summary="TRIMP по дням (Эдвардс)",
)
def api_daily_trimp(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
):
    items = cardio_service.get_daily_trimp(date_from, date_to)
    return DailyTrimpResponse(items=items)


@router.delete("/{workout_id}", summary="Удалить кардио-тренировку")
def api_delete_cardio(workout_id: int):
    if not cardio_service.delete_workout(workout_id):
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    return {"message": "ok"}


@router.post(
    "/{workout_id}/attach-polar",
    response_model=PolarAttachResponse,
    summary="Привязать данные Polar к кардио-тренировке",
)
def api_attach_polar_cardio(workout_id: int, body: PolarAttachBody):
    try:
        result = polar_attach_service.attach_polar_to_cardio(
            workout_id, body.polar_transaction_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return PolarAttachResponse(**result)
