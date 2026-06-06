# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any

import pandas as pd

from utils.constants import (
    BODY_FIELD_DB_ALIASES,
    CARDIO_DB_BIKE,
    CARDIO_SOURCE_EXCEL,
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_MANUAL,
    EXERCISE_SET_DEFAULT_FROM,
    HR_CHART_MAX_POINTS,
    KCAL_DEFICIT_PER_KG_FAT_DAY,
    KCAL_PER_KG_FAT,
)
from utils.date_utils import format_duration, normalize_cardio_date_column, normalize_date_column
from utils.math_utils import (
    calc_pace_min_km,
    calc_pace_sec_100m,
    calc_speed_kmh,
    epley_1rm,
)

from database.connection import WORKOUTS_DB_PATH as DB_PATH

logger = logging.getLogger(__name__)


def _default_user_id() -> int:
    """Текущий пользователь из middleware (backend.database.db_utils)."""
    from backend.database.db_utils import get_current_user_id

    return get_current_user_id()


def ensure_app_meta() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
    )
    conn.commit()
    conn.close()


def meta_get(key: str) -> str | None:
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
    conn.close()
    return row[0] if row else None


def meta_set(key: str, value: str) -> None:
    ensure_app_meta()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "INSERT INTO app_meta (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()
    conn.close()


def _clean_exercise_names(exercises: list[str]) -> list[str]:
    from database.exercise_names import dedupe_exercise_names_ordered

    return dedupe_exercise_names_ordered(exercises)


def _default_user_id() -> int:
    """Текущий пользователь из middleware (backend.database.db_utils)."""
    from backend.database.db_utils import get_current_user_id

    return get_current_user_id()


def _insert_exercise_set_items(
    conn: sqlite3.Connection,
    set_id: int,
    exercises: list[str],
    user_id: int,
    items: list[dict[str, Any]] | None = None,
) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(exercise_set_items)")}
    structured = items if items is not None else [
        {"exercise_name": name, "exercise_order": order}
        for order, name in enumerate(exercises)
    ]
    supports_blocks = "block_uid" in cols
    for order, item in enumerate(structured):
        name = str(item.get("exercise_name") or item.get("exercise") or "").strip()
        if not name:
            continue
        exercise_order = int(item.get("exercise_order") if item.get("exercise_order") is not None else order)
        if supports_blocks:
            conn.execute(
                """
                INSERT INTO exercise_set_items (
                    set_id, exercise_order, exercise_name, user_id,
                    block_uid, block_type, block_order, block_rounds, block_exercise_order,
                    block_title, target_reps, target_weight, target_duration_sec,
                    is_bodyweight, is_warmup
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    set_id,
                    exercise_order,
                    name,
                    user_id,
                    item.get("block_uid"),
                    item.get("block_type"),
                    item.get("block_order"),
                    item.get("block_rounds"),
                    item.get("block_exercise_order"),
                    item.get("block_title"),
                    item.get("target_reps"),
                    item.get("target_weight"),
                    item.get("target_duration_sec"),
                    1 if item.get("is_bodyweight") else 0,
                    1 if item.get("is_warmup") else 0,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO exercise_set_items (set_id, exercise_order, exercise_name, user_id)
                VALUES (?, ?, ?, ?)
                """,
                (set_id, exercise_order, name, user_id),
            )


def get_exercise_set(workout_type: str, for_date: str) -> list[str]:
    """Упражнения, действующие на дату (с учётом effective_from / effective_to)."""
    date_str = str(for_date)[:10]
    uid = _default_user_id()
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            """
            SELECT id FROM exercise_sets
            WHERE user_id = ? AND workout_type = ?
              AND effective_from <= ?
              AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC
            LIMIT 1
            """,
            (uid, workout_type, date_str, date_str),
        ).fetchone()
        if not row:
            conn.close()
            return []
        items = conn.execute(
            """
            SELECT exercise_name FROM exercise_set_items
            WHERE set_id = ?
            ORDER BY exercise_order
            """,
            (row[0],),
        ).fetchall()
    except sqlite3.OperationalError:
        conn.close()
        return []
    conn.close()
    from database.exercise_names import dedupe_exercise_names_ordered

    return dedupe_exercise_names_ordered(r[0] for r in items)


def get_exercises_for_workout_on_date(workout_title: str, on_date: str) -> list[str]:
    """Обратная совместимость: делегирует get_exercise_set."""
    return get_exercise_set(workout_title, on_date)


def get_set_exercises(set_id: int) -> list[str]:
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT exercise_name FROM exercise_set_items
            WHERE set_id = ?
            ORDER BY exercise_order
            """,
            (set_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        conn.close()
        return []
    conn.close()
    from database.exercise_names import dedupe_exercise_names_ordered

    return dedupe_exercise_names_ordered(r[0] for r in rows)


def get_set_exercise_items(set_id: int) -> list[dict[str, Any]]:
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(exercise_set_items)")}
        block_cols = [
            "block_uid",
            "block_type",
            "block_order",
            "block_rounds",
            "block_exercise_order",
            "block_title",
            "target_reps",
            "target_weight",
            "target_duration_sec",
            "is_bodyweight",
            "is_warmup",
        ]
        select_extra = ", ".join(
            col if col in cols else f"NULL AS {col}"
            for col in block_cols
        )
        rows = conn.execute(
            f"""
            SELECT exercise_name, exercise_order, {select_extra}
            FROM exercise_set_items
            WHERE set_id = ?
            ORDER BY exercise_order, id
            """,
            (set_id,),
        ).fetchall()
    except sqlite3.OperationalError:
        conn.close()
        return []
    conn.close()
    out: list[dict[str, Any]] = []
    for r in rows:
        item = dict(r)
        item["exercise"] = item.get("exercise_name")
        out.append(item)
    return out


def get_all_sets(workout_type: str) -> list[dict]:
    """Все наборы типа тренировки с периодами действия (только текущий user_id)."""
    uid = _default_user_id()
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT s.id, s.set_name, s.effective_from, s.effective_to, s.is_default,
                   (SELECT COUNT(*) FROM exercise_set_items i WHERE i.set_id = s.id) AS n_exercises
            FROM exercise_sets s
            WHERE s.user_id = ? AND s.workout_type = ?
            ORDER BY s.effective_from
            """,
            (uid, workout_type),
        ).fetchall()
    except sqlite3.OperationalError:
        conn.close()
        return []
    conn.close()
    keys = ("id", "set_name", "effective_from", "effective_to", "is_default", "n_exercises")
    return [dict(zip(keys, r)) for r in rows]


def get_active_set_id(workout_type: str, for_date: str) -> int | None:
    """ID набора, действующего на дату (только текущий user_id)."""
    date_str = str(for_date)[:10]
    uid = _default_user_id()
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            """
            SELECT id FROM exercise_sets
            WHERE user_id = ? AND workout_type = ?
              AND effective_from <= ?
              AND (effective_to IS NULL OR effective_to >= ?)
            ORDER BY effective_from DESC
            LIMIT 1
            """,
            (uid, workout_type, date_str, date_str),
        ).fetchone()
    except sqlite3.OperationalError:
        conn.close()
        return None
    conn.close()
    return int(row[0]) if row else None


def get_exercise_set_row(set_id: int) -> dict | None:
    """Метаданные набора по id (только текущий user_id)."""
    uid = _default_user_id()
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            """
            SELECT id, workout_type, set_name, effective_from, effective_to, is_default
            FROM exercise_sets WHERE id = ? AND user_id = ?
            """,
            (set_id, uid),
        ).fetchone()
    except sqlite3.OperationalError:
        conn.close()
        return None
    conn.close()
    if not row:
        return None
    keys = ("id", "workout_type", "set_name", "effective_from", "effective_to", "is_default")
    return dict(zip(keys, row))


def update_exercise_set_by_id(
    set_id: int,
    exercises_list: list[str],
    set_name: str | None = None,
    items: list[dict[str, Any]] | None = None,
) -> int:
    """Обновляет состав (и при необходимости название) существующего набора."""
    from database.migrations import ensure_db_schema

    ensure_db_schema()
    row = get_exercise_set_row(set_id)
    if not row:
        raise ValueError("Набор не найден")
    clean = _clean_exercise_names(exercises_list)
    if not clean:
        raise ValueError("Список упражнений пуст")

    conn = sqlite3.connect(DB_PATH)
    uid = _default_user_id()
    conn.execute("DELETE FROM exercise_set_items WHERE set_id = ?", (set_id,))
    _insert_exercise_set_items(conn, set_id, clean, uid, items=items)
    if set_name is not None:
        conn.execute(
            "UPDATE exercise_sets SET set_name = ? WHERE id = ? AND user_id = ?",
            (set_name.strip() or None, set_id, uid),
        )
    conn.commit()
    conn.close()
    return set_id


def save_exercise_set(
    workout_type: str,
    effective_from: str,
    exercises_list: list[str],
    set_name: str | None = None,
    items: list[dict[str, Any]] | None = None,
) -> int:
    """
    Создаёт или обновляет набор с даты effective_from.
    Предыдущий открытый набор закрывается (effective_to = день до новой даты).
    """
    from database.migrations import ensure_db_schema

    ensure_db_schema()
    eff = str(effective_from)[:10]
    clean = _clean_exercise_names(exercises_list)
    if not clean:
        raise ValueError("Список упражнений пуст")

    conn = sqlite3.connect(DB_PATH)
    uid = _default_user_id()
    day_before = (date.fromisoformat(eff) - timedelta(days=1)).isoformat()

    prev = conn.execute(
        """
        SELECT id FROM exercise_sets
        WHERE user_id = ? AND workout_type = ? AND effective_from < ?
          AND (effective_to IS NULL OR effective_to >= ?)
        ORDER BY effective_from DESC
        LIMIT 1
        """,
        (uid, workout_type, eff, eff),
    ).fetchone()
    if prev:
        conn.execute(
            """
            UPDATE exercise_sets SET effective_to = ?
            WHERE id = ? AND (effective_to IS NULL OR effective_to >= ?)
            """,
            (day_before, prev[0], eff),
        )

    existing = conn.execute(
        """
        SELECT id, is_default FROM exercise_sets
        WHERE user_id = ? AND workout_type = ? AND effective_from = ?
        """,
        (uid, workout_type, eff),
    ).fetchone()

    if existing:
        set_id, is_default = int(existing[0]), int(existing[1])
        if is_default and eff != EXERCISE_SET_DEFAULT_FROM:
            conn.close()
            raise ValueError("Нельзя перезаписать исходный набор по другой дате")
        conn.execute("DELETE FROM exercise_set_items WHERE set_id = ?", (set_id,))
        if set_name is not None:
            conn.execute(
                "UPDATE exercise_sets SET set_name = ? WHERE id = ? AND user_id = ?",
                (set_name, set_id, uid),
            )
    else:
        cur = conn.execute(
            """
            INSERT INTO exercise_sets
            (user_id, workout_type, set_name, effective_from, effective_to, is_default)
            VALUES (?, ?, ?, ?, NULL, 0)
            """,
            (uid, workout_type, set_name, eff),
        )
        set_id = int(cur.lastrowid)

    _insert_exercise_set_items(conn, set_id, clean, uid, items=items)

    conn.execute(
        """
        UPDATE exercise_sets SET effective_to = ?
        WHERE user_id = ? AND workout_type = ? AND effective_from > ?
          AND (effective_to IS NULL OR effective_to < effective_from)
        """,
        (day_before, uid, workout_type, eff),
    )
    conn.commit()
    conn.close()
    return set_id


