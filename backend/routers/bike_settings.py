# -*- coding: utf-8 -*-
"""API настроек велосипеда."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from backend.schemas.models import BikeSettings, BikeSettingsSave
from backend.services import bike_settings_service

router = APIRouter(tags=["bike"])


@router.get(
    "/bike-settings",
    response_model=BikeSettings,
    summary="Настройки велосипеда",
)
def api_get_bike_settings():
    return BikeSettings(**bike_settings_service.get_or_create_bike_settings())


@router.post(
    "/bike-settings",
    response_model=BikeSettings,
    summary="Сохранить настройки велосипеда",
)
def api_save_bike_settings(body: BikeSettingsSave):
    try:
        saved = bike_settings_service.save_bike_settings(body.model_dump(exclude_unset=True))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return BikeSettings(**saved)
