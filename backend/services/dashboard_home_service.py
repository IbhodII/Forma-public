# -*- coding: utf-8 -*-
"""Aggregated home dashboard: lightweight summary + lazy extensions."""
from __future__ import annotations

import time
from datetime import date, timedelta
from typing import Any

from backend.database.client_context import is_admin_browser_client
from backend.services import food_service, strength_service
from backend.services.body_service import get_metrics_summary, get_weight_week_series
from backend.services.cloud_storage_service import yandex_status_sync
from backend.services.dashboard_cache import get_dashboard_summary_cached
from backend.services.forma_sync.engine import get_forma_sync_status
from backend.services.health_connect_debug_service import _fetch_recent_sync_logs
from backend.services.health_connect_hub_service import (
    _overview_from_sync,
    build_health_connect_hub,
)
from backend.services.polar_oauth_service import get_connection_status
from backend.services.sleep_service import get_sleep_summary
from backend.services.steps_service import get_steps_history


def _today() -> str:
    return date.today().isoformat()


def _week_from() -> str:
    return (date.today() - timedelta(days=6)).isoformat()


def _steps_today_from_week(
    steps_week: dict[str, Any],
    today: str,
) -> dict[str, Any]:
    today_item = next(
        (i for i in (steps_week.get("items") or []) if str(i.get("date"))[:10] == today),
        None,
    )
    if today_item:
        return {
            "items": [today_item],
            "summary": steps_week.get("summary"),
        }
    return {"items": [], "summary": steps_week.get("summary")}


def build_hc_status_snapshot(
    *,
    steps_today: int | None = None,
    steps_today_source: str | None = None,
) -> dict[str, Any]:
    """Lightweight HC status (без повторного get_steps_history)."""
    recent, _log_ok = _fetch_recent_sync_logs(1)
    last = recent[0] if recent else None
    audit = (last or {}).get("audit") or {}
    overview = _overview_from_sync(last, audit)

    warnings = list(overview.get("warnings") or [])
    sync_status = overview.get("sync_status") or "no_data"
    last_sync = overview.get("last_sync_at")
    stale = sync_status in ("no_data", "partial") or not last_sync

    return {
        "last_sync_at": last_sync,
        "sync_status": sync_status,
        "warnings": warnings,
        "steps_today": steps_today,
        "steps_today_source": steps_today_source,
        "stale": stale,
    }


def _ctl_block(days: int = 90) -> dict[str, Any]:
    from backend.services import analytics_query

    return analytics_query.get_ctl_atl_tsb_payload(days, refresh_trimp=False)


def _build_dashboard_home_summary_sync(
    *,
    phase: str = "cut",
    sleep_days: int = 7,
) -> dict[str, Any]:
    today = _today()
    week_from = _week_from()

    strength_items, strength_total = strength_service.get_sessions(1, 0)
    steps_week = get_steps_history(week_from, today)
    today_item = next(
        (i for i in (steps_week.get("items") or []) if str(i.get("date"))[:10] == today),
        None,
    )
    steps_today_val = int(today_item["steps"]) if today_item else None
    steps_today_src = today_item.get("source") if today_item else None

    return {
        "date": today,
        "phase": phase,
        "food": food_service.get_day_log_lite(today, phase),
        "body": get_metrics_summary(),
        "steps_today": _steps_today_from_week(steps_week, today),
        "steps_week": steps_week,
        "weight_week": get_weight_week_series(7),
        "sleep": get_sleep_summary(sleep_days),
        "latest_strength": {
            "items": strength_items,
            "meta": {"total": strength_total, "limit": 1, "offset": 0},
        },
        "sync": {
            "polar": get_connection_status(),
            "cloud": yandex_status_sync(),
            "forma_sync": None,
            "health_connect": build_hc_status_snapshot(
                steps_today=steps_today_val,
                steps_today_source=steps_today_src,
            ),
        },
        "health_connect_hub": None,
    }


async def _attach_forma_sync_lite(payload: dict[str, Any]) -> None:
    forma_status = await get_forma_sync_status(fetch_remote=False)
    forma_dict = {k: v for k, v in forma_status.__dict__.items() if k != "debug_plan"}
    forma_dict["debug_plan"] = None
    payload["sync"]["forma_sync"] = forma_dict


def build_dashboard_home_extensions(parts: list[str], *, ctl_days: int = 90) -> dict[str, Any]:
    """Тяжёлые блоки для lazy-load после summary."""
    wanted = {p.strip().lower() for p in parts if p.strip()}
    out: dict[str, Any] = {}
    if "ctl" in wanted or "training_load" in wanted:
        out["ctl"] = _ctl_block(ctl_days)
    return out


async def build_dashboard_home_summary(
    *,
    phase: str = "cut",
    sleep_days: int = 7,
) -> dict[str, Any]:
    """Быстрая сводка для cold start (кэш ~45 с)."""
    t0 = time.perf_counter()

    def _build() -> dict[str, Any]:
        payload = _build_dashboard_home_summary_sync(phase=phase, sleep_days=sleep_days)
        return payload

    payload = get_dashboard_summary_cached(phase, _build)
    payload["ctl"] = {"items": [], "current": {}}
    await _attach_forma_sync_lite(payload)
    payload["_profile"] = {
        "variant": "summary",
        "build_ms": round((time.perf_counter() - t0) * 1000, 1),
    }
    return payload


async def build_dashboard_home(
    *,
    phase: str = "cut",
    ctl_days: int = 90,
    sleep_days: int = 7,
    include_hc_hub: bool | None = None,
    include_ctl: bool = True,
) -> dict[str, Any]:
    """Полный payload (summary + extensions); для обратной совместимости и warmup."""
    summary = await build_dashboard_home_summary(phase=phase, sleep_days=sleep_days)
    if include_ctl:
        ext = build_dashboard_home_extensions(["ctl"], ctl_days=ctl_days)
        summary["ctl"] = ext.get("ctl") or _ctl_block(ctl_days)
    else:
        summary["ctl"] = {"items": [], "current": {}}

    show_hub = (
        include_hc_hub if include_hc_hub is not None else is_admin_browser_client()
    )
    if show_hub:
        summary["health_connect_hub"] = build_health_connect_hub()
        forma_status = await get_forma_sync_status(
            include_debug=is_admin_browser_client() and show_hub,
            fetch_remote=True,
        )
        forma_dict = {k: v for k, v in forma_status.__dict__.items() if k != "debug_plan"}
        if is_admin_browser_client() and show_hub:
            forma_dict["debug_plan"] = forma_status.debug_plan
        else:
            forma_dict["debug_plan"] = None
        summary["sync"]["forma_sync"] = forma_dict
    return summary
