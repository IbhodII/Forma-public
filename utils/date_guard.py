# -*- coding: utf-8 -*-
"""Проверка дат тренировок и очистка записей в будущем."""
from __future__ import annotations

import sqlite3
from datetime import date, datetime
from pathlib import Path
from typing import Any

from backend.database import DB_PATH


def today_iso() -> str:
    return date.today().isoformat()


def parse_workout_date(value: Any) -> date | None:
    """ISO-строка или date → date; иначе None."""
    if value is None:
        return None
    if isinstance(value, date) and not isinstance(value, datetime):
        return value
    if isinstance(value, datetime):
        return value.date()
    text = str(value).strip()
    if not text:
        return None
    try:
        return date.fromisoformat(text[:10])
    except ValueError:
        return None


def is_future_workout_date(value: Any) -> bool:
    """True, если дата тренировки строго позже сегодня."""
    d = parse_workout_date(value)
    return d is not None and d > date.today()


def purge_future_dated_records(db_path: Path | None = None) -> dict[str, int]:
    """
    Удаляет записи с date / activity_date > сегодня.
    Сначала связанные HR/GPS, затем основные таблицы.
    """
    today = today_iso()
    path = db_path or DB_PATH
    if not path.exists():
        return {}

    conn = sqlite3.connect(path, timeout=30.0)
    deleted: dict[str, int] = {}
    try:
        deleted["workout_heart_rate"] = conn.execute(
            """
            DELETE FROM workout_heart_rate
            WHERE cardio_workout_id IN (
                SELECT id FROM cardio_workouts
                WHERE date > ? OR substr(COALESCE(start_time, ''), 1, 10) > ?
            )
            """,
            (today, today),
        ).rowcount

        deleted["gps_tracks_by_workout"] = conn.execute(
            """
            DELETE FROM gps_tracks
            WHERE cardio_workout_id IN (
                SELECT id FROM cardio_workouts
                WHERE date > ? OR substr(COALESCE(start_time, ''), 1, 10) > ?
            )
            """,
            (today, today),
        ).rowcount

        deleted["gps_tracks_by_date"] = conn.execute(
            "DELETE FROM gps_tracks WHERE activity_date > ?",
            (today,),
        ).rowcount

        for table, col in (
            ("strength_workouts", "date"),
            ("cardio_workouts", "date"),
            ("body_metrics", "date"),
            ("daily_weight", "date"),
        ):
            cur = conn.execute(
                f"DELETE FROM {table} WHERE {col} > ?",
                (today,),
            )
            deleted[table] = cur.rowcount

        # Кардио: дата в start_time в будущем при «нормальной» date
        deleted["cardio_workouts_start_time"] = conn.execute(
            """
            DELETE FROM cardio_workouts
            WHERE substr(COALESCE(start_time, ''), 1, 10) > ?
            """,
            (today,),
        ).rowcount

        conn.commit()
    finally:
        conn.close()
    return deleted
