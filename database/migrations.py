# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import sqlite3
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from database.connection import (
    SHARED_DB_PATH,
    SHARED_SCHEMA,
    WORKOUTS_DB_PATH as DB_PATH,
    attach_shared,
    is_shared_attached,
    migrate_workouts_to_shared_split,
    open_db,
    shared_table,
)
from utils.constants import EXERCISE_SET_DEFAULT_FROM, _TEMPLATE_SEED_DATE


def _sh(name: str) -> str:
    return shared_table(name)


_SHARED_PRAGMA_TABLES = frozenset(
    {
        "food_products",
        "food_product_components",
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "stretching_exercises",
        "tire_coefficients",
        "surface_multipliers",
    }
)


def _pragma_cols(conn: sqlite3.Connection, table: str) -> set[str]:
    """Список колонок таблицы main или attached shared (не PRAGMA table_info('shared.t'))."""
    if table in _SHARED_PRAGMA_TABLES:
        if not is_shared_attached(conn):
            attach_shared(conn)
        try:
            rows = conn.execute(
                "SELECT name FROM pragma_table_info(?, ?)",
                (table, SHARED_SCHEMA),
            ).fetchall()
            return {r[0] for r in rows}
        except sqlite3.OperationalError:
            rows = conn.execute(
                f"PRAGMA {SHARED_SCHEMA}.table_info({table!r})"
            ).fetchall()
            return {r[1] for r in rows}
    rows = conn.execute(f"PRAGMA table_info({table!r})").fetchall()
    return {r[1] for r in rows}


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    """Проверка существования таблицы в schema (main или attached)."""
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name = ?",
            (table,),
        ).fetchone()
    return row is not None


# Индексы на таблицах shared.db (создаются отдельным подключением — см. _ensure_shared_indexes).
# (table, index_name, columns, where_clause | None, unique)
_SHARED_INDEX_DEFS: tuple[tuple[str, str, str, str | None, bool], ...] = (
    ("food_product_components", "idx_food_product_components_pid", "product_id", None, False),
    ("meal_template_items", "idx_meal_template_items_tid", "template_id", None, False),
    ("daily_meal_plan_templates", "idx_meal_plan_templates_plan", "plan_id, sort_order", None, False),
    (
        "stretching_exercises",
        "idx_stretching_exercises_original_name",
        "original_name",
        "original_name IS NOT NULL",
        True,
    ),
)


def _ensure_shared_indexes() -> None:
    """
    CREATE INDEX ON shared.table(col) не поддерживается встроенным SQLite (near ".").
    Индексы создаём в shared.db без ATTACH, когда workouts.db не держит блокировку.
    """
    if not SHARED_DB_PATH.exists():
        return
    sc = sqlite3.connect(SHARED_DB_PATH, timeout=60.0)
    try:
        sc.execute("PRAGMA busy_timeout = 60000")
        for table, index_name, columns, where_clause, unique in _SHARED_INDEX_DEFS:
            unique_kw = "UNIQUE " if unique else ""
            sql = (
                f"CREATE {unique_kw}INDEX IF NOT EXISTS {index_name} "
                f"ON {table}({columns})"
            )
            if where_clause:
                sql += f" WHERE {where_clause}"
            sc.execute(sql)
        sc.commit()
    except sqlite3.OperationalError:
        pass
    finally:
        sc.close()

try:
    from utils.body_metrics import BODY_METRICS_FIELDS, BODY_COLUMN_ALIASES as _BODY_COLUMN_ALIASES
except ImportError:
    BODY_METRICS_FIELDS = ()  # type: ignore
    _BODY_COLUMN_ALIASES = {}  # type: ignore

def _ensure_meal_template_item_macros(conn: sqlite3.Connection) -> None:
    """БЖУ/ккал на 100 г для строки шаблона (если в Excel отличаются от справочника)."""
    cols = _pragma_cols(conn, "meal_template_items")
    if not cols:
        return

    for col in ("protein", "fat", "carbs", "calories"):
        if col not in cols:
            conn.execute(f"ALTER TABLE meal_template_items ADD COLUMN {col} REAL")


def _ensure_food_entry_macro_snapshot(conn: sqlite3.Connection) -> None:
    """Снимок БЖУ/ккал на 100 г при добавлении из шаблона."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(food_entries)")}
    if not cols:
        return
    for col in ("protein_per100", "fat_per100", "carbs_per100", "calories_per100"):
        if col not in cols:
            conn.execute(f"ALTER TABLE food_entries ADD COLUMN {col} REAL")


def _ensure_food_product_components(conn: sqlite3.Connection) -> None:
    """Состав многосоставных продуктов."""
    fp, fpc = _sh("food_products"), _sh("food_product_components")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {fpc} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            component_product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (product_id) REFERENCES food_products(id) ON DELETE CASCADE,
            FOREIGN KEY (component_product_id) REFERENCES food_products(id) ON DELETE CASCADE
        )
        """
    )


def _ensure_food_products_unified_schema(conn: sqlite3.Connection) -> None:
    """Единый справочник продуктов: без phase, UNIQUE(name), unit=g."""
    conn.row_factory = sqlite3.Row
    fp = _sh("food_products")
    fpc = _sh("food_product_components")
    mti = _sh("meal_template_items")
    cols = _pragma_cols(conn, "food_products")
    if not cols:
        return

    if "phase" not in cols:
        if "unit" not in cols:
            conn.execute(
                f"ALTER TABLE {fp} ADD COLUMN unit TEXT NOT NULL DEFAULT 'g'"
            )
        if "is_composite" not in cols:
            conn.execute(
                f"ALTER TABLE {fp} ADD COLUMN is_composite INTEGER NOT NULL DEFAULT 0"
            )
        if "is_alcohol" not in cols:
            conn.execute(
                f"ALTER TABLE {fp} ADD COLUMN is_alcohol INTEGER NOT NULL DEFAULT 0"
            )
        conn.execute(
            f"""
            UPDATE {fp} SET is_composite = 1
            WHERE id IN (SELECT DISTINCT product_id FROM {fpc})
            """
        )
        return

    rows = conn.execute(
        f"""
        SELECT id, name, protein, fat, carbs, calories
        FROM {fp} ORDER BY id
        """
    ).fetchall()

    fp_u = f"{SHARED_SCHEMA}.food_products_unified"
    conn.execute(
        f"""
        CREATE TABLE {fp_u} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            protein REAL,
            fat REAL,
            carbs REAL,
            calories REAL,
            unit TEXT NOT NULL DEFAULT 'g',
            is_composite INTEGER NOT NULL DEFAULT 0
        )
        """
    )

    id_map: dict[int, int] = {}
    groups: dict[str, list[Any]] = {}
    for row in rows:
        name = str(row["name"]).strip()
        key = name.lower()
        groups.setdefault(key, []).append(row)

    for group in groups.values():
        display_name = str(group[0]["name"]).strip()
        if len(group) == 1:
            r = group[0]
            protein = float(r["protein"] or 0)
            fat = float(r["fat"] or 0)
            carbs = float(r["carbs"] or 0)
            calories = float(r["calories"] or 0)
        else:
            n = len(group)
            protein = round(sum(float(r["protein"] or 0) for r in group) / n, 2)
            fat = round(sum(float(r["fat"] or 0) for r in group) / n, 2)
            carbs = round(sum(float(r["carbs"] or 0) for r in group) / n, 2)
            calories = round(sum(float(r["calories"] or 0) for r in group) / n, 2)
        cur = conn.execute(
            f"""
            INSERT INTO {fp_u} (name, protein, fat, carbs, calories, unit, is_composite)
            VALUES (?, ?, ?, ?, ?, 'g', 0)
            """,
            (display_name, protein, fat, carbs, calories),
        )
        new_id = int(cur.lastrowid)
        for r in group:
            id_map[int(r["id"])] = new_id

    for old_id, new_id in id_map.items():
        conn.execute(
            "UPDATE food_entries SET product_id = ? WHERE product_id = ?",
            (new_id, old_id),
        )
        conn.execute(
            f"UPDATE {mti} SET product_id = ? WHERE product_id = ?",
            (new_id, old_id),
        )
        conn.execute(
            f"UPDATE {fpc} SET product_id = ? WHERE product_id = ?",
            (new_id, old_id),
        )
        conn.execute(
            f"""
            UPDATE {fpc}
            SET component_product_id = ? WHERE component_product_id = ?
            """,
            (new_id, old_id),
        )

    conn.execute(f"DROP TABLE {fp}")
    conn.execute(f"ALTER TABLE {fp_u} RENAME TO food_products")
    conn.execute(
        f"""
        UPDATE {fp} SET is_composite = 1
        WHERE id IN (SELECT DISTINCT product_id FROM {fpc})
        """
    )
    conn.execute(
        f"""
        DELETE FROM {fpc}
        WHERE id NOT IN (
            SELECT MIN(id) FROM {fpc}
            GROUP BY product_id, component_product_id
        )
        """
    )


def _ensure_meal_template_extended_schema(conn: sqlite3.Connection) -> None:
    """source (лист Excel), description у рационов."""
    mt, dmp = _sh("meal_templates"), _sh("daily_meal_plans")
    tpl_cols = _pragma_cols(conn, "meal_templates")
    if tpl_cols and "source" not in tpl_cols:
        conn.execute(
            f"ALTER TABLE {mt} ADD COLUMN source TEXT NOT NULL DEFAULT ''"
        )
        conn.execute(
            f"""
            UPDATE {mt} SET source = CASE phase
                WHEN 'bulk' THEN 'Массонабор'
                ELSE 'Сушка'
            END
            WHERE source = '' OR source IS NULL
            """
        )
    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols and "description" not in plan_cols:
        conn.execute(
            f"ALTER TABLE {dmp} ADD COLUMN description TEXT"
        )
        conn.execute(
            f"""
            UPDATE {dmp} SET description = name
            WHERE description IS NULL OR description = ''
            """
        )
    _ensure_daily_meal_plans_is_custom(conn)


def _ensure_daily_meal_plans_is_custom(conn: sqlite3.Connection) -> None:
    """Флаг пользовательских рационов (не перезаписывать при импорте Excel)."""
    dmp = _sh("daily_meal_plans")
    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols and "is_custom" not in plan_cols:
        conn.execute(
            f"ALTER TABLE {dmp} ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0"
        )


def _ensure_weekly_meal_schedule(conn: sqlite3.Connection) -> None:
    """Привязка рационов к дням недели (0=пн … 6=вс, Python weekday)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS weekly_meal_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_of_week INTEGER NOT NULL,
            meal_plan_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1,
            UNIQUE(day_of_week, user_id)
        )
        """
    )


def _ensure_food_phase_products(conn: sqlite3.Connection) -> None:
    """Legacy phase на food_products (shared)."""
    fp = _sh("food_products")
    prod_cols = _pragma_cols(conn, "food_products")
    unified_products = bool(prod_cols) and "unit" in prod_cols and "phase" not in prod_cols
    if prod_cols and not unified_products and "phase" not in prod_cols:
        fp_new = f"{SHARED_SCHEMA}.food_products_new"
        conn.execute(
            f"""
            CREATE TABLE {fp_new} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                phase TEXT NOT NULL DEFAULT 'cut',
                protein REAL,
                fat REAL,
                carbs REAL,
                calories REAL,
                UNIQUE(name, phase)
            )
            """
        )
        conn.execute(
            f"""
            INSERT INTO {fp_new} (id, name, phase, protein, fat, carbs, calories)
            SELECT id, name, 'cut', protein, fat, carbs, calories FROM {fp}
            """
        )
        conn.execute(f"DROP TABLE {fp}")
        conn.execute(f"ALTER TABLE {fp_new} RENAME TO food_products")


def _ensure_food_phase_entries_and_goals(conn: sqlite3.Connection) -> None:
    """phase на food_entries и daily_nutrition_goals (личные таблицы)."""
    fp = _sh("food_products")
    prod_cols = _pragma_cols(conn, "food_products")
    unified_products = bool(prod_cols) and "unit" in prod_cols and "phase" not in prod_cols

    entry_cols = {r[1] for r in conn.execute("PRAGMA table_info(food_entries)")}
    if entry_cols and "phase" not in entry_cols:
        conn.execute(
            "ALTER TABLE food_entries ADD COLUMN phase TEXT NOT NULL DEFAULT 'cut'"
        )
        if not unified_products and prod_cols and "phase" in _pragma_cols(conn, "food_products"):
            conn.execute(
                f"""
                UPDATE food_entries
                SET phase = (
                    SELECT phase FROM {fp} p WHERE p.id = food_entries.product_id
                )
                WHERE product_id IS NOT NULL
                """
            )

    goal_info = conn.execute(
        """
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='daily_nutrition_goals'
        """
    ).fetchone()
    goal_sql = (goal_info[0] or "") if goal_info else ""
    if goal_info and "phase" not in goal_sql.lower():
        conn.execute(
            """
            CREATE TABLE daily_nutrition_goals_new (
                date TEXT NOT NULL,
                phase TEXT NOT NULL DEFAULT 'cut',
                protein_goal REAL,
                fat_goal REAL,
                carbs_goal REAL,
                calories_goal REAL,
                PRIMARY KEY (date, phase)
            )
            """
        )
        conn.execute(
            """
            INSERT INTO daily_nutrition_goals_new (
                date, phase, protein_goal, fat_goal, carbs_goal, calories_goal
            )
            SELECT date, 'cut', protein_goal, fat_goal, carbs_goal, calories_goal
            FROM daily_nutrition_goals
            """
        )
        conn.execute("DROP TABLE daily_nutrition_goals")
        conn.execute(
            "ALTER TABLE daily_nutrition_goals_new RENAME TO daily_nutrition_goals"
        )


def _ensure_nutrition_plan_schema(conn: sqlite3.Connection) -> None:
    """Таблица целей сушки/набора; при старой схеме переименовывает в nutrition_plan_legacy."""
    tables = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('nutrition_plan', 'nutrition_plan_legacy')"
        )
    }
    info: set[str] = set()
    if "nutrition_plan" in tables:
        info = {r[1] for r in conn.execute("PRAGMA table_info(nutrition_plan)")}
    new_cols = {
        "phase",
        "target_fat_percent",
        "target_weight_kg",
        "deficit_calories",
        "surplus_calories",
        "gain_rate_kg_per_week",
        "target_date",
        "updated_at",
    }
    if info and info != new_cols:
        if "nutrition_plan_legacy" in tables:
            conn.execute("DROP TABLE nutrition_plan")
        else:
            conn.execute("ALTER TABLE nutrition_plan RENAME TO nutrition_plan_legacy")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS nutrition_plan (
            phase TEXT PRIMARY KEY,
            target_fat_percent REAL,
            target_weight_kg REAL,
            deficit_calories REAL,
            surplus_calories REAL,
            gain_rate_kg_per_week REAL,
            target_date TEXT,
            updated_at TEXT
        )
        """
    )


# Текущая версия схемы workouts.db (увеличивать при добавлении миграции).

def _ensure_schema_version_table(conn: sqlite3.Connection) -> None:
    """Таблица с одной строкой — номер последней применённой миграции."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL CHECK (version >= 0)
        )
        """
    )
    row = conn.execute("SELECT version FROM schema_version LIMIT 1").fetchone()
    if row is None:
        conn.execute("INSERT INTO schema_version (version) VALUES (0)")


def get_schema_version(conn: sqlite3.Connection) -> int:
    """Версия схемы; при отсутствии таблицы создаёт её с version=0."""
    _ensure_schema_version_table(conn)
    row = conn.execute("SELECT version FROM schema_version LIMIT 1").fetchone()
    return int(row[0]) if row is not None else 0


def _set_schema_version(conn: sqlite3.Connection, version: int) -> None:
    if version < 0:
        raise ValueError("schema version must be >= 0")
    _ensure_schema_version_table(conn)
    updated = conn.execute(
        "UPDATE schema_version SET version = ?",
        (version,),
    ).rowcount
    if updated == 0:
        conn.execute("INSERT INTO schema_version (version) VALUES (?)", (version,))


def _apply_migration(
    conn: sqlite3.Connection,
    target_version: int,
    migrate_fn,
) -> None:
    """Выполнить migrate_fn только если текущая версия < target_version."""
    current = get_schema_version(conn)
    if current >= target_version:
        return
    migrate_fn(conn)
    _set_schema_version(conn, target_version)


def _migration_v001_workout_metric_columns(conn: sqlite3.Connection) -> None:
    # Fresh installs may start from an empty DB. Create baseline tables first
    # so early ALTER/UPDATE statements do not fail and block all migrations.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            workout_title TEXT,
            exercise TEXT,
            weight REAL,
            reps INTEGER,
            set_number INTEGER,
            order_index INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            avg_hr INTEGER,
            calories_chest INTEGER,
            calories_watch INTEGER,
            calories_hr INTEGER,
            epley_1rm REAL,
            preset_id INTEGER,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            duration_sec INTEGER,
            is_bodyweight INTEGER NOT NULL DEFAULT 0,
            is_circuit INTEGER NOT NULL DEFAULT 0,
            user_id INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT,
            duration_sec INTEGER,
            distance_km REAL,
            avg_hr INTEGER,
            max_hr INTEGER,
            calories INTEGER,
            notes TEXT,
            calories_chest INTEGER,
            calories_watch INTEGER,
            calories_hr INTEGER,
            swolf INTEGER,
            trimp REAL,
            user_id INTEGER NOT NULL DEFAULT 1
        )
        """
    )

    extras = {
        "strength_workouts": [
            ("avg_hr", "INTEGER"),
            ("calories_chest", "INTEGER"),
            ("calories_watch", "INTEGER"),
            ("calories_hr", "INTEGER"),
            ("epley_1rm", "REAL"),
            ("is_warmup", "INTEGER"),
        ],
        "cardio_workouts": [
            ("calories_chest", "INTEGER"),
            ("calories_watch", "INTEGER"),
            ("calories_hr", "INTEGER"),
            ("swolf", "INTEGER"),
            ("trimp", "REAL"),
        ],
    }
    for table, cols in extras.items():
        existing = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        for col, typ in cols:
            if col not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {typ}")
    for table in ("strength_workouts", "cardio_workouts"):
        info = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if "calories_hr" in info and "calories_chest" in info:
            conn.execute(
                f"UPDATE {table} SET calories_chest = calories_hr "
                f"WHERE calories_hr IS NOT NULL AND calories_chest IS NULL"
            )


