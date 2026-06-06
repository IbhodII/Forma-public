# -*- coding: utf-8 -*-
"""Scan and classify UNIQUE/PK constraints for import conflict resolution."""
from __future__ import annotations

import re
import sqlite3
from dataclasses import dataclass
from enum import Enum
from typing import Any

from database.migrations import _PERSONAL_USER_TABLES

CLOUD_AUTH_TABLES: frozenset[str] = frozenset(
    {"cloud_tokens", "user_cloud_links", "users"}
)

# Handled outside NATURAL_KEY_HANDLERS (identity reconcile).
RECONCILE_HANDLED_TABLES: frozenset[str] = frozenset({"user_profile"})

EXTRA_PERSONAL_TABLES: frozenset[str] = frozenset(
    {
        "sleep_data",
        "passive_heart_rate_samples",
        "bike_settings",
        "menstrual_cycle_log",
        "menstrual_cycle_settings",
        "account_warmup_daily_cache",
        "account_warmup_checkpoint",
        "strength_hr_session_meta",
        "strength_hr_block_mappings",
        "user_profile",
    }
)

# One row per user_id (PK or UNIQUE on user_id only).
SINGLETON_USER_SCOPED_TABLES: frozenset[str] = frozenset(
    {
        "account_warmup_checkpoint",
        "bike_settings",
        "menstrual_cycle_settings",
    }
)

PERSONAL_TABLES: frozenset[str] = frozenset(_PERSONAL_USER_TABLES) | EXTRA_PERSONAL_TABLES

CHILD_FK_COLUMNS: frozenset[str] = frozenset(
    {
        "workout_id",
        "cardio_workout_id",
        "preset_id",
        "set_id",
        "canonical_workout_id",
        "linked_workout_id",
        "strength_workout_id",
        "plan_id",
        "template_id",
    }
)

# Expected user-scoped tables with handlers (for inventory tests).
EXPECTED_USER_SCOPED_HANDLED: frozenset[str] = frozenset(
    {
        "steps_history",
        "body_metrics",
        "daily_bracelet_calories",
        "passive_heart_rate_samples",
        "sleep_data",
        "strength_hr_session_meta",
        "strength_hr_block_mappings",
        "cardio_type_settings",
        "workout_presets",
        "exercise_sets",
        "bike_settings",
        "menstrual_cycle_settings",
        "menstrual_cycle_log",
        "account_warmup_daily_cache",
        "weekly_meal_schedule",
        "strength_hr_block_overrides",
        "account_warmup_checkpoint",
    }
)


def is_singleton_user_key(columns: tuple[str, ...]) -> bool:
    return columns == ("user_id",)


class TableImportClass(str, Enum):
    user_scoped = "user_scoped"
    global_catalog = "global_catalog"
    child = "child"
    cloud_auth = "cloud_auth"
    unclassified = "unclassified"


@dataclass(frozen=True)
class UniqueConstraintInfo:
    schema: str
    table: str
    columns: tuple[str, ...]
    source: str  # pk | unique_index | table_constraint
    import_class: TableImportClass

    @property
    def qualified(self) -> str:
        return f"{self.schema}.{self.table}" if self.schema != "main" else self.table


def _parse_create_table_constraints(sql: str) -> list[tuple[tuple[str, ...], str]]:
    """Extract UNIQUE(...) and PRIMARY KEY(...) from CREATE TABLE sql."""
    out: list[tuple[tuple[str, ...], str]] = []
    if not sql:
        return out
    norm = re.sub(r"\s+", " ", sql)
    for match in re.finditer(
        r"(?:CONSTRAINT\s+\w+\s+)?(UNIQUE|PRIMARY\s+KEY)\s*\(([^)]+)\)",
        norm,
        flags=re.IGNORECASE,
    ):
        kind = match.group(1).upper().replace("  ", " ")
        cols_raw = match.group(2)
        cols = tuple(c.strip().strip('"') for c in cols_raw.split(","))
        source = "pk" if "PRIMARY" in kind else "table_constraint"
        out.append((cols, source))
    for col in _parse_inline_primary_key_columns(norm):
        out.append(((col,), "pk_inline"))
    for match in re.finditer(
        r"(\w+)\s+[^,]*\bUNIQUE\b",
        norm,
        flags=re.IGNORECASE,
    ):
        col = match.group(1).strip()
        if col:
            out.append(((col,), "column_unique"))
    return out


def _parse_inline_primary_key_columns(sql_norm: str) -> list[str]:
    """Detect `user_id INTEGER PRIMARY KEY` style inline PK columns."""
    cols: list[str] = []
    for match in re.finditer(
        r"\b(\w+)\s+[^,]*?\bPRIMARY\s+KEY\b",
        sql_norm,
        flags=re.IGNORECASE,
    ):
        cols.append(match.group(1).strip())
    return cols


def primary_key_columns(
    conn: sqlite3.Connection, schema: str, table: str
) -> tuple[str, ...]:
    """PK column names from PRAGMA table_info (composite order preserved)."""
    return _pragma_primary_key_columns(conn, schema, table)


def _pragma_primary_key_columns(
    conn: sqlite3.Connection, schema: str, table: str
) -> tuple[str, ...]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    pk_cols = [str(r[1]) for r in rows if int(r[5] or 0) > 0]
    pk_cols.sort(
        key=lambda name: next(int(r[5]) for r in rows if str(r[1]) == name)
    )
    return tuple(pk_cols)


