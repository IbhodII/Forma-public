# -*- coding: utf-8 -*-
"""Authoritative strength vs stretching exercise classification."""
from __future__ import annotations

import json
import re
import sqlite3
from pathlib import Path
from typing import Iterable

EXERCISE_CATEGORY_STRENGTH = "strength"
EXERCISE_CATEGORY_STRETCHING = "stretching"

_CYRILLIC_RE = re.compile(r"[\u0400-\u04FF\u0500-\u052F]")


def normalize_exercise_name_key(name: str) -> str:
    return str(name or "").strip().casefold()


def name_has_cyrillic(name: str) -> bool:
    return bool(_CYRILLIC_RE.search(str(name or "")))


def load_free_exercise_db_categories(
    json_path: Path | None = None,
) -> dict[str, str]:
    """Map normalized exercise name -> category from free-exercise-db JSON."""
    path = json_path or Path(__file__).resolve().parent.parent / "backend/data/exercises.json"
    if not path.is_file():
        return {}
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    out: dict[str, str] = {}
    for item in raw:
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        category = str(item.get("category") or "").strip().lower()
        if category in (EXERCISE_CATEGORY_STRENGTH, EXERCISE_CATEGORY_STRETCHING):
            out[normalize_exercise_name_key(name)] = category
    return out


def collect_stretching_name_keys(conn: sqlite3.Connection, *, shared_table: str) -> set[str]:
    """All name keys that belong to the stretching library."""
    keys: set[str] = set()
    try:
        rows = conn.execute(
            f"""
            SELECT name, original_name
            FROM {shared_table}
            """
        ).fetchall()
    except sqlite3.Error:
        return keys
    for name, original_name in rows:
        for raw in (name, original_name):
            key = normalize_exercise_name_key(str(raw or ""))
            if key:
                keys.add(key)
    return keys


def classify_exercise_name(
    name: str,
    *,
    json_categories: dict[str, str],
    stretching_keys: set[str],
    default: str = EXERCISE_CATEGORY_STRENGTH,
) -> str:
    key = normalize_exercise_name_key(name)
    if not key:
        return default
    if key in stretching_keys:
        return EXERCISE_CATEGORY_STRETCHING
    json_cat = json_categories.get(key)
    if json_cat in (EXERCISE_CATEGORY_STRENGTH, EXERCISE_CATEGORY_STRETCHING):
        return json_cat
    return default


def collect_referenced_strength_names(conn: sqlite3.Connection) -> set[str]:
    """Exercise names referenced by strength workouts, templates, and sets (all users)."""
    keys: set[str] = set()
    queries = (
        """
        SELECT DISTINCT TRIM(exercise) AS name
        FROM strength_workouts
        WHERE exercise IS NOT NULL AND TRIM(exercise) != ''
        """,
        """
        SELECT DISTINCT TRIM(exercise_name) AS name
        FROM preset_exercises
        WHERE exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
        """,
        """
        SELECT DISTINCT TRIM(esi.exercise_name) AS name
        FROM exercise_set_items esi
        WHERE esi.exercise_name IS NOT NULL AND TRIM(esi.exercise_name) != ''
        """,
        """
        SELECT DISTINCT TRIM(exercise) AS name
        FROM workout_exercise_template
        WHERE exercise IS NOT NULL AND TRIM(exercise) != ''
        """,
    )
    for sql in queries:
        try:
            rows = conn.execute(sql).fetchall()
        except sqlite3.Error:
            continue
        for row in rows:
            key = normalize_exercise_name_key(str(row[0] or ""))
            if key:
                keys.add(key)
    return keys


def is_strength_catalog_name(
    name: str,
    *,
    json_categories: dict[str, str],
    stretching_keys: set[str],
) -> bool:
    return (
        classify_exercise_name(
            name,
            json_categories=json_categories,
            stretching_keys=stretching_keys,
        )
        == EXERCISE_CATEGORY_STRENGTH
    )


