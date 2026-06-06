# -*- coding: utf-8 -*-
"""Reconcile users/user_profile and user_id scopes after full DB import or cloud restore."""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.services.auth_user_service import (
    DEFAULT_LOCAL_USER_ID,
    ensure_auth_schema,
    ensure_local_desktop_user,
    find_user_by_cloud,
)
from backend.services.backup_json_service import TABLE_IMPORT_ORDER, USER_SCOPED_TABLES
from backend.services.db_import_natural_merge import (
    NATURAL_KEY_HANDLERS,
    assert_safe_user_id_reassign,
    has_user_scoped_handler,
    is_cloud_auth_table,
    is_natural_key_table,
    post_import_dedupe_table,
    remap_table_user_ids,
)
from backend.services.db_import_unique_inventory import (
    list_user_scoped_tables_in_schema,
    scan_unique_constraints,
)
from backend.services.db_import_unique_inventory import RECONCILE_HANDLED_TABLES
from database.connection import SHARED_TABLES, open_db

logger = logging.getLogger(__name__)

# Natural-key tables: blind UPDATE user_id can violate UNIQUE before dedupe runs.
_NATURAL_KEY_TABLES = frozenset(NATURAL_KEY_HANDLERS.keys())


def _iter_main_user_id_tables(conn: sqlite3.Connection) -> list[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    out: list[str] = []
    for (name,) in rows:
        table = str(name)
        if is_cloud_auth_table(table) or table in RECONCILE_HANDLED_TABLES:
            continue
        if "user_id" not in _pragma_columns(conn, "main", table):
            continue
        out.append(table)
    return sorted(out)


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    return row is not None


def _pragma_columns(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


def detect_import_user_id(workouts_path: Path) -> int:
    """Primary user_id encoded in an imported workouts.db."""
    conn = sqlite3.connect(f"file:{workouts_path}?mode=ro", uri=True)
    try:
        if _table_exists(conn, "main", "user_profile"):
            cols = _pragma_columns(conn, "main", "user_profile")
            if "user_id" in cols:
                row = conn.execute(
                    "SELECT user_id FROM user_profile WHERE user_id IS NOT NULL LIMIT 1"
                ).fetchone()
                if row and row[0] is not None:
                    return int(row[0])
            row = conn.execute("SELECT id FROM user_profile LIMIT 1").fetchone()
            if row and row[0] is not None:
                return int(row[0])
        for table in (
            "strength_workouts",
            "cardio_workouts",
            "food_entries",
            "steps_history",
            "body_metrics",
            "daily_bracelet_calories",
            "sleep_data",
            "passive_heart_rate_samples",
            "strength_hr_session_meta",
            "strength_hr_block_mappings",
            "cardio_type_settings",
            "workout_presets",
            "exercise_sets",
            "bike_settings",
            "menstrual_cycle_settings",
            "menstrual_cycle_log",
            "account_warmup_daily_cache",
            "account_warmup_checkpoint",
        ):
            if _table_exists(conn, "main", table):
                row = conn.execute(
                    f"SELECT user_id FROM {table} WHERE user_id IS NOT NULL LIMIT 1"
                ).fetchone()
                if row and row[0] is not None:
                    return int(row[0])
    finally:
        conn.close()
    return DEFAULT_LOCAL_USER_ID


def read_import_users_context(workouts_path: Path) -> dict[str, Any]:
    """Inspect imported DB for source user id and optional users/profile rows."""
    source_id = detect_import_user_id(workouts_path)
    users_rows: list[dict[str, Any]] = []
    profile_row: dict[str, Any] | None = None

    conn = sqlite3.connect(f"file:{workouts_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    try:
        if _table_exists(conn, "main", "users"):
            for row in conn.execute(
                """
                SELECT id, username, cloud_provider, cloud_user_id, display_email
                FROM users
                """
            ).fetchall():
                users_rows.append(dict(row))
        if _table_exists(conn, "main", "user_profile"):
            cols = _pragma_columns(conn, "main", "user_profile")
            if "user_id" in cols:
                row = conn.execute(
                    "SELECT * FROM user_profile WHERE user_id = ? OR id = ? LIMIT 1",
                    (source_id, source_id),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM user_profile WHERE id = ? LIMIT 1",
                    (source_id,),
                ).fetchone()
            if row:
                profile_row = dict(row)
    finally:
        conn.close()

    imported_user = None
    for u in users_rows:
        if int(u.get("id") or 0) == source_id:
            imported_user = u
            break
    if imported_user is None and users_rows:
        imported_user = users_rows[0]

    return {
        "import_source_user_id": source_id,
        "users_rows": users_rows,
        "imported_user": imported_user,
        "profile_row": profile_row,
    }


def _resolve_import_source_user_id(
    workouts_path: Path,
    source_user_id_from_filename: int | None,
) -> int:
    detected = detect_import_user_id(workouts_path)
    if source_user_id_from_filename is not None and source_user_id_from_filename != detected:
        logger.info(
            "import_reconcile source hint filename=%s detected=%s using detected",
            source_user_id_from_filename,
            detected,
        )
    return detected


def _users_row_exists(target_user_id: int) -> bool:
    conn = open_db(attach=False)
    try:
        if not _table_exists(conn, "main", "users"):
            return False
        row = conn.execute(
            "SELECT 1 FROM users WHERE id = ? LIMIT 1",
            (int(target_user_id),),
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def _apply_pre_import_user_to_row(
    conn: sqlite3.Connection,
    target_user_id: int,
    pre_import_user: dict[str, Any],
) -> None:
    conn.execute(
        """
        UPDATE users
        SET username = ?, cloud_provider = ?, cloud_user_id = ?,
            display_email = COALESCE(?, display_email)
        WHERE id = ?
        """,
        (
            pre_import_user.get("username") or "user",
            pre_import_user.get("cloud_provider"),
            pre_import_user.get("cloud_user_id"),
            pre_import_user.get("display_email"),
            int(target_user_id),
        ),
    )


def ensure_target_user_row(
    target_user_id: int,
    pre_import_user: dict[str, Any] | None,
    *,
    imported_user_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """
    Guarantee users.id = target exists after full DB replace.
    Preserves pre-import cloud identity over imported users row.
    """
    target = int(target_user_id)
    conn = open_db(attach=False)
    try:
        from backend.services.auth_user_service import _ensure_auth_tables

        _ensure_auth_tables(conn)
        conn.commit()
        row = conn.execute(
            "SELECT 1 FROM users WHERE id = ? LIMIT 1",
            (target,),
        ).fetchone()
        if row is not None:
            if pre_import_user:
                _apply_pre_import_user_to_row(conn, target, pre_import_user)
                conn.commit()
                return {"action": "updated_from_snapshot", "user_id": target}
            return {"action": "exists", "user_id": target}

        if pre_import_user:
            conn.execute(
                """
                INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
                VALUES (?, ?, ?, ?, ?)
                """,
                (
                    target,
                    pre_import_user.get("username") or "user",
                    pre_import_user.get("cloud_provider"),
                    pre_import_user.get("cloud_user_id"),
                    pre_import_user.get("display_email"),
                ),
            )
            conn.commit()
            return {"action": "restored_from_snapshot", "user_id": target}

        if imported_user_row:
            provider = str(imported_user_row.get("cloud_provider") or "").strip().lower()
            cloud_uid = str(imported_user_row.get("cloud_user_id") or "").strip()
            if provider and cloud_uid and provider not in ("local", "admin"):
                matched = find_user_by_cloud(provider, cloud_uid)
                if matched and int(matched["id"]) != target:
                    logger.info(
                        "import_reconcile cloud match id=%s target=%s keeping target row",
                        matched["id"],
                        target,
                    )
            conn.execute(
                """
                INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
                VALUES (?, ?, 'local', 'imported', ?)
                """,
                (
                    target,
                    imported_user_row.get("username") or "imported",
                    imported_user_row.get("display_email"),
                ),
            )
            conn.commit()
            return {"action": "created_from_import", "user_id": target}

        ensure_local_desktop_user(target)
        return {"action": "ensure_local_desktop", "user_id": target}
    finally:
        conn.close()


def _restore_target_cloud_identity(
    target_user_id: int,
    pre_import_user: dict[str, Any] | None,
) -> dict[str, Any] | None:
    """After replace, re-apply session user's cloud fields if snapshot had them."""
    if not pre_import_user:
        return None
    provider = str(pre_import_user.get("cloud_provider") or "").strip().lower()
    cloud_uid = str(pre_import_user.get("cloud_user_id") or "").strip()
    if not provider or not cloud_uid or provider in ("local", "admin"):
        return None

    conn = open_db(attach=False)
    try:
        conn.execute(
            """
            UPDATE users
            SET cloud_provider = ?, cloud_user_id = ?,
                display_email = COALESCE(?, display_email),
                username = COALESCE(?, username)
            WHERE id = ?
            """,
            (
                provider,
                cloud_uid,
                pre_import_user.get("display_email"),
                pre_import_user.get("username"),
                int(target_user_id),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {
        "cloud_provider": provider,
        "cloud_user_id": cloud_uid,
    }


def reassign_user_ids_to_target(target_user_id: int) -> dict[str, Any]:
    """Align user_id in scoped tables with the active profile."""
    target = int(target_user_id)
    conn = open_db(attach=True)
    from_ids: set[int] = set()
    rows_updated = 0
    per_table: dict[str, int] = {}
    reassign_natural_key: dict[str, dict[str, int]] = {}
    try:
        constraints = scan_unique_constraints(conn, schemas=("main",))
        user_scoped_uk = list_user_scoped_tables_in_schema(constraints, schema="main")
        wrong_by_main_table: dict[str, list[int]] = {}
        for table in _iter_main_user_id_tables(conn):
            if not _table_exists(conn, "main", table):
                continue
            distinct = conn.execute(
                f"SELECT DISTINCT user_id FROM {table} WHERE user_id IS NOT NULL"
            ).fetchall()
            wrong = [int(r[0]) for r in distinct if int(r[0]) != target]
            if not wrong:
                continue
            from_ids.update(wrong)
            if is_natural_key_table(table) or table in user_scoped_uk:
                if table in user_scoped_uk and not has_user_scoped_handler(table):
                    raise RuntimeError(
                        f"Reassign blocked for {table}: user-scoped UNIQUE "
                        "requires merge handler (preflight should have caught this)"
                    )
                wrong_by_main_table[table] = wrong
                continue
            assert_safe_user_id_reassign(conn, table, schema="main")
            before = conn.total_changes
            for wid in wrong:
                conn.execute(
                    f"UPDATE {table} SET user_id = ? WHERE user_id = ?",
                    (target, wid),
                )
            delta = conn.total_changes - before
            if delta:
                per_table[table] = delta
                rows_updated += delta

        for table in TABLE_IMPORT_ORDER:
            if table not in USER_SCOPED_TABLES or table not in SHARED_TABLES:
                continue
            schema = "shared"
            if not _table_exists(conn, schema, table):
                continue
            if "user_id" not in _pragma_columns(conn, schema, table):
                continue
            texpr = f"shared.{table}"
            distinct = conn.execute(
                f"SELECT DISTINCT user_id FROM {texpr} WHERE user_id IS NOT NULL"
            ).fetchall()
            wrong = [int(r[0]) for r in distinct if int(r[0]) != target]
            if not wrong:
                continue
            from_ids.update(wrong)
            before = conn.total_changes
            for wid in wrong:
                conn.execute(
                    f"UPDATE {texpr} SET user_id = ? WHERE user_id = ?",
                    (target, wid),
                )
            delta = conn.total_changes - before
            if delta:
                per_table[table] = delta
                rows_updated += delta

        for table in _NATURAL_KEY_TABLES:
            if not _table_exists(conn, "main", table):
                continue
            wrong_ids = wrong_by_main_table.get(table, [])
            if wrong_ids:
                detail = remap_table_user_ids(
                    conn,
                    table,
                    target_user_id=target,
                    source_user_ids=wrong_ids,
                )
                if detail is not None:
                    reassign_natural_key[table] = detail
                    touched = (
                        detail.get("imported", 0)
                        + detail.get("updated", 0)
                        + detail.get("merged", 0)
                    )
                    per_table[table] = touched
                    rows_updated += touched
            else:
                deduped = post_import_dedupe_table(conn, table, user_id=target)
                if deduped:
                    per_table[f"{table}_deduped"] = deduped
                    rows_updated += deduped

        conn.commit()
    finally:
        conn.close()
    out: dict[str, Any] = {
        "from": sorted(from_ids),
        "to": target,
        "rows_updated": rows_updated,
        "tables": per_table,
    }
    if reassign_natural_key:
        out["reassign_natural_key"] = reassign_natural_key
    if from_ids:
        logger.info(
            "import_reconcile user_id_remap target=%s from=%s rows=%s",
            target,
            sorted(from_ids),
            rows_updated,
        )
    return out


def reconcile_user_profile(
    target_user_id: int,
    import_source_user_id: int,
    *,
    profile_row: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Copy imported profile fields onto user_profile.id = target."""
    target = int(target_user_id)
    source = int(import_source_user_id)
    if target == source and profile_row is None:
        conn = open_db(attach=False)
        try:
            if not _table_exists(conn, "main", "user_profile"):
                return {"action": "no_table"}
            row = conn.execute(
                "SELECT id FROM user_profile WHERE id = ? LIMIT 1",
                (target,),
            ).fetchone()
            if row:
                cols = _pragma_columns(conn, "main", "user_profile")
                if "user_id" in cols:
                    conn.execute(
                        "UPDATE user_profile SET user_id = ? WHERE id = ?",
                        (target, target),
                    )
                    conn.commit()
                return {"action": "already_aligned"}
        finally:
            conn.close()

    conn = open_db(attach=False)
    try:
        if not _table_exists(conn, "main", "user_profile"):
            return {"action": "no_table"}

        cols = _pragma_columns(conn, "main", "user_profile")
        if profile_row is None:
            if "user_id" in cols:
                row = conn.execute(
                    "SELECT * FROM user_profile WHERE user_id = ? OR id = ? LIMIT 1",
                    (source, source),
                ).fetchone()
            else:
                row = conn.execute(
                    "SELECT * FROM user_profile WHERE id = ? LIMIT 1",
                    (source,),
                ).fetchone()
            profile_row = dict(row) if row else None

        if not profile_row:
            from backend.services.auth_user_service import _ensure_user_profile_row

            _ensure_user_profile_row(conn, target)
            conn.commit()
            return {"action": "created_empty"}

        skip = {"id", "user_id"}
        data_cols = [c for c in cols if c in profile_row and c not in skip]
        if not data_cols:
            return {"action": "no_columns"}

        values = {c: profile_row[c] for c in data_cols}
        if "updated_at" in cols and (
            "updated_at" not in values or not values.get("updated_at")
        ):
            values["updated_at"] = (
                datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            )

        target_row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ? LIMIT 1",
            (target,),
        ).fetchone()

        if target_row:
            set_parts = [f"{c} = ?" for c in data_cols if c != "updated_at"]
            if "updated_at" in cols:
                set_parts.append("updated_at = ?")
            params = [values[c] for c in data_cols if c != "updated_at"]
            if "updated_at" in cols:
                params.append(values["updated_at"])
            if "user_id" in cols:
                set_parts.append("user_id = ?")
                params.append(target)
            params.append(target)
            conn.execute(
                f"UPDATE user_profile SET {', '.join(set_parts)} WHERE id = ?",
                params,
            )
            action = "updated"
        else:
            insert_cols = ["id"] + data_cols
            insert_vals = [target] + [values[c] for c in data_cols]
            if "user_id" in cols:
                insert_cols.append("user_id")
                insert_vals.append(target)
            placeholders = ", ".join("?" for _ in insert_vals)
            conn.execute(
                f"INSERT INTO user_profile ({', '.join(insert_cols)}) "
                f"VALUES ({placeholders})",
                insert_vals,
            )
            action = "inserted"

        if source != target:
            conn.execute("DELETE FROM user_profile WHERE id = ?", (source,))
        conn.commit()
        return {"action": action, "target_user_id": target, "source_user_id": source}
    finally:
        conn.close()


def reconcile_after_db_import(
    target_user_id: int,
    workouts_path: Path | None = None,
    pre_import_user: dict[str, Any] | None = None,
    *,
    source_user_id_from_filename: int | None = None,
    skip_reassign: bool = False,
) -> dict[str, Any]:
    """
    Full post-replace reconciliation for active session user.
    Uses live DB when workouts_path is None.
    """
    target = int(target_user_id)
    wp = workouts_path or None
    ctx: dict[str, Any] = {}
    if wp and wp.is_file():
        ctx = read_import_users_context(wp)
        import_source = _resolve_import_source_user_id(
            wp, source_user_id_from_filename
        )
    else:
        from database.connection import WORKOUTS_DB_PATH

        wp = WORKOUTS_DB_PATH
        import_source = detect_import_user_id(wp)
        ctx = read_import_users_context(wp)

    ensure_report = ensure_target_user_row(
        target,
        pre_import_user,
        imported_user_row=ctx.get("imported_user"),
    )
    cloud_restore = _restore_target_cloud_identity(target, pre_import_user)

    user_remap: dict[str, Any] | None = None
    if not skip_reassign:
        user_remap = reassign_user_ids_to_target(target)

    profile_report = reconcile_user_profile(
        target,
        int(ctx.get("import_source_user_id", import_source)),
        profile_row=ctx.get("profile_row"),
    )

    ensure_auth_schema()

    if not _users_row_exists(target):
        raise RuntimeError(
            f"После импорта пользователь id={target} не найден в таблице users"
        )

    return {
        "session_user_id": target,
        "import_source_user_id": import_source,
        "ensure_user": ensure_report,
        "cloud_identity_restored": cloud_restore,
        "user_id_remap": user_remap,
        "profile_reconciled": profile_report,
    }
