# -*- coding: utf-8 -*-
"""BMR (Миффлин — Сан Жеор)."""
from __future__ import annotations


def compute_bmr(
    weight_kg: float,
    height_cm: float,
    age_years: int,
    *,
    sex: str = "male",
) -> float:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age_years
    is_female = str(sex).strip().lower() in ("female", "f", "woman", "ж", "жен")
    return round(base + (-161 if is_female else 5), 1)
