# -*- coding: utf-8 -*-
"""Поля и производные метрики замеров тела (без привязки к Excel-импорту)."""
from __future__ import annotations

BODY_METRICS_FIELDS = (
    "weight_kg",
    "body_fat_percent",
    "muscle_mass_kg",
    "chest_inhale_cm",
    "chest_exhale_cm",
    "chest_avg_cm",
    "bicep_tense_cm",
    "bicep_relaxed_cm",
    "bicep_avg_cm",
    "calf_tense_cm",
    "calf_relaxed_cm",
    "calf_avg_cm",
    "thigh_tense_cm",
    "thigh_relaxed_cm",
    "thigh_avg_cm",
    "forearm_tense_cm",
    "forearm_relaxed_cm",
    "waist_cm",
    "hips_cm",
    "ankle_cm",
    "wrist_cm",
    "neck_cm",
)

BODY_COLUMN_ALIASES = {
    "bicep_right_cm": "bicep_relaxed_cm",
    "bicep_left_cm": "bicep_tense_cm",
    "calf_right_cm": "calf_relaxed_cm",
    "calf_left_cm": "calf_tense_cm",
    "thigh_right_cm": "thigh_relaxed_cm",
    "thigh_left_cm": "thigh_tense_cm",
    "forearm_right_cm": "forearm_relaxed_cm",
    "forearm_left_cm": "forearm_tense_cm",
}

# Обратная совместимость с migrations
_BODY_COLUMN_ALIASES = BODY_COLUMN_ALIASES


def _avg_two(a: float | None, b: float | None) -> float | None:
    vals = [v for v in (a, b) if v is not None]
    if not vals:
        return None
    return sum(vals) / len(vals)


def apply_body_derived(entry: dict[str, float | None]) -> dict[str, float | None]:
    """Считает chest_avg и средние Н/Р для конечностей."""
    inhale = entry.get("chest_inhale_cm")
    exhale = entry.get("chest_exhale_cm")
    avg_chest = _avg_two(inhale, exhale)
    if avg_chest is not None:
        entry["chest_avg_cm"] = avg_chest

    for tense_key, relaxed_key, avg_key in (
        ("bicep_tense_cm", "bicep_relaxed_cm", "bicep_avg_cm"),
        ("calf_tense_cm", "calf_relaxed_cm", "calf_avg_cm"),
        ("thigh_tense_cm", "thigh_relaxed_cm", "thigh_avg_cm"),
    ):
        avg_val = _avg_two(entry.get(tense_key), entry.get(relaxed_key))
        if avg_val is not None:
            entry[avg_key] = avg_val
    return entry
