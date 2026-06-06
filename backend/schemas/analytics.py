# -*- coding: utf-8 -*-
"""Схемы API аналитики (браслет, скорректированный расход)."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class DailyBraceletCalories(BaseModel):
    date: str
    total_calories: int
    source: Optional[str] = "manual"
    updated_at: Optional[str] = None


class DailyBraceletCaloriesSave(BaseModel):
    date: str
    total_calories: int = Field(..., ge=0)
    source: Optional[str] = "manual"


class DailyBraceletCaloriesListResponse(BaseModel):
    items: list[DailyBraceletCalories]


class DailyExpenditureResponse(BaseModel):
    date: str
    bmr: Optional[float] = None
    tef: float = 0
    bracelet_total: Optional[int] = None
    bracelet_source: Optional[str] = None
    watch_total: int = 0
    chest_total: int = 0
    chest_raw_total: int = 0
    workout_effective_total: int = 0
    corrected_activity: Optional[int] = None
    total_expenditure: Optional[float] = None
    needs_bracelet_input: bool = False
    calculation_mode: Literal["bracelet", "fallback"] = "fallback"
    prefer_chest: bool = True
    has_fallback: bool = False
    fallback_used_for: list[str] = Field(default_factory=list)
    hc_analytics_enabled: bool = False
    hc_stale: bool = False
    hc_stale_warning: Optional[str] = None


class WeekDailyExpenditureResponse(BaseModel):
    items: list[DailyExpenditureResponse]
    days_with_bracelet: int = 0
    days_without_bracelet: int = 0
    total_corrected_expenditure: Optional[float] = None
