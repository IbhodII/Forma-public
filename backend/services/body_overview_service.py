# -*- coding: utf-8 -*-
"""Lightweight Body Overview payload (7d HC + recent weight)."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.database.daily_weight_store import load_daily_weight_recent
from backend.services.health_connect_debug_service import _fetch_recent_sync_logs
from backend.services.health_connect_hub_service import (
    _fetch_calories_hub,
    _fetch_heart_rate_hub,
    _fetch_sleep_hub,
    _fetch_steps_hub,
    _fetch_workouts_hub,
    _overview_from_sync,
)
from backend.services.user_service import get_profile
from backend.services.source_resolver_service import get_user_priority_prefs
from backend.services.health_connect_routing_rules import build_routing_rules


def _today() -> str:
    return date.today().isoformat()


def _week_cutoff() -> str:
    return (date.today() - timedelta(days=6)).isoformat()


def build_weight_overview(*, days: int = 30) -> dict[str, Any]:
    """Последние N записей веса + текущая неделя (без полной истории)."""
    from database.db_utils import get_current_week_weight_stats

    days = max(7, min(int(days), 90))
    end = date.today()
    start = end - timedelta(days=days - 1)
    df = load_daily_weight_recent(limit=days + 7, date_from=start.isoformat())
    items: list[dict[str, Any]] = []
    if not df.empty:
        from backend.services.hc_analytics_service import filter_weight_items

        for _, r in df.iterrows():
            items.append(
                {
                    "date": str(r["date"])[:10],
                    "weight_kg": float(r["weight_kg"]),
                    "body_fat_percent": (
                        float(r["body_fat_percent"])
                        if pd.notna(r.get("body_fat_percent"))
                        else None
                    ),
                    "source": str(r.get("source") or "manual"),
                }
            )
        items = filter_weight_items(items)
    cur = get_current_week_weight_stats(df) if not df.empty else {}
    return {
        "items": items,
        "weekly": [],
        "current_week": cur,
        "days": days,
    }


def build_body_overview_summary(*, weight_days: int = 30) -> dict[str, Any]:
    """7-дневный HC snapshot + вес за N дней — без полного hub и weekly aggregation."""
    uid = get_current_user_id()
    today = _today()
    cutoff = _week_cutoff()
    recent, _log_ok = _fetch_recent_sync_logs(1)
    last = recent[0] if recent else None
    audit = (last or {}).get("audit") or {}
    overview = _overview_from_sync(last, audit)

    profile = get_profile() or {}
    use_chest = bool(profile.get("use_chest_strap_priority", True))

    conn = get_db()
    try:
        steps = _fetch_steps_hub(conn, uid, today, cutoff)
        steps["date_range"] = {
            "min": cutoff if steps.get("week_series") else None,
            "max": today if steps.get("week_series") else None,
        }
        sleep = _fetch_sleep_hub(uid, conn, cutoff)
        calories = _fetch_calories_hub(conn, uid, today, cutoff, use_chest)
        workouts = _fetch_workouts_hub(uid, conn, cutoff)
        heart_rate = _fetch_heart_rate_hub(uid, conn, cutoff, audit)
    finally:
        conn.close()

    routing_rules = build_routing_rules(
        steps_effective=steps.get("effective_source"),
        sleep_effective=sleep.get("last_night", {}).get("source"),
        bracelet_effective=calories.get("today_source"),
        weight_effective=None,
        use_chest_strap_priority=use_chest,
        priority_prefs=get_user_priority_prefs(),
    )

    hub = {
        "overview": overview,
        "steps": steps,
        "sleep": sleep,
        "calories": calories,
        "workouts": workouts,
        "heart_rate": heart_rate,
        "source_routing": {"rules": routing_rules},
        "analytics_connected": {},
        "debug_available": False,
    }
    return {
        "health_connect_hub": hub,
        "weight": build_weight_overview(days=weight_days),
    }
