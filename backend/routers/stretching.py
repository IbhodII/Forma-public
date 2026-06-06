# -*- coding: utf-8 -*-
"""API учёта растяжки."""
from __future__ import annotations

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field

from backend.services import stretching_service
from backend.services.stretching_upload import save_stretching_image

router = APIRouter(tags=["stretching"])


class StretchingExerciseBody(BaseModel):
    name: str = Field(..., min_length=1)
    target_muscle_group: str | None = None
    description: str | None = None
    images: list[str] = Field(default_factory=list, description="Пути к изображениям")


class StretchingPresetExerciseBody(BaseModel):
    exercise_id: int
    hold_seconds: int = 30
    reps: int = 1
    notes: str = ""
    exercise_order: int = 0


class StretchingPresetCreateBody(BaseModel):
    name: str = Field(..., min_length=1)
    exercises: list[StretchingPresetExerciseBody] = Field(..., min_length=1)


class StretchingPresetUpdateBody(BaseModel):
    name: str | None = None
    exercises: list[StretchingPresetExerciseBody] | None = None
    sort_order: int | None = None


class StretchingLogCreateBody(BaseModel):
    date: str = Field(..., min_length=10)
    preset_id: int
    duration_minutes: int | None = None
    notes: str | None = None



@router.get("/exercises", summary="Список упражнений растяжки")
def api_list_exercises(
    muscle_group: str | None = Query(None, description="Фильтр по группе мышц"),
):
    return stretching_service.list_exercises(muscle_group=muscle_group)


@router.post(
    "/upload-image",
    summary="Загрузить изображение упражнения",
)
async def api_upload_stretching_image(file: UploadFile = File(...)):
    return await save_stretching_image(file)


@router.post("/exercises", summary="Добавить упражнение")
def api_create_exercise(body: StretchingExerciseBody):
    try:
        return stretching_service.create_exercise(
            name=body.name,
            target_muscle_group=body.target_muscle_group,
            description=body.description,
            images=body.images,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/exercises/{exercise_id}", summary="Обновить упражнение")
def api_update_exercise(exercise_id: int, body: StretchingExerciseBody):
    try:
        return stretching_service.update_exercise(
            exercise_id,
            name=body.name,
            target_muscle_group=body.target_muscle_group,
            description=body.description,
            images=body.images,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/exercises/{exercise_id}", summary="Удалить упражнение")
def api_delete_exercise(exercise_id: int):
    try:
        stretching_service.delete_exercise(exercise_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"message": "ok"}


@router.get("/presets", summary="Список пресетов растяжки")
def api_list_presets(
    active_only: bool | None = Query(None, description="True=активные, False=архив"),
):
    return stretching_service.list_presets(active_only=active_only)


@router.get("/presets/{preset_id}", summary="Детали пресета")
def api_get_preset(preset_id: int):
    preset = stretching_service.get_preset_by_id(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Пресет не найден")
    return preset


@router.post("/presets", summary="Создать пресет")
def api_create_preset(body: StretchingPresetCreateBody):
    try:
        return stretching_service.create_preset(
            body.name,
            [ex.model_dump() for ex in body.exercises],
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/presets/{preset_id}", summary="Обновить пресет")
def api_update_preset(preset_id: int, body: StretchingPresetUpdateBody):
    try:
        return stretching_service.update_preset(
            preset_id,
            name=body.name,
            exercises=[ex.model_dump() for ex in body.exercises]
            if body.exercises is not None
            else None,
            sort_order=body.sort_order,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/presets/{preset_id}/archive", summary="Архивировать пресет")
def api_archive_preset(preset_id: int):
    try:
        return stretching_service.archive_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/presets/{preset_id}/restore", summary="Восстановить пресет")
def api_restore_preset(preset_id: int):
    try:
        return stretching_service.restore_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/presets/{preset_id}", summary="Удалить пресет")
def api_delete_preset(preset_id: int):
    try:
        stretching_service.delete_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"message": "ok"}


@router.get("/log", summary="Журнал растяжки")
def api_list_log(
    days: int = Query(90, ge=1, le=730),
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
):
    return stretching_service.list_log(days=days, date_from=date_from, date_to=date_to)


@router.post("/log", summary="Записать выполненный пресет")
def api_create_log(body: StretchingLogCreateBody):
    try:
        return stretching_service.create_log_entry(
            date_str=body.date,
            preset_id=body.preset_id,
            duration_minutes=body.duration_minutes,
            notes=body.notes,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/log/{log_id}", summary="Удалить запись из журнала")
def api_delete_log(log_id: int):
    try:
        stretching_service.delete_log_entry(log_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"message": "ok"}


@router.get("/activity", summary="Данные для календаря активности")
def api_activity(days: int = Query(365, ge=30, le=730)):
    return stretching_service.get_activity_calendar(days=days)
