# -*- coding: utf-8 -*-
"""Full-account JSON backup export/import (forma_backup_v1)."""
from __future__ import annotations

import json
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Callable, Literal

logger = logging.getLogger(__name__)

ExportProgressFn = Callable[[str, int, int, str], None]

from backend.database.db_utils import get_current_user_id, get_db
from database.connection import open_db

SCHEMA_VERSION = "forma_backup_v1"
APP_VERSION = "1.0.0"

ImportMode = Literal["merge", "replace"]

IMPORT_COMMIT_BATCH = 250

# Import order: parents before children.
TABLE_IMPORT_ORDER: tuple[str, ...] = (
    "user_profile",
    "workout_presets",
    "preset_exercises",
    "preset_sets",
    "workout_exercise_template",
    "cardio_workouts",
    "gps_tracks",
    "workout_sensors",
    "workout_heart_rate",
    "strength_workouts",
    "strength_hr_session_meta",
    "strength_hr_block_mappings",
    "exercise_sets",
    "exercise_set_items",
    "food_entries",
    "body_metrics",
    "daily_weight",
    "stretching_log",
    "daily_nutrition_goals",
    "nutrition_plan",
    "steps_history",
    "daily_bracelet_calories",
    "cardio_type_settings",
    "polar_pending_workouts",
    "imported_files",
    "sync_conflicts",
)

EXPORT_TABLES: tuple[str, ...] = TABLE_IMPORT_ORDER

EXCLUDED_TABLES = frozenset({"cloud_tokens", "users"})

USER_SCOPED_TABLES = frozenset(
    {
        "strength_workouts",
        "cardio_workouts",
        "exercise_sets",
        "exercise_set_items",
        "food_entries",
        "body_metrics",
        "daily_weight",
        "stretching_log",
        "daily_nutrition_goals",
        "nutrition_plan",
        "steps_history",
        "polar_pending_workouts",
        "cloud_tokens",
        "imported_files",
        "gps_tracks",
        "workout_sensors",
        "workout_heart_rate",
        "cardio_type_settings",
        "daily_bracelet_calories",
        "workout_exercise_template",
        "workout_presets",
        "preset_exercises",
        "preset_sets",
        "strength_hr_session_meta",
        "strength_hr_block_mappings",
    }
)

PROFILE_TABLES = frozenset({"user_profile"})


@dataclass
class ImportReport:
    imported: dict[str, int] = field(default_factory=dict)
    updated: dict[str, int] = field(default_factory=dict)
    skipped: dict[str, int] = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    skipped_tables: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "imported": dict(self.imported),
            "updated": dict(self.updated),
            "skipped": dict(self.skipped),
            "errors": list(self.errors),
            "skipped_tables": list(self.skipped_tables),
        }


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (table,),
    ).fetchone()
    return row is not None


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _serialize_row(row: dict[str, Any]) -> dict[str, Any] | None:
    out: dict[str, Any] = {}
    for key, val in row.items():
        if isinstance(val, (bytes, bytearray)):
            out[key] = val.hex()
        elif isinstance(val, datetime):
            out[key] = val.isoformat()
        elif val is None or isinstance(val, (bool, int, float, str, list, dict)):
            out[key] = val
        else:
            out[key] = str(val)
    return out


