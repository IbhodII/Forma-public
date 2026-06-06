# -*- coding: utf-8 -*-
"""Data scope diagnostics and cloud-to-local profile recovery."""
from __future__ import annotations

import sqlite3
from typing import Any

from fastapi import HTTPException

from database.connection import WORKOUTS_DB_PATH, attach_shared, is_shared_attached
from database.meal_plans_storage import meal_plans_in_workouts, mq
from backend.database.db_utils import get_current_user_id, get_db
from backend.services.auth_user_service import (
    DEFAULT_LOCAL_USER_ID,
    _database_has_legacy_workouts,
    _ensure_auth_tables,
    get_user_by_id,
)

_COUNT_TABLES_USER_SCOPED: tuple[str, ...] = (
    "strength_workouts",
    "cardio_workouts",
    "food_entries",
    "body_metrics",
    "daily_weight",
    "stretching_log",
    "steps_history",
    "daily_bracelet_calories",
    "weekly_meal_schedule",
)

_SHARED_USER_SCOPED_TABLES: tuple[str, ...] = (
    "daily_meal_plans",
    "meal_templates",
)

_GLOBAL_COUNT_TABLES: tuple[str, ...] = ()


def _safe_count(conn: sqlite3.Connection, sql: str, params: tuple = ()) -> int:
    try:
        row = conn.execute(sql, params).fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0


def _table_has_user_id(conn: sqlite3.Connection, table: str) -> bool:
    try:
        cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        return "user_id" in cols
    except Exception:
        return False


def _shared_table_has_user_id(conn: sqlite3.Connection, table: str) -> bool:
    schema = "main" if table in ("daily_meal_plans", "meal_templates") and meal_plans_in_workouts(conn) else "shared"
    try:
        cols = {r[1] for r in conn.execute(f"PRAGMA {schema}.table_info({table})")}
        return "user_id" in cols
    except Exception:
        return False


def _count_shared_user_rows(conn: sqlite3.Connection, table: str, uid: int) -> int:
    if not _shared_table_has_user_id(conn, table):
        return 0
    return _safe_count(
        conn,
        f"SELECT COUNT(*) FROM shared.{table} WHERE user_id = ?",
        (uid,),
    )


def _rebind_meal_plan_scope(
    conn: sqlite3.Connection,
    *,
    source_id: int,
    target_id: int,
) -> dict[str, int]:
    """Перенести рационы/шаблоны и расписание с одного user_id на другой."""
    if not is_shared_attached(conn):
        attach_shared(conn)

    stats: dict[str, int] = {}

    for table in _SHARED_USER_SCOPED_TABLES:
        if not _shared_table_has_user_id(conn, table):
            continue
        qt = mq(conn, table)
        name_col = "name" if table in ("daily_meal_plans", "meal_templates") else None
        rows = conn.execute(
            f"SELECT id{', name' if name_col else ''} FROM {qt} WHERE user_id = ?",
            (source_id,),
        ).fetchall()
        moved = 0
        merged = 0
        for row in rows:
            row_id = int(row["id"])
            if name_col:
                dup = conn.execute(
                    f"""
                    SELECT id FROM {qt}
                    WHERE user_id = ? AND name = ? COLLATE NOCASE
                    """,
                    (target_id, str(row["name"])),
                ).fetchone()
                if dup is not None:
                    dup_id = int(dup["id"])
                    if table == "daily_meal_plans":
                        conn.execute(
                            """
                            UPDATE weekly_meal_schedule
                            SET meal_plan_id = ?
                            WHERE meal_plan_id = ? AND user_id = ?
                            """,
                            (dup_id, row_id, source_id),
                        )
                        conn.execute(
                            f"DELETE FROM {mq(conn, 'daily_meal_plan_templates')} WHERE plan_id = ?",
                            (row_id,),
                        )
                        conn.execute(
                            f"DELETE FROM {mq(conn, 'meal_plan_items')} WHERE plan_id = ?",
                            (row_id,),
                        )
                    conn.execute(f"DELETE FROM {qt} WHERE id = ?", (row_id,))
                    merged += 1
                    continue
            conn.execute(
                f"UPDATE {qt} SET user_id = ? WHERE id = ?",
                (target_id, row_id),
            )
            moved += 1
        if moved:
            stats[f"{qt}_moved"] = moved
        if merged:
            stats[f"{qt}_merged"] = merged

    if _table_has_user_id(conn, "weekly_meal_schedule"):
        cur = conn.execute(
            "UPDATE weekly_meal_schedule SET user_id = ? WHERE user_id = ?",
            (target_id, source_id),
        )
        if cur.rowcount:
            stats["weekly_meal_schedule"] = cur.rowcount

    return stats


def get_link_candidate() -> dict[str, Any]:
    """Suggest linking OAuth to user id=1 when local DB has legacy data."""
    conn = get_db()
    try:
        _ensure_auth_tables(conn)
        if not _database_has_legacy_workouts(conn):
            return {"suggest_link_user_id": None, "reason": "no_legacy_data"}
        row = conn.execute(
            "SELECT id, cloud_provider, cloud_user_id FROM users WHERE id = ?",
            (DEFAULT_LOCAL_USER_ID,),
        ).fetchone()
        if not row:
            return {"suggest_link_user_id": None, "reason": "no_primary_user"}
        provider = str(row["cloud_provider"] or "local").strip().lower()
        cloud_uid = str(row["cloud_user_id"] or "").strip().lower()
        if provider not in ("", "local", "admin"):
            return {"suggest_link_user_id": None, "reason": "primary_already_cloud"}
        if cloud_uid not in ("", "admin", "local"):
            return {"suggest_link_user_id": None, "reason": "primary_already_cloud"}
        return {
            "suggest_link_user_id": DEFAULT_LOCAL_USER_ID,
            "reason": "legacy_data_on_primary",
        }
    finally:
        conn.close()


