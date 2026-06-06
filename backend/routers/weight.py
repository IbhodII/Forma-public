# -*- coding: utf-8 -*-
"""API ежедневного веса (daily_weight)."""
from __future__ import annotations

import pandas as pd
from fastapi import APIRouter, Query
from pydantic import BaseModel, Field, field_validator

from utils.date_guard import is_future_workout_date, parse_workout_date

router = APIRouter(tags=["weight"])


class DailyWeightRow(BaseModel):
    date: str
    weight_kg: float
    body_fat_percent: float | None = None


class DailyWeightCreate(BaseModel):
    date: str
    weight_kg: float = Field(..., gt=0)
    body_fat_percent: float | None = Field(None, ge=0, le=60)
    only_weight: bool = True

    @field_validator("date")
    @classmethod
    def _date_ok(cls, value: str) -> str:
        parsed = parse_workout_date(value)
        if parsed is None:
            raise ValueError("Некорректная дата")
        if is_future_workout_date(parsed):
            raise ValueError("Дата не может быть в будущем")
        return parsed.isoformat()


@router.get(
    "/daily/overview",
    summary="Вес для обзора: последние N дней",
    description="Без полной истории и weekly-агрегации по всей БД.",
)
def api_daily_weight_overview(
    days: int = Query(30, ge=7, le=365),
):
    from backend.services.body_overview_service import build_weight_overview

    return build_weight_overview(days=days)


@router.get("/daily", summary="Список ежедневных весов")
def api_list_daily_weight():
    from backend.database.daily_weight_store import load_daily_weight

    df = load_daily_weight()
    if df.empty:
        return {"items": [], "weekly": [], "current_week": {}}
    items = []
    for _, r in df.iterrows():
        items.append(
            {
                "date": str(r["date"])[:10],
                "weight_kg": float(r["weight_kg"]),
                "body_fat_percent": (
                    float(r["body_fat_percent"])
                    if pd.notna(r.get("body_fat_percent"))
                    else None
                ),
                "source": (
                    str(r["source"]).strip()
                    if "source" in r.index and pd.notna(r.get("source"))
                    else "manual"
                ),
            }
        )
    from backend.services.hc_analytics_service import filter_weight_items

    items = filter_weight_items(items)
    from database.db_utils import (
        _format_week_range,
        build_weekly_weight_stats,
        get_current_week_weight_stats,
    )

    weekly_df = build_weekly_weight_stats(df)
    weekly = []
    if not weekly_df.empty:
        for _, r in weekly_df.iterrows():
            ws = r["week_start"]
            weekly.append(
                {
                    "week_start": str(ws.date())[:10] if hasattr(ws, "date") else str(ws)[:10],
                    "week_label": _format_week_range(ws),
                    "weight_kg": float(r["weight_kg"]) if pd.notna(r["weight_kg"]) else None,
                    "body_fat_percent": (
                        float(r["body_fat_percent"])
                        if pd.notna(r.get("body_fat_percent"))
                        else None
                    ),
                    "fat_mass_kg": (
                        float(r["fat_mass_kg"]) if pd.notna(r.get("fat_mass_kg")) else None
                    ),
                    "lean_mass_kg": (
                        float(r["lean_mass_kg"]) if pd.notna(r.get("lean_mass_kg")) else None
                    ),
                    "days": int(r["days"]),
                }
            )
    cur = get_current_week_weight_stats(df)
    return {"items": items, "weekly": weekly, "current_week": cur}


@router.post("/daily", summary="Сохранить вес на дату")
def api_save_daily_weight(body: DailyWeightCreate):
    from backend.database.daily_weight_store import save_daily_weight
    from backend.services import body_service

    fat = None if body.only_weight or body.body_fat_percent is None else body.body_fat_percent
    save_daily_weight(
        body.date,
        body.weight_kg,
        fat,
        keep_existing_fat=body.only_weight,
    )
    body_service.sync_weight_from_daily(body.date, body.weight_kg, fat)
    return {"message": "ok"}
