# -*- coding: utf-8 -*-
"""Shared helpers for DB import merge handlers (no registry imports)."""
from __future__ import annotations

import logging
import sqlite3
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
from typing import Any, Callable, Iterator

logger = logging.getLogger(__name__)

StatsDict = dict[str, int]


@dataclass(frozen=True)
class ImportDedupeContext:
    """Arguments for post-import dedupe handlers (universal resolver dispatcher)."""

    user_id: int
    row_limit: int = 20_000


DedupeFn = Callable[[sqlite3.Connection, ImportDedupeContext], int]

TIMESTAMP_COLUMN_CANDIDATES: tuple[str, ...] = (
    "updated_at",
    "computed_at",
    "created_at",
    "recorded_at",
    "effective_from",
    "started_at",
    "completed_at",
    "verified_at",
    "date",
)


class MergeStrategy(str, Enum):
    newer_timestamp = "newer_timestamp"
    incoming_wins = "incoming_wins"
    keep_existing = "keep_existing"
    max_numeric = "max_numeric"
    richer = "richer"
    coalesce_non_null = "coalesce_non_null"


def timestamp_sort_key(val: Any) -> str:
    return str(val or "")[:19]


def incoming_newer(incoming_ts: Any, existing_ts: Any) -> bool:
    inc, ex = timestamp_sort_key(incoming_ts), timestamp_sort_key(existing_ts)
    if not inc:
        return False
    if not ex:
        return True
    return inc > ex


def resolve_timestamp_column(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    candidates: tuple[str, ...] = TIMESTAMP_COLUMN_CANDIDATES,
) -> str | None:
    cols = set(pragma_columns(conn, schema, table))
    for name in candidates:
        if name in cols:
            return name
    return None


def filter_existing_columns(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    columns: list[str] | tuple[str, ...],
) -> list[str]:
    have = set(pragma_columns(conn, schema, table))
    return [c for c in columns if c in have]


def prefer_staging_row(
    prev: dict[str, Any],
    incoming: dict[str, Any],
    *,
    strategy: MergeStrategy,
    ts_col: str | None = None,
    richer_field: str | None = None,
    date_field: str | None = None,
) -> bool:
    """True when incoming row should replace prev during staging dedupe."""
    if strategy == MergeStrategy.incoming_wins:
        return True
    if strategy == MergeStrategy.keep_existing:
        return False
    if strategy == MergeStrategy.max_numeric and richer_field:
        return int(incoming.get(richer_field) or 0) >= int(prev.get(richer_field) or 0)
    if ts_col:
        return incoming_newer(incoming.get(ts_col), prev.get(ts_col))
    if date_field:
        return incoming_newer(incoming.get(date_field), prev.get(date_field))
    if strategy == MergeStrategy.newer_timestamp:
        return False
    return True


def rows_payload_equal(
    a: dict[str, Any],
    b: dict[str, Any],
    fields: tuple[str, ...],
) -> bool:
    for f in fields:
        if f in a or f in b:
            if a.get(f) != b.get(f):
                return False
    return True


def empty_stats() -> StatsDict:
    return {
        "imported": 0,
        "updated": 0,
        "skipped_identical": 0,
        "merged": 0,
        "conflicts": 0,
        "deduped_removed": 0,
        "deleted_source_rows": 0,
    }


def inc_stats(stats: StatsDict, result: str) -> None:
    if result in stats:
        stats[result] += 1
    elif result == "skipped":
        stats["skipped_identical"] += 1
    else:
        stats["conflicts"] += 1


def log_table_merge(table: str, stats: StatsDict, *, context: str = "merge") -> None:
    logger.info(
        "%s %s imported=%s updated=%s skipped_identical=%s merged=%s "
        "conflicts=%s deduped_removed=%s deleted_source=%s",
        context,
        table,
        stats.get("imported", 0),
        stats.get("updated", 0),
        stats.get("skipped_identical", 0),
        stats.get("merged", 0),
        stats.get("conflicts", 0),
        stats.get("deduped_removed", 0),
        stats.get("deleted_source_rows", 0),
    )


def table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
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


