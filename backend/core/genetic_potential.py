# -*- coding: utf-8 -*-
"""Генетический предел сухой массы на основе FFMI = 25."""
from __future__ import annotations

from typing import Any

FFMI_GENETIC_LIMIT = 25.0

DISCLAIMER = (
    "Это приблизительная оценка на основе FFMI и не является точным физиологическим "
    "пределом. Индивидуальные особенности могут давать отклонения."
)


def max_lean_mass_ffmi(height_cm: float | None) -> float | None:
    """max_lean_mass_kg = FFMI × (рост_м)² при FFMI = 25."""
    if height_cm is None or height_cm <= 0:
        return None
    height_m = float(height_cm) / 100.0
    if height_m <= 0:
        return None
    return round(FFMI_GENETIC_LIMIT * height_m * height_m, 1)


def lean_mass_kg(
    weight_kg: float | None,
    body_fat_percent: float | None,
) -> float | None:
    if weight_kg is None or body_fat_percent is None or body_fat_percent < 0:
        return None
    try:
        w = float(weight_kg)
        fat = float(body_fat_percent)
    except (TypeError, ValueError):
        return None
    if w <= 0 or fat >= 100:
        return None
    return round(w * (1.0 - fat / 100.0), 1)


def build_genetic_potential_state(
    height_cm: float | None,
    weight_kg: float | None,
    body_fat_percent: float | None,
    *,
    measurement_date: str | None = None,
) -> dict[str, Any]:
    max_kg = max_lean_mass_ffmi(height_cm)
    current = lean_mass_kg(weight_kg, body_fat_percent)

    base: dict[str, Any] = {
        "disclaimer": DISCLAIMER,
        "ffmi_limit": FFMI_GENETIC_LIMIT,
        "measurement_date": measurement_date,
    }

    if max_kg is None:
        return {
            **base,
            "status": "no_height",
            "message": "Добавьте рост в профиле",
            "lean_mass": None,
            "max_lean_mass": None,
            "percent": None,
            "remaining_kg": None,
        }

    if current is None:
        return {
            **base,
            "status": "no_body",
            "message": "Сделайте замер тела",
            "lean_mass": None,
            "max_lean_mass": max_kg,
            "percent": None,
            "remaining_kg": None,
        }

    remaining = round(max(max_kg - current, 0), 1)
    percent = round(min(current / max_kg * 100, 100), 1) if max_kg > 0 else 0.0
    ratio = round(current / max_kg, 3) if max_kg > 0 else 0.0

    if ratio < 0.8:
        interpretation = "Потенциал раскрыт не полностью"
        level = "low"
    elif ratio < 0.9:
        interpretation = "Хороший уровень"
        level = "mid"
    elif ratio < 0.98:
        interpretation = "Очень высокий"
        level = "high"
    else:
        interpretation = "Практически достигнут предел"
        level = "max"

    return {
        **base,
        "status": "ok",
        "lean_mass": current,
        "max_lean_mass": max_kg,
        "remaining_kg": remaining,
        "percent": percent,
        "ratio": ratio,
        "interpretation": interpretation,
        "level": level,
        # обратная совместимость для /analytics/genetic-potential
        "current_lean_mass_kg": current,
        "max_lean_mass_kg": max_kg,
        "percent_of_limit": percent,
    }