def _migration_v002_body_metrics(conn: sqlite3.Connection) -> None:
    body_cols = BODY_METRICS_FIELDS or (
        "weight_kg",
        "body_fat_percent",
        "muscle_mass_kg",
        "chest_inhale_cm",
        "chest_exhale_cm",
        "chest_avg_cm",
        "bicep_left_cm",
        "bicep_right_cm",
        "bicep_avg_cm",
        "calf_left_cm",
        "calf_right_cm",
        "calf_avg_cm",
        "thigh_left_cm",
        "thigh_right_cm",
        "thigh_avg_cm",
        "forearm_left_cm",
        "forearm_right_cm",
        "waist_cm",
        "hips_cm",
        "ankle_cm",
        "wrist_cm",
        "neck_cm",
    )
    cols_sql = ", ".join(f"{c} REAL" for c in body_cols)
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS body_metrics (
            date TEXT PRIMARY KEY,
            {cols_sql}
        )
        """
    )
    existing_body = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
    for col in body_cols:
        if col not in existing_body:
            conn.execute(f"ALTER TABLE body_metrics ADD COLUMN {col} REAL")
    try:
        aliases = _BODY_COLUMN_ALIASES
    except NameError:
        aliases = {}
    for old_name, new_name in aliases.items():
        if old_name in existing_body and new_name in existing_body:
            conn.execute(
                f"""
                UPDATE body_metrics SET {new_name} = {old_name}
                WHERE {new_name} IS NULL AND {old_name} IS NOT NULL
                """
            )


def _migration_v003_workout_exercise_template(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_exercise_template (
            workout_title TEXT NOT NULL,
            effective_from TEXT NOT NULL,
            sort_order INTEGER NOT NULL,
            exercise TEXT NOT NULL,
            PRIMARY KEY (workout_title, effective_from, exercise)
        )
        """
    )
    _seed_workout_exercise_templates(conn)


def _migration_v004_exercise_sets(conn: sqlite3.Connection) -> None:
    _ensure_exercise_sets_schema(conn)


def _migration_v005_daily_weight(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_weight (
            date TEXT PRIMARY KEY,
            weight_kg REAL NOT NULL,
            body_fat_percent REAL
        )
        """
    )


def _migration_v006_nutrition_plan(conn: sqlite3.Connection) -> None:
    _ensure_nutrition_plan_schema(conn)


def _migration_v007_food_diary_tables(conn: sqlite3.Connection) -> None:
    _drop_legacy_food_log(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS food_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut',
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 100,
            meal_type TEXT NOT NULL,
            notes TEXT
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_food_entries_date ON food_entries(date)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_nutrition_goals (
            date TEXT NOT NULL,
            protein_goal REAL,
            fat_goal REAL,
            carbs_goal REAL,
            calories_goal REAL
        )
        """
    )
    _ensure_food_entry_macro_snapshot(conn)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migration_v008_user_profile(conn: sqlite3.Connection) -> None:
    _ensure_user_profile_table(conn)


def _migration_v009_strength_epley_backfill(conn: sqlite3.Connection) -> None:
    _backfill_strength_epley_1rm(conn)


def _migration_v010_sync_import(conn: sqlite3.Connection) -> None:
    _ensure_sync_import_tables(conn)


def _migration_v011_workout_presets(conn: sqlite3.Connection) -> None:
    _ensure_workout_presets_schema(conn)


def _migration_v012_cardio_type_settings(conn: sqlite3.Connection) -> None:
    _ensure_cardio_type_settings_schema(conn)


def _migration_v013_stretching_personal(conn: sqlite3.Connection) -> None:
    _ensure_stretching_personal_schema(conn)


def _migration_v014_menstrual_cycle(conn: sqlite3.Connection) -> None:
    _ensure_menstrual_cycle_schema(conn)


def _migration_v015_all_exercises(conn: sqlite3.Connection) -> None:
    _ensure_all_exercises_schema(conn)


def _migration_v018_workout_heart_rate_source_type(conn: sqlite3.Connection) -> None:
    """Тип владельца ряда пульса: cardio | strength (пока по умолчанию cardio)."""
    _ensure_workout_heart_rate_source_type_column(conn)


def _ensure_workout_heart_rate_source_type_column(conn: sqlite3.Connection) -> None:
    cols = _pragma_cols(conn, "workout_heart_rate")
    if not cols or "source_type" in cols:
        return
    conn.execute(
        "ALTER TABLE workout_heart_rate ADD COLUMN source_type TEXT DEFAULT 'cardio'"
    )
    conn.execute(
        "UPDATE workout_heart_rate SET source_type = 'cardio' WHERE source_type IS NULL"
    )


def _migration_v019_polar_pending_and_tokens(conn: sqlite3.Connection) -> None:
    """Очередь тренировок Polar, OAuth-токены; source_type на workout_heart_rate (идемпотентно)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS polar_pending_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            polar_transaction_id TEXT NOT NULL UNIQUE,
            date TEXT,
            type TEXT,
            duration_sec INTEGER,
            distance_km REAL,
            calories INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            raw_data TEXT,
            imported INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_polar_pending_imported
        ON polar_pending_workouts(imported)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS polar_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            access_token TEXT,
            refresh_token TEXT,
            user_id TEXT,
            expires_at INTEGER,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    _ensure_workout_heart_rate_source_type_column(conn)


def _migration_v022_user_profile_calorie_control(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "max_deficit_per_kg_fat" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN max_deficit_per_kg_fat REAL DEFAULT 35"
        )
    if "target_bulk_grams_per_week" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN target_bulk_grams_per_week REAL DEFAULT 300"
        )


def _migration_v023_use_chest_strap_priority(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "use_chest_strap_priority" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN use_chest_strap_priority INTEGER NOT NULL DEFAULT 1"
        )


def _ensure_cloud_tokens_table(conn: sqlite3.Connection) -> None:
    """OAuth-токены облачных провайдеров (Яндекс.Диск, Google Drive)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cloud_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(provider)
        )
        """
    )


def _migration_v026_cloud_tokens(conn: sqlite3.Connection) -> None:
    _ensure_cloud_tokens_table(conn)


def _migration_v027_strength_order_index(conn: sqlite3.Connection) -> None:
    """Порядок подходов в силовой тренировке (чередование упражнений)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "order_index" not in cols:
        conn.execute(
            "ALTER TABLE strength_workouts ADD COLUMN order_index INTEGER NOT NULL DEFAULT 0"
        )


def _add_user_id_column(conn: sqlite3.Connection, table: str) -> None:
    """user_id на личной таблице workouts.db (main)."""
    if not _table_exists(conn, "main", table):
        return
    cols = _pragma_cols(conn, table)
    if not cols or "user_id" in cols:
        return
    conn.execute(
        f"ALTER TABLE {table} ADD COLUMN user_id INTEGER NOT NULL DEFAULT {DEFAULT_USER_ID}"
    )
    conn.execute(
        f"UPDATE {table} SET user_id = {DEFAULT_USER_ID} WHERE user_id IS NULL"
    )


# Личные таблицы workouts.db (не shared, не user_profile).
_PERSONAL_USER_TABLES: tuple[str, ...] = (
    "strength_workouts",
    "cardio_workouts",
    "exercise_sets",
    "exercise_set_items",
    "body_metrics",
    "daily_weight",
    "food_entries",
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
)


def _backfill_user_id_from_parent(
    conn: sqlite3.Connection,
    child: str,
    parent: str,
    *,
    child_fk: str,
    parent_pk: str = "id",
) -> None:
    if not _table_exists(conn, "main", child) or not _table_exists(conn, "main", parent):
        return
    child_cols = _pragma_cols(conn, child)
    parent_cols = _pragma_cols(conn, parent)
    if not child_cols or "user_id" not in child_cols:
        return
    if not parent_cols or "user_id" not in parent_cols:
        return
    conn.execute(
        f"""
        UPDATE {child}
        SET user_id = (
            SELECT p.user_id FROM {parent} p
            WHERE p.{parent_pk} = {child}.{child_fk}
        )
        WHERE {child_fk} IS NOT NULL
          AND (user_id IS NULL OR user_id = 0)
        """
    )


def _migration_v035_user_id_columns(conn: sqlite3.Connection) -> None:
    """
    Multi-user подготовка: user_id на личных таблицах, общие справочники в shared.db.
    """
    migrate_workouts_to_shared_split(conn)
    from database.shared_schema import ensure_shared_schema

    ensure_shared_schema(conn)

    for table in _PERSONAL_USER_TABLES:
        _add_user_id_column(conn, table)

    _backfill_user_id_from_parent(
        conn, "exercise_set_items", "exercise_sets", child_fk="set_id"
    )
    _backfill_user_id_from_parent(
        conn, "gps_tracks", "cardio_workouts", child_fk="cardio_workout_id"
    )
    _backfill_user_id_from_parent(
        conn, "workout_sensors", "cardio_workouts", child_fk="cardio_workout_id"
    )
    _backfill_user_id_from_parent(
        conn, "workout_heart_rate", "cardio_workouts", child_fk="cardio_workout_id"
    )

    for table in _PERSONAL_USER_TABLES:
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)"
        )


def _migration_v038_stretching_images_json(conn: sqlite3.Connection) -> None:
    """Пути к иллюстрациям free-exercise-db (JSON-массив)."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    se = _sh("stretching_exercises")
    cols = _pragma_cols(conn, "stretching_exercises")
    if cols and "images_json" not in cols:
        conn.execute(f"ALTER TABLE {se} ADD COLUMN images_json TEXT")


def _stretching_exercises_ddl(conn: sqlite3.Connection) -> str:
    if not is_shared_attached(conn):
        attach_shared(conn)
    row = conn.execute(
        """
        SELECT sql FROM shared.sqlite_master
        WHERE type = 'table' AND name = 'stretching_exercises'
        """
    ).fetchone()
    return str(row[0] or "") if row else ""


def _stretching_exercises_needs_pk_rebuild(conn: sqlite3.Connection) -> bool:
    ddl = _stretching_exercises_ddl(conn).upper()
    if not ddl:
        return False
    return "AUTOINCREMENT" not in ddl or "PRIMARY KEY" not in ddl


def _migration_v039_stretching_exercises_pk(conn: sqlite3.Connection) -> None:
    """
    Восстановить PRIMARY KEY AUTOINCREMENT на stretching_exercises (после ошибочного переноса в shared.db).
    """
    if not is_shared_attached(conn):
        attach_shared(conn)
    if not _table_exists(conn, "shared", "stretching_exercises"):
        _ensure_shared_stretching_exercises(conn)
        return
    if not _stretching_exercises_needs_pk_rebuild(conn):
        return

    se = _sh("stretching_exercises")
    tmp = "shared.stretching_exercises__pk_fix"
    conn.execute(
        f"""
        CREATE TABLE {tmp} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            target_muscle_group TEXT,
            description TEXT,
            original_name TEXT,
            translated INTEGER NOT NULL DEFAULT 0,
            original_description TEXT,
            description_translated INTEGER NOT NULL DEFAULT 0,
            images_json TEXT
        )
        """
    )
    cols = _pragma_cols(conn, "stretching_exercises")
    copy_cols = [
        c
        for c in (
            "name",
            "target_muscle_group",
            "description",
            "original_name",
            "translated",
            "original_description",
            "description_translated",
            "images_json",
        )
        if c in cols
    ]
    if copy_cols:
        col_sql = ", ".join(copy_cols)
        conn.execute(
            f"""
            INSERT INTO {tmp} ({col_sql})
            SELECT {col_sql} FROM {se}
            """
        )
    conn.execute(f"DROP TABLE {se}")
    conn.execute(f"ALTER TABLE {tmp} RENAME TO stretching_exercises")


def _stretching_preset_exercises_has_bad_exercise_fk(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='stretching_preset_exercises'"
    ).fetchone()
    if not row or not row[0]:
        return False
    ddl = str(row[0]).upper()
    if "REFERENCES STRETCHING_EXERCISES" not in ddl:
        return False
    main_exists = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='stretching_exercises'"
    ).fetchone()
    return main_exists is None


def _migration_v040_stretching_preset_exercises_fk(conn: sqlite3.Connection) -> None:
    """
    Убрать FK exercise_id → main.stretching_exercises (таблица перенесена в shared.db).
  Проверка существования упражнения — в stretching_service._save_preset_exercises.
    """
    if not _table_exists(conn, "main", "stretching_preset_exercises"):
        return
    if not _stretching_preset_exercises_has_bad_exercise_fk(conn):
        return
    conn.execute("PRAGMA foreign_keys = OFF")
    try:
        conn.execute(
            """
            CREATE TABLE stretching_preset_exercises__fk_fix (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preset_id INTEGER NOT NULL,
                exercise_id INTEGER NOT NULL,
                hold_seconds INTEGER DEFAULT 30,
                reps INTEGER DEFAULT 1,
                notes TEXT,
                exercise_order INTEGER DEFAULT 0,
                FOREIGN KEY (preset_id) REFERENCES stretching_presets(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            INSERT INTO stretching_preset_exercises__fk_fix
            (id, preset_id, exercise_id, hold_seconds, reps, notes, exercise_order)
            SELECT id, preset_id, exercise_id, hold_seconds, reps, notes, exercise_order
            FROM stretching_preset_exercises
            """
        )
        conn.execute("DROP TABLE stretching_preset_exercises")
        conn.execute(
            "ALTER TABLE stretching_preset_exercises__fk_fix "
            "RENAME TO stretching_preset_exercises"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_stretching_preset_exercises_preset "
            "ON stretching_preset_exercises(preset_id, exercise_order)"
        )
    finally:
        conn.execute("PRAGMA foreign_keys = ON")


def _migration_v041_sleep_data(conn: sqlite3.Connection) -> None:
    """Сон из Health Connect и других источников."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sleep_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            duration_seconds INTEGER NOT NULL,
            light_seconds INTEGER NOT NULL DEFAULT 0,
            deep_seconds INTEGER NOT NULL DEFAULT 0,
            rem_seconds INTEGER NOT NULL DEFAULT 0,
            source TEXT DEFAULT 'health_connect',
            external_id TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, external_id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_sleep_data_user_date ON sleep_data(user_id, date)"
    )


def _migration_v042_cloud_account_tokens(conn: sqlite3.Connection) -> None:
    """Токены облака по аккаунту Яндекс/Google; привязка локальных пользователей."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_cloud_links (
            user_id INTEGER NOT NULL,
            storage_provider TEXT NOT NULL,
            account_cloud_provider TEXT NOT NULL,
            account_cloud_user_id TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, storage_provider)
        )
        """
    )

    if not _table_exists(conn, "main", "cloud_tokens"):
        _ensure_cloud_tokens_table(conn)
        return

    ct_cols = _pragma_cols(conn, "cloud_tokens")
    if ct_cols and "account_cloud_provider" in ct_cols:
        return

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cloud_tokens_v042 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at TIMESTAMP,
            account_cloud_provider TEXT,
            account_cloud_user_id TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, provider),
            UNIQUE(account_cloud_provider, account_cloud_user_id, provider)
        )
        """
    )
    rows = conn.execute(
        """
        SELECT ct.provider, ct.access_token, ct.refresh_token, ct.expires_at,
               ct.created_at, ct.updated_at, COALESCE(ct.user_id, 1) AS user_id,
               u.cloud_provider AS u_cloud_provider, u.cloud_user_id AS u_cloud_user_id
        FROM cloud_tokens ct
        LEFT JOIN users u ON u.id = ct.user_id
        """
    ).fetchall()
    for row in rows:
        storage = str(row["provider"] or "").strip().lower()
        uid = int(row["user_id"])
        u_cp = str(row["u_cloud_provider"] or "").strip().lower()
        u_cid = str(row["u_cloud_user_id"] or "").strip().lower()
        acct_provider = u_cp if u_cp in ("yandex", "google") and u_cid else None
        acct_id = u_cid if acct_provider else None
        if storage == "yandex" and not acct_provider:
            acct_provider, acct_id = "yandex", f"legacy_user_{uid}"
        elif storage == "google" and not acct_provider:
            acct_provider, acct_id = "google", f"legacy_user_{uid}"

        conn.execute(
            """
            INSERT INTO cloud_tokens_v042 (
                user_id, provider, access_token, refresh_token, expires_at,
                account_cloud_provider, account_cloud_user_id,
                created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                account_cloud_provider = COALESCE(excluded.account_cloud_provider, cloud_tokens_v042.account_cloud_provider),
                account_cloud_user_id = COALESCE(excluded.account_cloud_user_id, cloud_tokens_v042.account_cloud_user_id),
                updated_at = excluded.updated_at
            """,
            (
                uid,
                storage,
                row["access_token"],
                row["refresh_token"],
                row["expires_at"],
                acct_provider,
                acct_id,
                row["created_at"],
                row["updated_at"],
            ),
        )
        if acct_provider and acct_id:
            conn.execute(
                """
                INSERT INTO user_cloud_links (
                    user_id, storage_provider, account_cloud_provider, account_cloud_user_id
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id, storage_provider) DO UPDATE SET
                    account_cloud_provider = excluded.account_cloud_provider,
                    account_cloud_user_id = excluded.account_cloud_user_id,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (uid, storage, acct_provider, acct_id),
            )

    conn.execute("DROP TABLE cloud_tokens")
    conn.execute("ALTER TABLE cloud_tokens_v042 RENAME TO cloud_tokens")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cloud_tokens_user_id ON cloud_tokens(user_id)"
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_cloud_tokens_account
        ON cloud_tokens(account_cloud_provider, account_cloud_user_id, provider)
        """
    )


def _migration_v037_cloud_users(conn: sqlite3.Connection) -> None:
    """
    Учётные записи по облачному OAuth (Яндекс / Google) и привязка токенов к user_id.
    """
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT,
            display_email TEXT,
            last_sync TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cloud_provider, cloud_user_id)
        )
        """
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO users (id, username, cloud_provider, cloud_user_id, display_email)
        VALUES (1, 'admin', 'local', 'admin', NULL)
        """
    )

    if _table_exists(conn, "main", "user_profile"):
        profile_cols = _pragma_cols(conn, "user_profile")
        if profile_cols and "user_id" not in profile_cols:
            conn.execute("ALTER TABLE user_profile ADD COLUMN user_id INTEGER")
        conn.execute(
            "UPDATE user_profile SET user_id = 1 WHERE user_id IS NULL OR user_id = 0"
        )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_user_profile_user_id "
            "ON user_profile(user_id) WHERE user_id IS NOT NULL"
        )

    if not _table_exists(conn, "main", "cloud_tokens"):
        _ensure_cloud_tokens_table(conn)
        return

    ct_cols = _pragma_cols(conn, "cloud_tokens")
    if ct_cols and "user_id" not in ct_cols:
        _add_user_id_column(conn, "cloud_tokens")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cloud_tokens_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, provider)
        )
        """
    )
    rows = conn.execute(
        "SELECT provider, access_token, refresh_token, expires_at, created_at, updated_at, "
        "COALESCE(user_id, 1) AS user_id FROM cloud_tokens"
    ).fetchall()
    for row in rows:
        conn.execute(
            """
            INSERT INTO cloud_tokens_new (
                user_id, provider, access_token, refresh_token,
                expires_at, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, provider) DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = excluded.refresh_token,
                expires_at = excluded.expires_at,
                updated_at = excluded.updated_at
            """,
            (
                int(row["user_id"]),
                row["provider"],
                row["access_token"],
                row["refresh_token"],
                row["expires_at"],
                row["created_at"],
                row["updated_at"],
            ),
        )
    conn.execute("DROP TABLE cloud_tokens")
    conn.execute("ALTER TABLE cloud_tokens_new RENAME TO cloud_tokens")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cloud_tokens_user_id ON cloud_tokens(user_id)"
    )


