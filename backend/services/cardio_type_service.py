# -*- coding: utf-8 -*-
"""Настройки вкладок кардио (бассейн, вело, бег): архивация и порядок."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from utils.constants import CARDIO_ARCHIVE_TYPE, CARDIO_DB_BIKE

TAB_CARDIO_TYPES: list[tuple[str, int]] = [
    ("бассейн", 0),
    (CARDIO_DB_BIKE, 1),
    (CARDIO_ARCHIVE_TYPE, 2),
]


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _ensure_user_system_types(conn, user_id: int) -> None:
    """Системные типы кардио (бег/вело/бассейн) — по одной строке на пользователя."""
    ts = _now()
    for cardio_type, order in TAB_CARDIO_TYPES:
        conn.execute(
            """
            INSERT OR IGNORE INTO cardio_type_settings
                (user_id, type, is_active, sort_order, updated_at)
            VALUES (?, ?, 1, ?, ?)
            """,
            (int(user_id), cardio_type, order, ts),
        )


def _row_to_dict(row: Any, *, workout_count: int = 0) -> dict[str, Any]:
    return {
        "type": str(row["type"]),
        "is_active": int(row["is_active"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "workout_count": workout_count,
        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
    }


def list_tab_settings(*, active_only: bool | None = None) -> list[dict[str, Any]]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        _ensure_user_system_types(conn, uid)
        clauses: list[str] = ["user_id = ?"]
        params: list[Any] = [uid]
        if active_only is True:
            clauses.append("is_active = 1")
        elif active_only is False:
            clauses.append("is_active = 0")
        where = " WHERE " + " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT type, is_active, sort_order, updated_at
            FROM cardio_type_settings{where}
            ORDER BY sort_order, type COLLATE NOCASE
            """,
            params,
        ).fetchall()
        from backend.services import cardio_service

        out: list[dict[str, Any]] = []
        for row in rows:
            t = str(row["type"])
            wc = cardio_service.count_visible_workouts(workout_type=t)
            out.append(_row_to_dict(row, workout_count=wc))
        conn.commit()
        return out
    finally:
        conn.close()


def list_active_tab_types() -> list[str]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        _ensure_user_system_types(conn, uid)
        rows = conn.execute(
            """
            SELECT type FROM cardio_type_settings
            WHERE user_id = ? AND is_active = 1
            ORDER BY sort_order, type COLLATE NOCASE
            """,
            (uid,),
        ).fetchall()
        conn.commit()
        return [str(r[0]) for r in rows]
    finally:
        conn.close()


def get_tab_setting(cardio_type: str) -> dict[str, Any] | None:
    uid = get_current_user_id()
    conn = get_db()
    try:
        _ensure_user_system_types(conn, uid)
        row = conn.execute(
            """
            SELECT type, is_active, sort_order, updated_at
            FROM cardio_type_settings
            WHERE user_id = ? AND type = ?
            """,
            (uid, cardio_type.strip()),
        ).fetchone()
        if not row:
            return None
        from backend.services import cardio_service

        wc = cardio_service.count_visible_workouts(workout_type=cardio_type)
        conn.commit()
        return _row_to_dict(row, workout_count=wc)
    finally:
        conn.close()


def _validate_type(cardio_type: str) -> str:
    t = cardio_type.strip()
    allowed = {x[0] for x in TAB_CARDIO_TYPES}
    if t not in allowed:
        raise ValueError(f"Неизвестный тип кардио «{t}»")
    return t


def archive_tab_type(cardio_type: str) -> dict[str, Any]:
    t = _validate_type(cardio_type)
    uid = get_current_user_id()
    conn = get_db()
    try:
        _ensure_user_system_types(conn, uid)
        row = conn.execute(
            "SELECT type FROM cardio_type_settings WHERE user_id = ? AND type = ?",
            (uid, t),
        ).fetchone()
        if not row:
            raise ValueError("Тип кардио не найден")
        conn.execute(
            """
            UPDATE cardio_type_settings
            SET is_active = 0, updated_at = ?
            WHERE user_id = ? AND type = ?
            """,
            (_now(), uid, t),
        )
        conn.commit()
    finally:
        conn.close()
    result = get_tab_setting(t)
    if not result:
        raise ValueError("Тип кардио не найден")
    return result


def restore_tab_type(cardio_type: str) -> dict[str, Any]:
    t = _validate_type(cardio_type)
    uid = get_current_user_id()
    conn = get_db()
    try:
        _ensure_user_system_types(conn, uid)
        row = conn.execute(
            "SELECT type FROM cardio_type_settings WHERE user_id = ? AND type = ?",
            (uid, t),
        ).fetchone()
        if not row:
            raise ValueError("Тип кардио не найден")
        conn.execute(
            """
            UPDATE cardio_type_settings
            SET is_active = 1, updated_at = ?
            WHERE user_id = ? AND type = ?
            """,
            (_now(), uid, t),
        )
        conn.commit()
    finally:
        conn.close()
    result = get_tab_setting(t)
    if not result:
        raise ValueError("Тип кардио не найден")
    return result