def pragma_columns(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


@contextmanager
def sqlite_row_factory(conn: sqlite3.Connection) -> Iterator[None]:
    """Temporarily use sqlite3.Row; restore previous factory (never force None)."""
    previous = conn.row_factory
    conn.row_factory = sqlite3.Row
    try:
        yield
    finally:
        conn.row_factory = previous


def row_dict(row: sqlite3.Row | tuple[Any, ...] | dict[str, Any], columns: list[str]) -> dict[str, Any]:
    """Normalize sqlite fetch rows (tuple, Row, or dict) to a column dict."""
    if isinstance(row, dict):
        return dict(row)
    keys_fn = getattr(row, "keys", None)
    if callable(keys_fn):
        try:
            return {k: row[k] for k in keys_fn()}
        except AttributeError:
            pass
    if not columns:
        raise ValueError("row_dict requires columns for sequence sqlite rows")
    return dict(zip(columns, row, strict=False))


def table_has_column(
    conn: sqlite3.Connection, schema: str, table: str, column: str
) -> bool:
    return column in pragma_columns(conn, schema, table)


def staging_select_columns(imp_cols: list[str]) -> list[str]:
    """Staging SELECT list: drop surrogate INTEGER PK `id` when other columns exist."""
    if "id" in imp_cols and len(imp_cols) > 1:
        return [c for c in imp_cols if c != "id"]
    return list(imp_cols)


def sql_where_for_keys(key_cols: tuple[str, ...]) -> str:
    return " AND ".join(f"{c} = ?" for c in key_cols)


def key_params_from_row(row: dict[str, Any], key_cols: tuple[str, ...]) -> list[Any]:
    return [row_key_value(row, c) for c in key_cols]


_DATE_LIKE_COLUMNS = frozenset(
    {"date", "workout_date", "bucket_date", "activity_date", "effective_from"}
)


def row_key_value(row: dict[str, Any], column: str) -> Any:
    """Normalize key values for lookup (calendar dates → YYYY-MM-DD)."""
    val = row[column]
    if column in _DATE_LIKE_COLUMNS and val is not None:
        return str(val)[:10]
    return val


def upsert_lookup_column_sets(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    *,
    preferred: tuple[str, ...] | None = None,
) -> list[tuple[str, ...]]:
    """Candidate UNIQUE/PK column sets to locate an existing row (legacy date-only UK first)."""
    from backend.services.db_import_unique_inventory import scan_unique_constraints

    sets: list[tuple[str, ...]] = []
    seen: set[tuple[str, ...]] = set()
    have = set(pragma_columns(conn, schema, table))

    def add(cols: tuple[str, ...]) -> None:
        if not cols or cols in seen or not all(c in have for c in cols):
            return
        seen.add(cols)
        sets.append(cols)

    if preferred:
        add(preferred)
    constraint_cols: list[tuple[str, ...]] = []
    for info in scan_unique_constraints(conn, schemas=(schema,)):
        if info.schema == schema and info.table == table and info.columns != ("id",):
            constraint_cols.append(info.columns)
            add(info.columns)
    has_user_date_uk = any(
        "user_id" in cols and "date" in cols for cols in constraint_cols
    )
    if "user_id" in have and "date" in have:
        add(("user_id", "date"))
    if "date" in have and not has_user_date_uk:
        add(("date",))
    return sets


def fetch_existing_row(
    conn: sqlite3.Connection,
    schema: str,
    table: str,
    row: dict[str, Any],
    select_columns: list[str] | str,
    *,
    preferred_keys: tuple[str, ...] | None = None,
) -> tuple[Any, tuple[str, ...] | None]:
    """Find existing row using schema UNIQUE keys; returns (row, matched_key_cols)."""
    if isinstance(select_columns, str):
        select_sql = select_columns
    else:
        cols = filter_existing_columns(conn, schema, table, select_columns)
        select_sql = ", ".join(cols) if cols else "1"
    qual = table if schema == "main" else f"{schema}.{table}"
    for keys in upsert_lookup_column_sets(conn, schema, table, preferred=preferred_keys):
        if any(k not in row for k in keys):
            continue
        where = sql_where_for_keys(keys)
        params = key_params_from_row(row, keys)
        with sqlite_row_factory(conn):
            found = conn.execute(
                f"SELECT {select_sql} FROM {qual} WHERE {where} LIMIT 1",
                params,
            ).fetchone()
        if found is not None:
            return found, keys
    return None, None


def resolve_dedupe_key_columns(
    conn: sqlite3.Connection,
    table: str,
    *,
    schema: str = "main",
) -> tuple[str, ...]:
    """Natural/PK columns for duplicate removal (inventory UK, singleton, PRAGMA PK)."""
    from backend.services.db_import_unique_inventory import (
        SINGLETON_USER_SCOPED_TABLES,
        list_user_scoped_tables_in_schema,
        primary_key_columns,
        scan_unique_constraints,
    )

    constraints = scan_unique_constraints(conn, schemas=(schema,))
    user_scoped = list_user_scoped_tables_in_schema(constraints, schema=schema)
    if table in user_scoped:
        return tuple(user_scoped[table])
    if table in SINGLETON_USER_SCOPED_TABLES:
        return ("user_id",)
    pk = primary_key_columns(conn, schema, table)
    if pk:
        return pk
    cols = pragma_columns(conn, schema, table)
    if "user_id" in cols:
        return ("user_id",)
    return tuple(cols)


def dedupe_user_scoped_sql(
    conn: sqlite3.Connection,
    table: str,
    ctx: ImportDedupeContext,
    *,
    schema: str = "main",
    key_cols: tuple[str, ...] | None = None,
) -> int:
    """
    Remove duplicate rows for one user, keeping MAX(rowid) per natural key.
    Works without surrogate `id` (uses sqlite rowid).
    """
    if not table_exists(conn, schema, table):
        return 0

    qual = table if schema == "main" else f"{schema}.{table}"
    cols = tuple(key_cols) if key_cols else resolve_dedupe_key_columns(conn, table, schema=schema)
    if not cols:
        return 0

    uid = int(ctx.user_id)
    group_sql = ", ".join(cols)
    if table_has_column(conn, schema, table, "user_id"):
        cur = conn.execute(
            f"""
            DELETE FROM {qual}
            WHERE user_id = ?
              AND rowid NOT IN (
                SELECT MAX(rowid) FROM {qual}
                WHERE user_id = ?
                GROUP BY {group_sql}
              )
            """,
            (uid, uid),
        )
    else:
        cur = conn.execute(
            f"""
            DELETE FROM {qual}
            WHERE rowid NOT IN (
              SELECT MAX(rowid) FROM {qual}
              GROUP BY {group_sql}
            )
            """
        )
    return int(cur.rowcount or 0)


# Aliases for schema-aware resolver helpers
get_table_columns = pragma_columns
has_column = table_has_column