def _migration_v036_user_id_preset_children(conn: sqlite3.Connection) -> None:
    """
    user_id для таблиц пресетов (дочерние таблицы workout_presets).

    workout_presets уже содержит user_id; добавляем его в preset_exercises и preset_sets,
    чтобы изоляция была полной на уровне всех личных таблиц.
    """
    for table in ("preset_exercises", "preset_sets"):
        _add_user_id_column(conn, table)

    # backfill: preset_exercises.user_id <- workout_presets.user_id
    if _table_exists(conn, "main", "preset_exercises") and _table_exists(conn, "main", "workout_presets"):
        pe_cols = _pragma_cols(conn, "preset_exercises")
        wp_cols = _pragma_cols(conn, "workout_presets")
        if pe_cols and wp_cols and "user_id" in pe_cols and "user_id" in wp_cols:
            conn.execute(
                """
                UPDATE preset_exercises
                SET user_id = (
                    SELECT p.user_id FROM workout_presets p
                    WHERE p.id = preset_exercises.preset_id
                )
                WHERE preset_id IS NOT NULL
                  AND (user_id IS NULL OR user_id = 0)
                """
            )

    # backfill: preset_sets.user_id <- preset_exercises.user_id
    if _table_exists(conn, "main", "preset_sets") and _table_exists(conn, "main", "preset_exercises"):
        ps_cols = _pragma_cols(conn, "preset_sets")
        pe_cols = _pragma_cols(conn, "preset_exercises")
        if ps_cols and pe_cols and "user_id" in ps_cols and "user_id" in pe_cols:
            conn.execute(
                """
                UPDATE preset_sets
                SET user_id = (
                    SELECT e.user_id FROM preset_exercises e
                    WHERE e.id = preset_sets.preset_exercise_id
                )
                WHERE preset_exercise_id IS NOT NULL
                  AND (user_id IS NULL OR user_id = 0)
                """
            )

    for table in ("preset_exercises", "preset_sets"):
        if _table_exists(conn, "main", table):
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)"
            )


def ensure_shared_schema(conn: sqlite3.Connection | None = None) -> None:
    """
    Создать/обновить таблицы в shared.db.
    Без conn — отдельное подключение (для скриптов).
    """
    own = conn is None
    if own:
        conn = open_db(attach=True)
    try:
        from database.shared_schema import ensure_shared_schema as _ensure

        _ensure(conn)
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


DEFAULT_USER_ID = 1


def _migration_v034_openfoodfacts(conn: sqlite3.Connection) -> None:
    """Штрихкод (external_id) в food_products и кэш ответов Open Food Facts."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    fp = _sh("food_products")
    cols = _pragma_cols(conn, "food_products")
    if cols and "external_id" not in cols:
        conn.execute(f"ALTER TABLE {fp} ADD COLUMN external_id TEXT")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS shared.openfoodfacts_cache (
            cache_key TEXT PRIMARY KEY,
            payload TEXT NOT NULL,
            fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    # Prefer CREATE INDEX through ATTACH to avoid a second shared.db connection (Windows lock).
    # Fallback to direct shared.db only for legacy SQLite builds with schema-qualified index syntax issues.
    idx_attached_sql = f"""
        CREATE UNIQUE INDEX IF NOT EXISTS idx_food_products_external_id
        ON {fp} (external_id)
        WHERE external_id IS NOT NULL AND external_id != ''
        """
    idx_direct_sql = """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_food_products_external_id
        ON food_products (external_id)
        WHERE external_id IS NOT NULL AND external_id != ''
        """
    try:
        conn.execute(idx_attached_sql)
    except sqlite3.OperationalError as err:
        if "near" not in str(err).lower() and "syntax" not in str(err).lower():
            raise
        sc = sqlite3.connect(SHARED_DB_PATH, timeout=60.0)
        try:
            sc.execute("PRAGMA busy_timeout = 60000")
            sc.execute(idx_direct_sql)
            sc.commit()
        finally:
            sc.close()


def _migration_v033_food_micro_nutrients(conn: sqlite3.Connection) -> None:
    """Витамины и минералы на 100 г в food_products; суточные нормы в user_profile."""
    from utils.micro_nutrients import MICRO_KEYS

    if not is_shared_attached(conn):
        attach_shared(conn)
    fp = _sh("food_products")
    cols = _pragma_cols(conn, "food_products")
    if cols:
        for key in MICRO_KEYS:
            if key not in cols:
                conn.execute(f"ALTER TABLE {fp} ADD COLUMN {key} REAL NOT NULL DEFAULT 0")

    profile_cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "micro_goals_json" not in profile_cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN micro_goals_json TEXT")


def _migration_v032_polar_calories_to_chest(conn: sqlite3.Connection) -> None:
    """
    Старые записи Polar attach: calories заполнен, calories_chest пуст.
    Копируем calories → calories_chest (идемпотентно).
    """
    where_clause = (
        "(calories_chest IS NULL OR calories_chest = 0) "
        "AND calories IS NOT NULL AND calories > 0"
    )
    for table in ("cardio_workouts", "strength_workouts"):
        info = {r[1] for r in conn.execute(f"PRAGMA table_info({table})")}
        if "calories" not in info or "calories_chest" not in info:
            continue
        conn.execute(
            f"UPDATE {table} SET calories_chest = calories WHERE {where_clause}"
        )


def _migration_v031_strength_is_circuit(conn: sqlite3.Connection) -> None:
    """Круговая тренировка: подходы в порядке выполнения, без группировки по упражнению."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "is_circuit" not in cols:
        conn.execute(
            "ALTER TABLE strength_workouts ADD COLUMN is_circuit INTEGER NOT NULL DEFAULT 0"
        )
    conn.execute(
        """
        UPDATE strength_workouts
        SET is_circuit = 1
        WHERE COALESCE(order_index, 0) > 0
        """
    )


def _migration_v030_daily_meal_plans_autoincrement(conn: sqlite3.Connection) -> None:
    """Восстановить PRIMARY KEY AUTOINCREMENT для daily_meal_plans."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    cols = conn.execute("PRAGMA shared.table_info(daily_meal_plans)").fetchall()
    id_col = next((c for c in cols if c[1] == "id"), None)
    needs_rebuild = id_col is not None and int(id_col[5] or 0) == 0

    if not needs_rebuild:
        null_rows = conn.execute(
            "SELECT rowid FROM shared.daily_meal_plans WHERE id IS NULL"
        ).fetchall()
        if not null_rows:
            return
        max_id = int(
            conn.execute(
                "SELECT COALESCE(MAX(id), 0) FROM shared.daily_meal_plans"
            ).fetchone()[0]
            or 0
        )
        for (rowid,) in null_rows:
            max_id += 1
            conn.execute(
                "UPDATE shared.daily_meal_plans SET id = ? WHERE rowid = ?",
                (max_id, rowid),
            )
        return

    dmp = _sh("daily_meal_plans")
    dmpt = _sh("daily_meal_plan_templates")
    mpi = _sh("meal_plan_items")
    items_backup: list[tuple] = []
    tpl_backup: list[tuple] = []
    if _pragma_cols(conn, "meal_plan_items"):
        items_backup = conn.execute(
            f"SELECT plan_id, day_offset, meal_type, product_id, quantity FROM {mpi}"
        ).fetchall()
        conn.execute(f"DROP TABLE IF EXISTS {mpi}")
    if _pragma_cols(conn, "daily_meal_plan_templates"):
        tpl_backup = conn.execute(
            f"SELECT plan_id, template_id, sort_order FROM {dmpt}"
        ).fetchall()
        conn.execute(f"DROP TABLE IF EXISTS {dmpt}")

    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(
        """
        CREATE TABLE shared.daily_meal_plans_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            phase TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            description TEXT,
            is_custom INTEGER NOT NULL DEFAULT 0,
            is_weekly INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        f"""
        INSERT INTO shared.daily_meal_plans_new
        (id, name, phase, created_at, description, is_custom, is_weekly)
        SELECT
            COALESCE(id, rowid),
            name,
            phase,
            created_at,
            description,
            COALESCE(is_custom, 0),
            COALESCE(is_weekly, 0)
        FROM {dmp}
        """
    )
    conn.execute(f"DROP TABLE {dmp}")
    conn.execute("ALTER TABLE shared.daily_meal_plans_new RENAME TO daily_meal_plans")

    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {dmpt} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            template_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES meal_templates(id) ON DELETE CASCADE,
            UNIQUE(plan_id, template_id)
        )
        """
    )
    for row in tpl_backup:
        conn.execute(
            f"INSERT INTO {dmpt} (plan_id, template_id, sort_order) VALUES (?, ?, ?)",
            tuple(row),
        )

    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {mpi} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES food_products(id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS shared.idx_meal_plan_items_plan
        ON meal_plan_items(plan_id, day_offset, meal_type)
        """
    )
    for row in items_backup:
        conn.execute(
            f"""
            INSERT INTO {mpi} (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (?, ?, ?, ?, ?)
            """,
            tuple(row),
        )
    conn.execute("PRAGMA foreign_keys=ON")


def _migration_v029_meal_plan_items(conn: sqlite3.Connection) -> None:
    """Продукты в рационе (по дням и приёмам пищи)."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    dmp = _sh("daily_meal_plans")
    mpi = _sh("meal_plan_items")
    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols and "is_weekly" not in plan_cols:
        conn.execute(
            f"ALTER TABLE {dmp} ADD COLUMN is_weekly INTEGER NOT NULL DEFAULT 0"
        )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {mpi} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES food_products(id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS shared.idx_meal_plan_items_plan
        ON meal_plan_items(plan_id, day_offset, meal_type)
        """
    )


def _migration_v046_meal_plan_items_drop_product_fk(conn: sqlite3.Connection) -> None:
    """Убрать FK product_id → food_products (foreign key mismatch при ATTACH shared)."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    mpi = _sh("meal_plan_items")
    if not _pragma_cols(conn, "meal_plan_items"):
        return
    backup = conn.execute(
        f"SELECT plan_id, day_offset, meal_type, product_id, quantity FROM {mpi}"
    ).fetchall()
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(f"DROP TABLE IF EXISTS {mpi}")
    dmp = _sh("daily_meal_plans")
    conn.execute(
        f"""
        CREATE TABLE {mpi} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS shared.idx_meal_plan_items_plan
        ON meal_plan_items(plan_id, day_offset, meal_type)
        """
    )
    for row in backup:
        conn.execute(
            f"""
            INSERT INTO {mpi} (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (?, ?, ?, ?, ?)
            """,
            tuple(row),
        )
    conn.execute("PRAGMA foreign_keys=ON")


def _food_entries_has_product_fk(conn: sqlite3.Connection) -> bool:
    """FK на food_products в main — ломается после переноса справочника в shared."""
    if not _table_exists(conn, "main", "food_entries"):
        return False
    for row in conn.execute("PRAGMA foreign_key_list(food_entries)").fetchall():
        if str(row[2]) == "food_products":
            return True
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='food_entries'"
    ).fetchone()
    sql = (row[0] or "") if row else ""
    upper = sql.upper()
    return "FOOD_PRODUCTS" in upper and "REFERENCES" in upper


def _food_entries_column_ddls(conn: sqlite3.Connection) -> list[str]:
    """DDL колонок food_entries без FOREIGN KEY (из PRAGMA table_info)."""
    ddls: list[str] = []
    for _cid, name, typ, notnull, dflt_value, pk in conn.execute(
        "PRAGMA table_info(food_entries)"
    ).fetchall():
        type_sql = (typ or "TEXT").strip()
        if int(pk):
            if name == "id" and type_sql.upper() == "INTEGER":
                part = "id INTEGER PRIMARY KEY AUTOINCREMENT"
            else:
                part = f"{name} {type_sql} PRIMARY KEY"
        else:
            part = f"{name} {type_sql}"
            if int(notnull):
                part += " NOT NULL"
            if dflt_value is not None:
                part += f" DEFAULT {dflt_value}"
        ddls.append(part)
    return ddls


def _migration_v047_food_entries_drop_product_fk(conn: sqlite3.Connection) -> None:
    """Убрать FK product_id → main.food_products (сломан после split в shared)."""
    if not _table_exists(conn, "main", "food_entries"):
        return
    if not _food_entries_has_product_fk(conn):
        return
    cols = [r[1] for r in conn.execute("PRAGMA table_info(food_entries)").fetchall()]
    if not cols:
        return
    col_list = ", ".join(cols)
    ddl_cols = ", ".join(_food_entries_column_ddls(conn))
    conn.execute("PRAGMA foreign_keys=OFF")
    conn.execute(f"CREATE TABLE food_entries_new ({ddl_cols})")
    conn.execute(
        f"INSERT INTO food_entries_new ({col_list}) SELECT {col_list} FROM food_entries"
    )
    conn.execute("DROP TABLE food_entries")
    conn.execute("ALTER TABLE food_entries_new RENAME TO food_entries")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_food_entries_date ON food_entries(date)"
    )
    if "phase" in cols:
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS idx_food_entries_phase_date
            ON food_entries(phase, date)
            """
        )
    if "user_id" in cols:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_food_entries_user_id ON food_entries(user_id)"
        )
    conn.execute("PRAGMA foreign_keys=ON")


def _migration_v048_health_connect_sync_log(conn: sqlite3.Connection) -> None:
    """Журнал пакетных синхронизаций Health Connect."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS health_connect_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            days_count INTEGER NOT NULL DEFAULT 0,
            saved_days INTEGER NOT NULL DEFAULT 0,
            errors_count INTEGER NOT NULL DEFAULT 0,
            payload_preview TEXT
        )
        """
    )


def _migration_v028_bracelet_calibration(conn: sqlite3.Connection) -> None:
    """Поправочный коэффициент калорий с браслета (часов)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "calibration_factor" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN calibration_factor REAL DEFAULT 1.0"
        )
    if "last_calibration_date" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN last_calibration_date TEXT"
        )


def _migration_v025_physiological_deficit_limit(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "max_physiological_deficit_per_kg_fat" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN max_physiological_deficit_per_kg_fat REAL DEFAULT 70"
        )


def _migration_v024_food_products_fiber_g(conn: sqlite3.Connection) -> None:
    """Клетчатка на 100 г в справочнике продуктов."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    fp = _sh("food_products")
    cols = _pragma_cols(conn, "food_products")
    if cols and "fiber_g" not in cols:
        conn.execute(f"ALTER TABLE {fp} ADD COLUMN fiber_g REAL NOT NULL DEFAULT 0")


def _migration_v021_daily_bracelet_calories(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_bracelet_calories (
            date TEXT PRIMARY KEY,
            total_calories INTEGER NOT NULL,
            source TEXT DEFAULT 'manual',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )


def _migration_v020_food_products_is_alcohol(conn: sqlite3.Connection) -> None:
    """Флаг алкогольного продукта (калории без учёта в БЖУ)."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    fp = _sh("food_products")
    cols = _pragma_cols(conn, "food_products")
    if cols and "is_alcohol" not in cols:
        conn.execute(
            f"ALTER TABLE {fp} ADD COLUMN is_alcohol INTEGER NOT NULL DEFAULT 0"
        )


def _migration_v017_breakfast1_breakfast2(conn: sqlite3.Connection) -> None:
    """Разделить завтрак: breakfast → breakfast1; шаблоны «Завтрак 2» → breakfast2."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    mt = _sh("meal_templates")
    conn.execute(
        """
        UPDATE food_entries SET meal_type = 'breakfast1'
        WHERE meal_type = 'breakfast'
        """
    )
    conn.execute(
        f"""
        UPDATE {mt}
        SET meal_type = 'breakfast2'
        WHERE meal_type = 'breakfast'
          AND (
            name LIKE '%Завтрак 2%'
            OR name LIKE '%завтрак 2%'
          )
        """
    )
    conn.execute(
        f"""
        UPDATE {mt}
        SET meal_type = 'breakfast1'
        WHERE meal_type = 'breakfast'
        """
    )


def _migration_v016_shared_and_food_phase(conn: sqlite3.Connection) -> None:
    migrate_workouts_to_shared_split(conn)
    from database.shared_schema import ensure_shared_schema

    ensure_shared_schema(conn)
    _ensure_food_phase_entries_and_goals(conn)
    _ensure_weekly_meal_schedule(conn)
    entry_cols = {r[1] for r in conn.execute("PRAGMA table_info(food_entries)")}
    if "phase" in entry_cols:
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_food_entries_phase_date "
            "ON food_entries(phase, date)"
        )


def _migration_v043_user_profile_interface(conn: sqlite3.Connection) -> None:
    """Компактный режим и плотность аналитики в профиле."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "compact_mode" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN compact_mode INTEGER NOT NULL DEFAULT 0"
        )
    if "density_analytics" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN density_analytics TEXT NOT NULL DEFAULT 'normal'"
        )


def _migration_v045_local_backup_settings(conn: sqlite3.Connection) -> None:
    """Папка для локальных ежемесячных бэкапов workouts.db."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "backup_folder_path" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN backup_folder_path TEXT DEFAULT NULL")
    if "last_backup_date" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN last_backup_date TEXT DEFAULT NULL")


