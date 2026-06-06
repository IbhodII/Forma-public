# -*- coding: utf-8 -*-
"""Единая логика недельного календаря (настраиваемый первый день недели)."""
from __future__ import annotations

from datetime import date, timedelta

# Python weekday: понедельник=0 … воскресенье=6
WEEKDAY_MON = 0
WEEKDAY_TUE = 1
WEEKDAY_WED = 2
WEEKDAY_THU = 3
WEEKDAY_FRI = 4
WEEKDAY_SAT = 5
WEEKDAY_SUN = 6

DEFAULT_WEEK_START_DAY = WEEKDAY_SAT

WEEKDAY_LABELS_RU: dict[int, str] = {
    WEEKDAY_MON: "Понедельник",
    WEEKDAY_TUE: "Вторник",
    WEEKDAY_WED: "Среда",
    WEEKDAY_THU: "Четверг",
    WEEKDAY_FRI: "Пятница",
    WEEKDAY_SAT: "Суббота",
    WEEKDAY_SUN: "Воскресенье",
}


def normalize_week_start_day(value: int | None) -> int:
    if value is None:
        return DEFAULT_WEEK_START_DAY
    v = int(value)
    if v < 0 or v > 6:
        return DEFAULT_WEEK_START_DAY
    return v


def week_start_for_date(d: date, start_day: int = DEFAULT_WEEK_START_DAY) -> date:
    """Начало недели, содержащей дату d."""
    sd = normalize_week_start_day(start_day)
    delta = (d.weekday() - sd + 7) % 7
    return d - timedelta(days=delta)


def week_start_iso(iso_date: str, start_day: int = DEFAULT_WEEK_START_DAY) -> str:
    d = date.fromisoformat(str(iso_date)[:10])
    return week_start_for_date(d, start_day).isoformat()


def week_dates_from_anchor(anchor_date: str, start_day: int = DEFAULT_WEEK_START_DAY) -> list[str]:
    start = week_start_for_date(
        date.fromisoformat(str(anchor_date)[:10]),
        start_day,
    )
    return [(start + timedelta(days=i)).isoformat() for i in range(7)]


def is_weekday_in_week(day_iso: str, weekday: int, start_day: int = DEFAULT_WEEK_START_DAY) -> bool:
    """True если day_iso — заданный день недели в неделе с start_day."""
    d = date.fromisoformat(str(day_iso)[:10])
    ws = week_start_for_date(d, start_day)
    return (d - ws).days == weekday


def is_sunday_in_sat_week(day_iso: str) -> bool:
    """Воскресенье в неделе с субботы (legacy food rules)."""
    return is_weekday_in_week(day_iso, WEEKDAY_SUN, WEEKDAY_SAT)


def week_number(iso_date: str, start_day: int = DEFAULT_WEEK_START_DAY) -> int:
    d = date.fromisoformat(str(iso_date)[:10])
    return int(d.isocalendar()[1])


def previous_week_range(
    on_date: date | None = None,
    start_day: int = DEFAULT_WEEK_START_DAY,
) -> tuple[date, date]:
    """Календарная неделя, непосредственно предшествующая неделе с on_date."""
    d = on_date or date.today()
    cur_start = week_start_for_date(d, start_day)
    prev_end = cur_start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=6)
    return prev_start, prev_end