def free_exercise_db_strength_import_keys(json_categories: dict[str, str]) -> set[str]:
    return {
        key
        for key, cat in json_categories.items()
        if cat == EXERCISE_CATEGORY_STRENGTH
    }


def _backfill_shared_strength_categories(
    conn: sqlite3.Connection,
    strength_table: str,
    json_categories: dict[str, str],
    stretching_keys: set[str],
) -> None:
    rows = conn.execute(
        f"SELECT id, name, category FROM {strength_table} WHERE TRIM(name) != ''"
    ).fetchall()
    for row_id, name, legacy_category in rows:
        title = str(name or "").strip()
        legacy = str(legacy_category or "").strip().lower()
        if legacy in (EXERCISE_CATEGORY_STRENGTH, EXERCISE_CATEGORY_STRETCHING):
            category = legacy
        else:
            category = classify_exercise_name(
                title,
                json_categories=json_categories,
                stretching_keys=stretching_keys,
            )
        conn.execute(
            f"UPDATE {strength_table} SET exercise_category = ? WHERE id = ?",
            (category, int(row_id)),
        )


def _backfill_stretching_categories(conn: sqlite3.Connection, stretching_table: str) -> None:
    conn.execute(
        f"""
        UPDATE {stretching_table}
        SET exercise_category = ?
        WHERE COALESCE(exercise_category, '') != ?
        """,
        (EXERCISE_CATEGORY_STRETCHING, EXERCISE_CATEGORY_STRETCHING),
    )


def _backfill_user_strength_categories(
    conn: sqlite3.Connection,
    json_categories: dict[str, str],
    stretching_keys: set[str],
) -> None:
    rows = conn.execute(
        """
        SELECT id, name FROM user_strength_exercises
        WHERE TRIM(name) != ''
        """
    ).fetchall()
    for row_id, name in rows:
        category = classify_exercise_name(
            str(name or ""),
            json_categories=json_categories,
            stretching_keys=stretching_keys,
        )
        conn.execute(
            "UPDATE user_strength_exercises SET exercise_category = ? WHERE id = ?",
            (category, int(row_id)),
        )


def _cleanup_shared_strength_rows(
    conn: sqlite3.Connection,
    strength_table: str,
    referenced_keys: set[str],
    json_categories: dict[str, str],
    strength_import_keys: set[str],
) -> tuple[int, int]:
    """Remove unreferenced bulk-import noise; reclassify referenced stretching rows."""
    deleted = 0
    reclassified = 0
    rows = conn.execute(
        f"SELECT id, name, exercise_category FROM {strength_table}"
    ).fetchall()
    for row_id, name, category in rows:
        title = str(name or "").strip()
        key = normalize_exercise_name_key(title)
        if not key:
            conn.execute(f"DELETE FROM {strength_table} WHERE id = ?", (int(row_id),))
            deleted += 1
            continue
        cat = str(category or EXERCISE_CATEGORY_STRENGTH)
        if cat == EXERCISE_CATEGORY_STRETCHING:
            if key in referenced_keys:
                reclassified += 1
                continue
            conn.execute(f"DELETE FROM {strength_table} WHERE id = ?", (int(row_id),))
            deleted += 1
            continue
        if (
            key in strength_import_keys
            and not name_has_cyrillic(title)
            and key not in referenced_keys
        ):
            conn.execute(f"DELETE FROM {strength_table} WHERE id = ?", (int(row_id),))
            deleted += 1
    return deleted, reclassified