def _migration_v044_polar_multitenant(conn: sqlite3.Connection) -> None:
    """Привязка Polar OAuth и очереди тренировок к локальному user_id."""
    token_cols = {r[1] for r in conn.execute("PRAGMA table_info(polar_tokens)")}
    if "local_user_id" not in token_cols:
        conn.execute(
            "ALTER TABLE polar_tokens ADD COLUMN local_user_id INTEGER NOT NULL DEFAULT 1"
        )
    conn.execute(
        "UPDATE polar_tokens SET local_user_id = 1 "
        "WHERE local_user_id IS NULL OR local_user_id = 0"
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_polar_tokens_local_user
        ON polar_tokens(local_user_id)
        """
    )

    pending_cols = {r[1] for r in conn.execute("PRAGMA table_info(polar_pending_workouts)")}
    if "local_user_id" not in pending_cols:
        conn.execute(
            "ALTER TABLE polar_pending_workouts "
            "ADD COLUMN local_user_id INTEGER NOT NULL DEFAULT 1"
        )
    conn.execute(
        "UPDATE polar_pending_workouts SET local_user_id = 1 "
        "WHERE local_user_id IS NULL OR local_user_id = 0"
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_polar_pending_user_imported
        ON polar_pending_workouts(local_user_id, imported)
        """
    )


def _migration_v049_food_products_default_portion_g(conn: sqlite3.Connection) -> None:
    """Стандартная порция продукта в граммах."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    fp = _sh("food_products")
    cols = _pragma_cols(conn, "food_products")
    if cols and "default_portion_g" not in cols:
        conn.execute(f"ALTER TABLE {fp} ADD COLUMN default_portion_g REAL DEFAULT NULL")


def _migration_v050_health_connect_audit_columns(conn: sqlite3.Connection) -> None:
    """Расширение журнала HC: audit JSON с телефона и бэкенда."""
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='health_connect_sync_log' LIMIT 1"
    ).fetchone()
    if not row:
        return
    cols = {r[1] for r in conn.execute("PRAGMA table_info(health_connect_sync_log)")}
    if "audit_json" not in cols:
        conn.execute("ALTER TABLE health_connect_sync_log ADD COLUMN audit_json TEXT")
    if "mobile_audit_json" not in cols:
        conn.execute("ALTER TABLE health_connect_sync_log ADD COLUMN mobile_audit_json TEXT")
    if "device_label" not in cols:
        conn.execute("ALTER TABLE health_connect_sync_log ADD COLUMN device_label TEXT")


def _migration_v051_strength_hr_block_overrides(conn: sqlite3.Connection) -> None:
    """Ручная разметка HR-блоков силовой тренировки."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_hr_block_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'set',
            assigned_order_index INTEGER,
            label TEXT,
            notes TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_block_overrides_session_block
        ON strength_hr_block_overrides(user_id, workout_date, workout_title, block_index)
        """
    )


def _migration_v052_hr_block_override_training_signal(conn: sqlite3.Connection) -> None:
    """Nullable columns for future ML / threshold tuning from manual corrections."""
    for col in (
        "source_auto_block_index INTEGER",
        "original_start_sec INTEGER",
        "original_end_sec INTEGER",
    ):
        name = col.split()[0]
        cols = {row[1] for row in conn.execute("PRAGMA table_info(strength_hr_block_overrides)")}
        if name not in cols:
            conn.execute(f"ALTER TABLE strength_hr_block_overrides ADD COLUMN {col}")


def _migration_v060_perf_indexes(conn: sqlite3.Connection) -> None:
    """Extra composite indexes for dashboard and HC sync log (perf pass v2)."""
    for sql in (
        """
        CREATE INDEX IF NOT EXISTS idx_food_entries_user_date
        ON food_entries(user_id, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cardio_user_date_type
        ON cardio_workouts(user_id, date, type)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cardio_user_source_date
        ON cardio_workouts(user_id, data_source, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_hc_sync_log_synced_at
        ON health_connect_sync_log(synced_at DESC)
        """,
    ):
        if "health_connect_sync_log" in sql:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='health_connect_sync_log' LIMIT 1"
            ).fetchone()
            if not row:
                continue
        conn.execute(sql)


def _migration_v061_body_metrics_user_scope(conn: sqlite3.Connection) -> None:
    """Per-user body_metrics and daily_weight (fixes cross-account weight bleed)."""
    uid_default = DEFAULT_USER_ID

    if _table_exists(conn, "main", "body_metrics"):
        bm_cols = _pragma_cols(conn, "body_metrics")
        if "user_id" not in bm_cols:
            if "id" not in bm_cols:
                info = conn.execute("PRAGMA table_info(body_metrics)").fetchall()
                col_defs = [
                    "id INTEGER PRIMARY KEY AUTOINCREMENT",
                    f"user_id INTEGER NOT NULL DEFAULT {uid_default}",
                ]
                copy_cols: list[str] = []
                for _cid, name, col_type, _nn, _dflt, pk in info:
                    if pk:
                        continue
                    if name == "date":
                        col_defs.append("date TEXT NOT NULL")
                    else:
                        col_defs.append(f"{name} {col_type or 'TEXT'}")
                    copy_cols.append(name)
                conn.execute(
                    f"CREATE TABLE body_metrics_v061 ({', '.join(col_defs)}, "
                    "UNIQUE(user_id, date))"
                )
                ins_cols = ", ".join(["user_id", *copy_cols])
                sel_cols = ", ".join([str(uid_default), *copy_cols])
                conn.execute(
                    f"INSERT INTO body_metrics_v061 ({ins_cols}) "
                    f"SELECT {sel_cols} FROM body_metrics"
                )
                conn.execute("DROP TABLE body_metrics")
                conn.execute("ALTER TABLE body_metrics_v061 RENAME TO body_metrics")
            else:
                _add_user_id_column(conn, "body_metrics")
                conn.execute(
                    f"UPDATE body_metrics SET user_id = {uid_default} "
                    "WHERE user_id IS NULL OR user_id = 0"
                )
        conn.execute(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_body_metrics_user_date "
            "ON body_metrics(user_id, date)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_body_metrics_user_id ON body_metrics(user_id)"
        )

    if _table_exists(conn, "main", "daily_weight"):
        dw_cols = _pragma_cols(conn, "daily_weight")
        if "user_id" not in dw_cols:
            conn.execute(
                f"""
                CREATE TABLE daily_weight_v061 (
                    user_id INTEGER NOT NULL DEFAULT {uid_default},
                    date TEXT NOT NULL,
                    weight_kg REAL NOT NULL,
                    body_fat_percent REAL,
                    source TEXT,
                    PRIMARY KEY (user_id, date)
                )
                """
            )
            if "source" in dw_cols:
                conn.execute(
                    f"""
                    INSERT INTO daily_weight_v061 (user_id, date, weight_kg, body_fat_percent, source)
                    SELECT {uid_default}, date, weight_kg, body_fat_percent, source FROM daily_weight
                    """
                )
            else:
                conn.execute(
                    f"""
                    INSERT INTO daily_weight_v061 (user_id, date, weight_kg, body_fat_percent)
                    SELECT {uid_default}, date, weight_kg, body_fat_percent FROM daily_weight
                    """
                )
            conn.execute("DROP TABLE daily_weight")
            conn.execute("ALTER TABLE daily_weight_v061 RENAME TO daily_weight")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_weight_user_id ON daily_weight(user_id)"
        )


def _migration_v062_steps_bracelet_hc_user_scope(conn: sqlite3.Connection) -> None:
    """Per-user steps_history, daily_bracelet_calories, health_connect_sync_log."""
    uid_default = DEFAULT_USER_ID

    if _table_exists(conn, "main", "health_connect_sync_log"):
        hc_cols = _pragma_cols(conn, "health_connect_sync_log")
        if "user_id" not in hc_cols:
            conn.execute(
                f"ALTER TABLE health_connect_sync_log ADD COLUMN user_id INTEGER NOT NULL DEFAULT {uid_default}"
            )
            conn.execute(
                f"UPDATE health_connect_sync_log SET user_id = {uid_default} "
                "WHERE user_id IS NULL OR user_id = 0"
            )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_hc_sync_log_user_id_desc "
            "ON health_connect_sync_log(user_id, id DESC)"
        )

    if _table_exists(conn, "main", "steps_history"):
        sh_cols = _pragma_cols(conn, "steps_history")
        create_row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='steps_history'"
        ).fetchone()
        table_sql = str(create_row[0] or "") if create_row else ""
        has_composite_unique = "unique(user_id, date)" in table_sql.lower().replace(" ", "")
        if not has_composite_unique:
            conn.execute(
                f"""
                CREATE TABLE steps_history_v062 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT {uid_default},
                    date TEXT NOT NULL,
                    steps INTEGER NOT NULL,
                    step_length_m REAL,
                    source TEXT DEFAULT 'excel_archive',
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, date)
                )
                """
            )
            if "user_id" in sh_cols:
                conn.execute(
                    f"""
                    INSERT INTO steps_history_v062
                        (user_id, date, steps, step_length_m, source, updated_at)
                    SELECT COALESCE(NULLIF(user_id, 0), {uid_default}),
                           date, steps, step_length_m, source, updated_at
                    FROM steps_history
                    """
                )
            else:
                conn.execute(
                    f"""
                    INSERT INTO steps_history_v062
                        (user_id, date, steps, step_length_m, source, updated_at)
                    SELECT {uid_default}, date, steps, step_length_m, source, updated_at
                    FROM steps_history
                    """
                )
            conn.execute("DROP TABLE steps_history")
            conn.execute("ALTER TABLE steps_history_v062 RENAME TO steps_history")
        elif "user_id" not in sh_cols:
            _add_user_id_column(conn, "steps_history")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_steps_history_user_date "
            "ON steps_history(user_id, date)"
        )

    if _table_exists(conn, "main", "daily_bracelet_calories"):
        bc_cols = _pragma_cols(conn, "daily_bracelet_calories")
        create_row = conn.execute(
            "SELECT sql FROM sqlite_master WHERE type='table' AND name='daily_bracelet_calories'"
        ).fetchone()
        table_sql = str(create_row[0] or "") if create_row else ""
        needs_rebuild = "primary key (user_id, date)" not in table_sql.lower().replace(" ", "")
        if needs_rebuild:
            conn.execute(
                f"""
                CREATE TABLE daily_bracelet_calories_v062 (
                    user_id INTEGER NOT NULL DEFAULT {uid_default},
                    date TEXT NOT NULL,
                    total_calories INTEGER NOT NULL,
                    source TEXT DEFAULT 'manual',
                    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (user_id, date)
                )
                """
            )
            if "user_id" in bc_cols:
                conn.execute(
                    f"""
                    INSERT INTO daily_bracelet_calories_v062
                        (user_id, date, total_calories, source, updated_at)
                    SELECT COALESCE(NULLIF(user_id, 0), {uid_default}),
                           date, total_calories, source, updated_at
                    FROM daily_bracelet_calories
                    """
                )
            else:
                conn.execute(
                    f"""
                    INSERT INTO daily_bracelet_calories_v062
                        (user_id, date, total_calories, source, updated_at)
                    SELECT {uid_default}, date, total_calories, source, updated_at
                    FROM daily_bracelet_calories
                    """
                )
            conn.execute("DROP TABLE daily_bracelet_calories")
            conn.execute("ALTER TABLE daily_bracelet_calories_v062 RENAME TO daily_bracelet_calories")
        elif "user_id" not in bc_cols:
            _add_user_id_column(conn, "daily_bracelet_calories")
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_daily_bracelet_user_date "
            "ON daily_bracelet_calories(user_id, date)"
        )


def _migration_v063_meal_plans_user_scope(conn: sqlite3.Connection) -> None:
    """Per-user daily_meal_plans and meal_templates in shared.db."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    uid_default = DEFAULT_USER_ID
    dmp = _sh("daily_meal_plans")
    mt = _sh("meal_templates")

    def _recover_temp_table(temp_name: str, final_name: str) -> None:
        temp_exists = _table_exists(conn, "shared", temp_name)
        final_exists = _table_exists(conn, "shared", final_name)
        if temp_exists and final_exists:
            conn.execute(f"DROP TABLE IF EXISTS shared.{temp_name}")
        elif temp_exists:
            conn.execute(f"ALTER TABLE shared.{temp_name} RENAME TO {final_name}")

    _recover_temp_table("daily_meal_plans_v063", "daily_meal_plans")
    _recover_temp_table("meal_templates_v063", "meal_templates")

    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols:
        create_row = conn.execute(
            "SELECT sql FROM shared.sqlite_master WHERE type='table' AND name='daily_meal_plans'"
        ).fetchone()
        table_sql = str(create_row[0] or "") if create_row else ""
        has_user_scope = "unique(user_id, name)" in table_sql.lower().replace(" ", "")
        if not has_user_scope:
            conn.execute("PRAGMA foreign_keys=OFF")
            conn.execute(
                f"""
                CREATE TABLE shared.daily_meal_plans_v063 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT {uid_default},
                    name TEXT NOT NULL,
                    phase TEXT NOT NULL,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    description TEXT,
                    is_custom INTEGER NOT NULL DEFAULT 0,
                    is_weekly INTEGER NOT NULL DEFAULT 0,
                    UNIQUE(user_id, name)
                )
                """
            )
            sel_cols = ["user_id", "id", "name", "phase", "created_at"]
            ins_cols = ["user_id", "id", "name", "phase", "created_at"]
            if "description" in plan_cols:
                sel_cols.append("description")
                ins_cols.append("description")
            else:
                ins_cols.append("description")
                sel_cols.append("NULL")
            if "is_custom" in plan_cols:
                sel_cols.append("COALESCE(is_custom, 0)")
                ins_cols.append("is_custom")
            else:
                ins_cols.append("is_custom")
                sel_cols.append("0")
            if "is_weekly" in plan_cols:
                sel_cols.append("COALESCE(is_weekly, 0)")
                ins_cols.append("is_weekly")
            else:
                ins_cols.append("is_weekly")
                sel_cols.append("0")
            if "user_id" in plan_cols:
                user_sel = f"COALESCE(NULLIF(user_id, 0), {uid_default})"
            else:
                user_sel = str(uid_default)
            sel_cols[0] = user_sel
            conn.execute(
                f"""
                INSERT INTO shared.daily_meal_plans_v063 ({", ".join(ins_cols)})
                SELECT {", ".join(sel_cols)} FROM {dmp}
                """
            )
            conn.execute(f"DROP TABLE {dmp}")
            conn.execute("ALTER TABLE shared.daily_meal_plans_v063 RENAME TO daily_meal_plans")
            conn.execute("PRAGMA foreign_keys=ON")
        elif "user_id" not in plan_cols:
            conn.execute(
                f"ALTER TABLE {dmp} ADD COLUMN user_id INTEGER NOT NULL DEFAULT {uid_default}"
            )
            conn.execute(
                f"UPDATE {dmp} SET user_id = {uid_default} WHERE user_id IS NULL OR user_id = 0"
            )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS shared.idx_daily_meal_plans_user
            ON daily_meal_plans(user_id, phase, is_custom)
            """
        )

    tpl_cols = _pragma_cols(conn, "meal_templates")
    if tpl_cols:
        create_row = conn.execute(
            "SELECT sql FROM shared.sqlite_master WHERE type='table' AND name='meal_templates'"
        ).fetchone()
        table_sql = str(create_row[0] or "") if create_row else ""
        has_user_scope = "unique(user_id, name)" in table_sql.lower().replace(" ", "")
        if not has_user_scope:
            conn.execute("PRAGMA foreign_keys=OFF")
            conn.execute(
                f"""
                CREATE TABLE shared.meal_templates_v063 (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL DEFAULT {uid_default},
                    name TEXT NOT NULL,
                    meal_type TEXT NOT NULL,
                    phase TEXT NOT NULL DEFAULT 'cut',
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(user_id, name)
                )
                """
            )
            if "user_id" in tpl_cols:
                conn.execute(
                    f"""
                    INSERT INTO shared.meal_templates_v063
                        (user_id, id, name, meal_type, phase, created_at)
                    SELECT COALESCE(NULLIF(user_id, 0), {uid_default}),
                           id, name, meal_type, phase, created_at
                    FROM {mt}
                    """
                )
            else:
                conn.execute(
                    f"""
                    INSERT INTO shared.meal_templates_v063
                        (user_id, id, name, meal_type, phase, created_at)
                    SELECT {uid_default}, id, name, meal_type, phase, created_at
                    FROM {mt}
                    """
                )
            conn.execute(f"DROP TABLE {mt}")
            conn.execute("ALTER TABLE shared.meal_templates_v063 RENAME TO meal_templates")
            conn.execute("PRAGMA foreign_keys=ON")
        elif "user_id" not in tpl_cols:
            conn.execute(
                f"ALTER TABLE {mt} ADD COLUMN user_id INTEGER NOT NULL DEFAULT {uid_default}"
            )
            conn.execute(
                f"UPDATE {mt} SET user_id = {uid_default} WHERE user_id IS NULL OR user_id = 0"
            )
        conn.execute(
            """
            CREATE INDEX IF NOT EXISTS shared.idx_meal_templates_user
            ON meal_templates(user_id, phase)
            """
        )


def _migration_v064_meal_plans_mark_custom(conn: sqlite3.Connection) -> None:
    """Стандартные рационы становятся обычными per-user (is_custom=1)."""
    if not is_shared_attached(conn):
        attach_shared(conn)
    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols and "is_custom" in plan_cols:
        conn.execute(
            "UPDATE shared.daily_meal_plans SET is_custom = 1 WHERE COALESCE(is_custom, 0) = 0"
        )


def _migration_v065_drop_cloned_standard_meal_plans(conn: sqlite3.Connection) -> None:
    """Удалить клоны стандартных рационов с чужих user_id (legacy seed с user 1)."""
    from utils.constants import STANDARD_MEAL_PLAN_NAMES

    if not is_shared_attached(conn):
        attach_shared(conn)
    standard_names = list(STANDARD_MEAL_PLAN_NAMES.values())
    if not standard_names:
        return
    placeholders = ",".join("?" * len(standard_names))
    rows = conn.execute(
        f"""
        SELECT id FROM shared.daily_meal_plans
        WHERE user_id != ? AND name IN ({placeholders})
        """,
        (DEFAULT_USER_ID, *standard_names),
    ).fetchall()
    for row in rows:
        plan_id = int(row[0])
        conn.execute(
            "DELETE FROM shared.daily_meal_plan_templates WHERE plan_id = ?",
            (plan_id,),
        )
        conn.execute(
            "DELETE FROM shared.meal_plan_items WHERE plan_id = ?",
            (plan_id,),
        )
        conn.execute(
            "DELETE FROM shared.daily_meal_plans WHERE id = ?",
            (plan_id,),
        )


def _migration_v066_stretching_log_user_date_index(conn: sqlite3.Connection) -> None:
    """Составной индекс stretching_log(user_id, date) для user-scoped запросов."""
    if not _table_exists(conn, "main", "stretching_log"):
        return
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_stretching_log_user_date
        ON stretching_log(user_id, date)
        """
    )


