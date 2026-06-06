# -*- coding: utf-8 -*-
"""Health Connect analytics gating: prefs, freshness, effective source."""
from __future__ import annotations

import json
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.request_cache import get_cached, invalidate

HC_METRICS = frozenset({
    "steps",
    "sleep",
    "heart_rate",
    "active_calories",
    "workout_calories",
    "total_calories",
    "weight",
})

HC_MASTER_PREF_KEY = "use_in_analytics"

DEFAULT_HC_ANALYTICS_PREFS: dict[str, bool] = {
    HC_MASTER_PREF_KEY: False,
    "steps": False,
    "sleep": False,
    "heart_rate": False,
    "active_calories": False,
    "workout_calories": False,
    "total_calories": False,
    "weight": False,
}

STALE_USER_MESSAGE = (
    "Обновите данные в приложении-источнике и выполните синхронизацию."
)

HC_SOURCE = "health_connect"


def _table_exists(conn, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def _parse_prefs(raw: Any) -> dict[str, bool]:
    base = dict(DEFAULT_HC_ANALYTICS_PREFS)
    if raw is None:
        return base
    data: dict[str, Any] | None = None
    if isinstance(raw, dict):
        data = raw
    elif isinstance(raw, str) and raw.strip():
        try:
            data = json.loads(raw)
        except (json.JSONDecodeError, TypeError):
            data = None
    if not isinstance(data, dict):
        return base
    if HC_MASTER_PREF_KEY in data:
        base[HC_MASTER_PREF_KEY] = bool(data[HC_MASTER_PREF_KEY])
    for key in HC_METRICS:
        if key in data:
            base[key] = bool(data[key])
    return base


def _load_prefs_from_db(user_id: int) -> dict[str, bool]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT hc_analytics_prefs FROM user_profile WHERE id = ?",
            (user_id,),
        ).fetchone()
    except Exception:
        return dict(DEFAULT_HC_ANALYTICS_PREFS)
    finally:
        conn.close()
    if row is None:
        return dict(DEFAULT_HC_ANALYTICS_PREFS)
    return _parse_prefs(row["hc_analytics_prefs"] if "hc_analytics_prefs" in row.keys() else None)


def get_hc_analytics_prefs(user_id: int | None = None) -> dict[str, bool]:
    uid = user_id if user_id is not None else get_current_user_id()
    return get_cached(
        f"hc_analytics_prefs:{uid}",
        60.0,
        lambda: _load_prefs_from_db(uid),
    )


def save_hc_analytics_prefs(prefs: dict[str, Any], user_id: int | None = None) -> dict[str, bool]:
    uid = user_id if user_id is not None else get_current_user_id()
    merged = _parse_prefs(get_hc_analytics_prefs(uid))
    for key in list(merged.keys()):
        if key in prefs:
            merged[key] = bool(prefs[key])
    if prefs.get(HC_MASTER_PREF_KEY) is True:
        for metric in HC_METRICS:
            if metric not in prefs:
                merged[metric] = True
    conn = get_db()
    try:
        conn.execute(
            "UPDATE user_profile SET hc_analytics_prefs = ? WHERE id = ?",
            (json.dumps(merged, ensure_ascii=False), uid),
        )
        conn.commit()
    finally:
        conn.close()
    invalidate(f"hc_analytics_prefs:{uid}")
    return merged


def is_hc_enabled(metric: str, user_id: int | None = None) -> bool:
    key = str(metric).strip().lower()
    if key not in HC_METRICS:
        return False
    prefs = get_hc_analytics_prefs(user_id)
    if not prefs.get(HC_MASTER_PREF_KEY):
        return False
    return bool(prefs.get(key))


def _last_hc_sync_date(user_id: int) -> date | None:
    conn = get_db()
    try:
        if not _table_exists(conn, "health_connect_sync_log"):
            return None
        cols = {r[1] for r in conn.execute("PRAGMA table_info(health_connect_sync_log)")}
        if "user_id" in cols:
            row = conn.execute(
                """
                SELECT synced_at FROM health_connect_sync_log
                WHERE user_id = ?
                ORDER BY id DESC LIMIT 1
                """,
                (user_id,),
            ).fetchone()
        else:
            row = conn.execute(
                """
                SELECT synced_at FROM health_connect_sync_log
                ORDER BY id DESC LIMIT 1
                """
            ).fetchone()
    finally:
        conn.close()
    if not row or not row["synced_at"]:
        return None
    try:
        return date.fromisoformat(str(row["synced_at"])[:10])
    except ValueError:
        return None


def _sync_stale(user_id: int) -> bool:
    last = _last_hc_sync_date(user_id)
    if last is None:
        return True
    return last < date.today() - timedelta(days=1)


