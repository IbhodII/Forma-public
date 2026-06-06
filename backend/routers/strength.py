# -*- coding: utf-8 -*-
"""API силовых тренировок."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from backend.schemas.models import (
    HeartRatePoint,
    HeartRateResponse,
    PaginatedMeta,
    PolarAttachBody,
    PolarAttachResponse,
    StrengthHrAnalysisResponse,
    StrengthHrBlockOverridesPutBody,
    StrengthHrBlockOverridesResponse,
    StrengthHrAnalyticsOverviewResponse,
    StrengthHrExerciseAggregatesResponse,
    StrengthHrMappingPutBody,
    StrengthHrSessionDetailResponse,
    StrengthHrSessionsListResponse,
    StrengthHrTrendsResponse,
    StrengthNextWorkoutSuggestion,
    StrengthOneRmChartPoint,
    StrengthProgressPoint,
    StrengthVolumeResponse,
    TopExercisesProgressResponse,
    StrengthSession,
    StrengthSessionDetail,
    StrengthSessionsResponse,
    StrengthWorkoutCreate,
    StrengthWorkoutCreateResponse,
)
from backend.services import (
    exercise_service,
    polar_attach_service,
    strength_hr_analysis_service,
    strength_hr_analytics_service,
    strength_hr_block_override_service,
    strength_hr_mapping_service,
    strength_service,
)
from backend.services.hr_response_service import build_heart_rate_response

router = APIRouter(tags=["strength"])


def _require_nonempty_exercises(exercises: list[str]) -> list[str]:
    clean = [e.strip() for e in exercises if e and str(e).strip()]
    if not clean:
        raise ValueError("Добавьте хотя бы одно упражнение")
    return clean


class ExerciseSetSaveBody(BaseModel):
    workout_type: str = Field(..., min_length=1)
    effective_from: str
    active_exercises: list[str] = Field(default_factory=list)
    active_blocks: list[dict] = Field(default_factory=list)
    set_name: str | None = None
    show_on_main_panel: bool = False

    @field_validator("active_exercises")
    @classmethod
    def _validate_active_exercises(cls, value: list[str]) -> list[str]:
        return _require_nonempty_exercises(value)


class ExerciseSetUpdateBody(BaseModel):
    active_exercises: list[str] = Field(default_factory=list)
    active_blocks: list[dict] = Field(default_factory=list)
    set_name: str | None = None

    @field_validator("active_exercises")
    @classmethod
    def _validate_active_exercises(cls, value: list[str]) -> list[str]:
        return _require_nonempty_exercises(value)


class WorkoutTypeCreateBody(BaseModel):
    workout_type: str = Field(..., min_length=1)
    effective_from: str
    exercises: list[str] = Field(default_factory=list)
    show_on_main_panel: bool = True

    @field_validator("exercises")
    @classmethod
    def _validate_exercises(cls, value: list[str]) -> list[str]:
        return _require_nonempty_exercises(value)


class EnsureWorkoutPresetBody(BaseModel):
    show_on_main_panel: bool = True
    sync_exercises: bool = True


class StrengthPolarAttachResponse(PolarAttachResponse):
    workout: StrengthSessionDetail


class AppendExerciseBody(BaseModel):
    workout_title: str = Field(..., min_length=1)
    date: str = Field(..., description="YYYY-MM-DD")
    exercise_name: str = Field(..., min_length=1)


class ExerciseRenameBody(BaseModel):
    old_name: str = Field(..., min_length=1)
    new_name: str = Field(..., min_length=1)


class ExerciseCreateBody(BaseModel):
    name: str = Field(..., min_length=1)


class ExerciseUpdateBody(BaseModel):
    name: str = Field(..., min_length=1)


class ExerciseCatalogItem(BaseModel):
    id: int
    name: str


class ExerciseCatalogDetailItem(ExerciseCatalogItem):
    display_name: str
    is_archived: bool = False
    created_at: str | None = None
    updated_at: str | None = None


@router.get(
    "/workout-types",
    response_model=list[str],
    summary="Типы силовых тренировок",
)
def api_list_workout_types():
    return exercise_service.list_workout_types()


@router.get(
    "/workout-form-prefill",
    summary="Упражнения и прошлые значения для формы ввода",
)
def api_workout_form_prefill(
    workout_title: str = Query(...),
    date: str = Query(..., description="YYYY-MM-DD"),
    preset_id: int | None = Query(
        None,
        description="Если задан — упражнения из пресета; иначе из активного exercise_set",
    ),
):
    return exercise_service.get_workout_form_prefill(
        workout_title,
        date,
        preset_id=preset_id,
    )


@router.get(
    "/exercise-set/editor",
    summary="Редактор набора: пул упражнений и активные на дату",
)
def api_exercise_set_editor(
    workout_type: str = Query(...),
    effective_date: str = Query(..., description="YYYY-MM-DD"),
):
    return exercise_service.get_editor_state(workout_type, effective_date)


@router.get(
    "/exercise-set/{set_id}",
    summary="Состав конкретного набора",
)
def api_get_exercise_set(set_id: int):
    try:
        return exercise_service.get_set_detail(set_id)
    except ValueError as err:
        raise HTTPException(status_code=404, detail=str(err)) from err


@router.put(
    "/exercise-set/{set_id}",
    summary="Обновить состав существующего набора",
)
def api_update_exercise_set(set_id: int, body: ExerciseSetUpdateBody):
    try:
        exercise_service.update_set_from_editor(
            set_id,
            body.active_exercises,
            set_name=body.set_name,
            active_blocks=body.active_blocks,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"set_id": set_id, "message": "ok"}


@router.post(
    "/exercise-set",
    summary="Сохранить набор упражнений с даты",
)
def api_save_exercise_set(body: ExerciseSetSaveBody):
    try:
        set_id = exercise_service.save_exercise_set_from_editor(
            body.workout_type,
            body.effective_from,
            body.active_exercises,
            set_name=body.set_name,
            active_blocks=body.active_blocks,
            show_on_main_panel=body.show_on_main_panel,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"set_id": set_id, "message": "ok"}


@router.post(
    "/workout-types",
    summary="Создать новый тип тренировки",
)
def api_create_workout_type(body: WorkoutTypeCreateBody):
    try:
        set_id, preset_id = exercise_service.create_workout_type(
            body.workout_type,
            body.exercises,
            body.effective_from,
            show_on_main_panel=body.show_on_main_panel,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"set_id": set_id, "preset_id": preset_id, "message": "ok"}


@router.post(
    "/workout-types/{workout_type}/ensure-preset",
    summary="Создать или обновить пресет для типа тренировки",
)
def api_ensure_workout_preset(workout_type: str, body: EnsureWorkoutPresetBody):
    from datetime import date

    try:
        exercises = exercise_service.get_active_exercises(workout_type, date.today().isoformat())
        if not exercises:
            from backend.database.db_utils import get_all_sets

            sets = get_all_sets(workout_type)
            if sets:
                from backend.services.exercise_service import get_exercises_from_set

                exercises = [
                    str(x["exercise_name"])
                    for x in get_exercises_from_set(int(sets[-1]["id"]))
                ]
        if not exercises:
            raise ValueError("У типа нет упражнений — сначала задайте набор")
        from backend.services import preset_service

        preset = preset_service.ensure_preset_for_workout_type(
            workout_type,
            exercises,
            is_active=body.show_on_main_panel,
            sync_exercises=body.sync_exercises,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"preset_id": preset["id"], "message": "ok"}


@router.delete(
    "/exercise-set/{set_id}",
    summary="Удалить набор упражнений",
)
def api_delete_exercise_set(set_id: int):
    try:
        return exercise_service.delete_exercise_set_version(set_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete(
    "/workout-types/{workout_type}",
    summary="Удалить пользовательский тип тренировки",
)
def api_delete_workout_type(workout_type: str):
    try:
        return exercise_service.delete_workout_type(workout_type)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post(
    "/exercises/append",
    summary="Добавить упражнение в активный набор тренировки",
)
def api_append_exercise(body: AppendExerciseBody):
    try:
        return exercise_service.append_exercise_to_workout(
            body.workout_title,
            body.date,
            body.exercise_name,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get(
    "/exercises",
    response_model=list[str],
    summary="Справочник упражнений (all_exercises)",
)
def api_list_exercises():
    return strength_service.list_unique_exercises()


@router.get(
    "/exercises/catalog",
    response_model=list[ExerciseCatalogDetailItem],
    summary="Управление справочником упражнений",
)
def api_list_exercise_catalog(include_archived: bool = Query(False)):
    from backend.services import exercise_catalog_service

    return exercise_catalog_service.list_catalog_items(include_archived=include_archived)


@router.post(
    "/exercises",
    response_model=ExerciseCatalogItem,
    status_code=200,
    summary="Добавить упражнение в справочник",
    description="Если название уже есть — возвращает существующую запись (200).",
)
def api_create_exercise(body: ExerciseCreateBody):
    from backend.services import exercise_catalog_service

    try:
        return exercise_catalog_service.ensure_exercise(body.name)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post(
    "/exercises/rename",
    summary="Переименовать упражнение во всей базе",
)
def api_rename_exercise(body: ExerciseRenameBody):
    try:
        return strength_service.rename_exercise_globally(body.old_name, body.new_name)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put(
    "/exercises/{exercise_id}",
    response_model=ExerciseCatalogItem,
    summary="Редактировать запись справочника упражнения",
)
def api_update_catalog_exercise(exercise_id: int, body: ExerciseUpdateBody):
    from backend.services import exercise_catalog_service

    try:
        return exercise_catalog_service.update_catalog_exercise(exercise_id, body.name)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete(
    "/exercises/{exercise_id}",
    summary="Удалить или архивировать запись справочника упражнения",
)
def api_delete_catalog_exercise(exercise_id: int):
    from backend.services import exercise_catalog_service

    try:
        return exercise_catalog_service.delete_catalog_exercise(exercise_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get(
    "/next-workout-suggestion",
    response_model=StrengthNextWorkoutSuggestion,
    summary="Подсказка увеличить вес на следующей тренировке",
    description=(
        "Успех: все рабочие подходы >= цели (пресет default_reps или 8 повторений). "
        "Шаг: 2.5 кг (штанга), 1 кг на гантель (по названию упражнения)."
    ),
)
def api_next_workout_suggestion(
    exercise_name: str = Query(..., min_length=1, description="Название упражнения"),
    workout_title: str | None = Query(None, description="Тип тренировки (опционально)"),
):
    return strength_service.get_next_workout_suggestion(exercise_name, workout_title)


@router.get(
    "/1rm-chart",
    response_model=list[StrengthOneRmChartPoint],
    summary="График прогресса e1RM по упражнению",
    description="По каждому дню — максимальный расчётный 1ПМ (epley_1rm) среди подходов.",
)
def api_1rm_chart(
    exercise_name: str = Query(..., min_length=1, description="Название упражнения"),
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    include_warmup: bool = Query(False, description="Включать разминочные подходы"),
):
    try:
        return strength_service.get_1rm_chart(
            exercise_name,
            date_from,
            date_to,
            include_warmup=include_warmup,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.get(
    "/progress/{exercise}",
    response_model=list[StrengthProgressPoint],
    summary="Прогресс по упражнению",
    description="По каждой дате — подход с максимальным весом, Epley 1ПМ.",
)
def api_exercise_progress(
    exercise: str,
    date_from: str | None = Query(None, description="YYYY-MM-DD"),
    date_to: str | None = Query(None, description="YYYY-MM-DD"),
    include_warmup: bool = Query(False, description="Включать разминочные подходы"),
):
    return strength_service.get_exercise_progress(
        exercise, date_from, date_to, include_warmup=include_warmup
    )


@router.get(
    "/volume",
    response_model=StrengthVolumeResponse,
    summary="Объём силовой нагрузки по дням",
)
def api_strength_volume(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
    include_warmup: bool = Query(False, description="Включать разминочные подходы"),
):
    items = strength_service.get_volume_by_day(date_from, date_to, include_warmup=include_warmup)
    return StrengthVolumeResponse(items=items)


@router.get(
    "/top-exercises-progress",
    response_model=TopExercisesProgressResponse,
    summary="Прогресс 1ПМ по популярным упражнениям",
)
def api_top_exercises_progress(
    limit: int = Query(10, ge=1, le=20),
    current_days: int = Query(7, ge=1, le=30, description="Текущее окно, дней"),
    past_days: int = Query(30, ge=7, le=90, description="Прошлое окно до текущего"),
    active_days: int = Query(60, ge=14, le=180, description="Учитывать упражнения за период"),
    include_warmup: bool = Query(False, description="Включать разминочные подходы"),
):
    items = strength_service.get_top_exercises_progress(
        limit=limit,
        current_days=current_days,
        past_days=past_days,
        active_days=active_days,
        include_warmup=include_warmup,
    )
    return TopExercisesProgressResponse(items=items)


@router.get(
    "/sessions",
    response_model=StrengthSessionsResponse,
    summary="Список силовых сессий",
    description=(
        "Группировка по дате и типу тренировки. "
        "Фильтры date_from / date_to (включительно), workout_title — точное совпадение."
    ),
)
def api_get_sessions(
    limit: int = Query(50, ge=1, le=5000, description="Размер страницы"),
    offset: int = Query(0, ge=0, description="Смещение"),
    date_from: str | None = Query(None, description="Начало периода YYYY-MM-DD"),
    date_to: str | None = Query(None, description="Конец периода YYYY-MM-DD"),
    workout_title: str | None = Query(
        None,
        description="Точное название тренировки (кириллица и пробелы как в БД)",
    ),
    preset_id: int | None = Query(
        None,
        gt=0,
        description="Фильтр по пресету (id); совместим с workout_title",
    ),
):
    items, total = strength_service.get_sessions(
        limit,
        offset,
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        preset_id=preset_id,
    )
    return StrengthSessionsResponse(
        items=[StrengthSession.model_validate(row) for row in items],
        meta=PaginatedMeta(total=total, limit=limit, offset=offset),
    )


@router.get(
    "/sessions/by-preset/{preset_id}",
    response_model=StrengthSessionsResponse,
    summary="Силовые тренировки по пресету",
)
def api_get_sessions_by_preset(
    preset_id: int,
    limit: int = Query(200, ge=1, le=5000),
    offset: int = Query(0, ge=0),
):
    items, total = strength_service.get_sessions(
        limit,
        offset,
        preset_id=preset_id,
    )
    return StrengthSessionsResponse(
        items=[StrengthSession.model_validate(row) for row in items],
        meta=PaginatedMeta(total=total, limit=limit, offset=offset),
    )


def _heart_rate_response(workout_id: int) -> HeartRateResponse:
    raw = strength_service.get_strength_heart_rate_data(workout_id)
    return build_heart_rate_response(workout_id, raw)


@router.get(
    "/sessions/{date}/{workout_title:path}/heart-rate",
    response_model=HeartRateResponse,
    summary="Пульс силовой сессии по дате и названию",
)
def api_get_strength_session_heart_rate(date: str, workout_title: str):
    wid = strength_service.resolve_session_hr_workout_id(date, workout_title)
    if wid is None:
        return build_heart_rate_response(0, [])
    return _heart_rate_response(wid)


@router.get(
    "/sessions/{date}/{workout_title:path}/hr-analysis",
    response_model=StrengthHrAnalysisResponse,
    summary="Анализ пульса по подходам (peak detection)",
)
def api_get_strength_hr_analysis(date: str, workout_title: str):
    return strength_hr_analysis_service.get_strength_hr_analysis(date, workout_title)


@router.get(
    "/sessions/{date}/{workout_title:path}/hr-block-overrides",
    response_model=StrengthHrBlockOverridesResponse,
    summary="Сохранённая ручная разметка HR-блоков",
)
def api_get_strength_hr_block_overrides(date: str, workout_title: str):
    date_str = str(date)[:10]
    mappings = strength_hr_mapping_service.get_mappings(date_str, workout_title)
    if mappings:
        blocks = strength_hr_mapping_service.mappings_as_overrides(mappings)
    else:
        blocks = strength_hr_block_override_service.get_overrides(date_str, workout_title)
    return {
        "date": date_str,
        "workout_title": workout_title,
        "blocks": blocks,
    }


@router.put(
    "/sessions/{date}/{workout_title:path}/hr-block-overrides",
    response_model=StrengthHrBlockOverridesResponse,
    summary="Сохранить ручную разметку HR-блоков",
)
def api_put_strength_hr_block_overrides(
    date: str,
    workout_title: str,
    body: StrengthHrBlockOverridesPutBody,
):
    date_str = str(date)[:10]
    try:
        strength_hr_mapping_service.sync_legacy_override(
            date_str,
            workout_title,
            [b.model_dump() for b in body.blocks],
        )
    except strength_hr_block_override_service.BlockOverrideValidationError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    mappings = strength_hr_mapping_service.get_mappings(date_str, workout_title)
    blocks = strength_hr_mapping_service.mappings_as_overrides(mappings)
    return {
        "date": date_str,
        "workout_title": workout_title,
        "blocks": blocks,
    }


@router.delete(
    "/sessions/{date}/{workout_title:path}/hr-block-overrides",
    summary="Сбросить ручную разметку HR-блоков",
)
def api_delete_strength_hr_block_overrides(date: str, workout_title: str):
    date_str = str(date)[:10]
    strength_hr_mapping_service.delete_legacy_and_mappings(date_str, workout_title)
    return {"date": date_str, "workout_title": workout_title, "message": "ok"}


@router.get(
    "/hr-analytics/sessions",
    response_model=StrengthHrSessionsListResponse,
    summary="Сессии с HR-аналитикой",
)
def api_hr_analytics_sessions(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    workout_title: str | None = Query(None),
    exercise: str | None = Query(None),
    verified_only: bool = Query(False),
    min_confidence: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return strength_hr_analytics_service.list_hr_sessions(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        exercise=exercise,
        verified_only=verified_only,
        min_confidence=min_confidence,
        limit=limit,
        offset=offset,
    )


@router.get(
    "/hr-analytics/session",
    response_model=StrengthHrSessionDetailResponse,
    summary="Детали HR-аналитики сессии",
)
def api_hr_analytics_session(
    date: str = Query(...),
    workout_title: str = Query(...),
):
    return strength_hr_analytics_service.get_hr_session_detail(date, workout_title)


@router.put(
    "/hr-analytics/session/mapping",
    summary="Сохранить разметку HR-блоков",
)
def api_hr_analytics_put_mapping(
    date: str = Query(...),
    workout_title: str = Query(...),
    body: StrengthHrMappingPutBody = ...,
):
    date_str = str(date)[:10]
    status = body.mapping_status if body.mapping_status in ("manual", "verified") else "manual"
    try:
        strength_hr_mapping_service.save_mappings(
            date_str,
            workout_title,
            body.blocks,
            mapping_status=status,
            verified=status == "verified",
        )
    except strength_hr_block_override_service.BlockOverrideValidationError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"date": date_str, "workout_title": workout_title, "mapping_status": status}


@router.post(
    "/hr-analytics/session/mapping/verify",
    summary="Подтвердить авторазметку («Подходы верны»)",
)
def api_hr_analytics_verify_mapping(
    date: str = Query(...),
    workout_title: str = Query(...),
):
    date_str = str(date)[:10]
    try:
        meta = strength_hr_mapping_service.verify_auto_mapping(date_str, workout_title)
    except strength_hr_block_override_service.BlockOverrideValidationError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {
        "date": date_str,
        "workout_title": workout_title,
        "mapping_status": meta.get("mapping_status", "verified"),
    }


@router.delete(
    "/hr-analytics/session/mapping",
    summary="Сбросить сохранённую разметку",
)
def api_hr_analytics_delete_mapping(
    date: str = Query(...),
    workout_title: str = Query(...),
):
    date_str = str(date)[:10]
    strength_hr_mapping_service.delete_legacy_and_mappings(date_str, workout_title)
    return {"date": date_str, "workout_title": workout_title, "message": "ok"}


@router.get(
    "/hr-analytics/exercises",
    response_model=StrengthHrExerciseAggregatesResponse,
    summary="Агрегаты по упражнениям",
)
def api_hr_analytics_exercises(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    workout_title: str | None = Query(None),
    verified_only: bool = Query(False),
    min_confidence: str | None = Query(None),
):
    items = strength_hr_analytics_service.list_exercise_aggregates(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        verified_only=verified_only,
        min_confidence=min_confidence,
    )
    return {"items": items}


@router.get(
    "/hr-analytics/trends",
    response_model=StrengthHrTrendsResponse,
    summary="Тренды HR по сессиям",
)
def api_hr_analytics_trends(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    workout_title: str | None = Query(None),
    verified_only: bool = Query(False),
    min_confidence: str | None = Query(None),
):
    items = strength_hr_analytics_service.get_hr_trends(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        verified_only=verified_only,
        min_confidence=min_confidence,
    )
    return {"items": items}


@router.get(
    "/hr-analytics/overview",
    response_model=StrengthHrAnalyticsOverviewResponse,
    summary="Сводка HR-аналитики (sessions + exercises + trends за один проход)",
)
def api_hr_analytics_overview(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    workout_title: str | None = Query(None),
    exercise: str | None = Query(None),
    verified_only: bool = Query(False),
    min_confidence: str | None = Query(None),
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
):
    return strength_hr_analytics_service.build_hr_analytics_overview(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        exercise=exercise,
        verified_only=verified_only,
        min_confidence=min_confidence,
        sessions_limit=limit,
        sessions_offset=offset,
    )


@router.get(
    "/{workout_id}/heart-rate",
    response_model=HeartRateResponse,
    summary="Пульс силовой тренировки",
    description=(
        "Точки из workout_heart_rate с source_type=strength "
        "(cardio_workout_id = id строки strength_workouts)."
    ),
)
def api_get_strength_heart_rate(workout_id: int):
    if not strength_service.strength_workout_exists(workout_id):
        raise HTTPException(status_code=404, detail="Силовая тренировка не найдена")
    return _heart_rate_response(workout_id)


@router.get(
    "/sessions/{date}/{workout_title:path}",
    response_model=StrengthSessionDetail,
    summary="Детали силовой тренировки",
    description="Упражнения (exercise, weight, reps_str), пульс и калории.",
    operation_id="get_strength_session_detail",
)
def get_strength_session_detail(date: str, workout_title: str):
    detail = strength_service.get_session_detail(date, workout_title)
    if not detail.get("exercises") and not detail.get("ordered_sets"):
        raise HTTPException(status_code=404, detail="Тренировка не найдена")
    return detail


@router.post(
    "/workout",
    response_model=StrengthWorkoutCreateResponse,
    summary="Сохранить силовую тренировку",
)
def api_post_strength_workout(body: StrengthWorkoutCreate):
    inserted, workout_id = strength_service.create_workout(body.model_dump())
    return StrengthWorkoutCreateResponse(inserted_sets=inserted, workout_id=workout_id)


@router.post(
    "/{workout_id}/attach-polar",
    response_model=StrengthPolarAttachResponse,
    summary="Привязать данные Polar к силовой тренировке",
)
def api_attach_polar_strength(workout_id: int, body: PolarAttachBody):
    try:
        result = polar_attach_service.attach_polar_to_strength(
            workout_id, body.polar_transaction_id
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return StrengthPolarAttachResponse(**result)


@router.delete(
    "/sessions/{date}/{workout_title:path}",
    summary="Удалить силовую сессию",
)
def api_delete_session(date: str, workout_title: str):
    if not strength_service.delete_session(date, workout_title):
        raise HTTPException(status_code=404, detail="Сессия не найдена")
    return {"message": "ok"}