def _migration_v067_account_warmup_tables(conn: sqlite3.Connection) -> None:
    """Checkpoint и кэш агрегатов для batched account warmup."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS account_warmup_checkpoint (
            user_id INTEGER PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'idle',
            mode TEXT,
            task_id TEXT,
            cursor_json TEXT,
            processed_units INTEGER NOT NULL DEFAULT 0,
            total_units INTEGER NOT NULL DEFAULT 0,
            started_at TEXT,
            updated_at TEXT,
            completed_at TEXT,
            last_error TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS account_warmup_daily_cache (
            user_id INTEGER NOT NULL,
            metric_key TEXT NOT NULL,
            grain TEXT NOT NULL,
            bucket_date TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            computed_at TEXT NOT NULL,
            source_fingerprint TEXT,
            PRIMARY KEY (user_id, metric_key, grain, bucket_date)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_warmup_cache_user_metric
        ON account_warmup_daily_cache(user_id, metric_key)
        """
    )


def _migration_v068_exercise_sets_user_scope(conn: sqlite3.Connection) -> None:
    """Per-user exercise_sets: backfill ownership and unique (user_id, workout_type, effective_from)."""
    if not _table_exists(conn, "main", "exercise_sets"):
        return

    cols = _pragma_cols(conn, "exercise_sets")
    if not cols or "user_id" not in cols:
        _add_user_id_column(conn, "exercise_sets")

    if _table_exists(conn, "main", "strength_workouts"):
        conn.execute(
            """
            UPDATE exercise_sets
            SET user_id = (
                SELECT sw.user_id FROM strength_workouts sw
                WHERE sw.workout_title = exercise_sets.workout_type
                  AND sw.user_id IS NOT NULL AND sw.user_id > 0
                GROUP BY sw.user_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
            WHERE EXISTS (
                SELECT 1 FROM strength_workouts sw
                WHERE sw.workout_title = exercise_sets.workout_type
                  AND sw.user_id IS NOT NULL AND sw.user_id > 0
            )
            """
        )

    conn.execute(
        f"UPDATE exercise_sets SET user_id = {DEFAULT_USER_ID} "
        "WHERE user_id IS NULL OR user_id = 0"
    )

    already = conn.execute(
        """
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='exercise_sets_v068'
        """
    ).fetchone()
    if already:
        return

    conn.execute(
        f"""
        CREATE TABLE exercise_sets_v068 (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT {DEFAULT_USER_ID},
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            UNIQUE(user_id, workout_type, effective_from)
        )
        """
    )
    conn.execute(
        f"""
        INSERT INTO exercise_sets_v068
            (id, user_id, workout_type, set_name, effective_from, effective_to, is_default)
        SELECT id, COALESCE(user_id, {DEFAULT_USER_ID}), workout_type, set_name,
               effective_from, effective_to, is_default
        FROM exercise_sets
        """
    )
    conn.execute("DROP TABLE exercise_sets")
    conn.execute("ALTER TABLE exercise_sets_v068 RENAME TO exercise_sets")

    if _table_exists(conn, "main", "exercise_set_items"):
        item_cols = _pragma_cols(conn, "exercise_set_items")
        if item_cols and "user_id" in item_cols:
            conn.execute(
                """
                UPDATE exercise_set_items
                SET user_id = (
                    SELECT es.user_id FROM exercise_sets es
                    WHERE es.id = exercise_set_items.set_id
                )
                WHERE set_id IS NOT NULL
                  AND (user_id IS NULL OR user_id = 0)
                """
            )

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_exercise_sets_user_id ON exercise_sets(user_id)"
    )


def _migration_v069_cardio_type_settings_user_scope(conn: sqlite3.Connection) -> None:
    """Per-user cardio tab settings (бассейн/вело/бег); system types seeded per user."""
    if not _table_exists(conn, "main", "cardio_type_settings"):
        return

    cols = _pragma_cols(conn, "cardio_type_settings")
    if not cols:
        return

    if "user_id" not in cols:
        _add_user_id_column(conn, "cardio_type_settings")

    conn.execute(
        f"UPDATE cardio_type_settings SET user_id = {DEFAULT_USER_ID} "
        "WHERE user_id IS NULL OR user_id = 0"
    )

    ddl_row = conn.execute(
        """
        SELECT sql FROM sqlite_master
        WHERE type='table' AND name='cardio_type_settings'
        """
    ).fetchone()
    ddl = str(ddl_row[0] or "") if ddl_row else ""
    if "PRIMARY KEY (user_id, type)" in ddl.replace("\n", " "):
        return

    already = conn.execute(
        """
        SELECT name FROM sqlite_master
        WHERE type='table' AND name='cardio_type_settings_v069'
        """
    ).fetchone()
    if already:
        return

    conn.execute(
        f"""
        CREATE TABLE cardio_type_settings_v069 (
            user_id INTEGER NOT NULL DEFAULT {DEFAULT_USER_ID},
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, type)
        )
        """
    )
    conn.execute(
        f"""
        INSERT INTO cardio_type_settings_v069
            (user_id, type, is_active, sort_order, updated_at)
        SELECT COALESCE(user_id, {DEFAULT_USER_ID}), type, is_active, sort_order, updated_at
        FROM cardio_type_settings
        """
    )
    conn.execute("DROP TABLE cardio_type_settings")
    conn.execute("ALTER TABLE cardio_type_settings_v069 RENAME TO cardio_type_settings")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cardio_type_settings_user_id "
        "ON cardio_type_settings(user_id)"
    )


def _migration_v070_meal_plans_to_workouts(conn: sqlite3.Connection) -> None:
    """Copy per-user meal plan tables shared → workouts; preserve ids; keep shared for dual-read."""
    from database.meal_plans_storage import (
        MEAL_PLAN_COPY_ORDER,
        META_MEAL_PLANS_IN_WORKOUTS,
    )

    try:
        row = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            (META_MEAL_PLANS_IN_WORKOUTS,),
        ).fetchone()
        if row is not None and str(row[0]) == "1":
            return
    except sqlite3.Error:
        pass

    if not is_shared_attached(conn):
        attach_shared(conn)

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )

    for table in MEAL_PLAN_COPY_ORDER:
        if not _table_exists(conn, SHARED_SCHEMA, table):
            continue
        if not _table_exists(conn, "main", table):
            ddl = conn.execute(
                f"""
                SELECT sql FROM {SHARED_SCHEMA}.sqlite_master
                WHERE type='table' AND name = ?
                """,
                (table,),
            ).fetchone()
            if ddl and ddl[0]:
                conn.execute(str(ddl[0]))
            else:
                conn.execute(
                    f"CREATE TABLE main.{table} AS "
                    f"SELECT * FROM {SHARED_SCHEMA}.{table} WHERE 0"
                )
        main_n = conn.execute(f"SELECT COUNT(*) FROM main.{table}").fetchone()[0]
        if main_n == 0:
            conn.execute(
                f"INSERT INTO main.{table} SELECT * FROM {SHARED_SCHEMA}.{table}"
            )
        else:
            conn.execute(
                f"INSERT OR IGNORE INTO main.{table} SELECT * FROM {SHARED_SCHEMA}.{table}"
            )

    for sql in (
        "CREATE INDEX IF NOT EXISTS idx_meal_template_items_tid ON meal_template_items(template_id)",
        "CREATE INDEX IF NOT EXISTS idx_meal_plan_templates_plan ON daily_meal_plan_templates(plan_id, sort_order)",
        "CREATE INDEX IF NOT EXISTS idx_daily_meal_plans_user ON daily_meal_plans(user_id, phase, is_custom)",
        "CREATE INDEX IF NOT EXISTS idx_meal_templates_user ON meal_templates(user_id, phase)",
    ):
        try:
            conn.execute(sql)
        except sqlite3.Error:
            pass

    conn.execute(
        """
        INSERT INTO app_meta (key, value) VALUES (?, '1')
        ON CONFLICT(key) DO UPDATE SET value = '1'
        """,
        (META_MEAL_PLANS_IN_WORKOUTS,),
    )


def _migration_v071_strength_block_metadata(conn: sqlite3.Connection) -> None:
    """Nullable block metadata for regular blocks, supersets and circuits."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if not cols:
        return
    additions = {
        "block_uid": "TEXT",
        "block_type": "TEXT",
        "block_order": "INTEGER",
        "block_rounds": "INTEGER",
        "block_exercise_order": "INTEGER",
        "round_index": "INTEGER",
        "block_title": "TEXT",
    }
    for col, typ in additions.items():
        if col not in cols:
            conn.execute(f"ALTER TABLE strength_workouts ADD COLUMN {col} {typ}")
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_strength_workouts_block_order
        ON strength_workouts(user_id, date, workout_title, block_order, round_index, block_exercise_order)
        """
    )


def _migration_v072_exercise_set_block_metadata(conn: sqlite3.Connection) -> None:
    """Persist block/superset/circuit structure in strength exercise-set templates."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(exercise_set_items)")}
    if not cols:
        return
    additions = {
        "block_uid": "TEXT",
        "block_type": "TEXT",
        "block_order": "INTEGER",
        "block_rounds": "INTEGER",
        "block_exercise_order": "INTEGER",
        "block_title": "TEXT",
        "target_reps": "INTEGER",
        "target_weight": "REAL",
        "target_duration_sec": "INTEGER",
        "is_bodyweight": "INTEGER NOT NULL DEFAULT 0",
        "is_warmup": "INTEGER NOT NULL DEFAULT 0",
    }
    for col, typ in additions.items():
        if col not in cols:
            conn.execute(f"ALTER TABLE exercise_set_items ADD COLUMN {col} {typ}")
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_exercise_set_items_block_order
        ON exercise_set_items(set_id, block_order, block_exercise_order, exercise_order)
        """
    )


def _migration_v073_all_exercises_archive(conn: sqlite3.Connection) -> None:
    """Soft archive support for the strength exercise catalog."""
    _ensure_all_exercises_schema(conn)


def _migration_v074_calorie_calibration_history(conn: sqlite3.Connection) -> None:
    """Adaptive calorie calibration history by analysis window."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS calorie_calibration_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            window_start TEXT NOT NULL,
            window_end TEXT NOT NULL,
            days INTEGER NOT NULL,
            factor REAL NOT NULL,
            predicted_deficit_kcal REAL NOT NULL,
            observed_deficit_kcal REAL NOT NULL,
            total_intake_kcal REAL NOT NULL,
            total_predicted_expenditure_kcal REAL NOT NULL,
            weight_measurements INTEGER NOT NULL DEFAULT 0,
            food_days INTEGER NOT NULL DEFAULT 0,
            bracelet_days INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ok',
            note TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_calorie_calibration_history_user_date
        ON calorie_calibration_history(user_id, calculated_at)
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if {"calibration_factor", "last_calibration_date"}.issubset(cols):
        conn.execute(
            """
            UPDATE user_profile
            SET calibration_factor = 1.0,
                last_calibration_date = NULL
            WHERE calibration_factor IS NOT NULL
              AND ABS(calibration_factor - 1.0) > 0.0001
            """
        )


def _migration_v075_cardio_duration_distance_columns(conn: sqlite3.Connection) -> None:
    """Legacy v001 fresh installs used duration/distance; app code expects duration_sec/distance_km."""
    if not _table_exists(conn, "main", "cardio_workouts"):
        return
    cols = {r[1] for r in conn.execute("PRAGMA table_info(cardio_workouts)")}
    if "duration_sec" not in cols:
        conn.execute("ALTER TABLE cardio_workouts ADD COLUMN duration_sec INTEGER")
    if "distance_km" not in cols:
        conn.execute("ALTER TABLE cardio_workouts ADD COLUMN distance_km REAL")
    cols = {r[1] for r in conn.execute("PRAGMA table_info(cardio_workouts)")}
    if "duration" in cols:
        conn.execute(
            """
            UPDATE cardio_workouts
            SET duration_sec = COALESCE(duration_sec, CAST(duration AS INTEGER))
            WHERE duration IS NOT NULL
              AND (duration_sec IS NULL OR duration_sec = 0)
            """
        )
    if "distance" in cols:
        conn.execute(
            """
            UPDATE cardio_workouts
            SET distance_km = COALESCE(distance_km, distance)
            WHERE distance IS NOT NULL AND distance_km IS NULL
            """
        )


def _migration_v056_performance_composite_indexes(conn: sqlite3.Connection) -> None:
    """Composite indexes for date-range API hot paths (Performance Pass v1)."""
    for sql in (
        """
        CREATE INDEX IF NOT EXISTS idx_food_entries_user_phase_date
        ON food_entries(user_id, phase, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_strength_user_date
        ON strength_workouts(user_id, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_strength_user_date_title
        ON strength_workouts(user_id, date, workout_title)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cardio_user_date
        ON cardio_workouts(user_id, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_hr_workout_source
        ON workout_heart_rate(cardio_workout_id, source_type)
        """,
    ):
        conn.execute(sql)


def _migration_v057_passive_heart_rate_samples(conn: sqlite3.Connection) -> None:
    """Continuous passive HR from Health Connect (minute-level timeline)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS passive_heart_rate_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            recorded_at TEXT NOT NULL,
            bpm INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT 'health_connect',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, recorded_at)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_passive_hr_user_time
        ON passive_heart_rate_samples(user_id, recorded_at)
        """
    )


def _migration_v058_hc_analytics_prefs(conn: sqlite3.Connection) -> None:
    cols = {row[1] for row in conn.execute("PRAGMA table_info(user_profile)")}
    if "hc_analytics_prefs" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN hc_analytics_prefs TEXT")


def _migration_v059_forma_sync_tracking(conn: sqlite3.Connection) -> None:
    """FormaSync change tracking columns + conflict log (additive)."""
    sync_tables = (
        "food_entries",
        "body_metrics",
        "stretching_log",
        "cardio_workouts",
        "daily_bracelet_calories",
        "strength_workouts",
        "workout_presets",
    )
    sync_columns: tuple[tuple[str, str], ...] = (
        ("updated_at", "TEXT"),
        ("deleted_at", "TEXT"),
        ("sync_status", "TEXT NOT NULL DEFAULT 'synced'"),
        ("device_id", "TEXT"),
        ("last_synced_revision", "INTEGER"),
    )
    now_iso = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    for table in sync_tables:
        if not _table_exists(conn, "main", table):
            continue
        existing = _pragma_cols(conn, table)
        for col, ddl in sync_columns:
            if col not in existing:
                conn.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
        if "updated_at" in _pragma_cols(conn, table):
            conn.execute(
                f"UPDATE {table} SET updated_at = ? WHERE updated_at IS NULL OR updated_at = ''",
                (now_iso,),
            )
        conn.execute(
            f"CREATE INDEX IF NOT EXISTS idx_{table}_sync_status ON {table}(sync_status)"
        )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS sync_conflicts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_label TEXT NOT NULL,
            local_payload_json TEXT NOT NULL,
            server_payload_json TEXT,
            previous_payload_json TEXT,
            remote_updated_at TEXT,
            winner TEXT,
            created_at TEXT NOT NULL,
            resolved INTEGER DEFAULT 0
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS forma_sync_touch (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (entity_type, entity_key)
        )
        """
    )


def _migration_v055_strength_hr_mappings(conn: sqlite3.Connection) -> None:
    """Persisted HR block mappings + session meta (verified/manual analysis layer)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_hr_session_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            hr_workout_id INTEGER,
            mapping_status TEXT NOT NULL DEFAULT 'auto',
            verified_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_session_meta_user_session
        ON strength_hr_session_meta(user_id, workout_date, workout_title)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_hr_block_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'set',
            assigned_order_index INTEGER,
            exercise TEXT,
            set_number INTEGER,
            verified INTEGER NOT NULL DEFAULT 0,
            confidence TEXT,
            label TEXT,
            notes TEXT,
            source_auto_block_index INTEGER,
            original_start_sec INTEGER,
            original_end_sec INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_block_mappings_session_block
        ON strength_hr_block_mappings(user_id, workout_date, workout_title, block_index)
        """
    )
    # Bridge legacy overrides → mappings (one-time per session)
    rows = conn.execute(
        """
        SELECT user_id, workout_date, workout_title,
               block_index, start_sec, end_sec, kind, assigned_order_index,
               label, notes, source_auto_block_index, original_start_sec, original_end_sec
        FROM strength_hr_block_overrides
        ORDER BY user_id, workout_date, workout_title, block_index
        """
    ).fetchall()
    if not rows:
        return
    sessions: set[tuple[int, str, str]] = set()
    for r in rows:
        uid, wdate, wtitle = int(r[0]), str(r[1]), str(r[2])
        sessions.add((uid, wdate, wtitle))
        existing = conn.execute(
            """
            SELECT 1 FROM strength_hr_block_mappings
            WHERE user_id = ? AND workout_date = ? AND workout_title = ? AND block_index = ?
            """,
            (uid, wdate, wtitle, int(r[3])),
        ).fetchone()
        if existing:
            continue
        conn.execute(
            """
            INSERT INTO strength_hr_block_mappings (
                user_id, workout_date, workout_title, block_index,
                start_sec, end_sec, kind, assigned_order_index,
                label, notes, source_auto_block_index, original_start_sec, original_end_sec,
                verified, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP)
            """,
            (uid, wdate, wtitle, int(r[3]), int(r[4]), int(r[5]), str(r[6] or "set"),
             r[7], r[8], r[9], r[10], r[11], r[12]),
        )
    for uid, wdate, wtitle in sessions:
        meta = conn.execute(
            """
            SELECT 1 FROM strength_hr_session_meta
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, wdate, wtitle),
        ).fetchone()
        if meta:
            continue
        conn.execute(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, mapping_status, updated_at
            ) VALUES (?, ?, ?, 'manual', CURRENT_TIMESTAMP)
            """,
            (uid, wdate, wtitle),
        )