def check_freshness(metric: str, user_id: int | None = None) -> dict[str, Any]:
    """Return enabled/fresh/stale_warning for one HC analytics metric."""
    uid = user_id if user_id is not None else get_current_user_id()
    key = str(metric).strip().lower()
    enabled = is_hc_enabled(key, uid)
    if not enabled:
        return {
            "metric": key,
            "enabled": False,
            "fresh": False,
            "stale_warning": None,
            "source": None,
        }

    stale_warning: str | None = None
    fresh = True

    if _sync_stale(uid):
        stale_warning = STALE_USER_MESSAGE
        fresh = False
    else:
        conn = get_db()
        try:
            if key == "steps" and _table_exists(conn, "steps_history"):
                today = date.today().isoformat()
                sh_cols = {r[1] for r in conn.execute("PRAGMA table_info(steps_history)")}
                if "user_id" in sh_cols:
                    row = conn.execute(
                        "SELECT steps, source FROM steps_history WHERE user_id = ? AND date = ?",
                        (uid, today),
                    ).fetchone()
                else:
                    row = conn.execute(
                        "SELECT steps, source FROM steps_history WHERE date = ?",
                        (today,),
                    ).fetchone()
                if row and str(row["source"] or "") == HC_SOURCE and int(row["steps"] or 0) == 0:
                    stale_warning = "Шаги за сегодня = 0"
                    fresh = False
            elif key == "sleep" and _table_exists(conn, "sleep_data"):
                row = conn.execute(
                    """
                    SELECT date FROM sleep_data
                    WHERE user_id = ? ORDER BY date DESC, end_time DESC LIMIT 1
                    """,
                    (uid,),
                ).fetchone()
                if row:
                    try:
                        days_ago = (date.today() - date.fromisoformat(str(row["date"])[:10])).days
                        if days_ago >= 2:
                            stale_warning = f"Сон не обновлялся {days_ago} дн."
                            fresh = False
                    except ValueError:
                        pass
                else:
                    fresh = False
            elif key == "heart_rate" and _table_exists(conn, "passive_heart_rate_samples"):
                row = conn.execute(
                    """
                    SELECT MAX(recorded_at) AS last_at FROM passive_heart_rate_samples
                    WHERE user_id = ?
                    """,
                    (uid,),
                ).fetchone()
                last_at = row["last_at"] if row else None
                if not last_at:
                    fresh = False
                else:
                    try:
                        dt = datetime.fromisoformat(str(last_at).replace("Z", "+00:00"))
                        if dt.tzinfo is None:
                            dt = dt.replace(tzinfo=timezone.utc)
                        age_h = (datetime.now(timezone.utc) - dt.astimezone(timezone.utc)).total_seconds() / 3600
                        if age_h > 48:
                            stale_warning = "Пульс HC не обновлялся более 48 ч"
                            fresh = False
                    except ValueError:
                        fresh = False
            elif key in ("total_calories", "active_calories") and _table_exists(
                conn, "daily_bracelet_calories"
            ):
                bc_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_bracelet_calories)")}
                if "user_id" in bc_cols:
                    row = conn.execute(
                        """
                        SELECT date FROM daily_bracelet_calories
                        WHERE user_id = ? AND source = ? ORDER BY date DESC LIMIT 1
                        """,
                        (uid, HC_SOURCE),
                    ).fetchone()
                else:
                    row = conn.execute(
                        """
                        SELECT date FROM daily_bracelet_calories
                        WHERE source = ? ORDER BY date DESC LIMIT 1
                        """,
                        (HC_SOURCE,),
                    ).fetchone()
                if not row:
                    fresh = False
        finally:
            conn.close()

    if stale_warning is None and not fresh and key not in ("steps", "sleep", "heart_rate"):
        stale_warning = STALE_USER_MESSAGE

    return {
        "metric": key,
        "enabled": True,
        "fresh": fresh,
        "stale_warning": stale_warning,
        "source": HC_SOURCE if fresh else (HC_SOURCE if enabled else None),
    }


def resolve_effective_source(metric: str, user_id: int | None = None) -> dict[str, Any]:
    status = check_freshness(metric, user_id)
    return {
        "source": status["source"],
        "enabled": status["enabled"],
        "fresh": status["fresh"],
        "stale_warning": status["stale_warning"],
    }


def bracelet_calories_enabled(user_id: int | None = None) -> bool:
    prefs = get_hc_analytics_prefs(user_id)
    return bool(prefs.get("total_calories") or prefs.get("active_calories"))


