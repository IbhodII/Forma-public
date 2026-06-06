# -*- coding: utf-8 -*-
"""Central analytics read layer: empty guards before TRIMP refresh / CTL EWMA."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import cardio_service


def _ctl_window(days: int) -> tuple[date, date, str, str]:
    days = max(7, min(int(days), 365))
    end = date.today()
    start = end - timedelta(days=days - 1)
    return start, end, start.isoformat(), end.isoformat()


def has_cardio_workouts_in_range(
    user_id: int,
    date_from: str,
    date_to: str,
) -> bool:
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT 1 FROM cardio_workouts
            WHERE user_id = ? AND date BETWEEN ? AND ?
            LIMIT 1
            """,
            (user_id, str(date_from)[:10], str(date_to)[:10]),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def has_cardio_trimp_data(
    user_id: int,
    date_from: str,
    date_to: str,
) -> bool:
    """True if range has TRIMP > 0 or cardio workouts with HR samples."""
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT 1
            FROM cardio_workouts c
            WHERE c.user_id = ? AND c.date BETWEEN ? AND ?
              AND (
                (c.trimp IS NOT NULL AND c.trimp > 0)
                OR EXISTS (
                  SELECT 1 FROM workout_heart_rate h
                  WHERE h.cardio_workout_id = c.id
                  LIMIT 1
                )
              )
            LIMIT 1
            """,
            (user_id, d_from, d_to),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def get_daily_trimp_series(
    date_from: str,
    date_to: str,
    *,
    refresh: bool = True,
) -> list[dict[str, Any]]:
    """Daily TRIMP aggregates; optional refresh of missing TRIMP before read."""
    return cardio_service.get_daily_trimp(date_from, date_to, refresh=refresh)


def _recovery_mult_by_day(
    start: date,
    end: date,
    d_from: str,
    d_to: str,
) -> dict[str, float]:
    recovery_mult_by_day: dict[str, float] = {}
    try:
        from backend.services.cycle_access import is_female_profile
        from backend.services import menstrual_cycle_service

        if is_female_profile():
            settings = menstrual_cycle_service.get_settings()
            if settings.get("cycle_enabled", True):
                manual_logs = menstrual_cycle_service.get_log(d_from, d_to)
                manual = {e["date"]: e.get("phase") for e in manual_logs}
                from backend.services.menstrual_cycle_phases import resolve_phase_for_date

                cur_m = start
                while cur_m <= end:
                    ds = cur_m.isoformat()
                    info = resolve_phase_for_date(cur_m, settings, manual_phase=manual.get(ds))
                    recovery_mult_by_day[ds] = (
                        float(info["recovery_multiplier"]) if info else 1.0
                    )
                    cur_m += timedelta(days=1)
    except Exception:
        recovery_mult_by_day = {}
    return recovery_mult_by_day


def _compute_ctl_atl_tsb_rows(
    trimp_by_day: dict[str, float],
    start: date,
    end: date,
    recovery_mult_by_day: dict[str, float],
) -> list[dict[str, Any]]:
    ctl: float | None = None
    atl: float | None = None
    out: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        d = cur.isoformat()
        t = float(trimp_by_day.get(d, 0.0))
        load = t * recovery_mult_by_day.get(d, 1.0)
        if ctl is None:
            ctl = atl = load
        else:
            ctl = ctl * (41.0 / 42.0) + load / 42.0
            atl = atl * (6.0 / 7.0) + load / 7.0
        out.append(
            {
                "date": d,
                "trimp": round(t, 1),
                "ctl": round(ctl, 1),
                "atl": round(atl, 1),
                "tsb": round(ctl - atl, 1),
            }
        )
        cur += timedelta(days=1)
    return out


def get_ctl_atl_tsb_series(
    days: int = 90,
    *,
    refresh_trimp: bool = True,
) -> list[dict[str, Any]]:
    """
    CTL / ATL / TSB by daily TRIMP (cardio only).
    Early exit when no cardio workouts in the window.
    """
    start, end, d_from, d_to = _ctl_window(days)
    uid = get_current_user_id()
    if not has_cardio_workouts_in_range(uid, d_from, d_to):
        return []

    rows = get_daily_trimp_series(d_from, d_to, refresh=refresh_trimp)
    trimp_by_day = {r["date"]: float(r["trimp"]) for r in rows}
    recovery_mult_by_day = _recovery_mult_by_day(start, end, d_from, d_to)
    return _compute_ctl_atl_tsb_rows(trimp_by_day, start, end, recovery_mult_by_day)


def build_ctl_current(
    items: list[dict[str, Any]],
    last_workout: dict[str, Any] | None = None,
) -> dict[str, float | str | None]:
    """Shared CTL snapshot for API and dashboard home."""
    if not items:
        return {}
    last = items[-1]
    current: dict[str, float | str | None] = {
        "ctl": last["ctl"],
        "atl": last["atl"],
        "tsb": last["tsb"],
        "trimp": last_workout["trimp"] if last_workout else None,
        "last_workout_date": last_workout["date"] if last_workout else None,
    }
    return current


def get_ctl_atl_tsb_payload(
    days: int = 90,
    *,
    refresh_trimp: bool = True,
) -> dict[str, Any]:
    """items + current for CTL endpoints and dashboard."""
    items = get_ctl_atl_tsb_series(days, refresh_trimp=refresh_trimp)
    last_workout = (
        cardio_service.get_last_workout_trimp(refresh=refresh_trimp) if items else None
    )
    return {
        "items": items,
        "current": build_ctl_current(items, last_workout),
    }