def delete_exercise_set(set_id: int) -> str:
    """
    Удаляет набор. Возвращает: 'ok', 'not_found', 'default', 'in_use'.
    """
    if not DB_PATH.exists():
        return "not_found"
    uid = _default_user_id()
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        """
        SELECT workout_type, effective_from, effective_to, is_default
        FROM exercise_sets WHERE id = ? AND user_id = ?
        """,
        (set_id, uid),
    ).fetchone()
    if not row:
        conn.close()
        return "not_found"
    workout_type, eff_from, eff_to, is_default = row
    if is_default:
        conn.close()
        return "default"
    end = eff_to or "9999-12-31"
    used = conn.execute(
        """
        SELECT COUNT(*) FROM strength_workouts
        WHERE workout_title = ? AND user_id = ? AND date >= ? AND date <= ?
        """,
        (workout_type, uid, eff_from, end),
    ).fetchone()[0]
    if used and used > 0:
        conn.close()
        return "in_use"
    conn.execute("DELETE FROM exercise_sets WHERE id = ? AND user_id = ?", (set_id, uid))
    conn.commit()
    conn.close()
    return "ok"


def reset_exercise_sets_to_default(workout_type: str) -> None:
    """Удаляет пользовательские наборы и восстанавливает исходный из истории strength_workouts."""
    from database.migrations import ensure_db_schema

    ensure_db_schema()
    uid = _default_user_id()
    conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT exercise FROM strength_workouts
            WHERE workout_title = ? AND user_id = ?
              AND exercise IS NOT NULL AND TRIM(exercise) != ''
            ORDER BY exercise COLLATE NOCASE
            """,
            (workout_type.strip(), uid),
        ).fetchall()
        exercises = [str(r[0]).strip() for r in rows if r[0]]
    finally:
        conn.close()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        DELETE FROM exercise_set_items
        WHERE set_id IN (
            SELECT id FROM exercise_sets
            WHERE user_id = ? AND workout_type = ? AND is_default = 0
        )
        """,
        (uid, workout_type),
    )
    conn.execute(
        "DELETE FROM exercise_sets WHERE user_id = ? AND workout_type = ? AND is_default = 0",
        (uid, workout_type),
    )
    default = conn.execute(
        """
        SELECT id FROM exercise_sets
        WHERE user_id = ? AND workout_type = ? AND is_default = 1
        LIMIT 1
        """,
        (uid, workout_type),
    ).fetchone()
    if default:
        set_id = int(default[0])
        conn.execute("DELETE FROM exercise_set_items WHERE set_id = ?", (set_id,))
        conn.execute(
            """
            UPDATE exercise_sets
            SET effective_from = ?, effective_to = NULL, set_name = 'Исходный'
            WHERE id = ? AND user_id = ?
            """,
            (EXERCISE_SET_DEFAULT_FROM, set_id, uid),
        )
    else:
        cur = conn.execute(
            """
            INSERT INTO exercise_sets
            (user_id, workout_type, set_name, effective_from, effective_to, is_default)
            VALUES (?, ?, 'Исходный', ?, NULL, 1)
            """,
            (uid, workout_type, EXERCISE_SET_DEFAULT_FROM),
        )
        set_id = int(cur.lastrowid)
    _insert_exercise_set_items(conn, set_id, exercises, uid)
    conn.execute(
        """
        UPDATE exercise_sets SET effective_to = NULL
        WHERE user_id = ? AND workout_type = ? AND is_default = 1
        """,
        (uid, workout_type),
    )
    conn.commit()
    conn.close()


def list_workout_template_dates(workout_title: str) -> list[str]:
    return [s["effective_from"] for s in get_all_sets(workout_title)]


def get_template_exercises(workout_title: str, effective_from: str) -> list[str]:
    eff = str(effective_from)[:10]
    for s in get_all_sets(workout_title):
        if s["effective_from"] == eff:
            return get_set_exercises(int(s["id"]))
    return []


def save_workout_exercise_template(
    workout_title: str, effective_from: str, exercises: list[str]
) -> None:
    """Обратная совместимость: делегирует save_exercise_set."""
    save_exercise_set(workout_title, effective_from, exercises)


def load_body_metrics() -> pd.DataFrame:
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    try:
        df = pd.read_sql_query(
            "SELECT * FROM body_metrics ORDER BY date DESC",
            conn,
        )
    except sqlite3.OperationalError:
        df = pd.DataFrame()
    conn.close()
    if not df.empty:
        df = normalize_date_column(df, "date")
    return df


def query_daily_calories(date_from: str, date_to: str) -> pd.DataFrame:
    """Сумма калорий по дням: силовые (chest) и кардио."""
    conn = sqlite3.connect(DB_PATH)
    strength = pd.read_sql_query(
        """
        SELECT date, SUM(kcal) AS strength_kcal FROM (
            SELECT date, workout_title,
                   MAX(COALESCE(calories_chest, calories_hr, 0)) AS kcal
            FROM strength_workouts
            WHERE date BETWEEN ? AND ?
            GROUP BY date, workout_title
        ) GROUP BY date
        """,
        conn,
        params=(date_from, date_to),
    )
    cardio = pd.read_sql_query(
        """
        SELECT date, SUM(COALESCE(calories_chest, calories_hr, calories, 0)) AS cardio_kcal
        FROM cardio_workouts
        WHERE date BETWEEN ? AND ?
        GROUP BY date
        """,
        conn,
        params=(date_from, date_to),
    )
    conn.close()
    all_dates = pd.DataFrame({"date": pd.date_range(date_from, date_to, freq="D").strftime("%Y-%m-%d")})
    out = all_dates.merge(strength, on="date", how="left").merge(cardio, on="date", how="left")
    out["strength_kcal"] = out["strength_kcal"].fillna(0)
    out["cardio_kcal"] = out["cardio_kcal"].fillna(0)
    out["total_kcal"] = out["strength_kcal"] + out["cardio_kcal"]
    return out


# ---------- CRUD ----------


def delete_strength_session(workout_date: str, workout_title: str) -> None:
    conn = sqlite3.connect(DB_PATH)
    title_val = None if workout_title == "Без названия" else workout_title
    if title_val is None:
        conn.execute(
            "DELETE FROM strength_workouts WHERE date = ? AND workout_title IS NULL",
            (workout_date,),
        )
    else:
        conn.execute(
            "DELETE FROM strength_workouts WHERE date = ? AND workout_title = ?",
            (workout_date, title_val),
        )
    conn.commit()
    conn.close()


def delete_cardio_session(row_id: int) -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("DELETE FROM workout_heart_rate WHERE cardio_workout_id = ?", (row_id,))
    conn.execute("DELETE FROM gps_tracks WHERE cardio_workout_id = ?", (row_id,))
    conn.execute("DELETE FROM cardio_workouts WHERE id = ?", (row_id,))
    conn.commit()
    conn.close()


def save_full_workout(
    workout_date: str, workout_title: str, exercises_data: list[dict],
    avg_hr: int | None = None, calories_chest: int | None = None, calories_watch: int | None = None,
) -> int:
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    inserted = 0
    for item in exercises_data:
        cur.execute(
            "DELETE FROM strength_workouts WHERE date=? AND workout_title=? AND exercise=?",
            (workout_date, workout_title, item["exercise"]),
        )
        for set_num, reps in enumerate(item["reps_list"], start=1):
            cur.execute(
                """
                INSERT INTO strength_workouts
                (date, exercise, weight, reps, set_number, notes, workout_title,
                 avg_hr, calories_chest, calories_watch)
                VALUES (?,?,?,?,?,?,?,?,?,?)
                """,
                (workout_date, item["exercise"], item["weight"], reps, set_num,
                 item.get("notes", ""), workout_title, avg_hr, calories_chest, calories_watch),
            )
            inserted += 1
    conn.commit()
    conn.close()
    return inserted


