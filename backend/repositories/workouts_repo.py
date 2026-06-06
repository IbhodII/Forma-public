# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.repositories.base import count_for_user, with_connection


def count_strength_workouts(user_id: int) -> int:
    with with_connection() as conn:
        if not _table_exists(conn, "strength_workouts"):
            return 0
        return count_for_user(conn, "strength_workouts", user_id)


def count_cardio_workouts(user_id: int) -> int:
    with with_connection() as conn:
        if not _table_exists(conn, "cardio_workouts"):
            return 0
        return count_for_user(conn, "cardio_workouts", user_id)


def _table_exists(conn, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None
