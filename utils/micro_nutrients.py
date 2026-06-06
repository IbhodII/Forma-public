# -*- coding: utf-8 -*-
"""Справочник микронутриентов (на 100 г продукта) и суточные нормы по умолчанию."""
from __future__ import annotations

from typing import Any

# key, label, unit (для UI), default_goal (суточная норма, ориентир RDA)
MICRO_NUTRIENTS: tuple[dict[str, Any], ...] = (
    {"key": "vitamin_c_mg", "label": "Витамин C", "unit": "мг", "default_goal": 90.0},
    {"key": "vitamin_d_mcg", "label": "Витамин D", "unit": "мкг", "default_goal": 15.0},
    {"key": "vitamin_b12_mcg", "label": "Витамин B12", "unit": "мкг", "default_goal": 2.4},
    {"key": "calcium_mg", "label": "Кальций", "unit": "мг", "default_goal": 1000.0},
    {"key": "iron_mg", "label": "Железо", "unit": "мг", "default_goal": 18.0},
    {"key": "magnesium_mg", "label": "Магний", "unit": "мг", "default_goal": 400.0},
    {"key": "zinc_mg", "label": "Цинк", "unit": "мг", "default_goal": 11.0},
    {"key": "potassium_mg", "label": "Калий", "unit": "мг", "default_goal": 3500.0},
    {"key": "sodium_mg", "label": "Натрий", "unit": "мг", "default_goal": 2000.0},
)

MICRO_KEYS: tuple[str, ...] = tuple(n["key"] for n in MICRO_NUTRIENTS)

DEFAULT_MICRO_GOALS: dict[str, float] = {
    n["key"]: float(n["default_goal"]) for n in MICRO_NUTRIENTS
}


def micro_columns_sql(prefix: str = "") -> str:
    """Список колонок для SELECT (с опциональным префиксом таблицы)."""
    p = f"{prefix}." if prefix else ""
    return ", ".join(f"COALESCE({p}{k}, 0) AS {k}" for k in MICRO_KEYS)
