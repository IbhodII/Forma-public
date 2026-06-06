# -*- coding: utf-8 -*-
"""Desktop Health Connect hub — агрегация данных и visibility."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.health_connect_debug_service import _fetch_recent_sync_logs, _table_exists
from backend.services.health_connect_routing_rules import (
    build_calories_routing_notes,
    build_routing_rules,
)
from backend.services.hc_analytics_service import compute_analytics_connected
from backend.services.sleep_service import get_sleep_summary
from backend.services.source_resolver_service import get_user_priority_prefs
from backend.services.user_service import get_profile
from utils.constants import (
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_HEALTH_CONNECT,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_POLAR,
)

PROTECTED_SOURCES = frozenset({
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_POLAR,
    CARDIO_SOURCE_MANUAL,
    "excel",
})


def _today() -> str:
    return date.today().isoformat()


def _week_cutoff() -> str:
    return (date.today() - timedelta(days=6)).isoformat()


def _parse_synced_date(synced_at: str | None) -> date | None:
    if not synced_at:
        return None
    raw = str(synced_at)[:10]
    try:
        return date.fromisoformat(raw)
    except ValueError:
        return None


def _overview_from_sync(last: dict[str, Any] | None, audit: dict[str, Any]) -> dict[str, Any]:
    warnings: list[str] = list(audit.get("warnings") or [])
    mobile = (last or {}).get("mobile_audit") or {}
    perms = mobile.get("permissions") or {}
    perm_detail = mobile.get("permissions_detail") or mobile.get("permissions")
    if isinstance(perm_detail, dict) and "permissions" in perm_detail:
        perms = perm_detail.get("permissions") or perms

    imported = int((audit.get("saved_totals") or {}).get("fields") or 0)
    skipped = int((audit.get("skipped_totals") or {}).get("total") or 0)

    sync_status = "no_data"
    if last:
        days_count = int(last.get("days_count") or 0)
        saved_days = int(last.get("saved_days") or 0)
        if days_count == 0:
            sync_status = "no_data"
        elif saved_days < days_count or skipped > 0 or last.get("errors_count", 0) > 0:
            sync_status = "partial"
        else:
            sync_status = "ok"

    provider = (last or {}).get("device_label") or "—"
    if mobile.get("device_label"):
        provider = str(mobile["device_label"])

    return {
        "last_sync_at": (last or {}).get("synced_at"),
        "device_label": provider,
        "sync_status": sync_status,
        "imported_records": imported,
        "skipped_records": skipped,
        "days_in_batch": int((last or {}).get("days_count") or 0),
        "saved_days_in_batch": int((last or {}).get("saved_days") or 0),
        "permissions": perms if isinstance(perms, dict) else {},
        "warnings": warnings,
    }


def _fetch_steps_hub(conn, uid: int, today: str, cutoff: str) -> dict[str, Any]:
    if not _table_exists(conn, "steps_history"):
        return {
            "has_data": False,
            "today": None,
            "today_source": None,
            "week_series": [],
            "effective_source": None,
            "date_range": {"min": None, "max": None},
            "source_breakdown": [],
            "stale": False,
            "stale_reason": None,
        }

    rows = conn.execute(
        """
        SELECT date, steps, source
        FROM steps_history
        WHERE user_id = ? AND date >= ? AND date <= ?
        ORDER BY date
        """,
        (uid, cutoff, today),
    ).fetchall()

    week_series = [
        {
            "date": str(r["date"])[:10],
            "steps": int(r["steps"] or 0),
            "source": r["source"],
        }
        for r in rows
    ]

    today_row = next((r for r in rows if str(r["date"])[:10] == today), None)
    range_row = conn.execute(
        """
        SELECT MIN(date), MAX(date) FROM steps_history
        WHERE user_id = ? AND source = 'health_connect'
        """,
        (uid,),
    ).fetchone()

    stale = False
    stale_reason = None
    if today_row and int(today_row["steps"] or 0) == 0:
        stale = True
        stale_reason = "Шаги за сегодня = 0"

    return {
        "has_data": len(week_series) > 0,
        "today": int(today_row["steps"]) if today_row else None,
        "today_source": today_row["source"] if today_row else None,
        "week_series": week_series,
        "effective_source": today_row["source"] if today_row else (
            week_series[-1]["source"] if week_series else None
        ),
        "date_range": {
            "min": str(range_row[0])[:10] if range_row and range_row[0] else None,
            "max": str(range_row[1])[:10] if range_row and range_row[1] else None,
        },
        "source_breakdown": [],
        "source_breakdown_note": (
            "Разбивка по приложениям (Mi Fitness / Phone) появится после обновления mobile audit"
        ),
        "stale": stale,
        "stale_reason": stale_reason,
    }


def _fetch_sleep_hub(uid: int, conn, cutoff: str) -> dict[str, Any]:
    summary = get_sleep_summary(days=7)
    nights: list[dict[str, Any]] = []
    if _table_exists(conn, "sleep_data"):
        rows = conn.execute(
            """
            SELECT date, start_time, end_time, duration_seconds, source
            FROM sleep_data
            WHERE user_id = ? AND date >= ?
            ORDER BY date DESC, end_time DESC
            LIMIT 7
            """,
            (uid, cutoff),
        ).fetchall()
        nights = [
            {
                "date": str(r["date"])[:10],
                "start_time": r["start_time"],
                "end_time": r["end_time"],
                "duration_hours": round(int(r["duration_seconds"] or 0) / 3600.0, 2),
                "source": r["source"],
            }
            for r in rows
        ]

    freshness = "no_data"
    stale_warning = None
    if summary.get("has_data"):
        last_date = summary.get("last_night_date")
        if last_date:
            try:
                days_ago = (date.today() - date.fromisoformat(str(last_date)[:10])).days
                if days_ago >= 2:
                    freshness = "stale"
                    stale_warning = f"Сон не обновлялся {days_ago} дн."
                else:
                    freshness = "fresh"
            except ValueError:
                freshness = "unknown"

    last_night = nights[0] if nights else None
    return {
        "has_data": summary.get("has_data", False),
        "last_night": {
            "date": summary.get("last_night_date"),
            "hours": summary.get("last_night_hours"),
            "source": summary.get("source"),
            "start_time": last_night.get("start_time") if last_night else None,
            "end_time": last_night.get("end_time") if last_night else None,
        },
        "avg_hours": summary.get("avg_hours"),
        "consistency_score": summary.get("consistency_score"),
        "week_nights": nights,
        "freshness": freshness,
        "stale_warning": stale_warning,
    }


def _fetch_calories_hub(conn, uid: int, today: str, cutoff: str, use_chest: bool) -> dict[str, Any]:
    if not _table_exists(conn, "daily_bracelet_calories"):
        return {
            "has_data": False,
            "today_total": None,
            "today_source": None,
            "week_series": [],
            "routing_notes": build_calories_routing_notes(use_chest_strap_priority=use_chest),
        }

    rows = conn.execute(
        """
        SELECT date, total_calories, source
        FROM daily_bracelet_calories
        WHERE user_id = ? AND date >= ? AND date <= ?
        ORDER BY date
        """,
        (uid, cutoff, today),
    ).fetchall()

    week_series = [
        {
            "date": str(r["date"])[:10],
            "total_calories": int(r["total_calories"] or 0),
            "source": r["source"],
        }
        for r in rows
    ]
    today_row = next((r for r in rows if str(r["date"])[:10] == today), None)

    return {
        "has_data": len(week_series) > 0,
        "today_total": int(today_row["total_calories"]) if today_row else None,
        "today_active": None,
        "today_source": today_row["source"] if today_row else None,
        "week_series": week_series,
        "sections": {
            "total": {
                "label": "Общие калории",
                "source": today_row["source"] if today_row else "health_connect",
                "description": "daily_bracelet_calories (HC wearable total)",
            },
            "active": {
                "label": "Активные калории",
                "source": "health_connect",
                "description": "Используются только если total_calories не пришёл",
            },
            "workout": {
                "label": "Тренировочные калории",
                "source": "polar_fit_preferred",
                "description": "Polar/FIT заменяют watch calories; HC fallback для standalone",
            },
        },
        "routing_notes": build_calories_routing_notes(use_chest_strap_priority=use_chest),
    }


def _fetch_workouts_hub(uid: int, conn, cutoff: str) -> dict[str, Any]:
    if not _table_exists(conn, "cardio_workouts"):
        return {"has_data": False, "items": [], "linked_count": 0, "standalone_count": 0}

    hc_rows = conn.execute(
        """
        SELECT id, date, type, duration_sec, calories, data_source, avg_hr, max_hr
        FROM cardio_workouts
        WHERE user_id = ? AND data_source = ? AND date >= ?
        ORDER BY date DESC, id DESC
        LIMIT 30
        """,
        (uid, CARDIO_SOURCE_HEALTH_CONNECT, cutoff),
    ).fetchall()

    items: list[dict[str, Any]] = []
    linked = 0
    standalone = 0

    protected_rows = conn.execute(
        """
        SELECT date, type, data_source FROM cardio_workouts
        WHERE user_id = ? AND date >= ? AND data_source != ?
        """,
        (uid, cutoff, CARDIO_SOURCE_HEALTH_CONNECT),
    ).fetchall()
    protected_map: dict[tuple[str, str], str] = {}
    for prow in protected_rows:
        protected_map[(str(prow["date"])[:10], str(prow["type"]))] = str(prow["data_source"])

    for row in hc_rows:
        date_str = str(row["date"])[:10]
        ctype = row["type"]
        linked_source = protected_map.get((date_str, str(ctype)))
        is_linked = linked_source in PROTECTED_SOURCES if linked_source else False
        if is_linked:
            linked += 1
        else:
            standalone += 1

        items.append({
            "id": int(row["id"]),
            "date": date_str,
            "type": ctype,
            "duration_sec": int(row["duration_sec"] or 0),
            "calories": row["calories"],
            "source": row["data_source"],
            "avg_hr": row["avg_hr"],
            "max_hr": row["max_hr"],
            "link_status": "linked" if is_linked else "standalone",
            "linked_source": linked_source,
        })

    from backend.services.hc_analytics_service import is_hc_enabled

    show_unlinked = is_hc_enabled("workout_calories", uid) or is_hc_enabled("heart_rate", uid)
    unlinked_items = [i for i in items if i["link_status"] == "standalone"] if show_unlinked else []

    return {
        "has_data": len(items) > 0,
        "items": items,
        "linked_count": linked,
        "standalone_count": standalone,
        "unlinked_items": unlinked_items,
        "show_unlinked": show_unlinked,
    }


def _fetch_heart_rate_hub(uid: int, conn, cutoff: str, audit: dict[str, Any]) -> dict[str, Any]:
    from backend.services.passive_hr_service import get_week_summary

    passive = get_week_summary(uid, cutoff)
    sample_count = int(passive.get("sample_count") or 0)
    hr_min = passive.get("min_hr")
    hr_max = passive.get("max_hr")
    resting_estimate = passive.get("resting_hr_estimate")

    workout_sample_count = 0
    if _table_exists(conn, "cardio_workouts") and _table_exists(conn, "workout_heart_rate"):
        hc_ids = [
            int(r[0])
            for r in conn.execute(
                """
                SELECT id FROM cardio_workouts
                WHERE user_id = ? AND data_source = ? AND date >= ?
                """,
                (uid, CARDIO_SOURCE_HEALTH_CONNECT, cutoff),
            ).fetchall()
        ]
        if hc_ids:
            placeholders = ",".join("?" * len(hc_ids))
            count_row = conn.execute(
                f"""
                SELECT COUNT(*) FROM workout_heart_rate
                WHERE cardio_workout_id IN ({placeholders})
                """,
                hc_ids,
            ).fetchone()
            workout_sample_count = int(count_row[0] or 0) if count_row else 0

    saved_totals = audit.get("saved_totals") or {}
    hr_inserted = int(saved_totals.get("heart_rate_samples_inserted") or 0)
    received_hr = int((audit.get("received_totals") or {}).get("heart_rate_samples") or 0)

    incomplete = received_hr > 0 and sample_count == 0 and hr_inserted == 0

    return {
        "has_data": sample_count > 0 or workout_sample_count > 0,
        "resting_hr_estimate": resting_estimate,
        "daily_hr_min": hr_min,
        "daily_hr_max": hr_max,
        "sample_count": sample_count,
        "workout_sample_count": workout_sample_count,
        "source": CARDIO_SOURCE_HEALTH_CONNECT,
        "analytics_connected": sample_count > 0,
        "first_at": passive.get("first_at"),
        "last_at": passive.get("last_at"),
        "last_sync_hr_inserted": hr_inserted or None,
        "incomplete_warning": ("HR samples not persisted yet" if incomplete else None),
        "hr_skipped_count": 0,
    }


def build_health_connect_hub() -> dict[str, Any]:
    """Собрать payload для GET /api/sync/health-connect/hub."""
    recent, _log_ok = _fetch_recent_sync_logs(1)
    last = recent[0] if recent else None
    audit = (last or {}).get("audit") or {}

    profile = get_profile() or {}
    use_chest = bool(profile.get("use_chest_strap_priority", True))

    uid = get_current_user_id()
    today = _today()
    cutoff = _week_cutoff()

    conn = get_db()
    try:
        steps = _fetch_steps_hub(conn, uid, today, cutoff)
        sleep = _fetch_sleep_hub(uid, conn, cutoff)
        calories = _fetch_calories_hub(conn, uid, today, cutoff, use_chest)
        workouts = _fetch_workouts_hub(uid, conn, cutoff)
        heart_rate = _fetch_heart_rate_hub(uid, conn, cutoff, audit)

        weight_source = None
        if _table_exists(conn, "daily_weight"):
            wrow = conn.execute(
                "SELECT source FROM daily_weight WHERE user_id = ? AND date = ? LIMIT 1",
                (uid, today),
            ).fetchone()
            if wrow and wrow["source"]:
                weight_source = str(wrow["source"])
    finally:
        conn.close()

    overview = _overview_from_sync(last, audit)
    hub_warnings = list(overview.get("warnings") or [])

    if sleep.get("stale_warning"):
        hub_warnings.append(sleep["stale_warning"])
    if steps.get("stale_reason"):
        hub_warnings.append(steps["stale_reason"])
    if overview.get("sync_status") == "partial":
        hub_warnings.append("Частичная синхронизация — часть записей пропущена")

    sync_date = _parse_synced_date(overview.get("last_sync_at"))
    if sync_date and sync_date < date.today() - timedelta(days=1) and last:
        hub_warnings.append("Данные не синхронизировались более суток")

    overview["warnings"] = list(dict.fromkeys(hub_warnings))

    routing_rules = build_routing_rules(
        steps_effective=steps.get("effective_source"),
        sleep_effective=sleep.get("last_night", {}).get("source"),
        bracelet_effective=calories.get("today_source"),
        weight_effective=weight_source,
        use_chest_strap_priority=use_chest,
        priority_prefs=get_user_priority_prefs(),
    )

    return {
        "overview": overview,
        "steps": steps,
        "sleep": sleep,
        "calories": calories,
        "workouts": workouts,
        "heart_rate": heart_rate,
        "source_routing": {"rules": routing_rules},
        "analytics_connected": compute_analytics_connected(
            steps, sleep, heart_rate, user_id=get_current_user_id()
        ),
        "debug_available": True,
    }
