# -*- coding: utf-8 -*-
"""Passive / continuous heart rate analytics from Health Connect."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from backend.database.db_utils import get_current_user_id
from backend.services.hc_analytics_service import passive_hr_allowed
from backend.services.passive_hr_service import (
    get_daily_stats,
    query_samples,
)
from backend.services.user_service import get_profile

router = APIRouter(prefix="/api/analytics/passive-heart-rate", tags=["analytics"])


def _zone_bounds(max_hr: int) -> list[tuple[str, float, float]]:
    return [
        ("z1", 0.0, 0.60),
        ("z2", 0.60, 0.70),
        ("z3", 0.70, 0.80),
        ("z4", 0.80, 0.90),
        ("z5", 0.90, 1.01),
    ]


@router.get("/daily")
def passive_hr_daily(
    date_from: str = Query(..., description="YYYY-MM-DD"),
    date_to: str = Query(..., description="YYYY-MM-DD"),
) -> dict[str, Any]:
    gate = passive_hr_allowed()
    if not gate["allowed"]:
        return {
            "date_from": str(date_from)[:10],
            "date_to": str(date_to)[:10],
            "days": [],
            "hc_gate": gate,
        }
    uid = get_current_user_id()
    days = get_daily_stats(uid, date_from, date_to)
    return {
        "date_from": str(date_from)[:10],
        "date_to": str(date_to)[:10],
        "days": days,
        "hc_gate": gate,
    }


@router.get("/timeline")
def passive_hr_timeline(
    date: str = Query(..., description="YYYY-MM-DD"),
    limit: int = Query(2000, ge=1, le=5000),
) -> dict[str, Any]:
    gate = passive_hr_allowed()
    day = str(date)[:10]
    if not gate["allowed"]:
        return {"date": day, "count": 0, "points": [], "hc_gate": gate}
    uid = get_current_user_id()
    from_iso = f"{day}T00:00:00.000Z"
    to_iso = f"{day}T23:59:59.999Z"
    points = query_samples(uid, from_iso, to_iso, limit=limit)
    return {"date": day, "count": len(points), "points": points, "hc_gate": gate}


@router.get("/zones")
def passive_hr_zones(
    date: str = Query(..., description="YYYY-MM-DD"),
) -> dict[str, Any]:
    gate = passive_hr_allowed()
    day = str(date)[:10]
    if not gate["allowed"]:
        return {"date": day, "zones": [], "sample_count": 0, "hc_gate": gate}
    uid = get_current_user_id()
    profile = get_profile() or {}
    max_hr = int(profile.get("effective_max_heart_rate") or profile.get("max_heart_rate") or 0)
    from_iso = f"{day}T00:00:00.000Z"
    to_iso = f"{day}T23:59:59.999Z"
    points = query_samples(uid, from_iso, to_iso, limit=5000)
    zones_out: list[dict[str, Any]] = []
    if max_hr > 0 and points:
        bounds = _zone_bounds(max_hr)
        counts = {z[0]: 0 for z in bounds}
        for p in points:
            bpm = int(p.get("bpm") or 0)
            ratio = bpm / max_hr
            for name, lo, hi in bounds:
                if lo <= ratio < hi:
                    counts[name] += 1
                    break
        total = sum(counts.values()) or 1
        zones_out = [
            {"zone": name, "minutes": round(counts[name] * 1.0, 1), "percent": round(100 * counts[name] / total, 1)}
            for name, _, _ in bounds
        ]
    return {
        "date": day,
        "zones": zones_out,
        "sample_count": len(points),
        "max_hr": max_hr if max_hr > 0 else None,
        "hc_gate": gate,
    }