def save_cardio_workout(
    workout_date: str, cardio_type_db: str, distance_km: float,
    duration_min: int, duration_sec: int,
    avg_hr: int | None, max_hr: int | None,
    calories_chest: int | None, calories_watch: int | None, swolf: int | None = None,
) -> None:
    total_sec = int(duration_min) * 60 + int(duration_sec)
    calories = calories_chest or calories_watch
    conn = sqlite3.connect(DB_PATH)
    if cardio_type_db == CARDIO_DB_BIKE and bike_date_has_fit_workouts(
        conn, workout_date
    ):
        conn.close()
        return
    if cardio_type_db == CARDIO_DB_BIKE:
        conn.execute(
            """
            DELETE FROM cardio_workouts
            WHERE date = ? AND type = ? AND start_time IS NULL
            """,
            (workout_date, cardio_type_db),
        )
    else:
        conn.execute(
            "DELETE FROM cardio_workouts WHERE date=? AND type=?",
            (workout_date, cardio_type_db),
        )
    conn.execute(
        """
        INSERT INTO cardio_workouts
        (date, type, distance_km, duration_sec, avg_hr, max_hr, calories,
         calories_chest, calories_watch, swolf, data_source)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            workout_date, cardio_type_db, distance_km, total_sec, avg_hr, max_hr,
            calories, calories_chest, calories_watch, swolf, CARDIO_SOURCE_MANUAL,
        ),
    )
    conn.commit()
    conn.close()


def body_metric_exists(measure_date: str) -> bool:
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT 1 FROM body_metrics WHERE date = ? LIMIT 1",
        (measure_date,),
    ).fetchone()
    conn.close()
    return row is not None


def save_body_metric(measure_date: str, allow_replace: bool = False, **fields: float | None) -> str:
    """
    Сохраняет замер (INSERT OR REPLACE). Возвращает 'ok', 'duplicate' или 'empty'.
    """
    from utils.body_metrics import BODY_METRICS_FIELDS, apply_body_derived

    body_cols = BODY_METRICS_FIELDS or tuple(fields.keys())
    clean = {k: fields[k] for k in body_cols if k in fields and fields[k] is not None}
    if not any(isinstance(v, (int, float)) and v > 0 for v in clean.values()):
        return "empty"
    if body_metric_exists(measure_date) and not allow_replace:
        return "duplicate"

    conn = sqlite3.connect(DB_PATH)
    existing = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
    use_cols = [c for c in body_cols if c in existing]
    if not use_cols:
        conn.close()
        return "empty"

    # Сохраняем переданные поля; остальные при REPLACE обнулятся — подставим старые значения
    if body_metric_exists(measure_date):
        old = conn.execute(
            f"SELECT {', '.join(use_cols)} FROM body_metrics WHERE date = ?",
            (measure_date,),
        ).fetchone()
        if old:
            for i, col in enumerate(use_cols):
                if col not in clean and old[i] is not None:
                    clean[col] = old[i]

    clean = apply_body_derived(clean)

    col_list = ", ".join(("date", *use_cols))
    placeholders = ", ".join("?" * (1 + len(use_cols)))
    params = [measure_date] + [clean.get(c) for c in use_cols]
    conn.execute(
        f"INSERT OR REPLACE INTO body_metrics ({col_list}) VALUES ({placeholders})",
        params,
    )
    conn.commit()
    conn.close()
    return "ok"


def _body_value_from_row(row: pd.Series, key: str) -> float | None:
    """Читает поле; для старых БД подставляет left/right (Н/Р)."""
    for k in BODY_FIELD_DB_ALIASES.get(key, (key,)):
        if k in row.index and pd.notna(row[k]):
            try:
                v = float(row[k])
                if v > 0:
                    return v
            except (TypeError, ValueError):
                continue
    return None


def get_last_body_value_for_field(field: str) -> tuple[float | None, str | None]:
    """
    Последнее заполненное значение поля по всей истории (через SQL — надёжно для всех колонок).
    """
    if not DB_PATH.exists():
        return None, None
    cols = BODY_FIELD_DB_ALIASES.get(field, (field,))
    conn = sqlite3.connect(DB_PATH)
    try:
        existing = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
    except sqlite3.OperationalError:
        conn.close()
        return None, None
    for col in cols:
        if col not in existing:
            continue
        row = conn.execute(
            f"""
            SELECT date, {col} FROM body_metrics
            WHERE {col} IS NOT NULL AND CAST({col} AS REAL) > 0
            ORDER BY date DESC
            LIMIT 1
            """,
        ).fetchone()
        if row:
            conn.close()
            return float(row[1]), str(row[0])
    conn.close()
    return None, None


def update_cardio_row(
    row_id: int, workout_date: str, distance_km: float, duration_min: int, duration_sec: int,
    avg_hr, max_hr, calories_chest, calories_watch, swolf,
) -> None:
    total_sec = int(duration_min) * 60 + int(duration_sec)
    calories = calories_chest or calories_watch
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        UPDATE cardio_workouts SET date=?, distance_km=?, duration_sec=?,
        avg_hr=?, max_hr=?, calories=?, calories_chest=?, calories_watch=?, swolf=?
        WHERE id=?
        """,
        (workout_date, distance_km, total_sec, avg_hr, max_hr, calories,
         calories_chest, calories_watch, swolf, row_id),
    )
    conn.commit()
    conn.close()

def ensure_nutrition_plan_table() -> None:
    from database.migrations import _ensure_nutrition_plan_schema

    conn = sqlite3.connect(DB_PATH)
    _ensure_nutrition_plan_schema(conn)
    conn.commit()
    conn.close()


def _iso_to_date(iso_val: str | None) -> date | None:
    if not iso_val:
        return None
    try:
        return datetime.strptime(str(iso_val)[:10], "%Y-%m-%d").date()
    except ValueError:
        return None


def load_nutrition_plan(phase: str) -> dict[str, float | str | None]:
    """Сохранённые цели фазы cut или bulk."""
    ensure_nutrition_plan_table()
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        """
        SELECT target_fat_percent, target_weight_kg, deficit_calories,
               surplus_calories, gain_rate_kg_per_week, target_date, updated_at
        FROM nutrition_plan WHERE phase = ?
        """,
        (phase,),
    ).fetchone()
    conn.close()
    if not row:
        return {}
    keys = (
        "target_fat_percent",
        "target_weight_kg",
        "deficit_calories",
        "surplus_calories",
        "gain_rate_kg_per_week",
        "target_date",
        "updated_at",
    )
    return {k: row[i] for i, k in enumerate(keys) if row[i] is not None}


def save_nutrition_plan(phase: str, **fields: float | str | None) -> None:
    ensure_nutrition_plan_table()
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        INSERT INTO nutrition_plan (
            phase, target_fat_percent, target_weight_kg, deficit_calories,
            surplus_calories, gain_rate_kg_per_week, target_date, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(phase) DO UPDATE SET
            target_fat_percent = excluded.target_fat_percent,
            target_weight_kg = excluded.target_weight_kg,
            deficit_calories = excluded.deficit_calories,
            surplus_calories = excluded.surplus_calories,
            gain_rate_kg_per_week = excluded.gain_rate_kg_per_week,
            target_date = excluded.target_date,
            updated_at = excluded.updated_at
        """,
        (
            phase,
            fields.get("target_fat_percent"),
            fields.get("target_weight_kg"),
            fields.get("deficit_calories"),
            fields.get("surplus_calories"),
            fields.get("gain_rate_kg_per_week"),
            fields.get("target_date"),
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    conn.commit()
    conn.close()
def get_daily_weight_on_date(on_date: str) -> tuple[float | None, str | None]:
    """Вес из вкладки «Вес» (daily_weight): на дату или последний на/до неё."""
    d = on_date[:10]
    df = load_daily_weight()
    if df.empty:
        return None, None
    exact = df[df["date"].astype(str).str[:10] == d]
    if not exact.empty and pd.notna(exact.iloc[0]["weight_kg"]):
        return float(exact.iloc[0]["weight_kg"]), d
    past = df[df["date"].astype(str).str[:10] <= d].sort_values("date", ascending=False)
    if not past.empty and pd.notna(past.iloc[0]["weight_kg"]):
        row = past.iloc[0]
        return float(row["weight_kg"]), str(row["date"])[:10]
    return None, None


def get_nutrition_input_snapshot(
    on_date: str | None = None,
) -> dict[str, float | str | None]:
    """
    Для плана питания: вес — из daily_weight на дату;
    % жира и мышцы — из последнего замера body_metrics (или daily_weight).
    Жир (кг) = вес × % жира / 100.

    Только SQLite — без ensure_session_data_loaded / API.
    """
    d = (on_date or date.today().isoformat())[:10]
    weight, weight_date = get_daily_weight_on_date(d)

    fat_pct_f, body_date = get_latest_body_fat_percent()
    muscle_f = None
    if fat_pct_f is not None:
        df_body = load_body_metrics()
        if not df_body.empty and pd.notna(df_body.iloc[0].get("muscle_mass_kg")):
            m = float(df_body.iloc[0]["muscle_mass_kg"])
            if m > 0:
                muscle_f = m

    fat_kg = lean_kg = None
    if weight is not None and fat_pct_f is not None:
        fat_kg = weight * fat_pct_f / 100.0
        lean_kg = weight - fat_kg
        if muscle_f is None:
            muscle_f = lean_kg

    return {
        "as_of_date": d,
        "weight_kg": weight,
        "weight_date": weight_date,
        "body_metrics_date": body_date,
        "body_fat_percent": fat_pct_f,
        "muscle_mass_kg": muscle_f,
        "lean_mass_kg": lean_kg,
        "fat_kg": fat_kg,
    }


def _normalize_saved_kcal_per_kg_fat(
    saved: float | None,
    fat_kg: float,
) -> float:
    """В БД deficit_calories = ккал/(кг жира)/день; старые записи могли быть суммарным дефицитом."""
    if saved is None or saved <= 0:
        return KCAL_DEFICIT_PER_KG_FAT_DAY
    v = float(saved)
    if v > KCAL_DEFICIT_PER_KG_FAT_DAY + 1 and fat_kg > 0:
        # раньше хранили общий дефицит (ккал/день)
        return min(KCAL_DEFICIT_PER_KG_FAT_DAY, v / fat_kg)
    return min(KCAL_DEFICIT_PER_KG_FAT_DAY, v)


def total_cut_deficit_kcal(fat_kg: float, kcal_per_kg_fat: float) -> float:
    """Суммарный дефицит за день = ккал/(кг жира) × кг жира."""
    return kcal_per_kg_fat * fat_kg


def max_cut_daily_fat_loss_kg(fat_kg: float, kcal_per_kg_fat: float | None = None) -> float:
    """Потеря жира кг/день: (ккал/кг × жир кг) / 7700."""
    rate = kcal_per_kg_fat if kcal_per_kg_fat is not None else KCAL_DEFICIT_PER_KG_FAT_DAY
    return total_cut_deficit_kcal(fat_kg, rate) / KCAL_PER_KG_FAT


def _simulate_cut_days_strict(
    fat_kg: float,
    target_fat_kg: float,
    kcal_per_kg_fat: float | None = None,
) -> float:
    """
    День за днём: дефицит = ккал/(кг жира) × оставшийся жир (не выше 35 ккал/кг),
    потеря жира = дефицит / 7700.
    """
    if fat_kg <= target_fat_kg:
        return 0.0
    per_kg = (
        min(kcal_per_kg_fat, KCAL_DEFICIT_PER_KG_FAT_DAY)
        if kcal_per_kg_fat and kcal_per_kg_fat > 0
        else KCAL_DEFICIT_PER_KG_FAT_DAY
    )
    remaining = fat_kg
    days = 0.0
    while remaining > target_fat_kg + 1e-9:
        deficit = per_kg * remaining
        daily_loss = deficit / KCAL_PER_KG_FAT
        if daily_loss <= 0:
            break
        loss = min(daily_loss, remaining - target_fat_kg)
        remaining -= loss
        days += 1.0
        if days > 5000:
            break
    return days


def compute_cut_forecast(
    weight_kg: float,
    body_fat_percent: float,
    target_fat_percent: float,
    kcal_per_kg_fat: float | None = None,
) -> dict[str, float | date | str | None]:
    """
    Строгий прогноз сушки.
    Жир (кг) = вес × % жира / 100; безжировая масса = вес − жир (не меняется).
    Сброс веса = только сожжённый жир (кг).
    """
    fat_kg = weight_kg * body_fat_percent / 100.0
    lean_kg = weight_kg - fat_kg
    target_weight = lean_kg / (1.0 - target_fat_percent / 100.0)
    target_fat_kg = target_weight * target_fat_percent / 100.0
    fat_to_lose = fat_kg - target_fat_kg
    weight_to_lose = fat_to_lose

    per_kg_used = (
        min(kcal_per_kg_fat, KCAL_DEFICIT_PER_KG_FAT_DAY)
        if kcal_per_kg_fat and kcal_per_kg_fat > 0
        else KCAL_DEFICIT_PER_KG_FAT_DAY
    )
    total_deficit_start = total_cut_deficit_kcal(fat_kg, per_kg_used)
    daily_loss_start_kg = total_deficit_start / KCAL_PER_KG_FAT

    days = weeks = None
    target_dt = None
    if fat_to_lose > 0:
        days = _simulate_cut_days_strict(fat_kg, target_fat_kg, per_kg_used)
        if days > 0:
            weeks = days / 7.0
            target_dt = date.today() + timedelta(days=int(round(days)))

    progress = None
    if fat_kg > target_fat_kg and fat_to_lose > 0:
        progress = max(0.0, min(1.0, 1.0 - fat_to_lose / (fat_kg - target_fat_kg)))

    return {
        "fat_kg": fat_kg,
        "lean_kg": lean_kg,
        "kcal_per_kg_fat": per_kg_used,
        "total_deficit_kcal_start": total_deficit_start,
        "daily_loss_kg_fat_start": daily_loss_start_kg,
        "target_weight_kg": target_weight,
        "target_fat_kg": target_fat_kg,
        "fat_to_lose_kg": fat_to_lose,
        "weight_to_lose_kg": weight_to_lose,
        "days": days if days and days > 0 else None,
        "weeks": weeks,
        "target_date": target_dt,
        "progress": progress,
    }
def compute_bulk_forecast(
    weight_kg: float,
    target_weight_kg: float,
    gain_kg_per_week: float,
) -> dict[str, float | date | None]:
    """Прогноз набора: фиксированная скорость кг/нед → дни до целевого веса."""
    gain_kg_per_day = gain_kg_per_week / 7.0
    kg_to_gain = target_weight_kg - weight_kg
    days = weeks = None
    target_dt = None
    if gain_kg_per_day > 0 and kg_to_gain > 0:
        days = kg_to_gain / gain_kg_per_day
        weeks = days / 7.0
        target_dt = date.today() + timedelta(days=int(round(days)))
    return {
        "kg_to_gain": kg_to_gain,
        "gain_kg_per_day": gain_kg_per_day,
        "days": days,
        "weeks": weeks,
        "target_date": target_dt,
    }

def ensure_daily_weight_table() -> None:
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS daily_weight (
            date TEXT PRIMARY KEY,
            weight_kg REAL NOT NULL,
            body_fat_percent REAL
        )
        """
    )
    conn.commit()
    try:
        conn.execute("ALTER TABLE daily_weight ADD COLUMN source TEXT")
        conn.commit()
    except sqlite3.OperationalError:
        pass
    conn.close()


