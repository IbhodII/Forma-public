# -*- coding: utf-8 -*-
"""
Единая точка доступа к SQLite: workouts.db (личные данные) + ATTACH shared.db.

Пока один пользователь (id=1); позже get_current_user_id() возьмёт id из сессии/JWT.
"""
from __future__ import annotations

import sqlite3
from typing import Any

from database.connection import (
    SHARED_SCHEMA,
    SHARED_TABLES,
    WORKOUTS_DB_PATH,
    attach_shared,
    is_shared_attached,
    open_db,
    shared_table as _conn_shared_table,
)

from backend.database.request_context import get_request_user_id

DEFAULT_USER_ID = 1

_FOOD_PRODUCT_LEGACY_COLUMNS: tuple[tuple[str, str], ...] = (
    ("fiber_g", "REAL DEFAULT 0"),
    ("vitamin_a_mcg", "REAL DEFAULT 0"),
    ("vitamin_c_mg", "REAL DEFAULT 0"),
    ("vitamin_d_mcg", "REAL DEFAULT 0"),
    ("vitamin_e_mg", "REAL DEFAULT 0"),
    ("vitamin_k_mcg", "REAL DEFAULT 0"),
    ("vitamin_b1_mg", "REAL DEFAULT 0"),
    ("vitamin_b2_mg", "REAL DEFAULT 0"),
    ("vitamin_b3_mg", "REAL DEFAULT 0"),
    ("vitamin_b5_mg", "REAL DEFAULT 0"),
    ("vitamin_b6_mg", "REAL DEFAULT 0"),
    ("vitamin_b7_mcg", "REAL DEFAULT 0"),
    ("vitamin_b9_mcg", "REAL DEFAULT 0"),
    ("vitamin_b12_mcg", "REAL DEFAULT 0"),
    ("choline_mg", "REAL DEFAULT 0"),
    ("calcium_mg", "REAL DEFAULT 0"),
    ("phosphorus_mg", "REAL DEFAULT 0"),
    ("magnesium_mg", "REAL DEFAULT 0"),
    ("potassium_mg", "REAL DEFAULT 0"),
    ("sodium_mg", "REAL DEFAULT 0"),
    ("chlorine_mg", "REAL DEFAULT 0"),
    ("sulfur_mg", "REAL DEFAULT 0"),
    ("iron_mg", "REAL DEFAULT 0"),
    ("zinc_mg", "REAL DEFAULT 0"),
    ("iodine_mcg", "REAL DEFAULT 0"),
    ("copper_mg", "REAL DEFAULT 0"),
    ("manganese_mg", "REAL DEFAULT 0"),
    ("selenium_mcg", "REAL DEFAULT 0"),
    ("molybdenum_mcg", "REAL DEFAULT 0"),
    ("chromium_mcg", "REAL DEFAULT 0"),
    ("omega3_g", "REAL DEFAULT 0"),
    ("omega6_g", "REAL DEFAULT 0"),
    ("unit", "TEXT NOT NULL DEFAULT 'g'"),
    ("is_composite", "INTEGER NOT NULL DEFAULT 0"),
    ("is_alcohol", "INTEGER NOT NULL DEFAULT 0"),
    ("external_id", "TEXT"),
    ("default_portion_g", "REAL DEFAULT NULL"),
)


def _table_exists(conn: sqlite3.Connection, table_expr: str, table_name: str) -> bool:
    if table_expr == "shared":
        row = conn.execute(
            f"SELECT 1 FROM {SHARED_SCHEMA}.sqlite_master "
            "WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table_name,),
        ).fetchone()
    return row is not None


def _ensure_column(
    conn: sqlite3.Connection,
    table_expr: str,
    table_name: str,
    col: str,
    typedef: str,
) -> None:
    if not _table_exists(conn, table_expr, table_name):
        return
    if table_expr == "shared":
        try:
            rows = conn.execute(
                "SELECT name FROM pragma_table_info(?, ?)",
                (table_name, "shared"),
            ).fetchall()
            cols = {r[0] for r in rows}
        except sqlite3.OperationalError:
            rows = conn.execute(f"PRAGMA shared.table_info({table_name!r})").fetchall()
            cols = {r[1] for r in rows}
    else:
        rows = conn.execute(f"PRAGMA table_info({table_name!r})").fetchall()
        cols = {r[1] for r in rows}
    if col not in cols:
        conn.execute(f"ALTER TABLE {table_expr}.{table_name} ADD COLUMN {col} {typedef}")


