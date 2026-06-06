# -*- coding: utf-8 -*-
"""Отладочная информация Health Connect: каталог полей и последняя синхронизация."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.health_connect_audit import (
    WARNING_SYNC_LOG_TABLE_MISSING,
    build_analytics_usage,
    truncate_json,
)
from backend.services.health_connect_mapping import get_exercise_type_map, get_field_catalog
from utils.constants import CARDIO_SOURCE_HEALTH_CONNECT


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def _parse_json_col(raw: Any) -> Any:
    if raw is None:
        return None
    if isinstance(raw, (dict, list)):
        return raw
    try:
        return json.loads(str(raw))
    except (json.JSONDecodeError, TypeError):
        return raw


def _log_columns_available(conn: sqlite3.Connection) -> set[str]:
    if not _table_exists(conn, "health_connect_sync_log"):
        return set()
    return {r[1] for r in conn.execute("PRAGMA table_info(health_connect_sync_log)")}


def _fetch_recent_sync_logs(limit: int = 5) -> tuple[list[dict[str, Any]], bool]:
    conn = get_db()
    try:
        if not _table_exists(conn, "health_connect_sync_log"):
            return [], False
        cols = _log_columns_available(conn)
        select_cols = [
            "id",
            "synced_at",
            "days_count",
            "saved_days",
            "errors_count",
            "payload_preview",
        ]
        if "audit_json" in cols:
            select_cols.append("audit_json")
        if "mobile_audit_json" in cols:
            select_cols.append("mobile_audit_json")
        if "device_label" in cols:
            select_cols.append("device_label")

        where_sql = ""
        params: list[Any] = [limit]
        if "user_id" in cols:
            where_sql = "WHERE user_id = ?"
            params = [get_current_user_id(), limit]

        rows = conn.execute(
            f"""
            SELECT {", ".join(select_cols)}
            FROM health_connect_sync_log
            {where_sql}
            ORDER BY id DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for row in rows:
            data = dict(row)
            preview = _parse_json_col(data.pop("payload_preview", None))
            audit = _parse_json_col(data.pop("audit_json", None)) if "audit_json" in cols else None
            mobile_audit = (
                _parse_json_col(data.pop("mobile_audit_json", None))
                if "mobile_audit_json" in cols
                else None
            )
            entry = {
                "id": data.get("id"),
                "synced_at": data.get("synced_at"),
                "days_count": data.get("days_count"),
                "saved_days": data.get("saved_days"),
                "errors_count": data.get("errors_count"),
                "payload_preview": preview,
                "device_label": data.get("device_label"),
            }
            if audit is not None:
                entry["audit"] = audit
            if mobile_audit is not None:
                entry["mobile_audit"] = mobile_audit
            out.append(entry)
        return out, True
    except sqlite3.OperationalError:
        return [], False
    finally:
        conn.close()


def _count_and_range(
    conn: sqlite3.Connection,
    sql_count: str,
    sql_range: str,
    params: tuple[Any, ...] = (),
) -> dict[str, Any]:
    try:
        count_row = conn.execute(sql_count, params).fetchone()
        count = int(count_row[0] or 0) if count_row else 0
        range_row = conn.execute(sql_range, params).fetchone()
        date_min = str(range_row[0])[:10] if range_row and range_row[0] else None
        date_max = str(range_row[1])[:10] if range_row and range_row[1] else None
        return {"count": count, "date_min": date_min, "date_max": date_max}
    except sqlite3.OperationalError:
        return {"count": 0, "date_min": None, "date_max": None}


def _fetch_db_stats() -> tuple[dict[str, Any], dict[str, Any]]:
    uid = get_current_user_id()
    conn = get_db()
    counts: dict[str, Any] = {}
    ranges: dict[str, Any] = {}
    try:
        if _table_exists(conn, "steps_history"):
            s = _count_and_range(
                conn,
                "SELECT COUNT(*) FROM steps_history WHERE user_id = ? AND source = 'health_connect'",
                "SELECT MIN(date), MAX(date) FROM steps_history WHERE user_id = ? AND source = 'health_connect'",
                (uid, uid),
            )
            counts["steps"] = s["count"]
            ranges["steps"] = {"min": s["date_min"], "max": s["date_max"]}

        if _table_exists(conn, "daily_bracelet_calories"):
            s = _count_and_range(
                conn,
                "SELECT COUNT(*) FROM daily_bracelet_calories WHERE user_id = ? AND source = 'health_connect'",
                "SELECT MIN(date), MAX(date) FROM daily_bracelet_calories WHERE user_id = ? AND source = 'health_connect'",
                (uid, uid),
            )
            counts["total_calories"] = s["count"]
            ranges["total_calories"] = {"min": s["date_min"], "max": s["date_max"]}

        if _table_exists(conn, "sleep_data"):
            s = _count_and_range(
                conn,
                "SELECT COUNT(*) FROM sleep_data WHERE user_id = ? AND source = 'health_connect'",
                "SELECT MIN(date), MAX(date) FROM sleep_data WHERE user_id = ? AND source = 'health_connect'",
                (uid,),
            )
            counts["sleep"] = s["count"]
            ranges["sleep"] = {"min": s["date_min"], "max": s["date_max"]}

        if _table_exists(conn, "daily_weight"):
            cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)")}
            if "source" in cols:
                s = _count_and_range(
                    conn,
                    "SELECT COUNT(*) FROM daily_weight WHERE source = 'health_connect'",
                    "SELECT MIN(date), MAX(date) FROM daily_weight WHERE source = 'health_connect'",
                )
            else:
                s = _count_and_range(
                    conn,
                    "SELECT COUNT(*) FROM daily_weight",
                    "SELECT MIN(date), MAX(date) FROM daily_weight",
                )
            counts["weight_kg"] = s["count"]
            ranges["weight_kg"] = {"min": s["date_min"], "max": s["date_max"]}

        if _table_exists(conn, "cardio_workouts"):
            s = _count_and_range(
                conn,
                "SELECT COUNT(*) FROM cardio_workouts WHERE user_id = ? AND data_source = ?",
                "SELECT MIN(date), MAX(date) FROM cardio_workouts WHERE user_id = ? AND data_source = ?",
                (uid, CARDIO_SOURCE_HEALTH_CONNECT),
            )
            counts["workouts"] = s["count"]
            ranges["workouts"] = {"min": s["date_min"], "max": s["date_max"]}

        if _table_exists(conn, "passive_heart_rate_samples"):
            row = conn.execute(
                """
                SELECT COUNT(*) AS cnt, MIN(recorded_at) AS first_at, MAX(recorded_at) AS last_at
                FROM passive_heart_rate_samples WHERE user_id = ?
                """,
                (uid,),
            ).fetchone()
            counts["passive_heart_rate_samples"] = int(row["cnt"] or 0) if row else 0
            if row and row["first_at"]:
                ranges["passive_heart_rate_samples"] = {
                    "min": str(row["first_at"])[:10],
                    "max": str(row["last_at"])[:10],
                    "first_at": row["first_at"],
                    "last_at": row["last_at"],
                }
    finally:
        conn.close()
    return counts, ranges