def load_daily_weight(user_id: int | None = None) -> pd.DataFrame:
    ensure_daily_weight_table()
    uid = user_id if user_id is not None else _default_user_id()
    conn = sqlite3.connect(DB_PATH)
    dw_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)")}
    try:
        if "user_id" in dw_cols:
            df = pd.read_sql_query(
                """
                SELECT date, weight_kg, body_fat_percent, source
                FROM daily_weight WHERE user_id = ?
                ORDER BY date DESC
                """,
                conn,
                params=(uid,),
            )
        else:
            df = pd.read_sql_query(
                "SELECT date, weight_kg, body_fat_percent, source FROM daily_weight ORDER BY date DESC",
                conn,
            )
    except sqlite3.OperationalError:
        if "user_id" in dw_cols:
            df = pd.read_sql_query(
                """
                SELECT date, weight_kg, body_fat_percent
                FROM daily_weight WHERE user_id = ?
                ORDER BY date DESC
                """,
                conn,
                params=(uid,),
            )
        else:
            df = pd.read_sql_query(
                "SELECT date, weight_kg, body_fat_percent FROM daily_weight ORDER BY date DESC",
                conn,
            )
        if not df.empty:
            df["source"] = "manual"
    conn.close()
    if not df.empty:
        df = normalize_date_column(df, "date")
    return df


def save_daily_weight(
    measure_date: str,
    weight_kg: float,
    body_fat_percent: float | None = None,
    *,
    keep_existing_fat: bool = True,
    source: str | None = None,
    user_id: int | None = None,
) -> None:
    ensure_daily_weight_table()
    d = measure_date[:10]
    uid = user_id if user_id is not None else _default_user_id()
    conn = sqlite3.connect(DB_PATH)
    dw_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)")}
    if keep_existing_fat and body_fat_percent is None:
        if "user_id" in dw_cols:
            old = conn.execute(
                "SELECT body_fat_percent FROM daily_weight WHERE user_id = ? AND date = ?",
                (uid, d),
            ).fetchone()
        else:
            old = conn.execute(
                "SELECT body_fat_percent FROM daily_weight WHERE date = ?", (d,)
            ).fetchone()
        if old and old[0] is not None:
            body_fat_percent = float(old[0])
    if "user_id" in dw_cols:
        conn.execute(
            """
            INSERT INTO daily_weight (user_id, date, weight_kg, body_fat_percent, source)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(user_id, date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                body_fat_percent = COALESCE(excluded.body_fat_percent, daily_weight.body_fat_percent),
                source = COALESCE(excluded.source, daily_weight.source)
            """,
            (uid, d, float(weight_kg), body_fat_percent, source),
        )
    else:
        conn.execute(
            """
            INSERT INTO daily_weight (date, weight_kg, body_fat_percent, source)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(date) DO UPDATE SET
                weight_kg = excluded.weight_kg,
                body_fat_percent = COALESCE(excluded.body_fat_percent, daily_weight.body_fat_percent),
                source = COALESCE(excluded.source, daily_weight.source)
            """,
            (d, float(weight_kg), body_fat_percent, source),
        )
    conn.commit()
    conn.close()


def get_weight_on_date(on_date: str) -> float | None:
    """Вес на дату: daily_weight, иначе последний вес на или до даты."""
    d = on_date[:10]
    df = load_daily_weight()
    if not df.empty:
        exact = df[df["date"].astype(str).str[:10] == d]
        if not exact.empty and pd.notna(exact.iloc[0]["weight_kg"]):
            return float(exact.iloc[0]["weight_kg"])
        past = df[df["date"].astype(str).str[:10] <= d].sort_values("date", ascending=False)
        if not past.empty and pd.notna(past.iloc[0]["weight_kg"]):
            return float(past.iloc[0]["weight_kg"])
    df_body = load_body_metrics()
    if not df_body.empty:
        row = df_body[df_body["date"].astype(str).str[:10] <= d].sort_values(
            "date", ascending=False
        )
        if not row.empty and pd.notna(row.iloc[0].get("weight_kg")):
            return float(row.iloc[0]["weight_kg"])
    return None


def get_latest_body_fat_percent() -> tuple[float | None, str | None]:
    """
    Последний % жира: сначала daily_weight (где указан жир),
    затем body_metrics. Только SQLite.
    """
    df = load_daily_weight()
    if not df.empty and "body_fat_percent" in df.columns:
        with_fat = df[df["body_fat_percent"].notna() & (df["body_fat_percent"] > 0)]
        if not with_fat.empty:
            row = with_fat.iloc[0]
            return float(row["body_fat_percent"]), str(row["date"])[:10]
    df_body = load_body_metrics()
    if not df_body.empty and pd.notna(df_body.iloc[0].get("body_fat_percent")):
        pct = float(df_body.iloc[0]["body_fat_percent"])
        if pct > 0:
            return pct, str(df_body.iloc[0]["date"])[:10]
    return None, None


def get_body_composition_for_date(on_date: str | None = None) -> dict[str, float | str | None]:
    """Вес на дату + последний жир → масса жира и «сухая» масса."""
    d = (on_date or date.today().isoformat())[:10]
    weight = get_weight_on_date(d)
    fat_pct, fat_date = get_latest_body_fat_percent()
    fat_kg = lean_kg = None
    if weight is not None and fat_pct is not None:
        fat_kg = weight * fat_pct / 100.0
        lean_kg = weight - fat_kg
    return {
        "date": d,
        "weight_kg": weight,
        "body_fat_percent": fat_pct,
        "body_fat_date": fat_date,
        "fat_mass_kg": fat_kg,
        "lean_mass_kg": lean_kg,
    }


def week_start_saturday(dt: date | pd.Timestamp | datetime) -> date:
    """Начало недели (суббота) для даты."""
    if isinstance(dt, pd.Timestamp):
        d = dt.date()
    elif isinstance(dt, datetime):
        d = dt.date()
    else:
        d = dt
    return d - timedelta(days=(d.weekday() - 5) % 7)


def _mean_positive_fat(series: pd.Series) -> float | None:
    vals = series.dropna()
    vals = vals[vals > 0]
    if vals.empty:
        return None
    return float(vals.mean())


