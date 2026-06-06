# -*- coding: utf-8 -*-
"""Read-only описание правил маршрутизации данных Health Connect."""
from __future__ import annotations

from typing import Any

PROTECTED_CARDIO_LABEL = "FIT / Polar / manual / excel"


def _effective_from_prefs(prefs: dict[str, list[str]] | None, metric: str, fallback: str) -> str:
    if not prefs:
        return fallback
    order = prefs.get(metric) or []
    return order[0] if order else fallback


def build_routing_rules(
    *,
    steps_effective: str | None = None,
    sleep_effective: str | None = None,
    bracelet_effective: str | None = None,
    weight_effective: str | None = None,
    use_chest_strap_priority: bool = True,
    priority_prefs: dict[str, list[str]] | None = None,
) -> list[dict[str, Any]]:
    """Статические правила + effective source из БД (read-only)."""
    hr_effective = _effective_from_prefs(priority_prefs, "hr", "polar")
    cal_effective = _effective_from_prefs(priority_prefs, "workout_calories", "polar")
    gps_effective = _effective_from_prefs(priority_prefs, "gps", "fit_import")
    weight_pref = _effective_from_prefs(priority_prefs, "weight", "manual")
    steps_pref = _effective_from_prefs(priority_prefs, "steps", "health_connect")
    chest_note = (
        "calories_chest приоритетнее calories_watch"
        if use_chest_strap_priority
        else "calories_watch без приоритета нагрудника"
    )
    return [
        {
            "metric": "steps",
            "metric_label": "Шаги",
            "effective": steps_effective or steps_pref,
            "policy": "MAX(steps) за день; source обновляется при большем значении",
            "fallback": None,
        },
        {
            "metric": "sleep",
            "metric_label": "Сон",
            "effective": sleep_effective or "health_connect",
            "policy": "INSERT если новый external_id; дубликаты пропускаются",
            "fallback": None,
        },
        {
            "metric": "bracelet_calories",
            "metric_label": "Калории браслета (общие)",
            "effective": bracelet_effective or "health_connect",
            "policy": "total_calories побеждает active_calories; перезапись при sync",
            "fallback": None,
        },
        {
            "metric": "workout_calories",
            "metric_label": "Калории тренировок",
            "effective": cal_effective,
            "policy": f"HC блокируется если уже есть {PROTECTED_CARDIO_LABEL}",
            "fallback": "health_connect для standalone HC тренировок",
        },
        {
            "metric": "hr_workout",
            "metric_label": "Пульс тренировки",
            "effective": hr_effective,
            "policy": "insert_hr_samples_if_empty — не перезаписывает существующие",
            "fallback": "health_connect samples если слот пуст",
        },
        {
            "metric": "gps",
            "metric_label": "GPS трека",
            "effective": gps_effective,
            "policy": "Приоритет из user source_priority_prefs",
            "fallback": "polar / gpx / tcx",
        },
        {
            "metric": "weight",
            "metric_label": "Вес",
            "effective": weight_effective or weight_pref,
            "policy": "Последняя запись побеждает (ON CONFLICT UPDATE)",
            "fallback": "health_connect если manual не задан",
        },
        {
            "metric": "day_hr",
            "metric_label": "Пульс за день (passive HR)",
            "effective": "health_connect",
            "policy": (
                "Continuous HR в passive_heart_rate_samples; в аналитике — только при "
                "включённом toggle heart_rate и свежих данных"
            ),
            "fallback": None,
        },
        {
            "metric": "strength_hc",
            "metric_label": "Силовые HC",
            "effective": "none",
            "policy": "exercise_type=70 пропускается (SKIP unsupported_type)",
            "fallback": None,
        },
    ]


def build_calories_routing_notes(*, use_chest_strap_priority: bool = True) -> list[str]:
    notes = [
        "Общие калории: daily_bracelet_calories из HC (total_calories > active_calories).",
        f"Кардио: Polar/FIT/manual/excel имеют приоритет над HC на ту же дату и тип.",
        "HC тренировка сохраняется только если нет protected source и нет другой HC записи.",
    ]
    if use_chest_strap_priority:
        notes.append(
            "В силовых/кардио формах: calories_chest (Polar/нагрудник) приоритетнее calories_watch."
        )
    else:
        notes.append("Приоритет нагрудника отключён в профиле — используется calories_watch.")
    return notes