def _migration_v054_workout_source_resolver(conn: sqlite3.Connection) -> None:
    """Unified source resolver: contributions, links, user priority prefs."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_source_contributions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            cardio_workout_id INTEGER NOT NULL,
            metric TEXT NOT NULL,
            source_type TEXT NOT NULL,
            source_provider TEXT,
            origin TEXT NOT NULL DEFAULT 'imported',
            confidence TEXT,
            external_ref TEXT NOT NULL DEFAULT '',
            value_snapshot_json TEXT,
            is_effective INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            UNIQUE(cardio_workout_id, metric, source_type, external_ref)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_wsc_workout
        ON workout_source_contributions(user_id, cardio_workout_id)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_source_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            canonical_workout_id INTEGER NOT NULL,
            linked_workout_id INTEGER NOT NULL,
            link_reason TEXT NOT NULL,
            confidence TEXT,
            created_at TEXT NOT NULL,
            UNIQUE(canonical_workout_id, linked_workout_id)
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_wsl_linked
        ON workout_source_links(user_id, linked_workout_id)
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "source_priority_prefs" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN source_priority_prefs TEXT")


_SCHEMA_MIGRATIONS: tuple[tuple[int, Any], ...] = (
    (1, _migration_v001_workout_metric_columns),
    (2, _migration_v002_body_metrics),
    (3, _migration_v003_workout_exercise_template),
    (4, _migration_v004_exercise_sets),
    (5, _migration_v005_daily_weight),
    (6, _migration_v006_nutrition_plan),
    (7, _migration_v007_food_diary_tables),
    (8, _migration_v008_user_profile),
    (9, _migration_v009_strength_epley_backfill),
    (10, _migration_v010_sync_import),
    (11, _migration_v011_workout_presets),
    (12, _migration_v012_cardio_type_settings),
    (13, _migration_v013_stretching_personal),
    (14, _migration_v014_menstrual_cycle),
    (15, _migration_v015_all_exercises),
    (16, _migration_v016_shared_and_food_phase),
    (17, _migration_v017_breakfast1_breakfast2),
    (18, _migration_v018_workout_heart_rate_source_type),
    (19, _migration_v019_polar_pending_and_tokens),
    (20, _migration_v020_food_products_is_alcohol),
    (21, _migration_v021_daily_bracelet_calories),
    (22, _migration_v022_user_profile_calorie_control),
    (23, _migration_v023_use_chest_strap_priority),
    (24, _migration_v024_food_products_fiber_g),
    (25, _migration_v025_physiological_deficit_limit),
    (26, _migration_v026_cloud_tokens),
    (27, _migration_v027_strength_order_index),
    (28, _migration_v028_bracelet_calibration),
    (29, _migration_v029_meal_plan_items),
    (30, _migration_v030_daily_meal_plans_autoincrement),
    (31, _migration_v031_strength_is_circuit),
    (32, _migration_v032_polar_calories_to_chest),
    (33, _migration_v033_food_micro_nutrients),
    (34, _migration_v034_openfoodfacts),
    (35, _migration_v035_user_id_columns),
    (36, _migration_v036_user_id_preset_children),
    (37, _migration_v037_cloud_users),
    (38, _migration_v038_stretching_images_json),
    (39, _migration_v039_stretching_exercises_pk),
    (40, _migration_v040_stretching_preset_exercises_fk),
    (41, _migration_v041_sleep_data),
    (42, _migration_v042_cloud_account_tokens),
    (43, _migration_v043_user_profile_interface),
    (44, _migration_v044_polar_multitenant),
    (45, _migration_v045_local_backup_settings),
    (46, _migration_v046_meal_plan_items_drop_product_fk),
    (47, _migration_v047_food_entries_drop_product_fk),
    (48, _migration_v048_health_connect_sync_log),
    (49, _migration_v049_food_products_default_portion_g),
    (50, _migration_v050_health_connect_audit_columns),
    (51, _migration_v051_strength_hr_block_overrides),
    (52, _migration_v052_hr_block_override_training_signal),
    (54, _migration_v054_workout_source_resolver),
    (55, _migration_v055_strength_hr_mappings),
    (56, _migration_v056_performance_composite_indexes),
    (57, _migration_v057_passive_heart_rate_samples),
    (58, _migration_v058_hc_analytics_prefs),
    (59, _migration_v059_forma_sync_tracking),
    (60, _migration_v060_perf_indexes),
    (61, _migration_v061_body_metrics_user_scope),
    (62, _migration_v062_steps_bracelet_hc_user_scope),
    (63, _migration_v063_meal_plans_user_scope),
    (64, _migration_v064_meal_plans_mark_custom),
    (65, _migration_v065_drop_cloned_standard_meal_plans),
    (66, _migration_v066_stretching_log_user_date_index),
    (67, _migration_v067_account_warmup_tables),
    (68, _migration_v068_exercise_sets_user_scope),
    (69, _migration_v069_cardio_type_settings_user_scope),
    (70, _migration_v070_meal_plans_to_workouts),
    (71, _migration_v071_strength_block_metadata),
    (72, _migration_v072_exercise_set_block_metadata),
    (73, _migration_v073_all_exercises_archive),
    (74, _migration_v074_calorie_calibration_history),
    (75, _migration_v075_cardio_duration_distance_columns),
)

SCHEMA_VERSION = _SCHEMA_MIGRATIONS[-1][0]


def run_schema_migrations(conn: sqlite3.Connection) -> int:
    """
    Применить все миграции с version+1 … SCHEMA_VERSION.
    Возвращает итоговую версию схемы.
    """
    if SCHEMA_VERSION != _SCHEMA_MIGRATIONS[-1][0]:
        raise RuntimeError("SCHEMA_VERSION must match latest migration version")
    _ensure_schema_version_table(conn)
    for target_version, migrate_fn in _SCHEMA_MIGRATIONS:
        _apply_migration(conn, target_version, migrate_fn)
    return get_schema_version(conn)


def ensure_db_schema() -> None:
    """Миграции workouts.db + shared.db по schema_version."""
    import time

    last_err: Exception | None = None
    for attempt in range(5):
        conn = open_db(attach=True)
        try:
            run_schema_migrations(conn)
            _ensure_cloud_tokens_table(conn)
            from database.shared_schema import ensure_shared_schema as _ensure_shared

            _ensure_shared(conn)
            conn.commit()
            from backend.services.auth_user_service import ensure_auth_schema

            ensure_auth_schema()
            last_err = None
            break
        except sqlite3.OperationalError as err:
            last_err = err
            if "locked" not in str(err).lower() or attempt >= 4:
                raise
            time.sleep(0.4 * (attempt + 1))
        finally:
            conn.close()
    if last_err is not None:
        raise last_err
    _ensure_shared_indexes()


def _backfill_strength_epley_1rm(conn: sqlite3.Connection) -> None:
    """Заполнить epley_1rm для существующих подходов."""
    info = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "epley_1rm" not in info:
        return
    conn.execute(
        """
        UPDATE strength_workouts
        SET epley_1rm = ROUND(weight * (1.0 + reps / 30.0), 1)
        WHERE weight IS NOT NULL AND weight > 0 AND reps IS NOT NULL AND reps > 0
          AND (epley_1rm IS NULL OR epley_1rm <= 0)
        """
    )


def _ensure_user_profile_table(conn: sqlite3.Connection) -> None:
    """Личные данные для зон пульса и TRIMP (одна строка id=1)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profile (
            id INTEGER PRIMARY KEY,
            date_of_birth TEXT,
            height_cm REAL,
            max_heart_rate INTEGER,
            updated_at TEXT NOT NULL
        )
        """
    )
    _ensure_user_nutrition_settings_schema(conn)
    _ensure_user_integration_settings_schema(conn)
    _ensure_user_analytics_settings_schema(conn)
    _ensure_user_name_columns(conn)
    _ensure_user_profile_units_system(conn)
    from database.migrations_cycle import ensure_user_cycle_profile_columns

    ensure_user_cycle_profile_columns(conn)


def _ensure_user_profile_units_system(conn: sqlite3.Connection) -> None:
    """Система единиц: metric | american."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "units_system" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN units_system TEXT DEFAULT 'metric'"
        )
    conn.execute(
        """
        UPDATE user_profile
        SET units_system = 'metric'
        WHERE units_system IS NULL OR TRIM(units_system) = ''
        """
    )


def _ensure_user_integration_settings_schema(conn: sqlite3.Connection) -> None:
    """Путь к папке FIT-файлов в user_profile."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "fit_folder_path" not in cols:
        conn.execute("ALTER TABLE user_profile ADD COLUMN fit_folder_path TEXT")


def _ensure_user_nutrition_settings_schema(conn: sqlite3.Connection) -> None:
    """Настройки норм БЖУ и уровня активности в user_profile."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    for name, typedef in (
        ("protein_gram_per_kg", "REAL"),
        ("fat_gram_per_kg", "REAL"),
        ("carbs_gram_per_kg", "REAL"),
        ("activity_level", "TEXT"),
    ):
        if name not in cols:
            conn.execute(f"ALTER TABLE user_profile ADD COLUMN {name} {typedef}")


def _ensure_user_analytics_settings_schema(conn: sqlite3.Connection) -> None:
    """Учёт разминочных подходов в силовой аналитике (0 — исключать, 1 — включать)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "include_warmup_in_analytics" not in cols:
        conn.execute(
            "ALTER TABLE user_profile ADD COLUMN include_warmup_in_analytics INTEGER NOT NULL DEFAULT 0"
        )


def _ensure_user_name_columns(conn: sqlite3.Connection) -> None:
    """Имя, фамилия и отображаемое имя в профиле."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    for name in ("first_name", "last_name", "display_name"):
        if name not in cols:
            conn.execute(f"ALTER TABLE user_profile ADD COLUMN {name} TEXT")


def _ensure_sync_import_tables(conn: sqlite3.Connection) -> None:
    """Таблицы для внешних синхронизаций (Polar, Mi Fitness, FIT и т.д.)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS imported_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_name TEXT NOT NULL,
            source TEXT NOT NULL,
            imported_at TEXT NOT NULL,
            UNIQUE(file_name, source)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS gps_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            source TEXT NOT NULL,
            activity_date TEXT NOT NULL,
            file_name TEXT,
            track_data TEXT,
            created_at TEXT NOT NULL,
            cardio_workout_id INTEGER,
            UNIQUE(source, activity_date, file_name)
        )
        """
    )
    _ensure_workout_heart_rate_table(conn)
    _ensure_workout_sensors_table(conn)
    _ensure_fit_import_columns(conn)
    _ensure_bike_power_schema(conn)
    _ensure_performance_indexes(conn)
    _drop_legacy_streamlit_cache(conn)
    _ensure_strength_is_warmup_column(conn)


def _ensure_strength_is_warmup_column(conn: sqlite3.Connection) -> None:
    """Разминочные подходы: is_warmup=1, рабочие — 0 (по умолчанию)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "is_warmup" not in cols:
        conn.execute(
            "ALTER TABLE strength_workouts ADD COLUMN is_warmup INTEGER NOT NULL DEFAULT 0"
        )


def _drop_legacy_food_log(conn: sqlite3.Connection) -> None:
    """Удаляет legacy-таблицу питания Streamlit (заменена на food_entries)."""
    conn.execute("DROP TABLE IF EXISTS food_log")


def _drop_legacy_streamlit_cache(conn: sqlite3.Connection) -> None:
    """Удаляет таблицы и метаданные кэша Streamlit-дашборда (legacy UI)."""
    for table in ("cached_exercise_progress", "cached_strength_sessions"):
        conn.execute(f"DROP TABLE IF EXISTS {table}")
    has_meta = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='app_meta'"
    ).fetchone()
    if has_meta:
        cache_meta_keys = (
            "dashboard_cache_stale",
            "dashboard_cache_built_at",
            "dashboard_cache_job_active",
            "dashboard_cache_job_pct",
            "dashboard_cache_job_label",
        )
        placeholders = ",".join("?" * len(cache_meta_keys))
        conn.execute(
            f"DELETE FROM app_meta WHERE key IN ({placeholders})",
            cache_meta_keys,
        )
    conn.commit()


def _can_create_index(conn: sqlite3.Connection, sql: str) -> bool:
    """Skip composite indexes when referenced columns are not migrated yet."""
    import re

    m = re.search(r"ON\s+(\w+)\(([^)]+)\)", sql, re.IGNORECASE)
    if not m:
        return True
    table, col_list = m.group(1), m.group(2)
    if not _table_exists(conn, "main", table):
        return False
    cols = _pragma_cols(conn, table)
    for part in col_list.split(","):
        name = part.strip().split()[-1]
        if name and name not in cols:
            return False
    return True


def _ensure_performance_indexes(conn: sqlite3.Connection) -> None:
    """Индексы для ускорения API-запросов (CREATE INDEX IF NOT EXISTS)."""
    for sql in (
        "CREATE INDEX IF NOT EXISTS idx_strength_date ON strength_workouts(date)",
        "CREATE INDEX IF NOT EXISTS idx_strength_workout_title ON strength_workouts(workout_title)",
        "CREATE INDEX IF NOT EXISTS idx_strength_exercise ON strength_workouts(exercise)",
        "CREATE INDEX IF NOT EXISTS idx_cardio_date ON cardio_workouts(date)",
        "CREATE INDEX IF NOT EXISTS idx_cardio_type ON cardio_workouts(type)",
        "CREATE INDEX IF NOT EXISTS idx_cardio_type_date ON cardio_workouts(type, date)",
        "CREATE INDEX IF NOT EXISTS idx_body_date ON body_metrics(date)",
        # колонка cardio_workout_id (не workout_id)
        "CREATE INDEX IF NOT EXISTS idx_hr_workout ON workout_heart_rate(cardio_workout_id)",
        "CREATE INDEX IF NOT EXISTS idx_gps_workout ON gps_tracks(cardio_workout_id)",
        # составной индекс для выборки пульса по тренировке
        """
        CREATE INDEX IF NOT EXISTS idx_workout_hr_cardio
        ON workout_heart_rate(cardio_workout_id, elapsed_sec)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_workout_sensors_cardio
        ON workout_sensors(cardio_workout_id, elapsed_sec)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_food_entries_user_phase_date
        ON food_entries(user_id, phase, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_strength_user_date
        ON strength_workouts(user_id, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_strength_user_date_title
        ON strength_workouts(user_id, date, workout_title)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_cardio_user_date
        ON cardio_workouts(user_id, date)
        """,
        """
        CREATE INDEX IF NOT EXISTS idx_hr_workout_source
        ON workout_heart_rate(cardio_workout_id, source_type)
        """,
    ):
        if _can_create_index(conn, sql):
            conn.execute(sql)


def _ensure_workout_sensors_table(conn: sqlite3.Connection) -> None:
    """Поминутные/посекундные датчики FIT: скорость, каденс, высота, температура."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_sensors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            speed_kmh REAL,
            cadence REAL,
            elevation_m REAL,
            temperature_c REAL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_workout_sensors_cardio
        ON workout_sensors(cardio_workout_id, elapsed_sec)
        """
    )


def _ensure_workout_heart_rate_table(conn: sqlite3.Connection) -> None:
    """Поминутный/посекундный пульс по велотренировке (FIT record)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_workout_hr_cardio
        ON workout_heart_rate(cardio_workout_id, elapsed_sec)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_hr_workout
        ON workout_heart_rate(cardio_workout_id)
        """
    )
    info = {row[1] for row in conn.execute("PRAGMA table_info(workout_heart_rate)")}
    if "distance_m" not in info:
        conn.execute("ALTER TABLE workout_heart_rate ADD COLUMN distance_m REAL")
    if "source_type" not in info:
        _ensure_workout_heart_rate_source_type_column(conn)


def _ensure_shared_bike_reference(conn: sqlite3.Connection) -> None:
    """Справочники Crr в shared.db."""
    tc, sm = _sh("tire_coefficients"), _sh("surface_multipliers")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {tc} (
            tire_type TEXT PRIMARY KEY,
            crr REAL NOT NULL,
            description TEXT
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {sm} (
            surface TEXT PRIMARY KEY,
            crr_multiplier REAL NOT NULL,
            description TEXT
        )
        """
    )
    _seed_tire_and_surface_reference(conn)


def _ensure_bike_power_schema(conn: sqlite3.Connection) -> None:
    """Настройки велосипеда (личные) и колонки мощности."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS bike_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            bike_weight_kg REAL NOT NULL DEFAULT 10.0,
            rider_weight_kg REAL,
            tire_type TEXT NOT NULL DEFAULT 'road_slick',
            tire_width_mm INTEGER NOT NULL DEFAULT 25,
            wheel_size_inch REAL NOT NULL DEFAULT 28,
            default_route_surface TEXT NOT NULL DEFAULT 'asphalt',
            created_at TEXT,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bike_settings_user
        ON bike_settings(user_id)
        """
    )
    _migrate_bike_settings_columns(conn)

    cardio_cols = {
        "has_power_data": "INTEGER NOT NULL DEFAULT 0",
        "avg_power_watts": "REAL",
        "estimated_avg_power_watts": "REAL",
        "power_source": "TEXT",
    }
    existing_cardio = {r[1] for r in conn.execute("PRAGMA table_info(cardio_workouts)")}
    for col, typ in cardio_cols.items():
        if col not in existing_cardio:
            conn.execute(f"ALTER TABLE cardio_workouts ADD COLUMN {col} {typ}")

    sensor_cols = {r[1] for r in conn.execute("PRAGMA table_info(workout_sensors)")}
    if "power_watts" not in sensor_cols:
        conn.execute("ALTER TABLE workout_sensors ADD COLUMN power_watts REAL")

    conn.execute(
        """
        UPDATE cardio_workouts
        SET has_power_data = 1,
            avg_power_watts = avg_power,
            power_source = 'real'
        WHERE type = 'вело'
          AND avg_power IS NOT NULL AND avg_power > 0
          AND (power_source IS NULL OR power_source = '')
          AND (has_power_data IS NULL OR has_power_data = 0)
        """
    )