def build_weekly_weight_stats(df: pd.DataFrame) -> pd.DataFrame:
    """Средний вес и жир по неделям; неделя начинается в субботу."""
    if df.empty:
        return pd.DataFrame()
    wdf = df.copy()
    wdf["dt"] = pd.to_datetime(wdf["date"], errors="coerce")
    wdf = wdf.dropna(subset=["dt", "weight_kg"])
    wdf["week_start"] = wdf["dt"].apply(
        lambda x: pd.Timestamp(week_start_saturday(x))
    )
    weekly = (
        wdf.groupby("week_start", as_index=False)
        .agg(
            weight_kg=("weight_kg", "mean"),
            body_fat_percent=("body_fat_percent", _mean_positive_fat),
            days=("weight_kg", "count"),
        )
        .sort_values("week_start")
    )
    weekly["fat_mass_kg"] = weekly.apply(
        lambda r: r["weight_kg"] * r["body_fat_percent"] / 100.0
        if pd.notna(r["body_fat_percent"]) and pd.notna(r["weight_kg"])
        else None,
        axis=1,
    )
    weekly["lean_mass_kg"] = weekly.apply(
        lambda r: r["weight_kg"] - r["fat_mass_kg"]
        if pd.notna(r["fat_mass_kg"])
        else None,
        axis=1,
    )
    return weekly


def _format_week_range(week_start: pd.Timestamp) -> str:
    ws = week_start.date() if hasattr(week_start, "date") else week_start
    we = ws + timedelta(days=6)
    return f"{ws.strftime('%d.%m')} – {we.strftime('%d.%m.%Y')}"


def get_current_week_weight_stats(df: pd.DataFrame) -> dict[str, float | int | None]:
    """Средние за текущую неделю (суббота–пятница)."""
    weekly = build_weekly_weight_stats(df)
    if weekly.empty:
        return {}
    cur_start = pd.Timestamp(week_start_saturday(date.today()))
    row = weekly[weekly["week_start"] == cur_start]
    if row.empty:
        return {}
    r = row.iloc[0]
    return {
        "weight_kg": float(r["weight_kg"]) if pd.notna(r["weight_kg"]) else None,
        "body_fat_percent": float(r["body_fat_percent"]) if pd.notna(r["body_fat_percent"]) else None,
        "fat_mass_kg": float(r["fat_mass_kg"]) if pd.notna(r["fat_mass_kg"]) else None,
        "lean_mass_kg": float(r["lean_mass_kg"]) if pd.notna(r["lean_mass_kg"]) else None,
        "days": int(r["days"]),
    }


# ---------- Импорт FIT / внешние синхронизации ----------

_FIT_IMPORT_SCHEMA_VERSION = 2
_FIT_IMPORT_SCHEMA_READY = 0


def ensure_fit_import_schema() -> None:
    """
    Таблицы imported_files, gps_tracks и колонки для FIT-импорта.
    Вызывать один раз до открытия долгоживущего соединения (иначе database is locked).
    """
    global _FIT_IMPORT_SCHEMA_READY
    if _FIT_IMPORT_SCHEMA_READY >= _FIT_IMPORT_SCHEMA_VERSION:
        return

    if not DB_PATH.parent.exists():
        DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    try:
        from database.connection import attach_shared
        from database.shared_schema import ensure_shared_schema

        attach_shared(conn)
        from database.migrations import _ensure_sync_import_tables

        _ensure_sync_import_tables(conn)
        ensure_shared_schema(conn)
        conn.commit()
    finally:
        conn.close()

    if DB_PATH.exists():
        from database.migrations import ensure_db_schema

        ensure_db_schema()

    _FIT_IMPORT_SCHEMA_READY = _FIT_IMPORT_SCHEMA_VERSION


def is_file_imported(
    file_name: str,
    source: str,
    *,
    conn: sqlite3.Connection | None = None,
) -> bool:
    if not DB_PATH.exists():
        return False
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH, timeout=30.0)
    row = conn.execute(
        "SELECT 1 FROM imported_files WHERE file_name = ? AND source = ? LIMIT 1",
        (file_name, source),
    ).fetchone()
    if own:
        conn.close()
    return row is not None