def bracelet_gate_meta(user_id: int | None = None) -> dict[str, Any]:
    uid = user_id if user_id is not None else get_current_user_id()
    enabled = bracelet_calories_enabled(uid)
    total_on = is_hc_enabled("total_calories", uid)
    active_on = is_hc_enabled("active_calories", uid)
    fresh_status = check_freshness("total_calories" if total_on else "active_calories", uid)
    return {
        "hc_analytics_enabled": enabled,
        "hc_total_calories_enabled": total_on,
        "hc_active_calories_enabled": active_on,
        "hc_stale": enabled and not fresh_status["fresh"],
        "hc_stale_warning": fresh_status["stale_warning"] if enabled else None,
    }


def should_use_hc_bracelet(source: str | None, user_id: int | None = None) -> bool:
    if str(source or "").lower() != HC_SOURCE:
        return True
    meta = bracelet_gate_meta(user_id)
    return bool(meta["hc_analytics_enabled"] and not meta["hc_stale"])


def apply_sleep_analytics_gate(summary: dict[str, Any], user_id: int | None = None) -> dict[str, Any]:
    uid = user_id if user_id is not None else get_current_user_id()
    enabled = is_hc_enabled("sleep", uid)
    out = dict(summary)
    out["hc_analytics_enabled"] = enabled
    if not enabled:
        out["has_data"] = False
        out["hc_stale"] = False
        out["hc_stale_warning"] = None
        out["sleep_debt_hours"] = None
        return out

    status = check_freshness("sleep", uid)
    out["hc_stale"] = not status["fresh"]
    out["hc_stale_warning"] = status["stale_warning"]

    if out.get("has_data") and out.get("source") == HC_SOURCE:
        avg = out.get("avg_hours")
        nights = int(out.get("nights_count") or 0)
        target = 7.5
        if avg is not None and nights > 0:
            debt = max(0.0, (target - float(avg)) * nights)
            out["sleep_debt_hours"] = round(min(debt, 24.0), 1)
        else:
            out["sleep_debt_hours"] = None

    if not status["fresh"] and out.get("source") == HC_SOURCE:
        out["has_data"] = False

    return out


def filter_steps_items(items: list[dict[str, Any]], user_id: int | None = None) -> list[dict[str, Any]]:
    if is_hc_enabled("steps", user_id):
        return items
    return [i for i in items if str(i.get("source") or "").lower() != HC_SOURCE]


def filter_weight_items(items: list[dict[str, Any]], user_id: int | None = None) -> list[dict[str, Any]]:
    if is_hc_enabled("weight", user_id):
        return items
    return [i for i in items if str(i.get("source") or "").lower() != HC_SOURCE]


def passive_hr_allowed(user_id: int | None = None) -> dict[str, Any]:
    status = check_freshness("heart_rate", user_id)
    return {
        "allowed": status["enabled"] and status["fresh"],
        "enabled": status["enabled"],
        "fresh": status["fresh"],
        "stale_warning": status["stale_warning"],
    }


def compute_analytics_connected(
    steps_hub: dict[str, Any],
    sleep_hub: dict[str, Any],
    heart_rate_hub: dict[str, Any],
    user_id: int | None = None,
) -> bool:
    uid = user_id if user_id is not None else get_current_user_id()
    prefs = get_hc_analytics_prefs(uid)
    if not any(prefs.values()):
        return False
    if prefs.get("steps") and steps_hub.get("has_data") and not steps_hub.get("stale"):
        return True
    if prefs.get("sleep") and sleep_hub.get("has_data") and sleep_hub.get("freshness") == "fresh":
        return True
    if prefs.get("heart_rate") and heart_rate_hub.get("sample_count", 0) > 0:
        status = check_freshness("heart_rate", uid)
        if status["fresh"]:
            return True
    if bracelet_calories_enabled(uid):
        meta = bracelet_gate_meta(uid)
        if meta["hc_analytics_enabled"] and not meta["hc_stale"]:
            return True
    return False


def analytics_usage_for_field(hc_field: str, user_id: int | None = None) -> dict[str, Any]:
    mapping = {
        "steps": "steps",
        "sleep": "sleep",
        "heart_rate_samples": "heart_rate",
        "heart_rate": "heart_rate",
        "total_calories": "total_calories",
        "active_calories": "active_calories",
        "workouts": "workout_calories",
        "weight_kg": "weight",
    }
    metric = mapping.get(hc_field)
    if not metric:
        return {"used": False, "note": "not mapped to HC analytics toggle"}
    enabled = is_hc_enabled(metric, user_id)
    status = check_freshness(metric, user_id) if enabled else None
    return {
        "used": enabled and bool(status and status["fresh"]),
        "enabled": enabled,
        "fresh": bool(status and status["fresh"]) if status else False,
        "note": status["stale_warning"] if status and status["stale_warning"] else None,
    }