def _seed_tire_and_surface_reference(conn: sqlite3.Connection) -> None:
    """Сид справочников Crr; ON CONFLICT на attached shared.* не поддерживается — OR REPLACE или shared.db напрямую."""
    tc, sm = _sh("tire_coefficients"), _sh("surface_multipliers")
    tires = [
        ("road_slick", 0.0030, "Шоссейная слик"),
        ("semi_slick", 0.0045, "Полуслик"),
        ("gravel", 0.0080, "Гравийная"),
        ("cx", 0.0120, "CX / грунтовая"),
    ]
    surfaces = [
        ("asphalt", 1.0, "Асфальт"),
        ("cobblestone", 1.5, "Брусчатка"),
        ("gravel", 2.0, "Гравий"),
        ("mixed", 1.3, "Смешанное покрытие"),
    ]

    def _seed_attached() -> None:
        for tire_type, crr, desc in tires:
            conn.execute(
                f"""
                INSERT OR REPLACE INTO {tc} (tire_type, crr, description)
                VALUES (?, ?, ?)
                """,
                (tire_type, crr, desc),
            )
        for surface, mult, desc in surfaces:
            conn.execute(
                f"""
                INSERT OR REPLACE INTO {sm} (surface, crr_multiplier, description)
                VALUES (?, ?, ?)
                """,
                (surface, mult, desc),
            )

    def _seed_direct() -> None:
        if not SHARED_DB_PATH.exists():
            return
        sc = sqlite3.connect(SHARED_DB_PATH, timeout=60.0)
        try:
            sc.execute("PRAGMA busy_timeout = 60000")
            for tire_type, crr, desc in tires:
                sc.execute(
                    """
                    INSERT OR REPLACE INTO tire_coefficients (tire_type, crr, description)
                    VALUES (?, ?, ?)
                    """,
                    (tire_type, crr, desc),
                )
            for surface, mult, desc in surfaces:
                sc.execute(
                    """
                    INSERT OR REPLACE INTO surface_multipliers (surface, crr_multiplier, description)
                    VALUES (?, ?, ?)
                    """,
                    (surface, mult, desc),
                )
            sc.commit()
        finally:
            sc.close()

    try:
        _seed_attached()
    except sqlite3.OperationalError:
        _seed_direct()


def _migrate_bike_settings_columns(conn: sqlite3.Connection) -> None:
    """Добавляет новые колонки и пересоздаёт legacy bike_settings при необходимости."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(bike_settings)")}
    if not cols:
        return
    additions = {
        "tire_type": "TEXT NOT NULL DEFAULT 'road_slick'",
        "tire_width_mm": "INTEGER NOT NULL DEFAULT 25",
        "wheel_size_inch": "REAL NOT NULL DEFAULT 28",
        "default_route_surface": "TEXT NOT NULL DEFAULT 'asphalt'",
    }
    for name, typedef in additions.items():
        if name not in cols:
            conn.execute(f"ALTER TABLE bike_settings ADD COLUMN {name} {typedef}")
    if "rider_weight_kg" not in cols:
        conn.execute("ALTER TABLE bike_settings ADD COLUMN rider_weight_kg REAL")
    _rebuild_bike_settings_table_if_legacy(conn)


def _rebuild_bike_settings_table_if_legacy(conn: sqlite3.Connection) -> None:
    """Старая схема (aero + NOT NULL rider_weight_kg) → v2 с nullable rider_weight_kg."""
    info = conn.execute("PRAGMA table_info(bike_settings)").fetchall()
    if not info:
        return
    col_names = {r[1] for r in info}
    rider_notnull = False
    for r in info:
        if r[1] == "rider_weight_kg" and int(r[3]) == 1:
            rider_notnull = True
            break
    if "frontal_area_m2" not in col_names and not rider_notnull:
        return

    conn.execute("ALTER TABLE bike_settings RENAME TO _bike_settings_legacy")
    conn.execute(
        """
        CREATE TABLE bike_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            bike_weight_kg REAL NOT NULL DEFAULT 10.0,
            rider_weight_kg REAL,
            tire_type TEXT NOT NULL DEFAULT 'road_slick',
            tire_width_mm INTEGER NOT NULL DEFAULT 25,
            wheel_size_inch REAL NOT NULL DEFAULT 28,
            default_route_surface TEXT NOT NULL DEFAULT 'asphalt',
            created_at TEXT,
            updated_at TEXT
        )
        """
    )
    legacy_cols = {r[1] for r in conn.execute("PRAGMA table_info(_bike_settings_legacy)")}
    tire_type_expr = "tire_type" if "tire_type" in legacy_cols else "'road_slick'"
    tire_width_expr = "tire_width_mm" if "tire_width_mm" in legacy_cols else "25"
    wheel_expr = "wheel_size_inch" if "wheel_size_inch" in legacy_cols else "28"
    surface_expr = (
        "default_route_surface" if "default_route_surface" in legacy_cols else "'asphalt'"
    )
    conn.execute(
        f"""
        INSERT INTO bike_settings (
            id, user_id, bike_weight_kg, rider_weight_kg, tire_type,
            tire_width_mm, wheel_size_inch, default_route_surface,
            created_at, updated_at
        )
        SELECT
            id, user_id, bike_weight_kg, rider_weight_kg,
            COALESCE({tire_type_expr}, 'road_slick'),
            COALESCE({tire_width_expr}, 25),
            COALESCE({wheel_expr}, 28),
            COALESCE({surface_expr}, 'asphalt'),
            created_at, updated_at
        FROM _bike_settings_legacy
        """
    )
    conn.execute("DROP TABLE _bike_settings_legacy")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_bike_settings_user
        ON bike_settings(user_id)
        """
    )


def _ensure_fit_import_columns(conn: sqlite3.Connection) -> None:
    """Доп. колонки для импорта FIT (вело) и связи gps_tracks → cardio_workouts."""
    cardio_cols = {
        "start_time": "TEXT",
        "avg_speed_kmh": "REAL",
        "max_speed_kmh": "REAL",
        "avg_power": "REAL",
        "max_power": "REAL",
        "avg_cadence": "REAL",
        "data_source": "TEXT",
    }
    existing_cardio = {r[1] for r in conn.execute("PRAGMA table_info(cardio_workouts)")}
    for col, typ in cardio_cols.items():
        if col not in existing_cardio:
            conn.execute(f"ALTER TABLE cardio_workouts ADD COLUMN {col} {typ}")

    existing_gps = {r[1] for r in conn.execute("PRAGMA table_info(gps_tracks)")}
    if "cardio_workout_id" not in existing_gps:
        conn.execute("ALTER TABLE gps_tracks ADD COLUMN cardio_workout_id INTEGER")

    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cardio_fit_start_time
        ON cardio_workouts(type, start_time)
        WHERE start_time IS NOT NULL
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_gps_cardio_workout_id
        ON gps_tracks(cardio_workout_id)
        WHERE cardio_workout_id IS NOT NULL
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_gps_workout
        ON gps_tracks(cardio_workout_id)
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cardio_date_type_manual
        ON cardio_workouts(date, type)
        WHERE start_time IS NULL
        """
    )
    _migrate_cardio_drop_date_type_unique(conn)
    _remove_excel_bike_duplicates_when_fit(conn)


def _remove_excel_bike_duplicates_when_fit(conn: sqlite3.Connection) -> None:
    """Удаляет сводные excel-строки за день, если есть FIT-заезды с start_time."""
    conn.execute(
        """
        DELETE FROM cardio_workouts
        WHERE type = 'вело'
          AND start_time IS NULL
          AND date IN (
              SELECT DISTINCT date FROM cardio_workouts
              WHERE type = 'вело' AND start_time IS NOT NULL
          )
        """
    )
    conn.execute(
        """
        UPDATE cardio_workouts
        SET data_source = 'fit_coospo'
        WHERE type = 'вело' AND start_time IS NOT NULL
          AND (data_source IS NULL OR data_source = '')
        """
    )
    conn.execute(
        """
        UPDATE cardio_workouts
        SET data_source = 'excel'
        WHERE type = 'вело' AND start_time IS NULL
          AND (data_source IS NULL OR data_source = '')
        """
    )


def _migrate_cardio_drop_date_type_unique(conn: sqlite3.Connection) -> None:
    """
    Убирает UNIQUE(date, type) с таблицы — иначе нельзя импортировать
    несколько велозаездов в один день (FIT upsert по start_time).
  Ручной ввод без start_time по-прежнему уникален по (date, type).
    """
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='cardio_workouts'"
    ).fetchone()
    if not row or not row[0]:
        return
    ddl_norm = row[0].replace(" ", "")
    if "UNIQUE(date,type)" not in ddl_norm:
        return

    info = conn.execute("PRAGMA table_info(cardio_workouts)").fetchall()
    col_defs: list[str] = []
    col_names: list[str] = []
    for _cid, name, col_type, notnull, _dflt, pk in info:
        col_names.append(name)
        if pk:
            col_defs.append("id INTEGER PRIMARY KEY AUTOINCREMENT")
        else:
            nn = " NOT NULL" if notnull else ""
            col_defs.append(f"{name} {col_type}{nn}")

    conn.execute("ALTER TABLE cardio_workouts RENAME TO _cardio_fit_migrate_old")
    conn.execute(f"CREATE TABLE cardio_workouts ({', '.join(col_defs)})")
    cols_sql = ", ".join(col_names)
    conn.execute(
        f"INSERT INTO cardio_workouts ({cols_sql}) "
        f"SELECT {cols_sql} FROM _cardio_fit_migrate_old"
    )
    conn.execute("DROP TABLE _cardio_fit_migrate_old")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cardio_date_type_manual
        ON cardio_workouts(date, type)
        WHERE start_time IS NULL
        """
    )


def _primary_user_id_for_workout_title(conn: sqlite3.Connection, title: str) -> int:
    row = conn.execute(
        """
        SELECT user_id FROM strength_workouts
        WHERE workout_title = ? AND user_id IS NOT NULL AND user_id > 0
        GROUP BY user_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
        """,
        (title.strip(),),
    ).fetchone()
    return int(row[0]) if row else DEFAULT_USER_ID


def _distinct_strength_workout_title_users(conn: sqlite3.Connection) -> list[tuple[str, int]]:
    rows = conn.execute(
        """
        SELECT DISTINCT workout_title, user_id FROM strength_workouts
        WHERE workout_title IS NOT NULL AND TRIM(workout_title) != ''
          AND user_id IS NOT NULL AND user_id > 0
        ORDER BY workout_title COLLATE NOCASE, user_id
        """
    ).fetchall()
    out: list[tuple[str, int]] = []
    for raw_title, uid in rows:
        title = str(raw_title).strip()
        if title:
            out.append((title, int(uid)))
    return out


def _distinct_strength_workout_titles(conn: sqlite3.Connection) -> list[str]:
    return [title for title, _uid in _distinct_strength_workout_title_users(conn)]


def _distinct_exercises_for_workout_title(
    conn: sqlite3.Connection,
    title: str,
    user_id: int | None = None,
) -> list[str]:
    params: list[object] = [title.strip()]
    user_sql = ""
    if user_id is not None:
        user_sql = " AND user_id = ?"
        params.append(int(user_id))
    rows = conn.execute(
        f"""
        SELECT DISTINCT exercise FROM strength_workouts
        WHERE workout_title = ?
          AND exercise IS NOT NULL AND TRIM(exercise) != ''
          {user_sql}
        ORDER BY exercise COLLATE NOCASE
        """,
        tuple(params),
    ).fetchall()
    return [str(r[0]).strip() for r in rows if str(r[0]).strip()]


def _seed_workout_exercise_templates(conn: sqlite3.Connection) -> None:
    """Legacy table; hardcoded strength templates removed (Desktop v1)."""
    return


def _ensure_exercise_sets_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            UNIQUE(workout_type, effective_from)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            FOREIGN KEY (set_id) REFERENCES exercise_sets(id) ON DELETE CASCADE
        )
        """
    )
    n = conn.execute("SELECT COUNT(*) FROM exercise_sets").fetchone()[0]
    if n == 0:
        if conn.execute(
            "SELECT COUNT(*) FROM workout_exercise_template"
        ).fetchone()[0] > 0:
            _migrate_template_to_exercise_sets(conn)
    _seed_default_exercise_sets(conn)


def _insert_exercise_set(
    conn: sqlite3.Connection,
    workout_type: str,
    effective_from: str,
    exercises: list[str],
    *,
    effective_to: str | None = None,
    is_default: int = 0,
    set_name: str | None = None,
    user_id: int | None = None,
) -> int:
    uid = int(user_id) if user_id is not None else _primary_user_id_for_workout_title(conn, workout_type)
    cur = conn.execute(
        """
        INSERT INTO exercise_sets
        (user_id, workout_type, set_name, effective_from, effective_to, is_default)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            uid,
            workout_type,
            set_name or ("Исходный" if is_default else None),
            effective_from[:10],
            effective_to,
            is_default,
        ),
    )
    set_id = int(cur.lastrowid)
    for order, name in enumerate(exercises):
        conn.execute(
            """
            INSERT INTO exercise_set_items (set_id, exercise_order, exercise_name, user_id)
            VALUES (?, ?, ?, ?)
            """,
            (set_id, order, name, uid),
        )
    return set_id


def _seed_exercise_sets(conn: sqlite3.Connection) -> None:
    """No-op: built-in strength exercise sets removed (Desktop v1)."""
    return


def _seed_default_exercise_sets(conn: sqlite3.Connection) -> None:
    """
    Для workout_type из истории strength_workouts без exercise_set — набор из фактических упражнений.
    Hardcoded WORKOUT_EXERCISES не используется.
    """
    for title, uid in _distinct_strength_workout_title_users(conn):
        exists = conn.execute(
            "SELECT 1 FROM exercise_sets WHERE workout_type = ? AND user_id = ? LIMIT 1",
            (title, uid),
        ).fetchone()
        if exists:
            continue
        exercises = _distinct_exercises_for_workout_title(conn, title, uid)
        if not exercises:
            continue
        _insert_exercise_set(
            conn,
            title,
            EXERCISE_SET_DEFAULT_FROM,
            exercises,
            is_default=1,
            set_name="Исходный",
            user_id=uid,
        )


def _migrate_template_to_exercise_sets(conn: sqlite3.Connection) -> None:
    """Перенос версий из workout_exercise_template в exercise_sets."""
    rows = conn.execute(
        """
        SELECT workout_title, effective_from
        FROM workout_exercise_template
        GROUP BY workout_title, effective_from
        ORDER BY workout_title, effective_from
        """
    ).fetchall()
    by_type: dict[str, list[str]] = {}
    for title, eff in rows:
        by_type.setdefault(title, []).append(str(eff)[:10])

    for workout_type, dates in by_type.items():
        for i, eff in enumerate(dates):
            eff_to = None
            if i + 1 < len(dates):
                nxt = date.fromisoformat(dates[i + 1])
                eff_to = (nxt - timedelta(days=1)).isoformat()
            is_default = int(
                eff <= EXERCISE_SET_DEFAULT_FROM
                or eff == _TEMPLATE_SEED_DATE[:10]
            )
            ex_rows = conn.execute(
                """
                SELECT exercise FROM workout_exercise_template
                WHERE workout_title = ? AND effective_from = ?
                ORDER BY sort_order, exercise
                """,
                (workout_type, eff),
            ).fetchall()
            exercises = [r[0] for r in ex_rows]
            if not exercises:
                continue
            _insert_exercise_set(
                conn,
                workout_type,
                eff,
                exercises,
                effective_to=eff_to,
                is_default=is_default,
            )

    if conn.execute("SELECT COUNT(*) FROM exercise_sets").fetchone()[0] == 0:
        _seed_exercise_sets(conn)


