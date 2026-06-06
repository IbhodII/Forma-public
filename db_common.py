# -*- coding: utf-8 -*-
"""
Общие функции для скриптов синхронизации (Polar, Mi Fitness, Xiaomi, FIT и др.).
"""
from __future__ import annotations

import argparse
import json
import sqlite3
from datetime import datetime
from pathlib import Path
from typing import Any

SCRIPT_DIR = Path(__file__).resolve().parent

# Canonical paths (respects FORMA_DATA_DIR like the API).
from database.connection import WORKOUTS_DB_PATH

DB_PATH = WORKOUTS_DB_PATH

# Упрощённые имена полей → колонки body_metrics
_BODY_FIELD_ALIASES: dict[str, str] = {
    "chest_cm": "chest_avg_cm",
    "bicep_cm": "bicep_avg_cm",
    "calf_cm": "calf_avg_cm",
    "thigh_cm": "thigh_avg_cm",
}

_STRENGTH_UPSERT_SQL = """
    INSERT INTO strength_workouts
    (date, exercise, set_number, weight, reps, notes, workout_title,
     avg_hr, calories_chest, calories_watch)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, exercise, set_number) DO UPDATE SET
        weight = excluded.weight,
        reps = excluded.reps,
        notes = excluded.notes,
        workout_title = excluded.workout_title,
        avg_hr = excluded.avg_hr,
        calories_chest = excluded.calories_chest,
        calories_watch = excluded.calories_watch
"""

_CARDIO_UPSERT_SQL = """
    INSERT INTO cardio_workouts
    (date, type, distance_km, duration_sec, avg_hr, max_hr, calories,
     calories_chest, calories_watch, swolf)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, type) DO UPDATE SET
        distance_km = excluded.distance_km,
        duration_sec = excluded.duration_sec,
        avg_hr = excluded.avg_hr,
        max_hr = excluded.max_hr,
        calories = excluded.calories,
        calories_chest = excluded.calories_chest,
        calories_watch = excluded.calories_watch,
        swolf = excluded.swolf
"""


