# -*- coding: utf-8 -*-
"""API управления пресетами тренировок."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from backend.services import preset_service

router = APIRouter(tags=["presets"])


class PresetSetBody(BaseModel):
    set_number: int = Field(..., ge=1)
    reps: int = Field(..., ge=1)
    weight: float | None = None
    duration_sec: int | None = Field(None, ge=1)
    is_warmup: bool = False


class PresetExerciseBody(BaseModel):
    exercise_name: str = Field(..., min_length=1)
    exercise_order: int = 0
    is_bodyweight: bool = False
    sets: list[PresetSetBody] = Field(default_factory=list)
    notes: str = ""
    # legacy (обратная совместимость)
    default_sets: int | None = None
    default_reps: str | None = None
    default_weight: float | None = None


class PresetCreateBody(BaseModel):
    name: str = Field(..., min_length=1)
    exercises: list[PresetExerciseBody] = Field(..., min_length=1)


class PresetUpdateBody(BaseModel):
    name: str | None = None
    exercises: list[PresetExerciseBody] | None = None
    sort_order: int | None = None


@router.get("", summary="Список пресетов")
def api_list_presets(
    active_only: bool | None = Query(None, description="True=активные, False=архив"),
):
    return preset_service.list_presets(active_only=active_only)


@router.get("/{preset_id}", summary="Детали пресета")
def api_get_preset(preset_id: int):
    preset = preset_service.get_preset_by_id(preset_id)
    if not preset:
        raise HTTPException(status_code=404, detail="Пресет не найден")
    return preset


@router.post("", summary="Создать пресет")
def api_create_preset(body: PresetCreateBody):
    try:
        return preset_service.create_preset(
            body.name,
            [ex.model_dump() for ex in body.exercises],
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.put("/{preset_id}", summary="Обновить пресет")
def api_update_preset(preset_id: int, body: PresetUpdateBody):
    try:
        return preset_service.update_preset(
            preset_id,
            name=body.name,
            exercises=[ex.model_dump() for ex in body.exercises] if body.exercises is not None else None,
            sort_order=body.sort_order,
        )
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{preset_id}/archive", summary="Архивировать пресет")
def api_archive_preset(preset_id: int):
    try:
        return preset_service.archive_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.post("/{preset_id}/restore", summary="Восстановить пресет")
def api_restore_preset(preset_id: int):
    try:
        return preset_service.restore_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


@router.delete("/{preset_id}", summary="Удалить пресет")
def api_delete_preset(preset_id: int):
    try:
        preset_service.delete_preset(preset_id)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return {"message": "ok"}