def _migrate_preset_exercises_to_preset_sets(conn: sqlite3.Connection) -> None:
    """Заполняет preset_sets из legacy default_reps (+ / ,)."""
    from backend.services.preset_sets_utils import (
        is_plank_exercise,
        legacy_default_reps_to_sets,
        parse_reps_tokens,
    )

    rows = conn.execute(
        """
        SELECT id, exercise_name, default_sets, default_reps, default_weight, is_bodyweight
        FROM preset_exercises
        """
    ).fetchall()
    for row in rows:
        pe_id = int(row[0])
        existing = conn.execute(
            "SELECT COUNT(*) FROM preset_sets WHERE preset_exercise_id = ?",
            (pe_id,),
        ).fetchone()[0]
        if existing:
            continue
        name = str(row[1] or "")
        is_bw = bool(int(row[5] or 0)) or is_plank_exercise(name)
        if is_bw and not int(row[5] or 0):
            conn.execute(
                "UPDATE preset_exercises SET is_bodyweight = 1 WHERE id = ?",
                (pe_id,),
            )
        default_reps = row[3] or ""
        if default_reps and parse_reps_tokens(default_reps):
            sets = legacy_default_reps_to_sets(
                default_reps,
                row[2],
                row[4],
                is_bodyweight=is_bw,
            )
        else:
            sets = legacy_default_reps_to_sets(
                None,
                row[2],
                row[4],
                is_bodyweight=is_bw,
            )
        for s in sets:
            conn.execute(
                """
                INSERT INTO preset_sets
                (preset_exercise_id, set_number, reps, weight, duration_sec, is_warmup)
                VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    pe_id,
                    s["set_number"],
                    s["reps"],
                    s["weight"],
                    s.get("duration_sec"),
                    s["is_warmup"],
                ),
            )


def _migrate_plank_duration_in_strength_workouts(conn: sqlite3.Connection) -> None:
    """Планка: вес → duration_sec, вес обнулить."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "duration_sec" not in cols:
        return
    conn.execute(
        """
        UPDATE strength_workouts
        SET duration_sec = CAST(weight AS INTEGER),
            weight = NULL,
            is_bodyweight = 1,
            reps = 1
        WHERE LOWER(exercise) LIKE '%планк%'
          AND weight IS NOT NULL AND weight > 0
          AND (duration_sec IS NULL OR duration_sec = 0)
        """
    )


def _ensure_workout_presets_schema(conn: sqlite3.Connection) -> None:
    """Таблицы пресетов тренировок и preset_id в strength_workouts."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS workout_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS preset_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_id INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            exercise_order INTEGER DEFAULT 0,
            default_sets INTEGER DEFAULT 4,
            default_reps TEXT,
            default_weight REAL,
            notes TEXT,
            FOREIGN KEY (preset_id) REFERENCES workout_presets(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_preset_exercises_preset "
        "ON preset_exercises(preset_id, exercise_order)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_workout_presets_active "
        "ON workout_presets(is_active, name)"
    )
    _dedupe_workout_presets_by_name(conn)
    conn.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_workout_presets_user_name_unique "
        "ON workout_presets(user_id, name COLLATE NOCASE)"
    )

    sw_cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if sw_cols and "preset_id" not in sw_cols:
        conn.execute("ALTER TABLE strength_workouts ADD COLUMN preset_id INTEGER")

    pe_cols = {r[1] for r in conn.execute("PRAGMA table_info(preset_exercises)")}
    if "is_bodyweight" not in pe_cols:
        conn.execute(
            "ALTER TABLE preset_exercises ADD COLUMN is_bodyweight INTEGER NOT NULL DEFAULT 0"
        )

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS preset_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_exercise_id INTEGER NOT NULL,
            set_number INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            weight REAL,
            duration_sec INTEGER,
            is_warmup INTEGER DEFAULT 0,
            FOREIGN KEY (preset_exercise_id) REFERENCES preset_exercises(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_preset_sets_exercise "
        "ON preset_sets(preset_exercise_id, set_number)"
    )

    sw_cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "duration_sec" not in sw_cols:
        conn.execute("ALTER TABLE strength_workouts ADD COLUMN duration_sec INTEGER")
    if "is_bodyweight" not in sw_cols:
        conn.execute(
            "ALTER TABLE strength_workouts ADD COLUMN is_bodyweight INTEGER NOT NULL DEFAULT 0"
        )

    _migrate_plank_duration_in_strength_workouts(conn)

    preset_count = conn.execute("SELECT COUNT(*) FROM workout_presets").fetchone()[0]
    if preset_count == 0:
        _seed_workout_presets(conn)

    _migrate_preset_exercises_to_preset_sets(conn)
    _migrate_strength_workouts_preset_id(conn)


def _dedupe_workout_presets_by_name(conn: sqlite3.Connection) -> None:
    """Normalize duplicated presets by (user_id, lower(name)) and remap children."""
    if not _table_exists(conn, "main", "workout_presets"):
        return
    duplicates = conn.execute(
        """
        SELECT user_id, lower(trim(name)) AS norm_name
        FROM workout_presets
        GROUP BY user_id, norm_name
        HAVING COUNT(*) > 1
        """
    ).fetchall()
    if not duplicates:
        return
    for row in duplicates:
        uid = int(row[0] or 1)
        norm_name = str(row[1] or "")
        same = conn.execute(
            """
            SELECT id FROM workout_presets
            WHERE user_id = ? AND lower(trim(name)) = ?
            ORDER BY id ASC
            """,
            (uid, norm_name),
        ).fetchall()
        if len(same) < 2:
            continue
        keep_id = int(same[0][0])
        drop_ids = [int(r[0]) for r in same[1:]]
        for drop_id in drop_ids:
            conn.execute(
                "UPDATE preset_exercises SET preset_id = ? WHERE preset_id = ?",
                (keep_id, drop_id),
            )
            conn.execute(
                "UPDATE strength_workouts SET preset_id = ? WHERE preset_id = ?",
                (keep_id, drop_id),
            )
        placeholders = ", ".join("?" for _ in drop_ids)
        conn.execute(
            f"DELETE FROM workout_presets WHERE id IN ({placeholders})",
            tuple(drop_ids),
        )


def _seed_workout_presets(conn: sqlite3.Connection) -> None:
    """Пресеты только из strength_workouts (импорт/история). Без hardcoded defaults."""
    seen_keys: set[str] = {
        f"{int(r[1] or DEFAULT_USER_ID)}::{str(r[0]).strip().casefold()}"
        for r in conn.execute("SELECT name, user_id FROM workout_presets").fetchall()
        if r[0]
    }
    order_row = conn.execute(
        "SELECT COALESCE(MAX(sort_order), -1) FROM workout_presets"
    ).fetchone()
    order = int(order_row[0] or -1) + 1

    for title, uid in _distinct_strength_workout_title_users(conn):
        t = title.strip()
        key = f"{uid}::{t.casefold()}"
        if not t or key in seen_keys:
            continue
        cur = conn.execute(
            """
            INSERT INTO workout_presets (user_id, name, is_active, sort_order)
            VALUES (?, ?, 1, ?)
            """,
            (uid, t, order),
        )
        preset_id = int(cur.lastrowid)
        exercises = _distinct_exercises_for_workout_title(conn, t, uid)
        pe_cols = _pragma_cols(conn, "preset_exercises")
        for idx, exercise in enumerate(exercises):
            if pe_cols and "user_id" in pe_cols:
                conn.execute(
                    """
                    INSERT INTO preset_exercises
                    (preset_id, exercise_name, exercise_order, default_sets, default_reps, user_id)
                    VALUES (?, ?, ?, 4, '', ?)
                    """,
                    (preset_id, exercise, idx, uid),
                )
            else:
                conn.execute(
                    """
                    INSERT INTO preset_exercises
                    (preset_id, exercise_name, exercise_order, default_sets, default_reps)
                    VALUES (?, ?, ?, 4, '')
                    """,
                    (preset_id, exercise, idx),
                )
        seen_keys.add(key)
        order += 1


def _migrate_strength_workouts_preset_id(conn: sqlite3.Connection) -> None:
    """Заполнить preset_id по workout_title; неизвестные → пресет «Другое»."""
    sw_cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if not sw_cols or "preset_id" not in sw_cols:
        return

    n_unlinked = conn.execute(
        "SELECT COUNT(*) FROM strength_workouts WHERE preset_id IS NULL"
    ).fetchone()[0]
    if n_unlinked == 0:
        return

    presets = {
        str(r[1]): int(r[0])
        for r in conn.execute("SELECT id, name FROM workout_presets").fetchall()
    }

    for title, preset_id in presets.items():
        conn.execute(
            """
            UPDATE strength_workouts SET preset_id = ?
            WHERE preset_id IS NULL AND workout_title = ?
            """,
            (preset_id, title),
        )

    orphan_titles = conn.execute(
        """
        SELECT DISTINCT workout_title FROM strength_workouts
        WHERE preset_id IS NULL AND workout_title IS NOT NULL AND TRIM(workout_title) != ''
        """
    ).fetchall()
    if orphan_titles:
        other_id = presets.get("Другое")
        if other_id is None:
            max_order = conn.execute(
                "SELECT COALESCE(MAX(sort_order), -1) FROM workout_presets"
            ).fetchone()[0]
            cur = conn.execute(
                """
                INSERT INTO workout_presets (user_id, name, is_active, sort_order)
                VALUES (1, 'Другое', 0, ?)
                """,
                (int(max_order) + 1,),
            )
            other_id = int(cur.lastrowid)
            presets["Другое"] = other_id

        for (title,) in orphan_titles:
            t = str(title).strip()
            if not t:
                continue
            conn.execute(
                """
                UPDATE strength_workouts SET preset_id = ?
                WHERE preset_id IS NULL AND workout_title = ?
                """,
                (other_id, t),
            )


def _ensure_cardio_type_settings_schema(conn: sqlite3.Connection) -> None:
    """Вкладки кардио: бассейн, вело, бег — активность и порядок."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cardio_type_settings (
            type TEXT PRIMARY KEY,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    n = conn.execute("SELECT COUNT(*) FROM cardio_type_settings").fetchone()[0]
    if n > 0:
        return
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    for cardio_type, order in (
        ("бассейн", 0),
        ("вело", 1),
        ("бег", 2),
    ):
        conn.execute(
            """
            INSERT INTO cardio_type_settings (type, is_active, sort_order, updated_at)
            VALUES (?, 1, ?, ?)
            """,
            (cardio_type, order, ts),
        )


_STRETCHING_EXERCISES_JSON = (
    Path(__file__).resolve().parent.parent / "backend" / "data" / "exercises.json"
)

_STRETCHING_MUSCLE_RU: dict[str, str] = {
    "abdominals": "Пресс",
    "hamstrings": "Задняя поверхность бедра",
    "quadriceps": "Квадрицепс",
    "calves": "Икры",
    "glutes": "Ягодицы",
    "chest": "Грудь",
    "shoulders": "Плечи",
    "biceps": "Бицепс",
    "triceps": "Трицепс",
    "lats": "Широчайшие",
    "lower back": "Поясница",
    "middle back": "Спина",
    "neck": "Шея",
    "forearms": "Предплечья",
    "traps": "Трапеции",
    "adductors": "Приводящие",
    "abductors": "Отводящие",
}


def _stretching_muscle_ru(name: str) -> str:
    return _STRETCHING_MUSCLE_RU.get(name.strip().lower(), name.strip())


def _ensure_shared_food_catalog(conn: sqlite3.Connection) -> None:
    """Справочники питания в shared.db."""
    fp = _sh("food_products")
    mt, mti = _sh("meal_templates"), _sh("meal_template_items")
    dmp, dmpt = _sh("daily_meal_plans"), _sh("daily_meal_plan_templates")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {fp} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE,
            protein REAL,
            fat REAL,
            carbs REAL,
            calories REAL,
            unit TEXT NOT NULL DEFAULT 'g',
            is_composite INTEGER NOT NULL DEFAULT 0
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {mt} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            meal_type TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {mti} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (template_id) REFERENCES meal_templates(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES food_products(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {dmp} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            phase TEXT NOT NULL,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {dmpt} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            template_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (template_id) REFERENCES meal_templates(id) ON DELETE CASCADE,
            UNIQUE(plan_id, template_id)
        )
        """
    )
    mpi = _sh("meal_plan_items")
    plan_cols = _pragma_cols(conn, "daily_meal_plans")
    if plan_cols and "is_weekly" not in plan_cols:
        conn.execute(
            f"ALTER TABLE {dmp} ADD COLUMN is_weekly INTEGER NOT NULL DEFAULT 0"
        )
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {mpi} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL,
            FOREIGN KEY (plan_id) REFERENCES daily_meal_plans(id) ON DELETE CASCADE,
            FOREIGN KEY (product_id) REFERENCES food_products(id)
        )
        """
    )
    _ensure_meal_template_extended_schema(conn)
    _ensure_meal_template_item_macros(conn)
    _ensure_food_product_components(conn)
    _ensure_food_products_unified_schema(conn)
    _ensure_food_phase_products(conn)


def _ensure_shared_stretching_exercises(conn: sqlite3.Connection) -> None:
    """Справочник упражнений растяжки (shared.db)."""
    se = _sh("stretching_exercises")
    conn.execute(
        f"""
        CREATE TABLE IF NOT EXISTS {se} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            target_muscle_group TEXT,
            description TEXT,
            original_name TEXT
        )
        """
    )
    stretch_cols = _pragma_cols(conn, "stretching_exercises")
    if "original_name" not in stretch_cols:
        conn.execute(f"ALTER TABLE {se} ADD COLUMN original_name TEXT")
    if "translated" not in stretch_cols:
        conn.execute(
            f"ALTER TABLE {se} ADD COLUMN translated INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute(
            f"UPDATE {se} SET original_name = name WHERE original_name IS NULL"
        )
        conn.execute(
            f"""
            UPDATE {se}
            SET translated = 1
            WHERE original_name IS NOT NULL
              AND TRIM(name) != TRIM(original_name) COLLATE NOCASE
            """
        )
    if "original_description" not in stretch_cols:
        conn.execute(f"ALTER TABLE {se} ADD COLUMN original_description TEXT")
    if "description_translated" not in stretch_cols:
        conn.execute(
            f"ALTER TABLE {se} ADD COLUMN description_translated INTEGER NOT NULL DEFAULT 0"
        )
        conn.execute(
            f"""
            UPDATE {se}
            SET original_description = description
            WHERE original_description IS NULL AND description IS NOT NULL
            """
        )
        conn.execute(
            f"""
            UPDATE {se}
            SET description_translated = 1
            WHERE description IS NULL OR TRIM(description) = ''
            """
        )
    exercise_count = conn.execute(f"SELECT COUNT(*) FROM {se}").fetchone()[0]
    if exercise_count == 0:
        _seed_stretching_exercises(conn)


def ensure_all_exercises_catalog(conn: sqlite3.Connection | None = None) -> None:
    """
    Создаёт all_exercises и заполняет из истории (идемпотентно).
    Можно вызывать отдельно, если полная ensure_db_schema не успела из‑за блокировки БД.
    """
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
        conn.execute("PRAGMA busy_timeout = 30000")
    try:
        _ensure_all_exercises_schema(conn)
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


def _ensure_all_exercises_schema(conn: sqlite3.Connection) -> None:
    """Глобальный справочник названий силовых упражнений."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            exercise TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS all_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    cols = {r[1] for r in conn.execute("PRAGMA table_info(all_exercises)")}
    if "is_archived" not in cols:
        conn.execute("ALTER TABLE all_exercises ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0")
    if "updated_at" not in cols:
        conn.execute("ALTER TABLE all_exercises ADD COLUMN updated_at TIMESTAMP")
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_all_exercises_name "
        "ON all_exercises(name COLLATE NOCASE)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_all_exercises_active_name "
        "ON all_exercises(is_archived, name COLLATE NOCASE)"
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO all_exercises (name)
        SELECT DISTINCT TRIM(exercise)
        FROM strength_workouts
        WHERE exercise IS NOT NULL AND TRIM(exercise) != ''
        """
    )


def _ensure_menstrual_cycle_schema(conn: sqlite3.Connection) -> None:
    """Журнал и настройки женского цикла (workouts.db)."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS menstrual_cycle_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            flow_intensity TEXT,
            symptoms TEXT,
            notes TEXT,
            phase TEXT,
            user_id INTEGER NOT NULL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_menstrual_cycle_log_date "
        "ON menstrual_cycle_log(date)"
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS menstrual_cycle_settings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1 UNIQUE,
            cycle_length_days INTEGER NOT NULL DEFAULT 28,
            period_length_days INTEGER NOT NULL DEFAULT 5,
            last_period_start TEXT,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    n = conn.execute("SELECT COUNT(*) FROM menstrual_cycle_settings").fetchone()[0]
    if n == 0:
        conn.execute(
            """
            INSERT INTO menstrual_cycle_settings
            (user_id, cycle_length_days, period_length_days)
            VALUES (1, 28, 5)
            """
        )
    from database.migrations_cycle import ensure_menstrual_log_phase_column

    ensure_menstrual_log_phase_column(conn)


def _ensure_stretching_personal_schema(conn: sqlite3.Connection) -> None:
    """Пресеты и журнал растяжки (workouts.db)."""
    se = _sh("stretching_exercises")
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
        f"""
        CREATE TABLE IF NOT EXISTS stretching_preset_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_id INTEGER NOT NULL,
            exercise_id INTEGER NOT NULL,
            hold_seconds INTEGER DEFAULT 30,
            reps INTEGER DEFAULT 1,
            notes TEXT,
            exercise_order INTEGER DEFAULT 0,
            FOREIGN KEY (preset_id) REFERENCES stretching_presets(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS stretching_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            date TEXT NOT NULL,
            preset_id INTEGER NOT NULL,
            duration_minutes INTEGER,
            notes TEXT,
            FOREIGN KEY (preset_id) REFERENCES stretching_presets(id)
        )
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stretching_log_date ON stretching_log(date)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stretching_preset_exercises_preset "
        "ON stretching_preset_exercises(preset_id, exercise_order)"
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_stretching_presets_active "
        "ON stretching_presets(is_active, sort_order)"
    )

    preset_count = conn.execute("SELECT COUNT(*) FROM stretching_presets").fetchone()[0]
    if preset_count == 0:
        _seed_stretching_presets(conn)


def _seed_stretching_exercises(conn: sqlite3.Connection) -> None:
    """Наполнение из free-exercise-db (category=stretching)."""
    if not _STRETCHING_EXERCISES_JSON.is_file():
        return
    try:
        raw = json.loads(_STRETCHING_EXERCISES_JSON.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    for item in raw:
        if str(item.get("category") or "").lower() != "stretching":
            continue
        name = str(item.get("name") or "").strip()
        if not name:
            continue
        muscles = item.get("primaryMuscles") or []
        muscle_ru = ", ".join(_stretching_muscle_ru(str(m)) for m in muscles if m)
        instructions = item.get("instructions") or []
        desc_parts = [str(x).strip() for x in instructions[:2] if str(x).strip()]
        description = " ".join(desc_parts)[:500] if desc_parts else None
        try:
            conn.execute(
                f"""
                INSERT OR IGNORE INTO {_sh('stretching_exercises')} (name, target_muscle_group, description)
                VALUES (?, ?, ?)
                """,
                (name, muscle_ru or None, description),
            )
        except sqlite3.Error:
            pass


def _seed_stretching_presets(conn: sqlite3.Connection) -> None:
    """Примеры пресетов с упражнениями из базы."""
    ts = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    def exercise_id_by_name(name: str) -> int | None:
        row = conn.execute(
            f"SELECT id FROM {_sh('stretching_exercises')} WHERE name = ?",
            (name,),
        ).fetchone()
        return int(row[0]) if row else None

    presets_spec = [
        (
            "Утренняя растяжка",
            0,
            [
                ("Cat Stretch", 30, 2),
                ("Adductor/Groin", 45, 1),
                ("90/90 Hamstring", 30, 2),
                ("All Fours Quad Stretch", 30, 2),
                ("Child's Pose", 45, 1),
            ],
        ),
        (
            "Вечерняя растяжка",
            1,
            [
                ("Standing Hamstring and Calf Stretch", 45, 2),
                ("Seated Glute", 45, 2),
                ("Kneeling Hip Flexor", 30, 2),
                ("Shoulder Stretch", 30, 2),
                ("Neck-SMR", 20, 1),
            ],
        ),
    ]

    for preset_name, sort_order, exercises in presets_spec:
        resolved = []
        for ex_name, hold, reps in exercises:
            eid = exercise_id_by_name(ex_name)
            if eid is not None:
                resolved.append((eid, hold, reps))
        if not resolved:
            continue
        cur = conn.execute(
            """
            INSERT INTO stretching_presets
            (user_id, name, is_active, sort_order, created_at, updated_at)
            VALUES (1, ?, 1, ?, ?, ?)
            """,
            (preset_name, sort_order, ts, ts),
        )
        preset_id = int(cur.lastrowid)
        for idx, (eid, hold, reps) in enumerate(resolved):
            conn.execute(
                """
                INSERT INTO stretching_preset_exercises
                (preset_id, exercise_id, hold_seconds, reps, exercise_order)
                VALUES (?, ?, ?, ?, ?)
                """,
                (preset_id, eid, hold, reps, idx),
            )


def ensure_performance_indexes(conn: sqlite3.Connection) -> None:
    """Публичная обёртка: CREATE INDEX IF NOT EXISTS для API-запросов."""
    _ensure_performance_indexes(conn)


# Схема применяется в backend.main.on_startup через ensure_db_schema → run_schema_migrations.