def mark_file_imported(
    file_name: str,
    source: str,
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        INSERT INTO imported_files (file_name, source, imported_at)
        VALUES (?, ?, ?)
        ON CONFLICT(file_name, source) DO UPDATE SET
            imported_at = excluded.imported_at
        """,
        (file_name, source, datetime.now().isoformat(timespec="seconds")),
    )
    if own:
        conn.commit()
        conn.close()


def bike_date_has_fit_workouts(
    conn: sqlite3.Connection,
    workout_date: str,
) -> bool:
    """Есть ли за день велозаезды из FIT (start_time задан)."""
    row = conn.execute(
        """
        SELECT 1 FROM cardio_workouts
        WHERE type = ? AND date = ? AND start_time IS NOT NULL
        LIMIT 1
        """,
        (CARDIO_DB_BIKE, str(workout_date)[:10]),
    ).fetchone()
    return row is not None


def bike_kcal_valid(
    chest: int | None, watch: int | None
) -> bool:
    """Есть ли ненулевые ккал (0 в Excel = пусто)."""
    return (chest is not None and chest > 0) or (watch is not None and watch > 0)


def bike_hr_valid(avg_hr: int | None, max_hr: int | None) -> bool:
    """Средний/макс. пульс из Excel (часы), 0 = пусто."""
    return (avg_hr is not None and avg_hr > 0) or (max_hr is not None and max_hr > 0)


def bike_calorie_week_starts(date_key: str) -> tuple[str, ...]:
    """Недели (суббота) для привязки сводки Excel к датам FIT (±1 месяц)."""
    key = str(date_key)[:10]
    weeks: list[str] = []
    try:
        base = pd.Timestamp(key)
        for months in (0, -1, 1):
            d = (base + pd.DateOffset(months=months)).date()
            weeks.append(week_start_saturday(d).isoformat())
    except (TypeError, ValueError):
        weeks.append(week_start_saturday(key).isoformat())
    return tuple(dict.fromkeys(weeks))


def bike_calorie_date_lookup_keys(date_key: str) -> tuple[str, ...]:
    """
    Ключи даты для поиска ккал Excel ↔ FIT.
    Сводка в Excel часто на ±1 месяц от даты заезда в FIT.
    """
    key = str(date_key)[:10]
    keys: list[str] = [key]
    try:
        ts = pd.Timestamp(key)
        keys.append((ts + pd.DateOffset(months=1)).strftime("%Y-%m-%d"))
        keys.append((ts - pd.DateOffset(months=1)).strftime("%Y-%m-%d"))
    except (TypeError, ValueError):
        pass
    return tuple(dict.fromkeys(keys))


def resolve_bike_calories_from_lookup(
    lookup: dict[str, dict],
    date_key: str,
) -> dict[str, int | None] | None:
    """Ккал из lookup: день (с учётом сдвига месяца) или неделя сб–пт."""
    by_date = lookup.get("by_date") or {}
    for k in bike_calorie_date_lookup_keys(date_key):
        ex = by_date.get(k)
        if ex and bike_kcal_valid(ex.get("chest"), ex.get("watch")):
            return ex
    by_week = lookup.get("by_week") or {}
    try:
        fit_week = week_start_saturday(
            pd.Timestamp(str(date_key)[:10]).date()
        ).isoformat()
        ex = by_week.get(fit_week)
        if ex and bike_kcal_valid(ex.get("chest"), ex.get("watch")):
            return ex
        week_keys = {
            week_start_saturday(pd.Timestamp(k).date()).isoformat()
            for k in bike_calorie_date_lookup_keys(date_key)
        }
        for wk in week_keys:
            ex = by_week.get(wk)
            if ex and bike_kcal_valid(ex.get("chest"), ex.get("watch")):
                return ex
    except (TypeError, ValueError):
        pass
    return None


def resolve_bike_hr_from_lookup(
    lookup: dict[str, dict],
    date_key: str,
) -> dict[str, int | None] | None:
    """Пульс (часы) из lookup: день ±1 месяц или неделя."""
    ex = resolve_bike_calories_from_lookup(lookup, date_key)
    if ex and bike_hr_valid(ex.get("avg_hr"), ex.get("max_hr")):
        return ex
    by_date = lookup.get("by_date") or {}
    for k in bike_calorie_date_lookup_keys(date_key):
        ex = by_date.get(k)
        if ex and bike_hr_valid(ex.get("avg_hr"), ex.get("max_hr")):
            return ex
    by_week = lookup.get("by_week") or {}
    try:
        fit_week = week_start_saturday(
            pd.Timestamp(str(date_key)[:10]).date()
        ).isoformat()
        for wk in (fit_week, *{
            week_start_saturday(pd.Timestamp(k).date()).isoformat()
            for k in bike_calorie_date_lookup_keys(date_key)
        }):
            ex = by_week.get(wk)
            if ex and bike_hr_valid(ex.get("avg_hr"), ex.get("max_hr")):
                return ex
    except (TypeError, ValueError):
        pass
    return None


def excel_bike_calories_for_date(
    conn: sqlite3.Connection,
    workout_date: str,
) -> tuple[int | None, int | None]:
    """Калории из сводной строки Excel (тот же день ±1 месяц)."""
    for key in bike_calorie_date_lookup_keys(workout_date):
        row = conn.execute(
            """
            SELECT calories_chest, calories_watch
            FROM cardio_workouts
            WHERE type = ? AND date = ? AND start_time IS NULL
            LIMIT 1
            """,
            (CARDIO_DB_BIKE, key),
        ).fetchone()
        if not row:
            continue
        chest = int(row[0]) if row[0] is not None else None
        watch = int(row[1]) if row[1] is not None else None
        if bike_kcal_valid(chest, watch):
            return chest, watch
    return None, None


def excel_bike_hr_for_date(
    conn: sqlite3.Connection,
    workout_date: str,
) -> tuple[int | None, int | None]:
    """Средний/макс. пульс из сводной строки Excel (тот же день ±1 месяц)."""
    for key in bike_calorie_date_lookup_keys(workout_date):
        row = conn.execute(
            """
            SELECT avg_hr, max_hr
            FROM cardio_workouts
            WHERE type = ? AND date = ? AND start_time IS NULL
            LIMIT 1
            """,
            (CARDIO_DB_BIKE, key),
        ).fetchone()
        if not row:
            continue
        avg_hr = int(row[0]) if row[0] is not None else None
        max_hr = int(row[1]) if row[1] is not None else None
        if bike_hr_valid(avg_hr, max_hr):
            return avg_hr, max_hr
    return None, None


def apply_excel_hr_to_fit_workout(
    conn: sqlite3.Connection,
    workout_id: int,
    workout_date: str,
) -> None:
    """Переносит пульс с часов (Excel) на FIT-строку, если в заезде пусто."""
    avg_hr, max_hr = excel_bike_hr_for_date(conn, workout_date)
    if not bike_hr_valid(avg_hr, max_hr):
        return
    conn.execute(
        """
        UPDATE cardio_workouts SET
            avg_hr = COALESCE(NULLIF(avg_hr, 0), ?),
            max_hr = COALESCE(NULLIF(max_hr, 0), ?)
        WHERE id = ?
        """,
        (avg_hr, max_hr, workout_id),
    )


def merge_excel_bike_summary_into_fit_for_date(
    conn: sqlite3.Connection,
    workout_date: str,
) -> int:
    """
    Перед удалением excel-сводки за день: ккал и пульс → все FIT-заезды этого дня.
    """
    date_str = str(workout_date)[:10]
    row = conn.execute(
        """
        SELECT avg_hr, max_hr, calories_chest, calories_watch
        FROM cardio_workouts
        WHERE type = ? AND date = ? AND start_time IS NULL
        LIMIT 1
        """,
        (CARDIO_DB_BIKE, date_str),
    ).fetchone()
    if not row:
        return 0
    avg_hr, max_hr, chest, watch = row
    avg_hr = int(avg_hr) if avg_hr is not None else None
    max_hr = int(max_hr) if max_hr is not None else None
    chest = int(chest) if chest is not None else None
    watch = int(watch) if watch is not None else None
    if not bike_hr_valid(avg_hr, max_hr) and not bike_kcal_valid(chest, watch):
        return 0
    calories = (chest or watch) if bike_kcal_valid(chest, watch) else None
    cur = conn.execute(
        """
        UPDATE cardio_workouts SET
            avg_hr = COALESCE(NULLIF(avg_hr, 0), ?),
            max_hr = COALESCE(NULLIF(max_hr, 0), ?),
            calories_chest = COALESCE(NULLIF(calories_chest, 0), ?),
            calories_watch = COALESCE(NULLIF(calories_watch, 0), ?),
            calories = COALESCE(NULLIF(calories, 0), ?)
        WHERE type = ? AND date = ? AND start_time IS NOT NULL
        """,
        (avg_hr, max_hr, chest, watch, calories, CARDIO_DB_BIKE, date_str),
    )
    return cur.rowcount


def backfill_fit_bike_hr_from_excel(conn: sqlite3.Connection | None = None) -> int:
    """Проставляет пульс с Excel-сводок на FIT-заезды (дата сводки ±1 месяц)."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    updated = 0
    rows = conn.execute(
        """
        SELECT date, avg_hr, max_hr
        FROM cardio_workouts
        WHERE type = ? AND start_time IS NULL
        """,
        (CARDIO_DB_BIKE,),
    ).fetchall()
    for date_str, avg_hr, max_hr in rows:
        avg_hr = int(avg_hr) if avg_hr is not None else None
        max_hr = int(max_hr) if max_hr is not None else None
        if not bike_hr_valid(avg_hr, max_hr):
            continue
        for target_date in bike_calorie_date_lookup_keys(str(date_str)[:10]):
            cur = conn.execute(
                """
                UPDATE cardio_workouts SET
                    avg_hr = COALESCE(NULLIF(avg_hr, 0), ?),
                    max_hr = COALESCE(NULLIF(max_hr, 0), ?)
                WHERE type = ? AND date = ? AND start_time IS NOT NULL
                  AND (
                      avg_hr IS NULL OR avg_hr <= 0
                      OR max_hr IS NULL OR max_hr <= 0
                  )
                """,
                (avg_hr, max_hr, CARDIO_DB_BIKE, target_date),
            )
            updated += cur.rowcount
    if own:
        conn.commit()
        conn.close()
    return updated


def backfill_fit_bike_calories_from_excel(conn: sqlite3.Connection | None = None) -> int:
    """Копирует ккал с Excel-строк на все FIT-заезды за тот же день. Возвращает число обновлений."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """
        SELECT date, calories_chest, calories_watch
        FROM cardio_workouts
        WHERE type = ? AND start_time IS NULL
          AND (calories_chest IS NOT NULL OR calories_watch IS NOT NULL)
        """,
        (CARDIO_DB_BIKE,),
    ).fetchall()
    updated = 0
    for date_str, chest, watch in rows:
        if not bike_kcal_valid(chest, watch):
            continue
        calories = chest or watch
        for target_date in bike_calorie_date_lookup_keys(str(date_str)[:10]):
            cur = conn.execute(
                """
                UPDATE cardio_workouts SET
                    calories_chest = COALESCE(NULLIF(calories_chest, 0), ?),
                    calories_watch = COALESCE(NULLIF(calories_watch, 0), ?),
                    calories = COALESCE(NULLIF(calories, 0), ?)
                WHERE type = ? AND date = ? AND start_time IS NOT NULL
                """,
                (chest, watch, calories, CARDIO_DB_BIKE, target_date),
            )
            updated += cur.rowcount
    if own:
        conn.commit()
        conn.close()
    return updated


def backfill_fit_bike_calories_by_week(conn: sqlite3.Connection | None = None) -> int:
    """
    Если на неделю (сб–пт) в Excel одна сводка с ккал — проставить на все FIT-заезды недели,
    у которых ещё нет ккал (типичная недельная запись в таблице).
    """
    from collections import defaultdict

    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """
        SELECT date, calories_chest, calories_watch
        FROM cardio_workouts
        WHERE type = ? AND start_time IS NULL
        """,
        (CARDIO_DB_BIKE,),
    ).fetchall()
    by_week: dict[str, list[tuple[int | None, int | None]]] = defaultdict(list)
    for date_str, chest, watch in rows:
        if not bike_kcal_valid(chest, watch):
            continue
        for wk in bike_calorie_week_starts(str(date_str)[:10]):
            by_week[wk].append((chest, watch))
    updated = 0
    for wk, entries in by_week.items():
        if len(entries) != 1:
            continue
        chest, watch = entries[0]
        calories = chest or watch
        week_end = (pd.Timestamp(wk) + timedelta(days=6)).strftime("%Y-%m-%d")
        cur = conn.execute(
            """
            UPDATE cardio_workouts SET
                calories_chest = COALESCE(NULLIF(calories_chest, 0), ?),
                calories_watch = COALESCE(NULLIF(calories_watch, 0), ?),
                calories = COALESCE(NULLIF(calories, 0), ?)
            WHERE type = ? AND start_time IS NOT NULL
              AND date >= ? AND date <= ?
              AND (calories_chest IS NULL OR calories_chest <= 0)
              AND (calories_watch IS NULL OR calories_watch <= 0)
            """,
            (chest, watch, calories, CARDIO_DB_BIKE, wk, week_end),
        )
        updated += cur.rowcount
    if own:
        conn.commit()
        conn.close()
    return updated


def apply_excel_calories_to_fit_workout(
    conn: sqlite3.Connection,
    workout_id: int,
    workout_date: str,
) -> None:
    """Переносит ккал пульсометр/часы с Excel на FIT-строку за тот же день."""
    chest, watch = excel_bike_calories_for_date(conn, workout_date)
    if not bike_kcal_valid(chest, watch):
        return
    calories = chest or watch
    conn.execute(
        """
        UPDATE cardio_workouts SET
            calories_chest = COALESCE(NULLIF(?, 0), calories_chest),
            calories_watch = COALESCE(NULLIF(?, 0), calories_watch),
            calories = COALESCE(NULLIF(?, 0), calories)
        WHERE id = ?
        """,
        (chest, watch, calories, workout_id),
    )


def backfill_all_fit_bike_calories(conn: sqlite3.Connection | None = None) -> int:
    """Проставляет ккал с Excel-сводок на все FIT-заезды (дата ±1 месяц)."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    updated = 0
    rows = conn.execute(
        """
        SELECT id, date FROM cardio_workouts
        WHERE type = ? AND start_time IS NOT NULL
        """,
        (CARDIO_DB_BIKE,),
    ).fetchall()
    for workout_id, workout_date in rows:
        before = conn.execute(
            "SELECT calories_chest, calories_watch FROM cardio_workouts WHERE id = ?",
            (int(workout_id),),
        ).fetchone()
        apply_excel_calories_to_fit_workout(conn, int(workout_id), str(workout_date)[:10])
        after = conn.execute(
            "SELECT calories_chest, calories_watch FROM cardio_workouts WHERE id = ?",
            (int(workout_id),),
        ).fetchone()
        if after != before:
            updated += 1
    if own:
        conn.commit()
        conn.close()
    return updated


def backfill_bike_hr_from_samples(conn: sqlite3.Connection | None = None) -> int:
    """avg_hr / max_hr из workout_heart_rate, если в сессии пусто."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        """
        UPDATE cardio_workouts SET
            avg_hr = COALESCE(
                NULLIF(avg_hr, 0),
                (SELECT CAST(ROUND(AVG(h.heart_rate)) AS INTEGER)
                 FROM workout_heart_rate h
                 WHERE h.cardio_workout_id = cardio_workouts.id)
            ),
            max_hr = COALESCE(
                NULLIF(max_hr, 0),
                (SELECT MAX(h.heart_rate)
                 FROM workout_heart_rate h
                 WHERE h.cardio_workout_id = cardio_workouts.id)
            )
        WHERE type = ?
          AND start_time IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM workout_heart_rate h
              WHERE h.cardio_workout_id = cardio_workouts.id
          )
        """,
        (CARDIO_DB_BIKE,),
    )
    n = cur.rowcount
    if own:
        conn.commit()
        conn.close()
    return n


def migrate_fit_calories_watch_to_chest(conn: sqlite3.Connection | None = None) -> int:
    """
    Раньше ккал из FIT попадали в calories_watch.
    Переносим в calories_chest (источник — .fit / пульсометр).
    """
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    cur = conn.execute(
        """
        UPDATE cardio_workouts SET
            calories_chest = COALESCE(NULLIF(calories_chest, 0), calories_watch, calories),
            calories = COALESCE(NULLIF(calories, 0), calories_watch, calories_chest)
        WHERE type = ?
          AND start_time IS NOT NULL
          AND (calories_chest IS NULL OR calories_chest <= 0)
          AND (COALESCE(calories_watch, 0) > 0 OR COALESCE(calories, 0) > 0)
        """,
        (CARDIO_DB_BIKE,),
    )
    n = cur.rowcount
    if own:
        conn.commit()
        conn.close()
    return n


def reconcile_bike_metrics_and_calories(conn: sqlite3.Connection | None = None) -> dict[str, int]:
    """Ккал FIT→пульсометр, пульс с Excel (часы) и из точек HR в .fit."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    result = {
        "fit_kcal_to_chest": migrate_fit_calories_watch_to_chest(conn),
        "hr_from_excel": backfill_fit_bike_hr_from_excel(conn),
        "hr_from_samples": backfill_bike_hr_from_samples(conn),
        "kcal_from_excel": backfill_all_fit_bike_calories(conn),
    }
    if own:
        conn.commit()
        conn.close()
    return result


