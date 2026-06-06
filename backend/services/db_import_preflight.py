# -*- coding: utf-8 -*-
"""Preflight scan for DB import UNIQUE conflicts; hard-block unsafe tables."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any, Literal

from backend.services.db_import_natural_merge import (
    CATALOG_MERGE_HANDLERS,
    CLOUD_AUTH_HANDLERS,
    NATURAL_KEY_HANDLERS,
    has_user_scoped_handler,
)
from backend.services.db_import_unique_inventory import (
    RECONCILE_HANDLED_TABLES,
    TableImportClass,
    list_user_scoped_tables_in_schema,
    scan_unique_constraints,
    singleton_tables_from_constraints,
    user_scoped_tables_from_constraints,
)
from backend.services.import_user_reconciliation import detect_import_user_id
from database.connection import MEAL_PLAN_TABLES

logger = logging.getLogger(__name__)

ImportMode = Literal["merge", "replace"]


class ImportPreflightError(Exception):
    def __init__(self, message: str, report: dict[str, Any]) -> None:
        self.report = report
        super().__init__(message)


def _attach_staging(
    conn: sqlite3.Connection,
    *,
    staging_workouts: Path,
    staging_shared: Path,
    live_workouts: Path | None,
    live_shared: Path | None,
) -> None:
    conn.execute("ATTACH DATABASE ? AS import_main", (str(staging_workouts.resolve()),))
    conn.execute("ATTACH DATABASE ? AS import_shared", (str(staging_shared.resolve()),))
    if live_workouts and live_workouts.is_file():
        conn.execute("ATTACH DATABASE ? AS live_main", (str(live_workouts.resolve()),))
    if live_shared and live_shared.is_file():
        conn.execute("ATTACH DATABASE ? AS live_shared", (str(live_shared.resolve()),))


def _table_exists_in_schema(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    try:
        row = conn.execute(
            f"""
            SELECT 1 FROM {schema}.sqlite_master
            WHERE type='table' AND name=?
            """,
            (table,),
        ).fetchone()
        return row is not None
    except sqlite3.OperationalError:
        return False


def _count_staging_duplicates(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    key_cols: tuple[str, ...],
    import_uid: int | None,
) -> int:
    if not key_cols:
        return 0
    qual = f"{schema}.{table}"
    try:
        cols = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    except sqlite3.OperationalError:
        return 0
    col_names = {str(c[1]) for c in cols}
    if not all(c in col_names for c in key_cols):
        return 0

    group_cols = ", ".join(key_cols)
    if import_uid is not None and "user_id" in key_cols:
        row = conn.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT {group_cols}, COUNT(*) AS c
                FROM {qual}
                WHERE user_id = ?
                GROUP BY {group_cols}
                HAVING c > 1
            )
            """,
            (import_uid,),
        ).fetchone()
    else:
        row = conn.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT {group_cols}, COUNT(*) AS c
                FROM {qual}
                GROUP BY {group_cols}
                HAVING c > 1
            )
            """
        ).fetchone()
    return int(row[0] or 0) if row else 0


def _count_remap_risk(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    *,
    target_user_id: int,
) -> int:
    qual = f"{schema}.{table}"
    try:
        row = conn.execute(
            f"""
            SELECT COUNT(DISTINCT user_id) FROM {qual}
            WHERE user_id IS NOT NULL AND user_id != ?
            """,
            (int(target_user_id),),
        ).fetchone()
        return int(row[0] or 0) if row else 0
    except sqlite3.OperationalError:
        return 0


def _count_merge_overlaps(
    conn: sqlite3.Connection,
    table: str,
    key_cols: tuple[str, ...],
    *,
    target_user_id: int,
    import_uid: int,
) -> int:
    live_schema = "live_main"
    imp_schema = "import_main"
    try:
        conn.execute(f"SELECT 1 FROM {live_schema}.{table} LIMIT 1")
    except sqlite3.OperationalError:
        return 0

    keys = list(key_cols)
    if "user_id" in keys:
        on_parts = [f"l.{c} = s.{c}" for c in keys if c != "user_id"]
        on_parts.append(f"l.user_id = {int(target_user_id)}")
        on_parts.append(f"s.user_id = {int(import_uid)}")
    else:
        on_parts = [f"l.{c} = s.{c}" for c in keys]

    on_sql = " AND ".join(on_parts)
    row = conn.execute(
        f"""
        SELECT COUNT(*) FROM {imp_schema}.{table} s
        INNER JOIN {live_schema}.{table} l ON {on_sql}
        """
    ).fetchone()
    return int(row[0] or 0) if row else 0


def run_import_preflight(
    staging_workouts: Path,
    staging_shared: Path,
    *,
    target_user_id: int,
    mode: ImportMode,
    live_workouts: Path | None = None,
    live_shared: Path | None = None,
) -> dict[str, Any]:
    """
    Scan staging (+ live for merge) for UNIQUE coverage and conflicts.
    Raises ImportPreflightError when tables_blocked is non-empty.
    """
    import_uid = detect_import_user_id(staging_workouts)
    tables_upsert: list[str] = []
    tables_blocked: list[str] = []
    tables_catalog: list[str] = []
    tables_preserve_target: list[str] = []
    tables_singleton: list[str] = []
    tables_required_handlers: list[str] = []
    conflict_counts: dict[str, int] = {}

    conn = sqlite3.connect(":memory:")
    try:
        _attach_staging(
            conn,
            staging_workouts=staging_workouts,
            staging_shared=staging_shared,
            live_workouts=live_workouts if mode == "merge" else None,
            live_shared=live_shared if mode == "merge" else None,
        )

        constraints = scan_unique_constraints(
            conn, schemas=("import_main", "import_shared")
        )
        user_scoped = list_user_scoped_tables_in_schema(
            constraints, schema="import_main"
        )
        tables_singleton = singleton_tables_from_constraints(
            constraints, schema="import_main"
        )

        for table in sorted(user_scoped.keys()):
            if table in MEAL_PLAN_TABLES:
                # Copied from import_shared; not merged via main user-scoped handlers.
                continue
            if not _table_exists_in_schema(conn, "import_main", table):
                continue
            tables_required_handlers.append(table)
            key_cols = user_scoped[table]

            if has_user_scoped_handler(table):
                if table not in tables_upsert:
                    tables_upsert.append(table)
            elif table in RECONCILE_HANDLED_TABLES:
                if table not in tables_upsert:
                    tables_upsert.append(table)
            else:
                tables_blocked.append(table)

            dup = _count_staging_duplicates(
                conn, "import_main", table, key_cols, import_uid
            )
            if dup:
                conflict_counts[table] = conflict_counts.get(table, 0) + dup

            remap_risk = _count_remap_risk(
                conn, "import_main", table, target_user_id=target_user_id
            )
            if remap_risk:
                conflict_counts[table] = conflict_counts.get(table, 0) + remap_risk

            if mode == "merge" and live_workouts and has_user_scoped_handler(table):
                overlap = _count_merge_overlaps(
                    conn,
                    table,
                    key_cols,
                    target_user_id=target_user_id,
                    import_uid=import_uid,
                )
                if overlap:
                    conflict_counts[table] = conflict_counts.get(table, 0) + overlap

        for c in constraints:
            if c.import_class == TableImportClass.global_catalog:
                if c.table in CATALOG_MERGE_HANDLERS:
                    q = f"{c.schema}.{c.table}"
                    try:
                        conn.execute(f"SELECT 1 FROM {q} LIMIT 1")
                        if c.table not in tables_catalog:
                            tables_catalog.append(c.table)
                    except sqlite3.OperationalError:
                        pass
                elif "user_id" in c.columns and c.table not in CATALOG_MERGE_HANDLERS:
                    if _table_exists_in_schema(conn, "import_shared", c.table):
                        blocked_name = f"shared.{c.table}"
                        if blocked_name not in tables_blocked:
                            tables_blocked.append(blocked_name)

            if c.import_class == TableImportClass.cloud_auth:
                tables_preserve_target.append(c.table)

        for t in CLOUD_AUTH_HANDLERS:
            if t not in tables_preserve_target:
                tables_preserve_target.append(t)

        for t in sorted(NATURAL_KEY_HANDLERS):
            if t not in tables_upsert and _table_exists_in_schema(conn, "import_main", t):
                if has_user_scoped_handler(t):
                    tables_upsert.append(t)
                if t not in tables_required_handlers:
                    tables_required_handlers.append(t)

        tables_upsert = sorted(set(tables_upsert))
        tables_blocked = sorted(set(tables_blocked))
        tables_catalog = sorted(set(tables_catalog))
        tables_preserve_target = sorted(set(tables_preserve_target))
        tables_required_handlers = sorted(set(tables_required_handlers))
        tables_singleton = sorted(set(tables_singleton))

        ok = len(tables_blocked) == 0
        report: dict[str, Any] = {
            "tables_upsert": tables_upsert,
            "tables_blocked": tables_blocked,
            "conflict_counts": conflict_counts,
            "tables_catalog": tables_catalog,
            "tables_preserve_target": tables_preserve_target,
            "tables_singleton": tables_singleton,
            "tables_required_handlers": tables_required_handlers,
            "import_source_user_id": import_uid,
            "target_user_id": int(target_user_id),
            "mode": mode,
            "ok": ok,
        }

        logger.info(
            "import_preflight ok=%s upsert=%s blocked=%s required=%s singleton=%s "
            "catalog=%s preserve=%s conflicts=%s",
            ok,
            tables_upsert,
            tables_blocked,
            tables_required_handlers,
            tables_singleton,
            tables_catalog,
            tables_preserve_target,
            conflict_counts,
        )

        if not ok:
            raise ImportPreflightError(
                "Импорт заблокирован: таблицы с UNIQUE без merge handler: "
                + ", ".join(tables_blocked),
                report,
            )
        return report
    finally:
        for det in ("import_main", "import_shared", "live_main", "live_shared"):
            try:
                conn.execute(f"DETACH {det}")
            except sqlite3.Error:
                pass
        conn.close()
