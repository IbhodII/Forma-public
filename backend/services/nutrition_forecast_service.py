# -*- coding: utf-8 -*-
"""Прогноз веса по среднему потреблению и расходу за последние N дней."""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException

from backend.core import week_calendar
from backend.services import nutrition_balance_service, settings_service
from database.db_utils import get_nutrition_input_snapshot, save_nutrition_plan

KCAL_PER_GRAM_MASS = nutrition_balance_service.KCAL_PER_GRAM_MASS


def _round1(v: float) -> float:
    return round(v, 1)


def compute_forecast(
    phase: str,
    target_weight_kg: float,
    target_body_fat_percent: float | None = None,
    *,
    prefer_chest_workout: bool = True,
    lookback_days: int = nutrition_balance_service.FORECAST_BALANCE_DAYS_BACK,
    balance_period: str = "rolling_14",
    week_start_day: int | None = None,
    target_bulk_grams_per_week: float | None = None,
    persist_plan: bool = False,
) -> dict[str, Any]:
    ph = phase if phase in ("cut", "bulk") else "cut"
    snap = get_nutrition_input_snapshot()
    current_weight = snap.get("weight_kg")
    if current_weight is None:
        raise HTTPException(
            status_code=400,
            detail="Нет веса. Добавьте запись на вкладке «Тело → Вес».",
        )
    current_weight = float(current_weight)
    current_bf = snap.get("body_fat_percent")
    current_bf_f = float(current_bf) if current_bf is not None else None

    target_weight_kg = float(target_weight_kg)
    if ph == "cut" and target_weight_kg >= current_weight:
        raise HTTPException(
            status_code=400,
            detail="При сушке целевой вес должен быть ниже текущего.",
        )
    if ph == "bulk" and target_weight_kg <= current_weight:
        raise HTTPException(
            status_code=400,
            detail="При наборе целевой вес должен быть выше текущего.",
        )

    wsd = week_calendar.normalize_week_start_day(
        week_start_day if week_start_day is not None else settings_service.get_week_start_day()
    )
    balance, period, balance_period_label = nutrition_balance_service.fetch_phase_energy_balance(
        ph,
        balance_period,
        prefer_chest=prefer_chest_workout,
        week_start_day=wsd,
    )

    if not balance.get("ok"):
        raise HTTPException(status_code=400, detail=balance.get("error", "Нет данных"))

    avg_intake = float(balance["average_daily_intake"])
    avg_expenditure = float(balance["average_daily_expenditure"])
    daily_balance = float(balance["daily_balance_kcal"])

    target_surplus_kcal: float | None = None
    if ph == "bulk" and target_bulk_grams_per_week is not None:
        target_surplus_kcal = nutrition_balance_service.target_daily_surplus_kcal(
            target_bulk_grams_per_week
        )
        change_per_week = _round1(float(target_bulk_grams_per_week) / 1000.0)
    else:
        change_per_week = _round1((abs(daily_balance) * 7) / 7700)

    if change_per_week <= 0:
        raise HTTPException(
            status_code=400,
            detail="Нет дефицита или профицита по данным за выбранный период — прогноз срока невозможен.",
        )

    kg_to_change = abs(target_weight_kg - current_weight)
    goal_reached = kg_to_change < 0.05
    if goal_reached:
        weeks_to_target = 0.0
        target_date = date.today().isoformat()
    else:
        weeks_to_target = _round1(kg_to_change / change_per_week)
        end = date.today()
        target_date = (end + timedelta(days=int(math.ceil(weeks_to_target * 7)))).isoformat()
    end = date.today()

    weight_projection: list[dict[str, Any]] = []
    w = current_weight
    max_weeks = min(int(math.ceil(weeks_to_target)) + 1, 52)
    for week in range(max_weeks + 1):
        proj_date = (end + timedelta(days=week * 7)).isoformat()
        weight_projection.append(
            {"week": week, "date": proj_date, "weight_kg": _round1(w)},
        )
        if ph == "cut":
            w = max(target_weight_kg, w - change_per_week)
        else:
            w = min(target_weight_kg, w + change_per_week)
        if abs(w - target_weight_kg) < 0.05:
            break

    result: dict[str, Any] = {
        "phase": ph,
        "current_weight_kg": _round1(current_weight),
        "current_body_fat_percent": _round1(current_bf_f) if current_bf_f is not None else None,
        "average_daily_calorie_intake": _round1(avg_intake),
        "average_daily_expenditure": _round1(avg_expenditure),
        "daily_surplus_or_deficit": _round1(daily_balance),
        "change_per_week_kg": change_per_week,
        "weeks_to_target": weeks_to_target,
        "target_date": target_date,
        "target_weight_kg": _round1(target_weight_kg),
        "goal_reached": goal_reached,
        "goal_reached_message": "Цель достигнута." if goal_reached else None,
        "lookback_days": balance.get("lookback_days", lookback_days),
        "balance_period": period,
        "balance_period_label": balance_period_label,
        "balance_from": balance.get("period_start"),
        "balance_to": balance.get("period_end"),
        "weight_projection": weight_projection,
        "target_bulk_grams_per_week": (
            _round1(target_bulk_grams_per_week) if target_bulk_grams_per_week is not None else None
        ),
        "target_daily_surplus_kcal": target_surplus_kcal,
    }

    if target_body_fat_percent is not None:
        target_bf = float(target_body_fat_percent)
        result["target_body_fat_percent"] = target_bf
        if current_bf_f is None:
            result["fat_goal_achievable"] = None
            result["body_fat_note"] = "Нет текущего % жира — проверка цели по жиру недоступна."
        else:
            current_lean = current_weight * (1 - current_bf_f / 100)
            target_fat_kg = _round1(target_weight_kg * target_bf / 100)
            target_lean = target_weight_kg - target_fat_kg
            achievable = True
            notes: list[str] = []
            if ph == "cut" and target_lean < current_lean - 0.1:
                achievable = False
                notes.append(
                    f"Целевая сухая масса ({target_lean:.1f} кг) ниже текущей ({current_lean:.1f} кг) — "
                    "потребуется потеря мышечной массы."
                )
            if ph == "cut" and target_bf >= current_bf_f:
                achievable = False
                notes.append("Целевой % жира должен быть ниже текущего при сушке.")
            if ph == "bulk" and target_bf > current_bf_f + 0.5:
                notes.append(
                    "Целевой % жира выше текущего — часть набора может прийтись на жировую ткань."
                )
            result.update(
                {
                    "target_fat_kg": target_fat_kg,
                    "target_lean_mass_kg": _round1(target_lean),
                    "min_weight_lean_preserved_kg": _round1(current_lean + target_fat_kg),
                    "fat_goal_achievable": achievable,
                    "body_fat_note": " ".join(notes) if notes else None,
                }
            )
    else:
        result["target_body_fat_percent"] = None

    if persist_plan:
        plan_fields: dict[str, Any] = {
            "target_weight_kg": result["target_weight_kg"],
        }
        if target_body_fat_percent is not None:
            plan_fields["target_fat_percent"] = float(target_body_fat_percent)
        if ph == "bulk" and target_bulk_grams_per_week is not None:
            plan_fields["gain_rate_kg_per_week"] = _round1(float(target_bulk_grams_per_week) / 1000.0)
        save_nutrition_plan(ph, **plan_fields)

    return result