def _index_columns(conn: sqlite3.Connection, schema: str, index_name: str) -> tuple[str, ...]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA index_info({index_name})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.index_info({index_name})").fetchall()
    ordered = sorted(rows, key=lambda r: int(r[0]))
    return tuple(str(r[2]) for r in ordered if r[2])


def scan_unique_constraints(
    conn: sqlite3.Connection,
    *,
    schemas: tuple[str, ...] = ("main", "shared"),
) -> list[UniqueConstraintInfo]:
    """Collect UNIQUE/PK constraints from attached schemas."""
    found: list[UniqueConstraintInfo] = []
    seen: set[tuple[str, str, tuple[str, ...]]] = set()

    for schema in schemas:
        if schema == "main":
            master = conn.execute(
                """
                SELECT name, type, sql FROM sqlite_master
                WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
                """
            ).fetchall()
        else:
            try:
                master = conn.execute(
                    f"""
                    SELECT name, type, sql FROM {schema}.sqlite_master
                    WHERE type IN ('table', 'index') AND name NOT LIKE 'sqlite_%'
                    """
                ).fetchall()
            except sqlite3.OperationalError:
                continue

        table_sql: dict[str, str] = {}
        for name, typ, sql in master:
            if typ == "table" and sql:
                table_sql[str(name)] = str(sql)

        for table, sql in table_sql.items():
            for cols, source in _parse_create_table_constraints(sql):
                key = (schema, table, cols)
                if key in seen:
                    continue
                seen.add(key)
                found.append(
                    UniqueConstraintInfo(
                        schema=schema,
                        table=table,
                        columns=cols,
                        source=source,
                        import_class=classify_constraint(
                            schema, table, cols
                        ),
                    )
                )
            pk_cols = _pragma_primary_key_columns(conn, schema, table)
            if pk_cols:
                key = (schema, table, pk_cols)
                if key not in seen:
                    seen.add(key)
                    found.append(
                        UniqueConstraintInfo(
                            schema=schema,
                            table=table,
                            columns=pk_cols,
                            source="pk_pragma",
                            import_class=classify_constraint(
                                schema, table, pk_cols
                            ),
                        )
                    )

        for name, typ, sql in master:
            if typ != "index" or not sql:
                continue
            index_name = str(name)
            if "UNIQUE" not in (sql or "").upper():
                continue
            cols = _index_columns(conn, schema, index_name)
            if not cols:
                continue
            table_row = conn.execute(
                f"SELECT tbl_name FROM {schema}.sqlite_master WHERE type='index' AND name=?",
                (index_name,),
            ).fetchone() if schema != "main" else conn.execute(
                "SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?",
                (index_name,),
            ).fetchone()
            if not table_row:
                continue
            table = str(table_row[0])
            key = (schema, table, cols)
            if key in seen:
                continue
            seen.add(key)
            found.append(
                UniqueConstraintInfo(
                    schema=schema,
                    table=table,
                    columns=cols,
                    source="unique_index",
                    import_class=classify_constraint(schema, table, cols),
                )
            )

    return found


SHARED_CATALOG_TABLES: frozenset[str] = frozenset(
    {
        "food_products",
        "food_product_components",
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
        "stretching_exercises",
        "tire_coefficients",
        "surface_multipliers",
    }
)


def classify_constraint(
    schema: str,
    table: str,
    columns: tuple[str, ...],
) -> TableImportClass:
    if table in CLOUD_AUTH_TABLES:
        return TableImportClass.cloud_auth

    col_set = set(columns)
    if table in RECONCILE_HANDLED_TABLES:
        return TableImportClass.user_scoped

    if col_set <= CHILD_FK_COLUMNS:
        return TableImportClass.child

    if "user_id" in col_set:
        return TableImportClass.user_scoped

    if table in PERSONAL_TABLES and col_set == {"user_id"}:
        return TableImportClass.user_scoped

    if schema == "shared" or table in SHARED_CATALOG_TABLES:
        return TableImportClass.global_catalog

    return TableImportClass.unclassified


def user_scoped_tables_from_constraints(
    constraints: list[UniqueConstraintInfo],
) -> dict[str, tuple[str, ...]]:
    """Map table -> natural key columns (prefer widest UK). Caller filters by schema."""
    by_table: dict[str, list[tuple[str, ...]]] = {}
    for c in constraints:
        if c.import_class != TableImportClass.user_scoped:
            continue
        by_table.setdefault(c.table, []).append(c.columns)

    result: dict[str, tuple[str, ...]] = {}
    for table, keys in by_table.items():
        keys_sorted = sorted(keys, key=len, reverse=True)
        result[table] = keys_sorted[0]
    return result


def constraints_for_table(
    constraints: list[UniqueConstraintInfo],
    *,
    schema: str,
    table: str,
) -> list[UniqueConstraintInfo]:
    return [c for c in constraints if c.schema == schema and c.table == table]


def list_user_scoped_tables_in_schema(
    constraints: list[UniqueConstraintInfo],
    *,
    schema: str = "main",
) -> dict[str, tuple[str, ...]]:
    """All tables in schema with user-scoped UNIQUE/PK (for preflight)."""
    return user_scoped_tables_from_constraints(
        [c for c in constraints if c.schema == schema]
    )


def singleton_tables_from_constraints(
    constraints: list[UniqueConstraintInfo],
    *,
    schema: str = "main",
) -> list[str]:
    user_scoped = list_user_scoped_tables_in_schema(constraints, schema=schema)
    out = sorted(
        t
        for t, cols in user_scoped.items()
        if is_singleton_user_key(cols) or t in SINGLETON_USER_SCOPED_TABLES
    )
    return out
