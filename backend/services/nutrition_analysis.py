# -*- coding: utf-8 -*-
"""Расчёт TEF, долей макросов, нутриентов на кг и разбивки расхода."""
from __future__ import annotations

from typing import Any

# Средние коэффициенты TEF в долях от калорийности макроса
TEF_RATE_PROTEIN = 0.25
TEF_RATE_CARBS = 0.075
TEF_RATE_FAT = 0.015

# Целевые г/кг по умолчанию, если нет daily_nutrition_goals
DEFAULT_G_PER_KG: dict[str, dict[str, float]] = {
    "cut": {"protein": 2.0, "fat": 0.9, "carbs": 2.5},
    "bulk": {"protein": 1.8, "fat": 1.0, "carbs": 4.0},
}

# Допустимое отклонение от цели (±10%)
PER_KG_TOLERANCE = 0.10


def _round1(n: float) -> float:
    return round(float(n), 1)


def calc_tef(protein_g: float, fat_g: float, carbs_g: float) -> dict[str, float]:
    """Термический эффект пищи по граммам БЖУ."""
    p_kcal = protein_g * 4.0
    f_kcal = fat_g * 9.0
    c_kcal = carbs_g * 4.0
    base = p_kcal + f_kcal + c_kcal
    p_tef = p_kcal * TEF_RATE_PROTEIN
    f_tef = f_kcal * TEF_RATE_FAT
    c_tef = c_kcal * TEF_RATE_CARBS
    tef = p_tef + f_tef + c_tef
    return {
        "base_calories": _round1(base),
        "tef_kcal": _round1(tef),
        "net_calories": _round1(base - tef),
        "protein_tef": _round1(p_tef),
        "fat_tef": _round1(f_tef),
        "carbs_tef": _round1(c_tef),
    }


def calc_macro_calorie_shares(
    protein_g: float, fat_g: float, carbs_g: float
) -> list[dict[str, Any]]:
    """Доли калорий из белков, жиров и углеводов."""
    items = [
        ("protein", "Белки", protein_g, protein_g * 4.0),
        ("fat", "Жиры", fat_g, fat_g * 9.0),
        ("carbs", "Углеводы", carbs_g, carbs_g * 4.0),
    ]
    total_kcal = sum(k for _, _, _, k in items)
    if total_kcal <= 0:
        return [
            {
                "key": key,
                "label": label,
                "grams": _round1(grams),
                "kcal": 0.0,
                "percent": 0.0,
            }
            for key, label, grams, _ in items
        ]
    return [
        {
            "key": key,
            "label": label,
            "grams": _round1(grams),
            "kcal": _round1(kcal),
            "percent": _round1(kcal / total_kcal * 100),
        }
        for key, label, grams, kcal in items
    ]


def _per_kg_status(current: float, target: float) -> str:
    if target <= 0:
        return "unknown"
    low = target * (1.0 - PER_KG_TOLERANCE)
    high = target * (1.0 + PER_KG_TOLERANCE)
    if current < low:
        return "low"
    if current > high:
        return "high"
    return "ok"


def calc_per_kg_macros(
    totals: dict[str, float],
    goals: dict[str, Any] | None,
    weight_kg: float | None,
    phase: str,
    defaults_g_per_kg: dict[str, float] | None = None,
) -> list[dict[str, Any]]:
    """Нутриенты на кг массы: текущее, цель, статус."""
    labels = {
        "protein": "Белки",
        "fat": "Жиры",
        "carbs": "Углеводы",
    }
    defaults = defaults_g_per_kg or DEFAULT_G_PER_KG.get(phase, DEFAULT_G_PER_KG["cut"])
    out: list[dict[str, Any]] = []
    for key, label in labels.items():
        current_g = float(totals.get(key) or 0)
        goal_g = None
        if goals:
            goal_g = goals.get(f"{key}_goal")
        target_g_per_kg: float | None = None
        if weight_kg and weight_kg > 0 and goal_g and float(goal_g) > 0:
            target_g_per_kg = _round1(float(goal_g) / weight_kg)
        elif defaults.get(key):
            target_g_per_kg = defaults[key]

        current_g_per_kg = (
            _round1(current_g / weight_kg) if weight_kg and weight_kg > 0 else None
        )
        status = "unknown"
        if current_g_per_kg is not None and target_g_per_kg is not None:
            status = _per_kg_status(current_g_per_kg, target_g_per_kg)

        out.append(
            {
                "key": key,
                "label": label,
                "current_g_per_kg": current_g_per_kg,
                "target_g_per_kg": target_g_per_kg,
                "status": status,
            }
        )
    return out


def build_body_summary(
    weight_kg: float | None,
    body_fat_percent: float | None,
    phase: str,
) -> dict[str, Any]:
    lean_mass_kg: float | None = None
    if weight_kg and body_fat_percent is not None and body_fat_percent >= 0:
        lean_mass_kg = _round1(weight_kg * (1.0 - body_fat_percent / 100.0))
    goal_labels = {"cut": "Сушка", "bulk": "Набор"}
    return {
        "weight_kg": _round1(weight_kg) if weight_kg else None,
        "body_fat_percent": _round1(body_fat_percent) if body_fat_percent is not None else None,
        "lean_mass_kg": lean_mass_kg,
        "goal_label": goal_labels.get(phase, phase),
        "phase": phase,
    }


def build_expenditure_breakdown(
    day: str,
    totals: dict[str, float],
    bmr: float | None,
    workout_kcal: float,
    activity_kcal: float = 0.0,
) -> dict[str, Any]:
    """Разбивка расхода калорий за день (BMR + активность + тренировки + TEF)."""
    tef = calc_tef(
        float(totals.get("protein") or 0),
        float(totals.get("fat") or 0),
        float(totals.get("carbs") or 0),
    )
    tef_kcal = tef["tef_kcal"]
    intake = float(totals.get("calories") or 0)
    parts = [bmr or 0, activity_kcal, workout_kcal, tef_kcal]
    total_out = _round1(sum(parts)) if bmr is not None else None
    balance = _round1(intake - total_out) if total_out is not None else None
    return {
        "date": day,
        "bmr": bmr,
        "activity_kcal": _round1(activity_kcal),
        "workout_kcal": _round1(workout_kcal),
        "tef_kcal": tef_kcal,
        "total_out_kcal": total_out,
        "intake_kcal": _round1(intake),
        "balance_kcal": balance,
    }


def build_nutrition_insights(
    totals: dict[str, float],
    goals: dict[str, Any] | None,
    weight_kg: float | None,
    phase: str,
    per_kg_totals: dict[str, float] | None = None,
    defaults_g_per_kg: dict[str, float] | None = None,
) -> dict[str, Any]:
    p = float(totals.get("protein") or 0)
    f = float(totals.get("fat") or 0)
    c = float(totals.get("carbs") or 0)
    pk = per_kg_totals or totals
    tef = calc_tef(p, f, c)
    from backend.core import nutrition_analytics

    return {
        "tef": tef,
        "tef_help": nutrition_analytics.build_tef_help(tef),
        "macro_calorie_shares": calc_macro_calorie_shares(p, f, c),
        "per_kg": calc_per_kg_macros(pk, goals, weight_kg, phase, defaults_g_per_kg),
    }


def week_number_saturday_start(week_start: str) -> int:
    """Номер недели в году (ISO), по дате субботы."""
    from datetime import date

    d = date.fromisoformat(week_start[:10])
    return int(d.isocalendar()[1])
