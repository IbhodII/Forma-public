# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta

PENDING_WHERE = """(
  sync_status IN ('pending', 'conflict')
  OR (deleted_at IS NOT NULL AND (last_synced_revision IS NULL OR sync_status != 'synced'))
)"""

SYNC_TABLES = (
    "food_entries",
    "body_metrics",
    "stretching_log",
    "cardio_workouts",
    "daily_bracelet_calories",
    "workout_presets",
)

_USER_SCOPED_TABLES = frozenset(
    {
        "food_entries",
        "body_metrics",
        "stretching_log",
        "cardio_workouts",
        "daily_bracelet_calories",
        "workout_presets",
    }
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class ExportedEntityRef:
    table: str
    key_column: str
    key_value: str | int


def mark_local_change(
    conn: sqlite3.Connection,
    table: str,
    key_column: str,
    key_value: str | int,
    *,
    deleted_at: str | None = None,
) -> None:
    cols = _table_column_names(conn, table)
    if "sync_status" not in cols:
        return
    device_id = sync_meta.get_or_create_device_id()
    ts = now_iso()
    set_parts = ["sync_status = 'pending'"]
    params: list[Any] = []
    if "device_id" in cols:
        set_parts.append("device_id = ?")
        params.append(device_id)
    if "updated_at" in cols:
        set_parts.append("updated_at = ?")
        params.append(ts)
    if deleted_at and "deleted_at" in cols:
        set_parts.append("deleted_at = ?")
        params.append(deleted_at)
    where_parts: list[str] = []
    if table in _USER_SCOPED_TABLES and "user_id" in cols:
        where_parts.append("user_id = ?")
        params.append(get_current_user_id())
    where_parts.append(f"{key_column} = ?")
    params.append(key_value)
    conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE {' AND '.join(where_parts)}",
        params,
    )


def mark_row_pending_on_insert(
    conn: sqlite3.Connection,
    table: str,
    key_column: str,
    key_value: str | int,
) -> None:
    device_id = sync_meta.get_or_create_device_id()
    ts = now_iso()
    conn.execute(
        f"UPDATE {table} SET sync_status = 'pending', device_id = ?, updated_at = ? WHERE {key_column} = ?",
        (device_id, ts, key_value),
    )


def touch_strength_session(conn: sqlite3.Connection, date_str: str, workout_title: str) -> None:
    ts = now_iso()
    key = f"{date_str}|{workout_title}"
    conn.execute(
        """INSERT OR REPLACE INTO forma_sync_touch (entity_type, entity_key, updated_at)
           VALUES ('strength_workouts', ?, ?)""",
        (key, ts),
    )
    uid = get_current_user_id()
    conn.execute(
        """UPDATE strength_workouts
           SET sync_status = 'pending', updated_at = ?, device_id = ?
           WHERE user_id = ? AND date = ? AND workout_title = ?""",
        (ts, sync_meta.get_or_create_device_id(), uid, date_str, workout_title),
    )


def mark_exported(conn: sqlite3.Connection, refs: list[ExportedEntityRef], revision: int) -> None:
    for ref in refs:
        conn.execute(
            f"""UPDATE {ref.table}
                SET sync_status = 'synced', last_synced_revision = ?
                WHERE {ref.key_column} = ?""",
            (revision, ref.key_value),
        )


def mark_entity_conflict(
    conn: sqlite3.Connection,
    table: str,
    key_column: str,
    key_value: str | int,
) -> None:
    conn.execute(
        f"UPDATE {table} SET sync_status = 'conflict' WHERE {key_column} = ?",
        (key_value,),
    )


def count_pending_in_table(conn: sqlite3.Connection, table: str, user_id: int | None = None) -> int:
    uid = user_id if user_id is not None else get_current_user_id()
    if table in ("food_entries", "stretching_log", "cardio_workouts", "workout_presets"):
        row = conn.execute(
            f"SELECT COUNT(*) FROM {table} WHERE user_id = ? AND {PENDING_WHERE}",
            (uid,),
        ).fetchone()
    elif table in ("body_metrics", "daily_bracelet_calories"):
        row = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {PENDING_WHERE}").fetchone()
    else:
        row = conn.execute(f"SELECT COUNT(*) FROM {table} WHERE {PENDING_WHERE}").fetchone()
    return int(row[0]) if row else 0


def count_pending_strength_sessions(conn: sqlite3.Connection, user_id: int | None = None) -> int:
    uid = user_id if user_id is not None else get_current_user_id()
    row = conn.execute(
        """SELECT COUNT(DISTINCT date || '|' || workout_title)
           FROM strength_workouts
           WHERE user_id = ? AND """ + PENDING_WHERE,
        (uid,),
    ).fetchone()
    return int(row[0]) if row else 0


def count_pending_preferences(conn: sqlite3.Connection) -> int:
    try:
        row = conn.execute(
            """SELECT COUNT(*) FROM forma_sync_touch
               WHERE entity_type = 'user_preferences'"""
        ).fetchone()
        return int(row[0]) if row else 0
    except sqlite3.OperationalError:
        return 0


