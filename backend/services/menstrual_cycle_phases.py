# -*- coding: utf-8 -*-
"""Расчёт фаз цикла и коэффициентов BMR / восстановления (TRIMP)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

VALID_PHASES = frozenset({"menstrual", "follicular", "ovulatory", "luteal"})

BMR_MULTIPLIER_BY_PHASE: dict[str, float] = {
    "luteal": 1.05,
}
RECOVERY_MULTIPLIER_BY_PHASE: dict[str, float] = {
    "follicular": 1.1,
    "luteal": 0.9,
}


def phase_label_ru(phase: str | None) -> str:
    labels = {
        "menstrual": "Менструальная",
        "follicular": "Фолликулярная",
        "ovulatory": "Овуляторная",
        "luteal": "Лютеиновая",
    }
    return labels.get(str(phase or ""), "—")


def bmr_multiplier(phase: str | None) -> float:
    if not phase:
        return 1.0
    return BMR_MULTIPLIER_BY_PHASE.get(phase, 1.0)


def recovery_multiplier(phase: str | None) -> float:
    if not phase:
        return 1.0
    return RECOVERY_MULTIPLIER_BY_PHASE.get(phase, 1.0)


def normalize_phase(raw: str | None) -> str | None:
    if raw is None or not str(raw).strip():
        return None
    val = str(raw).strip().lower()
    if val not in VALID_PHASES:
        raise ValueError("phase должен быть menstrual, follicular, ovulatory или luteal")
    return val


def day_index_in_cycle(target: date, last_start: date, cycle_len: int) -> int:
    """День цикла 0…cycle_len-1 от последней менструации."""
    delta = (target - last_start).days
    if delta < 0:
        while delta < 0:
            delta += cycle_len
    return delta % cycle_len


def predict_phase(
    target: date,
    *,
    last_menstruation: str | None,
    cycle_length: int,
    menstruation_length: int,
) -> str | None:
    if not last_menstruation:
        return None
    try:
        start = date.fromisoformat(str(last_menstruation)[:10])
    except ValueError:
        return None

    cycle_len = max(15, min(int(cycle_length or 28), 60))
    period_len = max(1, min(int(menstruation_length or 5), 14))
    idx = day_index_in_cycle(target, start, cycle_len)

    if idx < period_len:
        return "menstrual"

    ovulation_day = max(period_len + 1, cycle_len // 2)
    if abs(idx - ovulation_day) <= 1:
        return "ovulatory"
    if idx < ovulation_day - 1:
        return "follicular"
    return "luteal"


def resolve_phase_for_date(
    target: date,
    settings: dict[str, Any],
    manual_phase: str | None = None,
) -> dict[str, Any] | None:
    """
    Фаза на дату: ручная из журнала или прогноз по настройкам.
    None если цикл не отслеживается или нет last_menstruation.
    """
    if not settings.get("cycle_enabled", True):
        return None

    manual = normalize_phase(manual_phase) if manual_phase else None
    if manual:
        return {
            "phase": manual,
            "source": "manual",
            "bmr_multiplier": bmr_multiplier(manual),
            "recovery_multiplier": recovery_multiplier(manual),
        }

    predicted = predict_phase(
        target,
        last_menstruation=settings.get("last_menstruation") or settings.get("last_period_start"),
        cycle_length=int(settings.get("cycle_length") or settings.get("cycle_length_days") or 28),
        menstruation_length=int(
            settings.get("menstruation_length") or settings.get("period_length_days") or 5
        ),
    )
    if not predicted:
        return None
    return {
        "phase": predicted,
        "source": "predicted",
        "bmr_multiplier": bmr_multiplier(predicted),
        "recovery_multiplier": recovery_multiplier(predicted),
    }


def phases_for_range(
    date_from: str,
    date_to: str,
    settings: dict[str, Any],
    manual_by_date: dict[str, str | None],
) -> list[dict[str, Any]]:
    start = date.fromisoformat(str(date_from)[:10])
    end = date.fromisoformat(str(date_to)[:10])
    out: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        d = cur.isoformat()
        info = resolve_phase_for_date(
            cur,
            settings,
            manual_phase=manual_by_date.get(d),
        )
        if info:
            out.append({"date": d, **info})
        cur += timedelta(days=1)
    return out
