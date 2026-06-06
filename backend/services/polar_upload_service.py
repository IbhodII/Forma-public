# -*- coding: utf-8 -*-
"""Сохранение загруженных файлов тренировок в polar_pending_workouts."""
from __future__ import annotations

import json
import sqlite3
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from polar_file_parser import ParsedPolarUpload, parse_uploaded_workout_file


class PolarUploadDuplicateError(ValueError):
    """Файл или тренировка за дату уже в очереди."""


def save_uploaded_polar_workout(content: bytes, filename: str) -> dict[str, Any]:
    """Парсит файл и сохраняет в polar_pending_workouts (imported=0)."""
    parsed = parse_uploaded_workout_file(content, filename)
    uid = get_current_user_id()
    conn = get_db()
    try:
        _assert_not_duplicate(conn, parsed, uid)
        conn.execute(
            """
            INSERT INTO polar_pending_workouts (
                local_user_id, polar_transaction_id, date, type, duration_sec, distance_km,
                calories, avg_hr, max_hr, raw_data, imported
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
            """,
            (
                uid,
                parsed.polar_transaction_id,
                parsed.date,
                parsed.type,
                parsed.duration_sec,
                parsed.distance_km,
                parsed.calories,
                parsed.avg_hr,
                parsed.max_hr,
                json.dumps(parsed.raw_data, ensure_ascii=False),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {
        "polar_transaction_id": parsed.polar_transaction_id,
        "date": parsed.date,
        "type": parsed.type,
        "duration_sec": parsed.duration_sec,
        "distance_km": parsed.distance_km,
        "calories": parsed.calories,
    }


def _assert_not_duplicate(
    conn: sqlite3.Connection, parsed: ParsedPolarUpload, local_user_id: int
) -> None:
    by_id = conn.execute(
        """
        SELECT 1 FROM polar_pending_workouts
        WHERE local_user_id = ? AND polar_transaction_id = ?
        LIMIT 1
        """,
        (local_user_id, parsed.polar_transaction_id),
    ).fetchone()
    if by_id:
        raise PolarUploadDuplicateError("Этот файл уже был загружен")

    by_date = conn.execute(
        """
        SELECT polar_transaction_id FROM polar_pending_workouts
        WHERE local_user_id = ? AND date = ? AND type = ? AND imported = 0
        LIMIT 1
        """,
        (local_user_id, parsed.date, parsed.type),
    ).fetchone()
    if by_date:
        raise PolarUploadDuplicateError(
            f"Тренировка за {parsed.date} ({parsed.type}) уже есть в списке ожидания"
        )
