# -*- coding: utf-8 -*-
"""API профиля пользователя."""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Query

logger = logging.getLogger(__name__)

from backend.schemas.models import (
    AnalyticsSettings,
    AnalyticsSettingsSave,
    BackupNowResult,
    BackupSettings,
    BackupSettingsSave,
    BraceletCalibrationRecalculateResult,
    BraceletCalibrationStatus,
    IntegrationSettings,
    IntegrationSettingsSave,
    LevelCalculationResponse,
    NutritionSettings,
    NutritionSettingsSave,
    SourcePriorityPrefs,
    UserProfile,
    UserProfileUpdate,
)
from backend.services import backup_service, calibration_service, user_service
from backend.services import source_resolver_service

router = APIRouter(tags=["user"])


@router.get(
    "/profile",
    response_model=UserProfile,
    summary="Профиль пользователя",
)
def api_get_profile():
    profile = user_service.get_profile()
    return user_service.build_profile_response(profile)


@router.get(
    "/source-priorities",
    response_model=SourcePriorityPrefs,
    summary="Приоритеты источников данных",
)
def api_get_source_priorities():
    prefs = source_resolver_service.get_user_priority_prefs()
    return SourcePriorityPrefs(**prefs)


@router.put(
    "/source-priorities",
    response_model=SourcePriorityPrefs,
    summary="Сохранить приоритеты источников данных",
)
def api_save_source_priorities(body: SourcePriorityPrefs):
    saved = source_resolver_service.save_user_priority_prefs(body.model_dump())
    return SourcePriorityPrefs(**saved)


@router.post(
    "/profile",
    response_model=UserProfile,
    summary="Создать или обновить профиль",
)
def api_upsert_profile(body: UserProfileUpdate):
    payload = body.model_dump(exclude_unset=True)
    if not payload:
        raise HTTPException(status_code=400, detail="Нет полей для обновления")
    try:
        return user_service.upsert_profile(payload)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    except Exception as err:
        logger.exception("POST /api/user/profile failed: %s", payload)
        raise HTTPException(
            status_code=500,
            detail="Не удалось сохранить профиль",
        ) from err


@router.get(
    "/nutrition-settings",
    response_model=NutritionSettings,
    summary="Целевые нормы питания (г/кг)",
)
def api_get_nutrition_settings():
    data = user_service.get_nutrition_settings()
    return NutritionSettings(**data)


@router.post(
    "/nutrition-settings",
    response_model=NutritionSettings,
    summary="Сохранить целевые нормы питания",
)
def api_save_nutrition_settings(body: NutritionSettingsSave):
    try:
        saved = user_service.save_nutrition_settings(body.model_dump(exclude_unset=True))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return NutritionSettings(**saved)


@router.get(
    "/calibration-factor",
    response_model=BraceletCalibrationStatus,
    summary="Коэффициент калибровки калорий браслета",
)
def api_get_calibration_factor():
    status = calibration_service.get_calibration_status()
    return BraceletCalibrationStatus(
        factor=status["factor"],
        last_calibration_date=status.get("last_calibration_date"),
        calibration_stale=calibration_service.calibration_stale(14),
    )


@router.post(
    "/recalculate-calibration",
    response_model=BraceletCalibrationRecalculateResult,
    summary="Пересчитать коэффициент калибровки браслета",
)
def api_recalculate_calibration(
    days: int = Query(14, ge=3, le=90, description="Дней истории для расчёта"),
    phase: str = Query("cut", description="Фаза дневника питания: cut | bulk"),
):
    try:
        result = calibration_service.recalculate_and_save(days, phase=phase)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return BraceletCalibrationRecalculateResult(**result)


@router.post(
    "/calculate-level",
    response_model=LevelCalculationResponse,
    summary="Рассчитать уровень активности и рекомендации БЖУ",
)
def api_calculate_level():
    return LevelCalculationResponse(**user_service.calculate_user_level())


@router.get(
    "/integration-settings",
    response_model=IntegrationSettings,
    summary="Настройки интеграций (FIT и др.)",
)
def api_get_integration_settings():
    return IntegrationSettings(**user_service.get_integration_settings())


@router.post(
    "/integration-settings",
    response_model=IntegrationSettings,
    summary="Сохранить настройки интеграций",
)
def api_save_integration_settings(body: IntegrationSettingsSave):
    try:
        saved = user_service.save_integration_settings(body.model_dump(exclude_unset=True))
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return IntegrationSettings(**saved)


@router.get(
    "/analytics-settings",
    response_model=AnalyticsSettings,
    summary="Настройки силовой аналитики",
)
def api_get_analytics_settings():
    return AnalyticsSettings(**user_service.get_analytics_settings())


@router.post(
    "/analytics-settings",
    response_model=AnalyticsSettings,
    summary="Сохранить настройки силовой аналитики",
)
def api_save_analytics_settings(body: AnalyticsSettingsSave):
    saved = user_service.update_analytics_settings(body.model_dump())
    return AnalyticsSettings(**saved)


@router.get(
    "/backup-settings",
    response_model=BackupSettings,
    summary="Настройки локального резервного копирования",
)
def api_get_backup_settings():
    return BackupSettings(**backup_service.get_backup_settings())


@router.post(
    "/backup-settings",
    response_model=BackupSettings,
    summary="Сохранить папку для локальных бэкапов",
)
def api_save_backup_settings(body: BackupSettingsSave):
    try:
        saved = backup_service.save_backup_settings(body.backup_folder_path)
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err
    return BackupSettings(**saved)


@router.post(
    "/backup/now",
    response_model=BackupNowResult,
    summary="Создать локальный бэкап workouts.db сейчас",
)
def api_backup_now():
    result = backup_service.perform_backup()
    if not result.get("success"):
        raise HTTPException(
            status_code=400,
            detail=result.get("error") or "Не удалось создать бэкап",
        )
    return BackupNowResult(**result)