def _cleanup_user_strength_rows(
    conn: sqlite3.Connection,
    referenced_keys: set[str],
    json_categories: dict[str, str],
    stretching_keys: set[str],
) -> int:
    deleted = 0
    rows = conn.execute(
        """
        SELECT id, name, exercise_category
        FROM user_strength_exercises
        WHERE TRIM(name) != ''
        """
    ).fetchall()
    for row_id, name, category in rows:
        title = str(name or "").strip()
        key = normalize_exercise_name_key(title)
        cat = str(category or EXERCISE_CATEGORY_STRENGTH)
        if cat == EXERCISE_CATEGORY_STRETCHING and key not in referenced_keys:
            conn.execute(
                "DELETE FROM user_strength_exercises WHERE id = ?",
                (int(row_id),),
            )
            deleted += 1
            continue
        if (
            not is_strength_catalog_name(
                title,
                json_categories=json_categories,
                stretching_keys=stretching_keys,
            )
            and key not in referenced_keys
        ):
            conn.execute(
                "DELETE FROM user_strength_exercises WHERE id = ?",
                (int(row_id),),
            )
            deleted += 1
    return deleted


def run_exercise_category_migration(
    conn: sqlite3.Connection,
    *,
    strength_table: str,
    stretching_table: str,
    json_path: Path | None = None,
) -> dict[str, int]:
    """
    Add exercise_category, backfill, and clean shared strength catalog pollution.
    Expects shared.db attached when using qualified table names.
    """
    json_categories = load_free_exercise_db_categories(json_path)
    stretching_keys = collect_stretching_name_keys(conn, shared_table=stretching_table)
    stretching_keys.update(
        key
        for key, cat in json_categories.items()
        if cat == EXERCISE_CATEGORY_STRETCHING
    )
    strength_import_keys = free_exercise_db_strength_import_keys(json_categories)
    referenced_keys = collect_referenced_strength_names(conn)

    _ensure_attached_column(conn, strength_table, EXERCISE_CATEGORY_STRENGTH)
    _ensure_attached_column(conn, stretching_table, EXERCISE_CATEGORY_STRETCHING)

    _backfill_shared_strength_categories(
        conn, strength_table, json_categories, stretching_keys
    )
    _backfill_stretching_categories(conn, stretching_table)
    if _table_exists(conn, "user_strength_exercises"):
        _ensure_attached_column(
            conn, "user_strength_exercises", EXERCISE_CATEGORY_STRENGTH
        )
        _backfill_user_strength_categories(conn, json_categories, stretching_keys)

    deleted_shared, reclassified = _cleanup_shared_strength_rows(
        conn,
        strength_table,
        referenced_keys,
        json_categories,
        strength_import_keys,
    )
    deleted_user = 0
    if _table_exists(conn, "user_strength_exercises"):
        deleted_user = _cleanup_user_strength_rows(
            conn, referenced_keys, json_categories, stretching_keys
        )

    if _table_exists(conn, "user_strength_exercises"):
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_user_strength_exercises_category
            ON user_strength_exercises(user_id, exercise_category, is_archived)
            """
        )

    return {
        "deleted_shared_strength": deleted_shared,
        "reclassified_shared_stretching_kept": reclassified,
        "deleted_user_strength": deleted_user,
        "referenced_strength_names": len(referenced_keys),
    }


def _table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
        (table,),
    ).fetchone()
    return row is not None


def _ensure_attached_column(
    conn: sqlite3.Connection, qualified_table: str, default: str
) -> None:
    """Add exercise_category on main or attached shared table."""
    if "." in qualified_table:
        schema, table = qualified_table.split(".", 1)
        rows = conn.execute(
            "SELECT name FROM pragma_table_info(?, ?)", (table, schema)
        ).fetchall()
        cols = {r[0] for r in rows}
    else:
        rows = conn.execute(f"PRAGMA table_info({qualified_table})").fetchall()
        cols = {r[1] for r in rows}
    if "exercise_category" in cols:
        return
    if default not in (EXERCISE_CATEGORY_STRENGTH, EXERCISE_CATEGORY_STRETCHING):
        raise ValueError(f"Unsupported exercise_category default: {default!r}")
    conn.execute(
        f"""
        ALTER TABLE {qualified_table}
        ADD COLUMN exercise_category TEXT NOT NULL DEFAULT '{default}'
        """
    )
