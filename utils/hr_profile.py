# -*- coding: utf-8 -*-
"""Максимальный пульс и зоны — для TRIMP, аналитики кардио и профиля."""
from __future__ import annotations

from datetime import date, datetime
from typing import Any

DEFAULT_MAX_HR = 190
FORMULA_MAX_HR_BASE = 220

# Пять зон по доле от max HR (классическая модель)
HR_ZONE_DEFS: tuple[tuple[str, str, float, float], ...] = (
    ("z1", "Восстановление", 0.50, 0.60),
    ("z2", "Аэробная", 0.60, 0.70),
    ("z3", "Темповая", 0.70, 0.80),
    ("z4", "Пороговая", 0.80, 0.90),
    ("z5", "Максимальная", 0.90, 1.00),
)

# Подписи зон на странице «Аналитика»
ANALYTICS_HR_ZONE_DEFS: tuple[tuple[str, str, float, float], ...] = (
    ("z1", "Восстановление", 0.50, 0.60),
    ("z2", "Лёгкая", 0.60, 0.70),
    ("z3", "Аэробная", 0.70, 0.80),
    ("z4", "Пороговая", 0.80, 0.90),
    ("z5", "Анаэробная", 0.90, 1.00),
)

COEF_TO_ZONE_ID: dict[int, str] = {1: "z1", 2: "z2", 3: "z3", 4: "z4", 5: "z5"}


def age_from_date_of_birth(date_of_birth: str | None) -> int | None:
    """Полных лет на сегодня; None если дата не задана или некорректна."""
    if not date_of_birth:
        return None
    try:
        born = date.fromisoformat(str(date_of_birth)[:10])
    except ValueError:
        return None
    today = date.today()
    if born > today:
        return None
    years = today.year - born.year
    if (today.month, today.day) < (born.month, born.day):
        years -= 1
    return years if years >= 0 else None


def resolve_max_heart_rate(
    max_heart_rate: int | None = None,
    date_of_birth: str | None = None,
) -> int:
    """
    Приоритет: max_hr из профиля → 220 − возраст → 190 по умолчанию.
  """
    if max_heart_rate is not None:
        try:
            mhr = int(max_heart_rate)
            if mhr > 0:
                return mhr
        except (TypeError, ValueError):
            pass
    age = age_from_date_of_birth(date_of_birth)
    if age is not None and age > 0:
        return max(100, FORMULA_MAX_HR_BASE - age)
    return DEFAULT_MAX_HR


def analytics_heart_rate_zones(max_hr: int) -> list[dict[str, Any]]:
    """Зоны для аналитики (подписи: Лёгкая, Анаэробная и т.д.)."""
    mhr = max(1, int(max_hr))
    zones: list[dict[str, Any]] = []
    for zone_id, name, pct_lo, pct_hi in ANALYTICS_HR_ZONE_DEFS:
        lo = int(round(mhr * pct_lo))
        hi = int(round(mhr * pct_hi))
        if zone_id == "z5":
            hi = mhr
        zones.append(
            {
                "id": zone_id,
                "name": name,
                "pct_min": int(pct_lo * 100),
                "pct_max": int(pct_hi * 100),
                "min_bpm": lo,
                "max_bpm": hi,
            }
        )
    return zones


def heart_rate_zones(max_hr: int) -> list[dict[str, Any]]:
    """Зоны пульса в уд/мин по max HR."""
    mhr = max(1, int(max_hr))
    zones: list[dict[str, Any]] = []
    for zone_id, name, pct_lo, pct_hi in HR_ZONE_DEFS:
        lo = int(round(mhr * pct_lo))
        hi = int(round(mhr * pct_hi))
        if zone_id == "z5":
            hi = mhr
        zones.append(
            {
                "id": zone_id,
                "name": name,
                "pct_min": int(pct_lo * 100),
                "pct_max": int(pct_hi * 100),
                "min_bpm": lo,
                "max_bpm": hi,
            }
        )
    return zones


def edwards_zone_coefficient(hr: int, max_hr: int) -> int:
    """Коэффициент зоны Эдвардса (50–60% → 1 … 90–100% → 5)."""
    if max_hr <= 0 or hr <= 0:
        return 0
    pct = 100.0 * float(hr) / float(max_hr)
    if pct < 50:
        return 0
    if pct < 60:
        return 1
    if pct < 70:
        return 2
    if pct < 80:
        return 3
    if pct < 90:
        return 4
    return 5


def compute_edwards_trimp(
    points: list[dict[str, Any]],
    max_hr: int,
    duration_sec: int | None = None,
) -> float | None:
    """
    TRIMP по Эдвардсу: sum(коэф_зоны × секунды) / 60.
    points: [{"seconds": int, "heart_rate": int}, ...]
    """
    if not points or max_hr <= 0:
        return None
    sorted_pts = sorted(points, key=lambda p: int(p.get("seconds") or 0))
    if not sorted_pts:
        return None
    total = 0.0
    for i, pt in enumerate(sorted_pts):
        try:
            hr = int(pt["heart_rate"])
        except (KeyError, TypeError, ValueError):
            continue
        if hr <= 0:
            continue
        t0 = int(pt.get("seconds") or 0)
        if i + 1 < len(sorted_pts):
            t1 = int(sorted_pts[i + 1].get("seconds") or t0)
        else:
            if duration_sec is not None and int(duration_sec) > t0:
                t1 = int(duration_sec)
            else:
                t1 = t0 + 1
        dt = max(0, t1 - t0)
        if dt <= 0:
            continue
        total += edwards_zone_coefficient(hr, max_hr) * dt
    if total <= 0:
        return None
    return round(total / 60.0, 1)


def accumulate_zone_seconds(
    points: list[dict[str, Any]],
    max_hr: int,
    duration_sec: int | None = None,
) -> dict[str, float]:
    """Секунды в каждой зоне z1–z5 (ниже 50% не учитывается)."""
    totals = {z: 0.0 for z in ("z1", "z2", "z3", "z4", "z5")}
    if not points or max_hr <= 0:
        return totals
    sorted_pts = sorted(points, key=lambda p: int(p.get("seconds") or 0))
    for i, pt in enumerate(sorted_pts):
        try:
            hr = int(pt["heart_rate"])
        except (KeyError, TypeError, ValueError):
            continue
        if hr <= 0:
            continue
        coef = edwards_zone_coefficient(hr, max_hr)
        if coef <= 0:
            continue
        zid = COEF_TO_ZONE_ID.get(coef)
        if not zid:
            continue
        t0 = int(pt.get("seconds") or 0)
        if i + 1 < len(sorted_pts):
            t1 = int(sorted_pts[i + 1].get("seconds") or t0)
        else:
            t1 = int(duration_sec) if duration_sec is not None and int(duration_sec) > t0 else t0 + 1
        dt = max(0, t1 - t0)
        if dt > 0:
            totals[zid] += dt
    return totals


def compute_trimp_points(
    heart_rates: list[int],
    max_hr: int,
    *,
    resting_hr: int = 60,
) -> float:
    """
    Упрощённый TRIMP (Banister): сумма по минутам
    duration × HR_reserve × 0.64 × e^(1.92 × HR_reserve).
    """
    if not heart_rates or max_hr <= resting_hr:
        return 0.0
    import math

    total = 0.0
    for hr in heart_rates:
        if hr is None or hr <= 0:
            continue
        reserve = (float(hr) - resting_hr) / float(max_hr - resting_hr)
        reserve = max(0.0, min(1.0, reserve))
        total += reserve * 0.64 * math.exp(1.92 * reserve)
    return round(total, 1)