def build_scope_debug() -> dict[str, Any]:
    uid = int(get_current_user_id())
    user = get_user_by_id(uid)
    conn = get_db()
    try:
        counts_current: dict[str, int] = {}
        counts_user_1: dict[str, int] = {}
        for table in _COUNT_TABLES_USER_SCOPED:
            if not _table_has_user_id(conn, table):
                continue
            counts_current[table] = _safe_count(
                conn, f"SELECT COUNT(*) FROM {table} WHERE user_id = ?", (uid,)
            )
            counts_user_1[table] = _safe_count(
                conn,
                f"SELECT COUNT(*) FROM {table} WHERE user_id = ? OR user_id IS NULL",
                (DEFAULT_LOCAL_USER_ID,),
            )
        global_counts: dict[str, int] = {}
        for table in _GLOBAL_COUNT_TABLES:
            global_counts[table] = _safe_count(conn, f"SELECT COUNT(*) FROM {table}")

        shared_counts_current: dict[str, int] = {}
        shared_counts_user_1: dict[str, int] = {}
        try:
            if not is_shared_attached(conn):
                attach_shared(conn)
            for table in _SHARED_USER_SCOPED_TABLES:
                shared_counts_current[table] = _count_shared_user_rows(conn, table, uid)
                shared_counts_user_1[table] = _count_shared_user_rows(
                    conn, table, DEFAULT_LOCAL_USER_ID
                )
        except Exception:
            pass

        mismatch = (
            uid != DEFAULT_LOCAL_USER_ID
            and counts_user_1.get("strength_workouts", 0) > counts_current.get("strength_workouts", 0)
        )

        return {
            "current_user_id": uid,
            "local_profile_id": DEFAULT_LOCAL_USER_ID,
            "cloud_provider": user.get("cloud_provider") if user else None,
            "cloud_user_id": user.get("cloud_user_id") if user else None,
            "cloud_identity": (
                f"{user.get('cloud_provider')}:{user.get('cloud_user_id')}"
                if user and user.get("cloud_provider")
                else None
            ),
            "db_path": str(WORKOUTS_DB_PATH),
            "counts_current_user": counts_current,
            "counts_user_1": counts_user_1,
            "shared_counts_current_user": shared_counts_current,
            "shared_counts_user_1": shared_counts_user_1,
            "global_tables": global_counts,
            "scope_mismatch_suspected": mismatch,
        }
    finally:
        conn.close()


def rebind_cloud_to_local_profile(*, target_user_id: int = DEFAULT_LOCAL_USER_ID) -> dict[str, Any]:
    """
    Move cloud identity and user-scoped rows from current session user onto target (default 1).
    Admin recovery after mistaken new-user OAuth login.
    """
    source_id = int(get_current_user_id())
    target_id = int(target_user_id)
    if source_id == target_id:
        raise HTTPException(status_code=400, detail="Уже используется целевой профиль")

    source = get_user_by_id(source_id)
    target = get_user_by_id(target_id)
    if source is None or target is None:
        raise HTTPException(status_code=404, detail="Пользователь не найден")

    provider = str(source.get("cloud_provider") or "").strip().lower()
    cloud_uid = str(source.get("cloud_user_id") or "").strip()
    if not provider or provider in ("local", "admin") or not cloud_uid:
        raise HTTPException(
            status_code=400,
            detail="У текущего пользователя нет облачной привязки для переноса",
        )

    from backend.services.backup_json_service import USER_SCOPED_TABLES

    conn = get_db()
    moved: dict[str, int] = {}
    try:
        _ensure_auth_tables(conn)
        for table in USER_SCOPED_TABLES:
            if table in ("cloud_tokens",):
                continue
            if not _table_has_user_id(conn, table):
                continue
            cur = conn.execute(
                f"UPDATE {table} SET user_id = ? WHERE user_id = ?",
                (target_id, source_id),
            )
            if cur.rowcount:
                moved[table] = cur.rowcount

        meal_stats = _rebind_meal_plan_scope(
            conn, source_id=source_id, target_id=target_id
        )
        moved.update(meal_stats)

        conn.execute(
            """
            UPDATE users
            SET cloud_provider = NULL, cloud_user_id = NULL, display_email = display_email
            WHERE id = ?
            """,
            (source_id,),
        )
        conn.execute(
            """
            UPDATE users
            SET cloud_provider = ?, cloud_user_id = ?,
                display_email = COALESCE(?, display_email)
            WHERE id = ?
            """,
            (provider, cloud_uid, source.get("display_email"), target_id),
        )
        conn.commit()
    except sqlite3.Error as err:
        conn.rollback()
        raise HTTPException(status_code=503, detail=f"Ошибка БД при перепривязке: {err}") from err
    finally:
        conn.close()

    return {
        "status": "ok",
        "source_user_id": source_id,
        "target_user_id": target_id,
        "rows_moved": moved,
        "session_user_id": target_id,
    }