def _repair_food_products_null_ids(conn: sqlite3.Connection) -> None:
    """Legacy shared.food_products: id INT without AUTOINCREMENT leaves new rows with id NULL."""
    if not _table_exists(conn, "shared", "food_products"):
        return
    try:
        null_rows = conn.execute(
            "SELECT rowid FROM shared.food_products WHERE id IS NULL ORDER BY rowid"
        ).fetchall()
    except sqlite3.OperationalError:
        return
    if not null_rows:
        return
    max_id = int(
        conn.execute("SELECT COALESCE(MAX(id), 0) FROM shared.food_products").fetchone()[0]
        or 0
    )
    for (rowid,) in null_rows:
        max_id += 1
        conn.execute(
            "UPDATE shared.food_products SET id = ? WHERE rowid = ?",
            (max_id, rowid),
        )


def repair_forma_sync_tracking() -> None:
    """One-time per process: FormaSync columns on workouts tables (legacy DBs)."""
    conn = open_db(attach=True)
    try:
        _repair_forma_sync_tracking_columns(conn)
        try:
            conn.commit()
        except sqlite3.OperationalError:
            pass
    finally:
        conn.close()


def _repair_forma_sync_tracking_columns(conn: sqlite3.Connection) -> None:
    """Legacy DBs may lack FormaSync columns on daily_bracelet_calories etc."""
    try:
        from database.migrations import _migration_v059_forma_sync_tracking

        _migration_v059_forma_sync_tracking(conn)
    except Exception:
        pass