def get_excel_bike_calories_lookup() -> dict[str, dict[str, int | None]]:
    """
    Калории вело: Excel-сводки (start_time IS NULL) и FIT-строки в БД.
    keys: by_date / by_week -> {chest, watch}; даты Excel дублируются ±1 месяц.
    """
    if not DB_PATH.exists():
        return {"by_date": {}, "by_week": {}}
    conn = sqlite3.connect(DB_PATH)
    rows = conn.execute(
        """
        SELECT date, calories_chest, calories_watch, calories, start_time,
               avg_hr, max_hr
        FROM cardio_workouts
        WHERE type = ?
        ORDER BY date, CASE WHEN start_time IS NULL OR TRIM(start_time) = '' THEN 0 ELSE 1 END
        """,
        (CARDIO_DB_BIKE,),
    ).fetchall()
    conn.close()
    by_date: dict[str, dict[str, int | None]] = {}
    for date_str, chest, watch, calories, start_time, avg_hr, max_hr in rows:
        key = str(date_str)[:10]
        entry = by_date.setdefault(
            key, {"chest": None, "watch": None, "avg_hr": None, "max_hr": None}
        )
        is_excel = start_time is None or not str(start_time).strip()
        if is_excel:
            if chest is not None:
                entry["chest"] = int(chest)
            if watch is not None:
                entry["watch"] = int(watch)
            if avg_hr is not None and int(avg_hr) > 0:
                entry["avg_hr"] = int(avg_hr)
            if max_hr is not None and int(max_hr) > 0:
                entry["max_hr"] = int(max_hr)
        else:
            if entry["chest"] is None and chest is not None:
                entry["chest"] = int(chest)
            if entry["watch"] is None and watch is not None:
                entry["watch"] = int(watch)
            if entry["avg_hr"] is None and avg_hr is not None and int(avg_hr) > 0:
                entry["avg_hr"] = int(avg_hr)
            if entry["max_hr"] is None and max_hr is not None and int(max_hr) > 0:
                entry["max_hr"] = int(max_hr)
    expanded: dict[str, dict[str, int | None]] = {}
    for key, entry in by_date.items():
        if not bike_kcal_valid(entry.get("chest"), entry.get("watch")) and not bike_hr_valid(
            entry.get("avg_hr"), entry.get("max_hr")
        ):
            continue
        for alt in bike_calorie_date_lookup_keys(key):
            expanded.setdefault(alt, dict(entry))
    by_date.update(expanded)
    by_week: dict[str, dict[str, int | None]] = {}
    for date_str, chest, watch, _cal, start_time, avg_hr, max_hr in rows:
        if not bike_kcal_valid(
            int(chest) if chest is not None else None,
            int(watch) if watch is not None else None,
        ):
            continue
        if start_time is not None and str(start_time).strip():
            continue
        entry = {
            "chest": int(chest) if chest is not None else None,
            "watch": int(watch) if watch is not None else None,
            "avg_hr": int(avg_hr) if avg_hr is not None and int(avg_hr) > 0 else None,
            "max_hr": int(max_hr) if max_hr is not None and int(max_hr) > 0 else None,
        }
        for wk in bike_calorie_week_starts(str(date_str)[:10]):
            by_week[wk] = entry
    for key, entry in by_date.items():
        if not bike_kcal_valid(entry.get("chest"), entry.get("watch")):
            continue
        wk = week_start_saturday(
            pd.Timestamp(key).date() if key else date.today()
        ).isoformat()
        by_week.setdefault(wk, entry)
    return {"by_date": by_date, "by_week": by_week}


def delete_excel_bike_placeholder_for_date(
    conn: sqlite3.Connection,
    workout_date: str,
) -> None:
    """Удаляет сводную excel-строку только за день FIT (не ±1 месяц — там сводка для ккал)."""
    conn.execute(
        """
        DELETE FROM cardio_workouts
        WHERE type = ? AND date = ? AND start_time IS NULL
        """,
        (CARDIO_DB_BIKE, str(workout_date)[:10]),
    )


def delete_cardio_workout_cascade(conn: sqlite3.Connection, workout_id: int) -> None:
    """Удаляет кардио-строку и связанные пульс/GPS/датчики."""
    conn.execute(
        "DELETE FROM workout_heart_rate WHERE cardio_workout_id = ?",
        (workout_id,),
    )
    conn.execute(
        "DELETE FROM workout_sensors WHERE cardio_workout_id = ?",
        (workout_id,),
    )
    conn.execute(
        "DELETE FROM gps_tracks WHERE cardio_workout_id = ?",
        (workout_id,),
    )
    conn.execute("DELETE FROM cardio_workouts WHERE id = ?", (workout_id,))


def cleanup_stale_fit_bike_duplicates(conn: sqlite3.Connection | None = None) -> int:
    """
    Удаляет дубликаты FIT-вело без GPS, если за тот же день есть заезд с треком
    (после смены UTC → local start_time при --reimport).
    """
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    try:
        rows = conn.execute(
            """
            SELECT o.id FROM cardio_workouts o
            WHERE o.type = ? AND o.data_source = ?
              AND o.start_time IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM gps_tracks g WHERE g.cardio_workout_id = o.id
              )
              AND EXISTS (
                SELECT 1 FROM cardio_workouts n
                INNER JOIN gps_tracks gn ON gn.cardio_workout_id = n.id
                WHERE n.type = o.type AND n.date = o.date
                  AND COALESCE(n.duration_sec, 0) = COALESCE(o.duration_sec, 0)
                  AND ROUND(COALESCE(n.distance_km, 0), 3) = ROUND(COALESCE(o.distance_km, 0), 3)
              )
            """,
            (CARDIO_DB_BIKE, CARDIO_SOURCE_FIT),
        ).fetchall()
        for (wid,) in rows:
            delete_cardio_workout_cascade(conn, int(wid))
        if own:
            conn.commit()
        return len(rows)
    finally:
        if own:
            conn.close()


def prefer_fit_bike_workouts(df: pd.DataFrame) -> pd.DataFrame:
    """
    Вкладка «Велосипед»: только заезды из .fit (start_time задан).
    Сводки Excel без FIT не показываем — у них часто неверный месяц и нет каденса/GPS/пульса.
    """
    if df.empty:
        return df
    out = df.copy()
    if "start_time" not in out.columns:
        return out.iloc[0:0]
    mask = out["start_time"].notna() & (out["start_time"].astype(str).str.strip() != "")
    if "data_source" in out.columns:
        mask = mask | (out["data_source"] == CARDIO_SOURCE_FIT)
    out = out[mask].copy()
    if out.empty:
        return out.reset_index(drop=True)
    # Дубликаты после переимпорта (старый UTC и новый local start_time)
    out["_dur"] = pd.to_numeric(out["duration_sec"], errors="coerce").fillna(0).astype(int)
    out["_dist"] = pd.to_numeric(out["distance_km"], errors="coerce").fillna(0).round(3)
    out = out.sort_values("id").drop_duplicates(
        subset=["date", "_dur", "_dist"], keep="last"
    )
    return out.drop(columns=["_dur", "_dist"], errors="ignore").reset_index(drop=True)