def _derive_strength_sessions(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sessions: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        date_str = str(row.get("date", ""))[:10]
        title = str(row.get("workout_title") or "")
        key = (date_str, title)
        sess = sessions.get(key)
        if not sess:
            sessions[key] = {
                "date": date_str,
                "workout_title": title,
                "set_count": 0,
                "updated_at": row.get("updated_at"),
            }
            sess = sessions[key]
        sess["set_count"] = int(sess.get("set_count", 0)) + 1
        ts = row.get("updated_at")
        if ts and (not sess.get("updated_at") or str(ts) > str(sess["updated_at"])):
            sess["updated_at"] = ts
    return list(sessions.values())


def _load_settings_snapshot(conn: sqlite3.Connection, user_id: int) -> dict[str, Any]:
    settings: dict[str, Any] = {}
    try:
        from backend.services import settings_service

        settings["integration"] = settings_service.get_integration_settings()
        profile = conn.execute(
            "SELECT * FROM user_profile WHERE user_id = ? LIMIT 1", (user_id,)
        ).fetchone()
        if profile:
            settings["analytics"] = {
                k: profile[k]
                for k in profile.keys()
                if k in ("hc_analytics_prefs", "include_warmup_in_analytics")
            }
    except Exception as err:
        settings["error"] = str(err)
    return settings


def export_full_backup(
    user_id: int | None = None,
    *,
    on_progress: ExportProgressFn | None = None,
) -> dict[str, Any]:
    uid = int(user_id if user_id is not None else get_current_user_id())
    conn = get_db()
    conn.row_factory = sqlite3.Row
    exported: dict[str, int] = {}
    skipped_tables: list[str] = []
    serialization_errors: list[str] = []
    data: dict[str, Any] = {
        "strength_sessions": [],
        "settings": {},
        "cache_metadata": {"note": "Desktop export; mobile cache tables omitted"},
    }
    tables_total = len(EXPORT_TABLES)
    step = 0

    def report(phase: str, detail: str = "") -> None:
        if on_progress:
            on_progress(phase, step, tables_total, detail)

    try:
        for table in EXPORT_TABLES:
            step += 1
            report("table", table)
            if table in EXCLUDED_TABLES or not _table_exists(conn, table):
                skipped_tables.append(table)
                continue
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if table in PROFILE_TABLES:
                sql = "SELECT * FROM user_profile WHERE user_id = ?"
                params: tuple[Any, ...] = (uid,)
            elif "user_id" in cols:
                sql = f"SELECT * FROM {table} WHERE user_id = ?"
                params = (uid,)
            else:
                sql = f"SELECT * FROM {table}"
                params = ()
            rows_out: list[dict[str, Any]] = []
            try:
                for row in conn.execute(sql, params):
                    raw = _row_to_dict(row)
                    try:
                        ser = _serialize_row(raw)
                        if ser:
                            rows_out.append(ser)
                    except Exception as err:
                        serialization_errors.append(f"{table}: {err}")
                data[table] = rows_out
                exported[table] = len(rows_out)
            except sqlite3.OperationalError as err:
                skipped_tables.append(table)
                serialization_errors.append(f"{table}: {err}")

        report("finalize", "strength_sessions")
        if "strength_workouts" in data:
            data["strength_sessions"] = _derive_strength_sessions(data["strength_workouts"])
            exported["strength_sessions"] = len(data["strength_sessions"])

        data["settings"] = _load_settings_snapshot(conn, uid)

        # forma_sync device meta (non-secret)
        if _table_exists(conn, "forma_sync_touch"):
            try:
                touches = [
                    _serialize_row(_row_to_dict(r))
                    for r in conn.execute("SELECT * FROM forma_sync_touch").fetchall()
                ]
                data["forma_sync_touch"] = [t for t in touches if t]
                exported["forma_sync_touch"] = len(data["forma_sync_touch"])
            except sqlite3.OperationalError:
                pass
    finally:
        conn.row_factory = None
        conn.close()

    return {
        "schema_version": SCHEMA_VERSION,
        "exported_at": _now_iso(),
        "source": {"platform": "desktop", "user_id": uid, "app_version": APP_VERSION},
        "report": {
            "exported": exported,
            "skipped_tables": skipped_tables,
            "serialization_errors": serialization_errors,
        },
        "data": data,
    }


def _natural_key(table: str, row: dict[str, Any]) -> tuple[Any, ...]:
    if table == "strength_workouts":
        return (str(row.get("date", ""))[:10], str(row.get("workout_title") or ""), int(row.get("set_number") or 0))
    if table == "body_metrics" or table == "daily_weight":
        return (str(row.get("date", ""))[:10],)
    if table == "food_entries":
        return (
            str(row.get("date", ""))[:10],
            str(row.get("phase") or ""),
            str(row.get("meal_type") or ""),
            int(row.get("product_id") or 0),
        )
    if table == "cardio_workouts":
        return (str(row.get("date", ""))[:10], str(row.get("type") or ""), int(row.get("id") or 0))
    if "id" in row and row["id"] is not None:
        return (int(row["id"]),)
    return (json.dumps(row, sort_keys=True, default=str),)


def _remap_user_id(row: dict[str, Any], target_user_id: int) -> dict[str, Any]:
    out = dict(row)
    if "user_id" in out:
        out["user_id"] = target_user_id
    return out


def _insert_row(conn: sqlite3.Connection, table: str, row: dict[str, Any]) -> int | None:
    cols = [c for c in row.keys() if c != "id"]
    if not cols:
        return None
    placeholders = ", ".join("?" * len(cols))
    col_list = ", ".join(cols)
    cur = conn.execute(
        f"INSERT INTO {table} ({col_list}) VALUES ({placeholders})",
        [row[c] for c in cols],
    )
    return int(cur.lastrowid) if cur.lastrowid else None


def _update_row(conn: sqlite3.Connection, table: str, row: dict[str, Any], where_sql: str, params: list[Any]) -> None:
    cols = [c for c in row.keys() if c not in ("id",)]
    if not cols:
        return
    set_sql = ", ".join(f"{c} = ?" for c in cols)
    conn.execute(
        f"UPDATE {table} SET {set_sql} WHERE {where_sql}",
        [row[c] for c in cols] + params,
    )


def _delete_user_rows(conn: sqlite3.Connection, table: str, user_id: int) -> None:
    cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
    if "user_id" in cols:
        conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
    elif table == "user_profile":
        conn.execute("DELETE FROM user_profile WHERE user_id = ?", (user_id,))


def _find_existing(
    conn: sqlite3.Connection, table: str, row: dict[str, Any], user_id: int
) -> sqlite3.Row | None:
    conn.row_factory = sqlite3.Row
    try:
        if table == "body_metrics" or table == "daily_weight":
            return conn.execute(
                f"SELECT * FROM {table} WHERE user_id = ? AND date = ?",
                (user_id, str(row.get("date", ""))[:10]),
            ).fetchone()
        if table == "strength_workouts":
            return conn.execute(
                """
                SELECT * FROM strength_workouts
                WHERE user_id = ? AND date = ? AND workout_title = ?
                  AND set_number = ? AND exercise = ?
                LIMIT 1
                """,
                (
                    user_id,
                    str(row.get("date", ""))[:10],
                    str(row.get("workout_title") or ""),
                    int(row.get("set_number") or 0),
                    str(row.get("exercise") or ""),
                ),
            ).fetchone()
        if table == "workout_presets":
            name = str(row.get("name") or "").strip()
            if not name:
                return None
            return conn.execute(
                """
                SELECT * FROM workout_presets
                WHERE user_id = ? AND lower(trim(name)) = lower(trim(?))
                LIMIT 1
                """,
                (user_id, name),
            ).fetchone()
        if table == "steps_history":
            return conn.execute(
                "SELECT * FROM steps_history WHERE user_id = ? AND date = ?",
                (user_id, str(row.get("date", ""))[:10]),
            ).fetchone()
        if table == "cardio_type_settings":
            return conn.execute(
                "SELECT * FROM cardio_type_settings WHERE user_id = ? AND type = ?",
                (user_id, str(row.get("type") or "")),
            ).fetchone()
        if table == "strength_hr_session_meta":
            return conn.execute(
                """
                SELECT * FROM strength_hr_session_meta
                WHERE user_id = ? AND workout_date = ? AND workout_title = ?
                LIMIT 1
                """,
                (
                    user_id,
                    str(row.get("workout_date") or "")[:10],
                    str(row.get("workout_title") or ""),
                ),
            ).fetchone()
        if "id" in row and row.get("id") is not None:
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
            if "user_id" in cols:
                return conn.execute(
                    f"SELECT * FROM {table} WHERE id = ? AND user_id = ?",
                    (int(row["id"]), user_id),
                ).fetchone()
            return conn.execute(
                f"SELECT * FROM {table} WHERE id = ?", (int(row["id"]),)
            ).fetchone()
    finally:
        conn.row_factory = None
    return None


def _import_table(
    conn: sqlite3.Connection,
    table: str,
    rows: list[dict[str, Any]],
    mode: ImportMode,
    target_user_id: int,
    report: ImportReport,
    id_maps: dict[str, dict[int, int]],
) -> None:
    if not rows or not _table_exists(conn, table):
        if not _table_exists(conn, table):
            report.skipped_tables.append(table)
        return

    if table == "strength_hr_session_meta":
        if mode == "replace":
            _delete_user_rows(conn, table, target_user_id)
            conn.commit()
        from backend.services.strength_hr_session_meta_import import (
            import_strength_hr_session_meta_rows,
        )

        import_strength_hr_session_meta_rows(
            conn,
            rows,
            target_user_id=target_user_id,
            report_imported=report.imported,
            report_updated=report.updated,
            report_skipped=report.skipped,
            report_errors=report.errors,
        )
        conn.commit()
        return

    if table == "steps_history":
        if mode == "replace":
            _delete_user_rows(conn, table, target_user_id)
            conn.commit()
        from backend.services.db_import_natural_merge import import_steps_history_json_rows

        import_steps_history_json_rows(
            conn,
            rows,
            target_user_id=target_user_id,
            report_imported=report.imported,
            report_updated=report.updated,
            report_skipped=report.skipped,
            report_errors=report.errors,
        )
        conn.commit()
        return

    if table == "cardio_type_settings":
        if mode == "replace":
            _delete_user_rows(conn, table, target_user_id)
            conn.commit()
        from backend.services.db_import_conflict_handlers import (
            import_cardio_type_settings_json_rows,
        )

        import_cardio_type_settings_json_rows(
            conn,
            rows,
            target_user_id=target_user_id,
            report_imported=report.imported,
            report_updated=report.updated,
            report_skipped=report.skipped,
            report_errors=report.errors,
        )
        conn.commit()
        return

    if mode == "replace":
        _delete_user_rows(conn, table, target_user_id)
        conn.commit()

    for row_idx, raw in enumerate(rows):
        row = _remap_user_id(raw, target_user_id)
        old_id = row.pop("id", None)
        if table == "cardio_workouts" and old_id is not None:
            id_maps.setdefault("cardio_workouts", {})[int(old_id)] = -1  # placeholder

        existing = None if mode == "replace" else _find_existing(conn, table, {**row, "id": old_id}, target_user_id)
        try:
            if existing:
                local_ts = str(existing["updated_at"] or "") if "updated_at" in existing.keys() else ""
                incoming_ts = str(row.get("updated_at") or "")
                if mode == "merge" and incoming_ts and local_ts and incoming_ts <= local_ts:
                    report.skipped[table] = report.skipped.get(table, 0) + 1
                    continue
                pk = int(existing["id"]) if "id" in existing.keys() else None
                if pk is None:
                    report.errors.append(f"{table}: matched row without id, skipped update")
                    continue
                row["id"] = pk
                _update_row(conn, table, row, "id = ?", [pk])
                report.updated[table] = report.updated.get(table, 0) + 1
            else:
                new_id = _insert_row(conn, table, row)
                report.imported[table] = report.imported.get(table, 0) + 1
                if table == "cardio_workouts" and old_id is not None and new_id is not None:
                    id_maps.setdefault("cardio_workouts", {})[int(old_id)] = new_id
        except sqlite3.IntegrityError as err:
            report.errors.append(f"{table}: {err}")
        except sqlite3.OperationalError as err:
            report.errors.append(f"{table}: {err}")

        if (row_idx + 1) % IMPORT_COMMIT_BATCH == 0:
            conn.commit()

    conn.commit()


def _touch_strength_sessions(conn: sqlite3.Connection, user_id: int) -> None:
    from backend.services.forma_sync.change_tracker import touch_strength_session

    rows = conn.execute(
        """
        SELECT DISTINCT date, workout_title FROM strength_workouts
        WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')
        """,
        (user_id,),
    ).fetchall()
    for row in rows:
        touch_strength_session(conn, str(row[0])[:10], str(row[1]))


def _import_full_backup_once(
    payload: dict[str, Any],
    mode: ImportMode,
    uid: int,
    on_progress: ExportProgressFn | None = None,
) -> dict[str, Any]:
    if payload.get("schema_version") != SCHEMA_VERSION:
        raise ValueError(f"Unsupported backup schema: {payload.get('schema_version')}")

    data = payload.get("data") or {}
    if not isinstance(data, dict):
        raise ValueError("Invalid backup: missing data section")

    report = ImportReport()
    conn = open_db(attach=True)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        from database.shared_schema import ensure_shared_schema

        ensure_shared_schema(conn)
    except Exception:
        pass
    id_maps: dict[str, dict[int, int]] = {}
    tables = [t for t in TABLE_IMPORT_ORDER if isinstance(data.get(t), list)]
    total = max(len(tables), 1)
    idx = 0

    try:
        for table in TABLE_IMPORT_ORDER:
            rows = data.get(table)
            if not isinstance(rows, list):
                continue
            idx += 1
            if on_progress:
                on_progress("merging", idx, total, table)
            _import_table(conn, table, rows, mode, uid, report, id_maps)

        if not data.get("strength_workouts") and data.get("strength_sessions"):
            report.skipped_tables.append("strength_sessions_only")

        if on_progress:
            on_progress("saving", total, total, "")
        _touch_strength_sessions(conn, uid)
        conn.commit()
    except Exception as err:
        conn.rollback()
        report.errors.append(str(err))
        out = report.to_dict()
        out["fatal_error"] = str(err)
        return out
    finally:
        conn.close()

    return report.to_dict()


def import_full_backup(
    payload: dict[str, Any],
    mode: ImportMode,
    target_user_id: int | None = None,
    on_progress: ExportProgressFn | None = None,
) -> dict[str, Any]:
    uid = int(target_user_id if target_user_id is not None else get_current_user_id())
    logger.info("backup import start user_id=%s mode=%s", uid, mode)

    last: dict[str, Any] | None = None
    for attempt in range(3):
        try:
            last = _import_full_backup_once(payload, mode, uid, on_progress=on_progress)
            if not last.get("fatal_error"):
                logger.info("backup import done user_id=%s", uid)
                return last
            err_text = str(last.get("fatal_error") or "")
            if "locked" not in err_text.lower() or attempt >= 2:
                return last
        except sqlite3.OperationalError as err:
            if "locked" not in str(err).lower() or attempt >= 2:
                return {
                    "imported": {},
                    "updated": {},
                    "skipped": {},
                    "errors": [str(err)],
                    "skipped_tables": [],
                    "fatal_error": str(err),
                }
        time.sleep(0.35 * (attempt + 1))

    return last or {
        "imported": {},
        "updated": {},
        "skipped": {},
        "errors": ["Import failed"],
        "skipped_tables": [],
        "fatal_error": "Import failed",
    }


def remark_strength_workouts_pending(user_id: int | None = None) -> dict[str, int]:
    """Admin: mark all strength rows pending for FormaSync upload."""
    uid = int(user_id if user_id is not None else get_current_user_id())
    conn = get_db()
    try:
        from backend.services.forma_sync import sync_meta
        from backend.services.forma_sync.change_tracker import touch_strength_session

        device_id = sync_meta.get_or_create_device_id()
        ts = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
        updated = conn.execute(
            """
            UPDATE strength_workouts
            SET sync_status = 'pending', device_id = ?, updated_at = ?
            WHERE user_id = ?
            """,
            (device_id, ts, uid),
        ).rowcount
        sessions = conn.execute(
            """
            SELECT DISTINCT date, workout_title FROM strength_workouts WHERE user_id = ?
            """,
            (uid,),
        ).fetchall()
        for row in sessions:
            touch_strength_session(conn, str(row[0])[:10], str(row[1]))
        conn.commit()
        return {"sessions": len(sessions), "rows_marked": int(updated or 0)}
    finally:
        conn.close()