def touch_user_preferences(conn: sqlite3.Connection) -> None:
    ts = now_iso()
    conn.execute(
        """INSERT OR REPLACE INTO forma_sync_touch (entity_type, entity_key, updated_at)
           VALUES ('user_preferences', 'default', ?)""",
        (ts,),
    )


def clear_preference_touch(conn: sqlite3.Connection) -> None:
    conn.execute(
        "DELETE FROM forma_sync_touch WHERE entity_type = 'user_preferences' AND entity_key = 'default'"
    )


def mark_strength_session_exported(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
    revision: int,
    user_id: int | None = None,
) -> None:
    uid = user_id if user_id is not None else get_current_user_id()
    conn.execute(
        """UPDATE strength_workouts
           SET sync_status = 'synced', last_synced_revision = ?
           WHERE user_id = ? AND date = ? AND workout_title = ?""",
        (revision, uid, date_str, workout_title),
    )
    conn.execute(
        """DELETE FROM forma_sync_touch
           WHERE entity_type = 'strength_workouts' AND entity_key = ?""",
        (f"{date_str}|{workout_title}",),
    )


def count_pending_changes(conn: sqlite3.Connection, user_id: int | None = None) -> int:
    total = 0
    for table in SYNC_TABLES:
        try:
            total += count_pending_in_table(conn, table, user_id)
        except sqlite3.OperationalError:
            continue
    total += count_pending_strength_sessions(conn, user_id)
    total += count_pending_preferences(conn)
    return total


ACTIVE_NOT_DELETED = "(deleted_at IS NULL OR deleted_at = '')"


def _table_column_names(conn: sqlite3.Connection, table: str) -> set[str]:
    return {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}


def load_active_rows(
    conn: sqlite3.Connection,
    table: str,
    user_id: int | None = None,
    extra_where: str = "",
) -> list[sqlite3.Row]:
    """All non-deleted rows for baseline export."""
    uid = user_id if user_id is not None else get_current_user_id()
    conn.row_factory = sqlite3.Row
    cols = _table_column_names(conn, table)
    deleted_clause = ACTIVE_NOT_DELETED if "deleted_at" in cols else "1=1"
    order_col = "updated_at" if "updated_at" in cols else ("date" if "date" in cols else "id")
    if table in _USER_SCOPED_TABLES or "user_id" in cols:
        sql = (
            f"SELECT * FROM {table} WHERE user_id = ? AND {deleted_clause} "
            f"{extra_where} ORDER BY {order_col}"
        )
        rows = conn.execute(sql, (uid,)).fetchall()
    else:
        sql = f"SELECT * FROM {table} WHERE {deleted_clause} {extra_where} ORDER BY {order_col}"
        rows = conn.execute(sql).fetchall()
    return list(rows)


def load_pending_rows(
    conn: sqlite3.Connection,
    table: str,
    user_id: int | None = None,
    extra_where: str = "",
) -> list[sqlite3.Row]:
    uid = user_id if user_id is not None else get_current_user_id()
    conn.row_factory = sqlite3.Row
    cols = _table_column_names(conn, table)
    order_col = "updated_at" if "updated_at" in cols else ("date" if "date" in cols else "id")
    if table in _USER_SCOPED_TABLES or "user_id" in cols:
        sql = (
            f"SELECT * FROM {table} WHERE user_id = ? AND {PENDING_WHERE} "
            f"{extra_where} ORDER BY {order_col}"
        )
        rows = conn.execute(sql, (uid,)).fetchall()
    else:
        sql = f"SELECT * FROM {table} WHERE {PENDING_WHERE} {extra_where} ORDER BY {order_col}"
        rows = conn.execute(sql).fetchall()
    return list(rows)


def enqueue_conflict(
    conn: sqlite3.Connection,
    *,
    entity_type: str,
    entity_label: str,
    local_payload: Any,
    server_payload: Any | None = None,
    previous_payload: Any | None = None,
    remote_updated_at: str | None = None,
    winner: str | None = "remote",
) -> None:
    conn.execute(
        """INSERT INTO sync_conflicts
           (entity_type, entity_label, local_payload_json, server_payload_json,
            previous_payload_json, remote_updated_at, winner, created_at, resolved)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)""",
        (
            entity_type,
            entity_label,
            json.dumps(local_payload, ensure_ascii=False),
            json.dumps(server_payload, ensure_ascii=False) if server_payload is not None else None,
            json.dumps(previous_payload, ensure_ascii=False) if previous_payload is not None else None,
            remote_updated_at,
            winner,
            now_iso(),
        ),
    )


def count_unresolved_conflicts(conn: sqlite3.Connection) -> int:
    row = conn.execute("SELECT COUNT(*) FROM sync_conflicts WHERE resolved = 0").fetchone()
    return int(row[0]) if row else 0


def list_unresolved_conflicts(conn: sqlite3.Connection) -> list[dict[str, Any]]:
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM sync_conflicts WHERE resolved = 0 ORDER BY id DESC"
    ).fetchall()
    return [dict(r) for r in rows]


def resolve_conflict(conn: sqlite3.Connection, conflict_id: int) -> None:
    conn.execute("UPDATE sync_conflicts SET resolved = 1 WHERE id = ?", (conflict_id,))