def upsert_cardio_workout(
    workout_date: str,
    cardio_type: str,
    *,
    start_time: str | None = None,
    distance_km: float | None = None,
    duration_sec: int | None = None,
    avg_hr: int | None = None,
    max_hr: int | None = None,
    calories_chest: int | None = None,
    calories_watch: int | None = None,
    swolf: int | None = None,
    avg_speed_kmh: float | None = None,
    max_speed_kmh: float | None = None,
    avg_power: float | None = None,
    max_power: float | None = None,
    avg_cadence: float | None = None,
    data_source: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> int:
    """
    Вставка или обновление кардио-тренировки.
    Если задан start_time — поиск/обновление по (type, start_time), иначе по (date, type).
    Возвращает id строки cardio_workouts.
    """
    date_str = str(workout_date)[:10]
    calories = calories_chest or calories_watch
    src = data_source or (CARDIO_SOURCE_FIT if start_time else CARDIO_SOURCE_EXCEL)
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)

    workout_id: int | None = None
    if start_time:
        row = conn.execute(
            "SELECT id FROM cardio_workouts WHERE type = ? AND start_time = ?",
            (cardio_type, start_time),
        ).fetchone()
        if row:
            workout_id = int(row[0])
            conn.execute(
                """
                UPDATE cardio_workouts SET
                    date = ?, distance_km = ?, duration_sec = ?,
                    avg_hr = COALESCE(?, avg_hr),
                    max_hr = COALESCE(?, max_hr),
                    calories = COALESCE(?, calories),
                    calories_chest = COALESCE(?, calories_chest),
                    calories_watch = COALESCE(?, calories_watch),
                    swolf = COALESCE(?, swolf),
                    avg_speed_kmh = COALESCE(?, avg_speed_kmh),
                    max_speed_kmh = COALESCE(?, max_speed_kmh),
                    avg_power = COALESCE(?, avg_power),
                    max_power = COALESCE(?, max_power),
                    avg_cadence = COALESCE(?, avg_cadence),
                    data_source = ?
                WHERE id = ?
                """,
                (
                    date_str, distance_km, duration_sec,
                    avg_hr, max_hr, calories,
                    calories_chest, calories_watch, swolf,
                    avg_speed_kmh, max_speed_kmh,
                    avg_power, max_power, avg_cadence,
                    src,
                    workout_id,
                ),
            )
        else:
            cur = conn.execute(
                """
                INSERT INTO cardio_workouts (
                    date, type, start_time, distance_km, duration_sec,
                    avg_hr, max_hr, calories, calories_chest, calories_watch, swolf,
                    avg_speed_kmh, max_speed_kmh, avg_power, max_power, avg_cadence,
                    data_source
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    date_str, cardio_type, start_time, distance_km, duration_sec,
                    avg_hr, max_hr, calories, calories_chest, calories_watch, swolf,
                    avg_speed_kmh, max_speed_kmh, avg_power, max_power, avg_cadence,
                    src,
                ),
            )
            workout_id = int(cur.lastrowid)
    else:
        if cardio_type == CARDIO_DB_BIKE and bike_date_has_fit_workouts(conn, date_str):
            if own:
                conn.close()
            row = conn.execute(
                """
                SELECT id FROM cardio_workouts
                WHERE type = ? AND date = ? AND start_time IS NULL
                LIMIT 1
                """,
                (cardio_type, date_str),
            ).fetchone()
            return int(row[0]) if row else 0

        conn.execute(
            """
            INSERT INTO cardio_workouts (
                date, type, distance_km, duration_sec,
                avg_hr, max_hr, calories, calories_chest, calories_watch, swolf,
                data_source
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, type) DO UPDATE SET
                distance_km = COALESCE(excluded.distance_km, distance_km),
                duration_sec = COALESCE(excluded.duration_sec, duration_sec),
                avg_hr = COALESCE(excluded.avg_hr, avg_hr),
                max_hr = COALESCE(excluded.max_hr, max_hr),
                calories = COALESCE(excluded.calories, calories),
                calories_chest = COALESCE(excluded.calories_chest, calories_chest),
                calories_watch = COALESCE(excluded.calories_watch, calories_watch),
                swolf = COALESCE(excluded.swolf, swolf),
                data_source = COALESCE(excluded.data_source, data_source)
            """,
            (
                date_str, cardio_type, distance_km, duration_sec,
                avg_hr, max_hr, calories, calories_chest, calories_watch, swolf,
                src,
            ),
        )
        row = conn.execute(
            """
            SELECT id FROM cardio_workouts
            WHERE date = ? AND type = ? AND start_time IS NULL
            """,
            (date_str, cardio_type),
        ).fetchone()
        workout_id = int(row[0]) if row else int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])

    if own:
        conn.commit()
        conn.close()
    return int(workout_id)


def upsert_gps_track(
    cardio_workout_id: int,
    source: str,
    activity_date: str,
    file_name: str,
    geojson: dict,
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Сохраняет GPS-трек в формате GeoJSON, привязанный к cardio_workouts.id."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    track_json = json.dumps(geojson, ensure_ascii=False)
    now = datetime.now().isoformat(timespec="seconds")
    row = conn.execute(
        "SELECT id FROM gps_tracks WHERE cardio_workout_id = ?",
        (cardio_workout_id,),
    ).fetchone()
    if row:
        conn.execute(
            """
            UPDATE gps_tracks SET
                source = ?, activity_date = ?, file_name = ?,
                track_data = ?, created_at = ?
            WHERE cardio_workout_id = ?
            """,
            (source, str(activity_date)[:10], file_name, track_json, now, cardio_workout_id),
        )
    else:
        legacy = conn.execute(
            """
            SELECT id FROM gps_tracks
            WHERE source = ? AND activity_date = ? AND file_name = ?
            """,
            (source, str(activity_date)[:10], file_name),
        ).fetchone()
        if legacy:
            conn.execute(
                """
                UPDATE gps_tracks SET
                    track_data = ?, created_at = ?, cardio_workout_id = ?
                WHERE id = ?
                """,
                (track_json, now, cardio_workout_id, int(legacy[0])),
            )
        else:
            conn.execute(
                """
                INSERT INTO gps_tracks (
                    source, activity_date, file_name, track_data, created_at, cardio_workout_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (source, str(activity_date)[:10], file_name, track_json, now, cardio_workout_id),
            )
    if own:
        conn.commit()
        conn.close()


def get_cardio_workout_by_id(workout_id: int) -> dict | None:
    """Одна строка cardio_workouts по id."""
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    row = conn.execute(
        "SELECT * FROM cardio_workouts WHERE id = ?",
        (workout_id,),
    ).fetchone()
    conn.close()
    if row is None:
        return None
    return dict(row)


def cardio_workout_has_heart_rate(workout_id: int) -> bool:
    if not DB_PATH.exists():
        return False
    conn = sqlite3.connect(DB_PATH)
    found = conn.execute(
        "SELECT 1 FROM workout_heart_rate WHERE cardio_workout_id = ? LIMIT 1",
        (workout_id,),
    ).fetchone()
    conn.close()
    return found is not None


def cardio_workout_has_gps(workout_id: int) -> bool:
    if not DB_PATH.exists():
        return False
    conn = sqlite3.connect(DB_PATH)
    found = conn.execute(
        """
        SELECT 1 FROM gps_tracks
        WHERE cardio_workout_id = ? AND track_data IS NOT NULL AND track_data != ''
        LIMIT 1
        """,
        (workout_id,),
    ).fetchone()
    conn.close()
    return found is not None


def downsample_df(df: pd.DataFrame, max_points: int = HR_CHART_MAX_POINTS) -> pd.DataFrame:
    """Равномерное прореживание для графика (не более max_points точек)."""
    if df.empty or len(df) <= max_points:
        return df
    step = max(len(df) // max_points, 1)
    return df.iloc[::step].copy()


def _hr_with_moving_elapsed(df: pd.DataFrame) -> pd.DataFrame:
    """Активное время: накапливается только когда растёт дистанция."""
    out = df.sort_values("elapsed_sec").copy()
    moving_sec: list[int] = []
    total = 0
    prev_elapsed: float | None = None
    prev_dist_km: float | None = None
    for _, row in out.iterrows():
        elapsed = float(row["elapsed_sec"])
        dist_km = row.get("distance_km")
        if (
            prev_elapsed is not None
            and prev_dist_km is not None
            and pd.notna(dist_km)
            and float(dist_km) > prev_dist_km + 1e-6
        ):
            total += int(round(elapsed - prev_elapsed))
        moving_sec.append(total)
        prev_elapsed = elapsed
        if pd.notna(dist_km):
            prev_dist_km = float(dist_km)
    out["moving_elapsed_sec"] = moving_sec
    out["moving_time_label"] = out["moving_elapsed_sec"].apply(
        lambda s: format_duration(int(s)) if int(s) > 0 else "0 сек"
    )
    return out


def get_heart_rate_data(workout_id: int) -> pd.DataFrame:
    """Пульс: seconds, elapsed_min, distance_km, heart_rate."""
    if not DB_PATH.exists():
        return pd.DataFrame()
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        """
        SELECT elapsed_sec, heart_rate, distance_m
        FROM workout_heart_rate
        WHERE cardio_workout_id = ?
        ORDER BY elapsed_sec
        """,
        conn,
        params=(workout_id,),
    )
    conn.close()
    if df.empty:
        return df
    df["seconds"] = df["elapsed_sec"]
    df["elapsed_min"] = df["elapsed_sec"] / 60.0
    if "distance_m" in df.columns:
        dist = pd.to_numeric(df["distance_m"], errors="coerce")
        df["distance_km"] = dist / 1000.0
    return downsample_df(df)


def get_gps_geojson(workout_id: int) -> dict | None:
    """GeoJSON-трек из gps_tracks."""
    if not DB_PATH.exists():
        return None
    conn = sqlite3.connect(DB_PATH)
    row = conn.execute(
        "SELECT track_data FROM gps_tracks WHERE cardio_workout_id = ? LIMIT 1",
        (workout_id,),
    ).fetchone()
    conn.close()
    if not row or not row[0]:
        return None
    try:
        data = json.loads(row[0])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def workouts_with_heart_rate(workout_ids: tuple[int, ...]) -> frozenset[int]:
    """Один запрос: id тренировок с поминутным пульсом (для кнопок на странице)."""
    if not workout_ids or not DB_PATH.exists():
        return frozenset()
    conn = sqlite3.connect(DB_PATH)
    placeholders = ",".join("?" * len(workout_ids))
    rows = conn.execute(
        f"""
        SELECT DISTINCT cardio_workout_id
        FROM workout_heart_rate
        WHERE cardio_workout_id IN ({placeholders})
        """,
        workout_ids,
    ).fetchall()
    conn.close()
    return frozenset(int(r[0]) for r in rows)


def workouts_with_gps_track(workout_ids: tuple[int, ...]) -> frozenset[int]:
    """Один запрос: id тренировок с GPS-треком."""
    if not workout_ids or not DB_PATH.exists():
        return frozenset()
    conn = sqlite3.connect(DB_PATH)
    placeholders = ",".join("?" * len(workout_ids))
    rows = conn.execute(
        f"""
        SELECT DISTINCT cardio_workout_id
        FROM gps_tracks
        WHERE cardio_workout_id IN ({placeholders})
          AND track_data IS NOT NULL AND track_data != ''
        """,
        workout_ids,
    ).fetchall()
    conn.close()
    return frozenset(int(r[0]) for r in rows)


def replace_heart_rate_samples(
    cardio_workout_id: int,
    samples: list[tuple[int, int] | tuple[int, int, float | None]],
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Заменяет точки пульса: (elapsed_sec, heart_rate) или (+ distance_m)."""
    own = conn is None
    if own:
        conn = sqlite3.connect(DB_PATH)
    conn.execute(
        "DELETE FROM workout_heart_rate WHERE cardio_workout_id = ?",
        (cardio_workout_id,),
    )
    if samples:
        rows: list[tuple[int, int, int, float | None]] = []
        for item in samples:
            if len(item) == 2:
                elapsed, hr = item
                dist_m = None
            else:
                elapsed, hr, dist_m = item
            rows.append((cardio_workout_id, int(elapsed), int(hr), dist_m))
        conn.executemany(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, distance_m
            ) VALUES (?, ?, ?, ?)
            """,
            rows,
        )
    if own:
        conn.commit()
        conn.close()