def build_health_connect_debug() -> dict[str, Any]:
    recent_rows, log_table_ok = _fetch_recent_sync_logs(5)
    last = recent_rows[0] if recent_rows else None
    counts_by_type, date_ranges = _fetch_db_stats()
    warnings: list[str] = []
    if not log_table_ok:
        warnings.append(WARNING_SYNC_LOG_TABLE_MISSING)

    last_batch: dict[str, Any] | None = None
    if last:
        last_batch = {
            "synced_at": last.get("synced_at"),
            "days_count": last.get("days_count"),
            "saved_days": last.get("saved_days"),
            "errors_count": last.get("errors_count"),
            "device_label": last.get("device_label"),
            "payload_preview": last.get("payload_preview"),
            "audit": last.get("audit"),
            "mobile_audit": last.get("mobile_audit"),
        }
        audit = last.get("audit") or {}
        for w in audit.get("warnings") or []:
            if w not in warnings:
                warnings.append(str(w))
        mobile = last.get("mobile_audit") or {}
        perms = mobile.get("permissions") or {}
        if any(v is False for v in perms.values()):
            if "permission_missing" not in warnings:
                warnings.append("permission_missing")

    return {
        "status": "ok",
        "field_catalog": get_field_catalog(),
        "exercise_type_map": get_exercise_type_map(),
        "last_sync": last,
        "recent_syncs": recent_rows,
        "last_batch": last_batch,
        "counts_by_type": counts_by_type,
        "date_ranges": date_ranges,
        "saved_by_field": {
            "layer": "backend_saved_cumulative",
            "counts": counts_by_type,
            "ranges": date_ranges,
        },
        "analytics_usage": build_analytics_usage(),
        "warnings": warnings,
        "sync_endpoint": "POST /api/sync/health-connect",
    }


def log_health_connect_batch(
    *,
    days_count: int,
    saved_days: int,
    errors_count: int,
    payload_preview: dict[str, Any] | list[Any] | None = None,
    audit_json: dict[str, Any] | None = None,
    mobile_audit_json: dict[str, Any] | None = None,
    device_label: str | None = None,
) -> int | None:
    preview_json = None
    if payload_preview is not None:
        preview_json = truncate_json(payload_preview, 4000)
    audit_text = truncate_json(audit_json) if audit_json is not None else None
    mobile_text = truncate_json(mobile_audit_json) if mobile_audit_json is not None else None

    conn = get_db()
    try:
        if not _table_exists(conn, "health_connect_sync_log"):
            return None
        cols = _log_columns_available(conn)
        uid = get_current_user_id()
        if "audit_json" in cols:
            if "user_id" in cols:
                cur = conn.execute(
                    """
                    INSERT INTO health_connect_sync_log
                    (user_id, days_count, saved_days, errors_count, payload_preview,
                     audit_json, mobile_audit_json, device_label)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        days_count,
                        saved_days,
                        errors_count,
                        preview_json,
                        audit_text,
                        mobile_text,
                        device_label,
                    ),
                )
            else:
                cur = conn.execute(
                    """
                    INSERT INTO health_connect_sync_log
                    (days_count, saved_days, errors_count, payload_preview, audit_json, mobile_audit_json, device_label)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        days_count,
                        saved_days,
                        errors_count,
                        preview_json,
                        audit_text,
                        mobile_text,
                        device_label,
                    ),
                )
        else:
            if "user_id" in cols:
                cur = conn.execute(
                    """
                    INSERT INTO health_connect_sync_log
                    (user_id, days_count, saved_days, errors_count, payload_preview)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (uid, days_count, saved_days, errors_count, preview_json),
                )
            else:
                cur = conn.execute(
                    """
                    INSERT INTO health_connect_sync_log
                    (days_count, saved_days, errors_count, payload_preview)
                    VALUES (?, ?, ?, ?)
                    """,
                    (days_count, saved_days, errors_count, preview_json),
                )
        conn.commit()
        return int(cur.lastrowid) if cur.lastrowid else None
    finally:
        conn.close()