def _repair_shared_legacy_columns(conn: sqlite3.Connection) -> None:
    """
    Idempotent repair for packaged/legacy DBs: add columns the app SELECTs but old seeds lack.
    Runs on every connection — migrations may succeed without applying all ALTERs.
    """
    try:
        from database.migrations import (
            _migration_v024_food_products_fiber_g,
            _migration_v038_stretching_images_json,
            _migration_v047_food_entries_drop_product_fk,
        )

        _migration_v024_food_products_fiber_g(conn)
        _migration_v038_stretching_images_json(conn)
        _migration_v047_food_entries_drop_product_fk(conn)
    except Exception:
        pass

    for col, typedef in _FOOD_PRODUCT_LEGACY_COLUMNS:
        _ensure_column(conn, "shared", "food_products", col, typedef)

    _repair_food_products_null_ids(conn)

    _ensure_column(conn, "shared", "meal_templates", "phase", "TEXT NOT NULL DEFAULT 'cut'")
    _ensure_column(conn, "shared", "daily_meal_plans", "phase", "TEXT NOT NULL DEFAULT 'cut'")
    _ensure_column(conn, "shared", "daily_meal_plans", "description", "TEXT")
    _ensure_column(conn, "shared", "daily_meal_plans", "is_custom", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "shared", "daily_meal_plans", "is_weekly", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "shared", "daily_meal_plan_templates", "template_id", "INTEGER")
    _ensure_column(conn, "shared", "meal_plan_items", "plan_id", "INTEGER")
    _ensure_column(conn, "shared", "meal_plan_items", "day_offset", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(conn, "shared", "meal_plan_items", "meal_type", "TEXT NOT NULL DEFAULT 'breakfast1'")

    _ensure_column(conn, "shared", "stretching_exercises", "images_json", "TEXT")
    _ensure_column(conn, "shared", "stretching_exercises", "original_name", "TEXT")
    _ensure_column(conn, "shared", "stretching_exercises", "original_description", "TEXT")
    _ensure_column(conn, "shared", "stretching_exercises", "target_muscle_group", "TEXT")
    _ensure_column(conn, "shared", "stretching_exercises", "translated", "INTEGER NOT NULL DEFAULT 0")
    _ensure_column(
        conn,
        "shared",
        "stretching_exercises",
        "description_translated",
        "INTEGER NOT NULL DEFAULT 0",
    )

    _ensure_column(conn, "main", "stretching_presets", "user_id", "INTEGER DEFAULT 1")
    _ensure_column(conn, "main", "stretching_presets", "is_active", "INTEGER DEFAULT 1")
    _ensure_column(conn, "main", "stretching_presets", "sort_order", "INTEGER DEFAULT 0")
    _ensure_column(
        conn,
        "main",
        "stretching_presets",
        "created_at",
        "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    )
    _ensure_column(
        conn,
        "main",
        "stretching_presets",
        "updated_at",
        "TIMESTAMP DEFAULT CURRENT_TIMESTAMP",
    )

    _ensure_column(conn, "main", "stretching_preset_exercises", "hold_seconds", "INTEGER DEFAULT 30")
    _ensure_column(conn, "main", "stretching_preset_exercises", "reps", "INTEGER DEFAULT 1")
    _ensure_column(conn, "main", "stretching_preset_exercises", "notes", "TEXT")
    _ensure_column(conn, "main", "stretching_preset_exercises", "exercise_order", "INTEGER DEFAULT 0")
    _ensure_column(conn, "main", "stretching_preset_exercises", "user_id", "INTEGER DEFAULT 1")

    _ensure_column(conn, "main", "stretching_log", "user_id", "INTEGER NOT NULL DEFAULT 1")
    _ensure_column(conn, "main", "stretching_log", "duration_minutes", "INTEGER DEFAULT 0")
    _ensure_column(conn, "main", "stretching_log", "notes", "TEXT")
    try:
        conn.commit()
    except sqlite3.OperationalError as err:
        if "locked" not in str(err).lower():
            raise
        conn.rollback()


def repair_shared_schema() -> None:
    """Repair legacy shared columns (for middleware retry and startup)."""
    conn = open_db(attach=True)
    try:
        _repair_shared_legacy_columns(conn)
    finally:
        conn.close()


def _ensure_shared_minimal_fallback(conn: sqlite3.Connection) -> None:
    """
    Safety net for legacy installs where shared migrations did not complete.
    Keeps Food/Stretching reference screens operational.
    """
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.food_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            protein REAL DEFAULT 0,
            fat REAL DEFAULT 0,
            carbs REAL DEFAULT 0,
            calories REAL DEFAULT 0,
            fiber_g REAL DEFAULT 0,
            vitamin_a_mcg REAL DEFAULT 0,
            vitamin_c_mg REAL DEFAULT 0,
            vitamin_d_mcg REAL DEFAULT 0,
            vitamin_e_mg REAL DEFAULT 0,
            vitamin_k_mcg REAL DEFAULT 0,
            vitamin_b1_mg REAL DEFAULT 0,
            vitamin_b2_mg REAL DEFAULT 0,
            vitamin_b3_mg REAL DEFAULT 0,
            vitamin_b5_mg REAL DEFAULT 0,
            vitamin_b6_mg REAL DEFAULT 0,
            vitamin_b7_mcg REAL DEFAULT 0,
            vitamin_b9_mcg REAL DEFAULT 0,
            vitamin_b12_mcg REAL DEFAULT 0,
            choline_mg REAL DEFAULT 0,
            calcium_mg REAL DEFAULT 0,
            phosphorus_mg REAL DEFAULT 0,
            magnesium_mg REAL DEFAULT 0,
            potassium_mg REAL DEFAULT 0,
            sodium_mg REAL DEFAULT 0,
            chlorine_mg REAL DEFAULT 0,
            sulfur_mg REAL DEFAULT 0,
            iron_mg REAL DEFAULT 0,
            zinc_mg REAL DEFAULT 0,
            iodine_mcg REAL DEFAULT 0,
            copper_mg REAL DEFAULT 0,
            manganese_mg REAL DEFAULT 0,
            selenium_mcg REAL DEFAULT 0,
            molybdenum_mcg REAL DEFAULT 0,
            chromium_mcg REAL DEFAULT 0,
            omega3_g REAL DEFAULT 0,
            omega6_g REAL DEFAULT 0,
            unit TEXT NOT NULL DEFAULT 'g',
            is_composite INTEGER NOT NULL DEFAULT 0,
            is_alcohol INTEGER NOT NULL DEFAULT 0,
            external_id TEXT
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.food_product_components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            component_product_id INTEGER NOT NULL,
            quantity REAL NOT NULL
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.meal_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            meal_type TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut'
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.meal_template_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 100
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.daily_meal_plans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut',
            description TEXT,
            is_custom INTEGER NOT NULL DEFAULT 0,
            is_weekly INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.daily_meal_plan_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            template_id INTEGER,
            meal_type TEXT NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.meal_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL DEFAULT 'breakfast1',
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 100
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {SHARED_SCHEMA}.stretching_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            original_name TEXT,
            description TEXT,
            original_description TEXT,
            target_muscle_group TEXT,
            images_json TEXT,
            translated INTEGER NOT NULL DEFAULT 0,
            description_translated INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS stretching_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER DEFAULT 1,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS stretching_preset_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            hold_seconds INTEGER DEFAULT 30,
            reps INTEGER DEFAULT 1,
            notes TEXT,
            exercise_order INTEGER DEFAULT 0,
            user_id INTEGER DEFAULT 1
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS stretching_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            preset_id INTEGER,
            duration_minutes INTEGER DEFAULT 0,
            notes TEXT
        )
        """
    )

    _repair_shared_legacy_columns(conn)


def get_current_user_id() -> int:
    """Активный пользователь из X-User-ID (middleware)."""
    uid = get_request_user_id()
    if uid is not None:
        return int(uid)
    return DEFAULT_USER_ID


def get_db() -> sqlite3.Connection:
    """Соединение с workouts.db и attached shared.db для текущего пользователя."""
    return get_user_db(get_current_user_id())


def get_user_db(user_id: int | None = None) -> sqlite3.Connection:
    """
    Соединение с workouts.db (+ shared). user_id для SQL — через get_current_user_id()
    или аргумент user_filter(); на объект Connection не вешаем (Python 3.12+).
    """
    conn = open_db(attach=True)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        from database.shared_schema import ensure_shared_schema

        ensure_shared_schema(conn)
    except Exception:
        _ensure_shared_minimal_fallback(conn)
    else:
        _repair_shared_legacy_columns(conn)
    try:
        from backend.utils.api_profiling import _profile_enabled, wrap_connection

        if _profile_enabled.get():
            return wrap_connection(conn)
    except Exception:
        pass
    return conn


def get_shared_db() -> sqlite3.Connection:
    """
    Доступ к общим справочникам: то же соединение, таблицы — shared.<name>.
    """
    conn = get_db()
    if not is_shared_attached(conn):
        attach_shared(conn)
    return conn


def is_shared_table(name: str) -> bool:
    return name in SHARED_TABLES


def shared_table(name: str) -> str:
    return _conn_shared_table(name)


def database_paths() -> dict[str, str]:
    """Пути файлов БД (для health-check и диагностики)."""
    from database.connection import SHARED_DB_PATH

    return {
        "workouts": str(WORKOUTS_DB_PATH.resolve()),
        "shared": str(SHARED_DB_PATH.resolve()),
    }


def list_attached_schemas(conn: sqlite3.Connection) -> list[tuple[Any, ...]]:
    return list(conn.execute("PRAGMA database_list").fetchall())


def user_filter(
    alias: str = "",
    user_id: int | None = None,
) -> tuple[str, list[int]]:
    """
    Фрагмент SQL и параметры: «alias.user_id = ?».
    """
    uid = int(user_id) if user_id is not None else get_current_user_id()
    prefix = f"{alias}." if alias else ""
    return f"{prefix}user_id = ?", [uid]


def merge_user_into_where(
    clauses: list[str],
    params: list[Any],
    *,
    alias: str = "",
    user_id: int | None = None,
) -> tuple[list[str], list[Any]]:
    """Добавляет условие user_id в начало списка (для личных таблиц)."""
    uf, up = user_filter(alias, user_id)
    return [uf, *clauses], up + list(params)


def sql_where_from_clauses(clauses: list[str]) -> str:
    if not clauses:
        return ""
    return " WHERE " + " AND ".join(clauses)
