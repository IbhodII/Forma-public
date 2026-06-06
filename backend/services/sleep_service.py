# -*- coding: utf-8 -*-
"""Сводка сна из sleep_data (Health Connect и др.)."""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.hc_analytics_service import (
    HC_SOURCE,
    apply_sleep_analytics_gate,
    is_hc_enabled,
)


def _parse_time_minutes(ts: str | None) -> float | None:
    if not ts:
        return None
    s = str(ts).strip()
    if "T" in s:
        s = s.split("T", 1)[1]
    parts = s.replace("Z", "").split(":")
    if len(parts) < 2:
        return None
    try:
        h = int(parts[0])
        m = int(parts[1])
        return h * 60 + m
    except ValueError:
        return None


def get_sleep_summary(days: int = 7) -> dict[str, Any]:
    """Ночной сон: последняя ночь, среднее за N дней, простая оценка стабильности."""
    n = max(1, min(int(days), 30))
    uid = get_current_user_id()
    cutoff = (date.today() - timedelta(days=n)).isoformat()

    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT date, start_time, end_time, duration_seconds, source
            FROM sleep_data
            WHERE user_id = ? AND date >= ?
            ORDER BY date DESC, end_time DESC
            """,
            (uid, cutoff),
        ).fetchall()
    finally:
        conn.close()

    if not is_hc_enabled("sleep"):
        rows = [r for r in rows if str(r["source"] or "").lower() != HC_SOURCE]

    if not rows:
        return apply_sleep_analytics_gate(
            {
                "has_data": False,
                "days": n,
                "last_night_hours": None,
                "last_night_date": None,
                "avg_hours": None,
                "consistency_score": None,
                "source": None,
                "nights_count": 0,
            }
        )

    durations_h: list[float] = []
    bed_minutes: list[float] = []
    wake_minutes: list[float] = []
    sources: set[str] = set()

    for row in rows:
        dur = int(row["duration_seconds"] or 0)
        if dur > 0:
            durations_h.append(dur / 3600.0)
        sm = _parse_time_minutes(row["start_time"])
        em = _parse_time_minutes(row["end_time"])
        if sm is not None:
            bed_minutes.append(sm)
        if em is not None:
            wake_minutes.append(em)
        if row["source"]:
            sources.add(str(row["source"]))

    last = rows[0]
    last_dur = int(last["duration_seconds"] or 0)
    last_hours = round(last_dur / 3600.0, 2) if last_dur > 0 else None

    avg_hours = round(sum(durations_h) / len(durations_h), 2) if durations_h else None

    consistency: float | None = None
    if len(durations_h) >= 2:
        mean = sum(durations_h) / len(durations_h)
        variance = sum((x - mean) ** 2 for x in durations_h) / len(durations_h)
        std_h = math.sqrt(variance)
        # 0 = нестабильный (>1.5ч разброс), 100 = стабильный (<0.3ч)
        consistency = round(max(0.0, min(100.0, 100.0 - (std_h / 1.5) * 100)), 0)

    src = "health_connect" if "health_connect" in sources else next(iter(sources), None)

    return apply_sleep_analytics_gate(
        {
            "has_data": True,
            "days": n,
            "last_night_hours": last_hours,
            "last_night_date": str(last["date"])[:10],
            "avg_hours": avg_hours,
            "consistency_score": consistency,
            "source": src,
            "nights_count": len(rows),
        }
    )
