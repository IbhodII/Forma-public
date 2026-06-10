# -*- coding: utf-8 -*-
"""Подключение к workouts.db с ATTACH shared.db для общих справочников."""
from __future__ import annotations

import os
import shutil
import sqlite3
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve_data_root() -> Path:
    """
    Persistent DB root for desktop package.
    - In Electron packaged mode, main process passes FORMA_DATA_DIR (userData).
    - In dev/CLI mode, fallback to repository root.
    """
    env_dir = os.environ.get("FORMA_DATA_DIR", "").strip()
    if env_dir:
        return Path(env_dir).expanduser()
    return PROJECT_ROOT


DATA_ROOT = _resolve_data_root()
WORKOUTS_DB_PATH = DATA_ROOT / "workouts.db"
SHARED_DB_PATH = DATA_ROOT / "shared.db"

SHARED_SCHEMA = "shared"
META_SPLIT_KEY = "db_split_shared_v1"

# Per-user meal plans live in workouts.db after migration v070 (see meal_plans_storage.py).
MEAL_PLAN_TABLES: frozenset[str] = frozenset(
    {
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
    }
)

# Таблицы в shared.db (общие справочники).
SHARED_TABLES: frozenset[str] = frozenset(
    {
        "food_products",
        "food_product_components",
        "stretching_exercises",
        "strength_exercises",
        "tire_coefficients",
        "surface_multipliers",
    }
)

# Порядок переноса: сначала родительские, затем зависимые; удаление — в обратном порядке.
_SHARED_COPY_PARENTS = (
    "food_products",
    "stretching_exercises",
    "strength_exercises",
    "tire_coefficients",
    "surface_multipliers",
)
_SHARED_COPY_CHILDREN = (
    "food_product_components",
)
_SHARED_DROP_ORDER = _SHARED_COPY_CHILDREN + _SHARED_COPY_PARENTS


def shared_table(name: str) -> str:
    """Квалифицированное имя таблицы в attached shared (включая legacy meal DDL)."""
    if name not in SHARED_TABLES and name not in MEAL_PLAN_TABLES:
        raise ValueError(f"Not a shared table: {name}")
    return f"{SHARED_SCHEMA}.{name}"


def is_shared_attached(conn: sqlite3.Connection) -> bool:
    rows = conn.execute("PRAGMA database_list").fetchall()
    return any(len(r) > 1 and r[1] == SHARED_SCHEMA for r in rows)


def attach_shared(conn: sqlite3.Connection) -> None:
    """Подключает shared.db как schema «shared»."""
    if is_shared_attached(conn):
        return
    SHARED_DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn.execute(
        f"ATTACH DATABASE ? AS {SHARED_SCHEMA}",
        (str(SHARED_DB_PATH.resolve()),),
    )


def open_db(*, attach: bool = True) -> sqlite3.Connection:
    """Соединение с workouts.db; по умолчанию с ATTACH shared.db."""
    conn = sqlite3.connect(WORKOUTS_DB_PATH, check_same_thread=False, timeout=30.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA busy_timeout = 30000")
    conn.execute("PRAGMA journal_mode = WAL")
    if attach:
        attach_shared(conn)
        try:
            conn.execute("PRAGMA shared.journal_mode = WAL")
        except sqlite3.Error:
            pass
    return conn


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type = 'table' AND name = ?",
            (table,),
        ).fetchone()
    return row is not None


def _split_already_done(conn: sqlite3.Connection) -> bool:
    try:
        row = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?", (META_SPLIT_KEY,)
        ).fetchone()
        return row is not None and str(row[0]) == "1"
    except sqlite3.Error:
        return False


def _mark_split_done(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        INSERT INTO app_meta (key, value) VALUES (?, '1')
        ON CONFLICT(key) DO UPDATE SET value = '1'
        """,
        (META_SPLIT_KEY,),
    )


def migrate_workouts_to_shared_split(conn: sqlite3.Connection) -> None:
    """
    Однократно переносит общие таблицы из main → shared и удаляет их из workouts.db.
    Перед запуском создаёт .pre-split.bak копии файлов БД.
    """
    if _split_already_done(conn):
        attach_shared(conn)
        return

    attach_shared(conn)

    if WORKOUTS_DB_PATH.exists():
        bak = WORKOUTS_DB_PATH.with_suffix(WORKOUTS_DB_PATH.suffix + ".pre-split.bak")
        if not bak.exists():
            shutil.copy2(WORKOUTS_DB_PATH, bak)
    if SHARED_DB_PATH.exists():
        bak = SHARED_DB_PATH.with_suffix(SHARED_DB_PATH.suffix + ".pre-split.bak")
        if not bak.exists():
            shutil.copy2(SHARED_DB_PATH, bak)

    for table in _SHARED_COPY_PARENTS + _SHARED_COPY_CHILDREN:
        if not _table_exists(conn, "main", table):
            continue
        if not _table_exists(conn, SHARED_SCHEMA, table):
            conn.execute(
                f"CREATE TABLE {SHARED_SCHEMA}.{table} AS SELECT * FROM main.{table}"
            )
        else:
            conn.execute(f"DELETE FROM {SHARED_SCHEMA}.{table}")
            conn.execute(
                f"INSERT INTO {SHARED_SCHEMA}.{table} SELECT * FROM main.{table}"
            )

    for table in _SHARED_DROP_ORDER:
        if _table_exists(conn, "main", table):
            conn.execute(f"DROP TABLE main.{table}")

    _mark_split_done(conn)