def _ensure_sync_tables(conn: sqlite3.Connection) -> None:
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
            UNIQUE(source, activity_date, file_name)
        )
        """
    )


def get_db_connection() -> sqlite3.Connection:
    """Соединение с workouts.db; создаёт недостающие таблицы при необходимости."""
    from database.connection import open_db
    from database.migrations import _ensure_sync_import_tables, ensure_db_schema

    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = open_db(attach=False)
    conn.row_factory = sqlite3.Row
    _ensure_sync_import_tables(conn)
    _ensure_sync_tables(conn)
    conn.commit()
    try:
        ensure_db_schema()
    except Exception:
        pass
    conn.commit()
    return conn


def _normalize_date(date_val: str | datetime) -> str:
    if isinstance(date_val, datetime):
        return date_val.date().isoformat()
    return str(date_val)[:10]


def upsert_strength_workout(
    date: str,
    exercise: str,
    set_number: int,
    weight: float | None,
    reps: int,
    notes: str | None = None,
    workout_title: str | None = None,
    avg_hr: int | None = None,
    calories_chest: int | None = None,
    calories_watch: int | None = None,
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    own = conn is None
    if own:
        conn = get_db_connection()
    conn.execute(
        _STRENGTH_UPSERT_SQL,
        (
            _normalize_date(date),
            exercise,
            int(set_number),
            weight,
            int(reps),
            notes or "",
            workout_title,
            avg_hr,
            calories_chest,
            calories_watch,
        ),
    )
    if own:
        conn.commit()
        conn.close()


def upsert_cardio_workout(
    date: str,
    type: str,
    distance_km: float | None = None,
    duration_sec: int | None = None,
    avg_hr: int | None = None,
    max_hr: int | None = None,
    calories_chest: int | None = None,
    calories_watch: int | None = None,
    swolf: int | None = None,
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    calories = calories_chest or calories_watch
    own = conn is None
    if own:
        conn = get_db_connection()
    conn.execute(
        _CARDIO_UPSERT_SQL,
        (
            _normalize_date(date),
            type,
            distance_km,
            duration_sec,
            avg_hr,
            max_hr,
            calories,
            calories_chest,
            calories_watch,
            swolf,
        ),
    )
    if own:
        conn.commit()
        conn.close()


def upsert_body_metric(date: str, **fields: Any) -> None:
    """
    Вставка/обновление замера body_metrics на дату.
    Поддерживает все колонки из utils.body_metrics.BODY_METRICS_FIELDS
    и упрощённые имена (chest_cm → chest_avg_cm и т.д.).
    """
    try:
        from utils.body_metrics import BODY_METRICS_FIELDS, apply_body_derived
    except ImportError:
        BODY_METRICS_FIELDS = tuple(
            k for k in fields if k not in ("date",)
        )  # type: ignore
        apply_body_derived = None  # type: ignore

    measure_date = _normalize_date(date)
    clean: dict[str, float | None] = {}
    for key, val in fields.items():
        if val is None:
            continue
        col = _BODY_FIELD_ALIASES.get(key, key)
        try:
            clean[col] = float(val)
        except (TypeError, ValueError):
            continue

    if apply_body_derived is not None:
        clean = apply_body_derived(clean)

    conn = get_db_connection()
    existing = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
    use_cols = [c for c in BODY_METRICS_FIELDS if c in clean and c in existing]
    if not use_cols:
        conn.close()
        return

    old = conn.execute(
        f"SELECT {', '.join(use_cols)} FROM body_metrics WHERE date = ?",
        (measure_date,),
    ).fetchone()
    if old:
        for i, col in enumerate(use_cols):
            if clean.get(col) is None and old[i] is not None:
                clean[col] = float(old[i])

    col_list = ", ".join(("date", *use_cols))
    placeholders = ", ".join("?" * (1 + len(use_cols)))
    params: list[Any] = [measure_date] + [clean.get(c) for c in use_cols]
    conn.execute(
        f"INSERT OR REPLACE INTO body_metrics ({col_list}) VALUES ({placeholders})",
        params,
    )
    conn.commit()
    conn.close()


def mark_file_imported(file_name: str, source: str) -> None:
    conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO imported_files (file_name, source, imported_at)
        VALUES (?, ?, ?)
        ON CONFLICT(file_name, source) DO UPDATE SET
            imported_at = excluded.imported_at
        """,
        (file_name, source, datetime.now().isoformat(timespec="seconds")),
    )
    conn.commit()
    conn.close()


def is_file_imported(file_name: str, source: str) -> bool:
    if not DB_PATH.exists():
        return False
    conn = get_db_connection()
    row = conn.execute(
        "SELECT 1 FROM imported_files WHERE file_name = ? AND source = ? LIMIT 1",
        (file_name, source),
    ).fetchone()
    conn.close()
    return row is not None


def upsert_gps_track(
    source: str,
    activity_date: str,
    file_name: str | None,
    points: list[dict[str, Any]],
    *,
    conn: sqlite3.Connection | None = None,
) -> None:
    """Сохраняет GPS-трек (JSON) для активности."""
    own = conn is None
    if own:
        conn = get_db_connection()
    conn.execute(
        """
        INSERT INTO gps_tracks (source, activity_date, file_name, track_data, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(source, activity_date, file_name) DO UPDATE SET
            track_data = excluded.track_data,
            created_at = excluded.created_at
        """,
        (
            source,
            _normalize_date(activity_date),
            file_name,
            json.dumps(points, ensure_ascii=False),
            datetime.now().isoformat(timespec="seconds"),
        ),
    )
    if own:
        conn.commit()
        conn.close()


def add_sync_mode_arguments(parser: argparse.ArgumentParser) -> None:
    """Общие флаги --historical / --new / --recreate для скриптов синхронизации."""
    group = parser.add_mutually_exclusive_group()
    group.add_argument(
        "--historical",
        action="store_true",
        help="Полная загрузка истории",
    )
    group.add_argument(
        "--new",
        action="store_true",
        help="Только новые данные с последнего импорта (по умолчанию)",
    )
    group.add_argument(
        "--recreate",
        action="store_true",
        help="Пересоздать/перезаписать данные источника",
    )


def resolve_sync_mode(args: argparse.Namespace) -> str:
    if args.recreate:
        return "recreate"
    if args.historical:
        return "historical"
    return "new"
