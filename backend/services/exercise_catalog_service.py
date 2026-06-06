# -*- coding: utf-8 -*-
"""Глобальный справочник упражнений (all_exercises)."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from backend.database.db_utils import get_current_user_id


def _ensure_catalog_ready() -> None:
    """Ленивая миграция: таблица могла не создаться, если ensure_db_schema упала с database is locked."""
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='all_exercises'"
        ).fetchone()
        from database.migrations import ensure_all_exercises_catalog

        ensure_all_exercises_catalog(conn)
        conn.commit()
    finally:
        conn.close()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _sync_catalog_from_sources(conn) -> None:
    uid = get_current_user_id()
    ts = _now()
    for sql, params in (
        (
            """
            INSERT OR IGNORE INTO all_exercises (name, created_at, is_archived)
            SELECT DISTINCT TRIM(exercise), ?, 0
            FROM strength_workouts
            WHERE user_id = ? AND exercise IS NOT NULL AND TRIM(exercise) != ''
            """,
            (ts, uid),
        ),
        (
            """
            INSERT OR IGNORE INTO all_exercises (name, created_at, is_archived)
            SELECT DISTINCT TRIM(exercise_name), ?, 0
            FROM preset_exercises
            WHERE user_id = ? AND exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
            """,
            (ts, uid),
        ),
        (
            """
            INSERT OR IGNORE INTO all_exercises (name, created_at, is_archived)
            SELECT DISTINCT TRIM(esi.exercise_name), ?, 0
            FROM exercise_set_items esi
            INNER JOIN exercise_sets es ON es.id = esi.set_id
            WHERE es.user_id = ? AND esi.exercise_name IS NOT NULL AND TRIM(esi.exercise_name) != ''
            """,
            (ts, uid),
        ),
    ):
        try:
            conn.execute(sql, params)
        except Exception:
            continue


def list_all_exercise_names() -> list[str]:
    """Уникальные упражнения текущего пользователя (не подходы и не дубли JOIN)."""
    uid = get_current_user_id()
    from backend.database import get_db as open_workouts_db

    _ensure_catalog_ready()
    conn = open_workouts_db()
    try:
        rows = conn.execute(
            """
            SELECT TRIM(name) AS name
            FROM (
                SELECT TRIM(exercise) AS name
                FROM strength_workouts
                WHERE user_id = ? AND exercise IS NOT NULL AND TRIM(exercise) != ''
                UNION
                SELECT TRIM(exercise_name) AS name
                FROM preset_exercises
                WHERE user_id = ? AND exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
                UNION
                SELECT TRIM(esi.exercise_name) AS name
                FROM exercise_set_items esi
                INNER JOIN exercise_sets es ON es.id = esi.set_id
                WHERE es.user_id = ?
                  AND esi.exercise_name IS NOT NULL AND TRIM(esi.exercise_name) != ''
            ) AS sources
            ORDER BY name COLLATE NOCASE
            """,
            (uid, uid, uid),
        ).fetchall()
        archived_rows = conn.execute(
            """
            SELECT name FROM all_exercises
            WHERE COALESCE(is_archived, 0) = 1 AND TRIM(name) != ''
            """
        ).fetchall()
    finally:
        conn.close()
    from database.exercise_names import dedupe_exercise_names_ordered

    archived = {str(r[0]).strip().casefold() for r in archived_rows}
    return dedupe_exercise_names_ordered(
        str(r[0]) for r in rows if str(r[0]).strip().casefold() not in archived
    )


def list_catalog_items(include_archived: bool = False) -> list[dict[str, Any]]:
    """Rows from all_exercises for catalog management."""
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        _sync_catalog_from_sources(conn)
        conn.commit()
        where = "" if include_archived else "WHERE COALESCE(is_archived, 0) = 0"
        rows = conn.execute(
            f"""
            SELECT id, name, COALESCE(is_archived, 0) AS is_archived, created_at, updated_at
            FROM all_exercises
            {where}
            ORDER BY CASE WHEN TRIM(name) = '' THEN 1 ELSE 0 END, name COLLATE NOCASE, id
            """
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "id": int(r[0]),
            "name": str(r[1] or ""),
            "display_name": str(r[1] or "").strip() or "Без названия",
            "is_archived": bool(int(r[2] or 0)),
            "created_at": r[3],
            "updated_at": r[4],
        }
        for r in rows
    ]


def ensure_exercise(name: str) -> dict[str, Any]:
    """
    Добавить упражнение в справочник, если его ещё нет.
    При дубликате возвращает существующую запись (id, name).
    """
    title = str(name).strip()
    if not title:
        raise ValueError("Укажите название упражнения")

    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        conn.execute(
            """
            INSERT OR IGNORE INTO all_exercises (name, created_at, is_archived)
            VALUES (?, ?, 0)
            """,
            (title, _now()),
        )
        conn.execute(
            """
            UPDATE all_exercises
            SET is_archived = 0, updated_at = ?
            WHERE name = ? AND COALESCE(is_archived, 0) = 1
            """,
            (_now(), title),
        )
        row = conn.execute(
            "SELECT id, name FROM all_exercises WHERE name = ?",
            (title,),
        ).fetchone()
        conn.commit()
    finally:
        conn.close()

    if not row:
        raise RuntimeError("Не удалось сохранить упражнение в справочник")
    return {"id": int(row[0]), "name": str(row[1])}


def _usage_counts(conn, name: str) -> dict[str, int]:
    uid = get_current_user_id()
    checks = {
        "strength_workouts": (
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ? AND exercise = ?",
            (uid, name),
        ),
        "preset_exercises": (
            "SELECT COUNT(*) FROM preset_exercises WHERE user_id = ? AND exercise_name = ?",
            (uid, name),
        ),
        "exercise_set_items": (
            "SELECT COUNT(*) FROM exercise_set_items WHERE user_id = ? AND exercise_name = ?",
            (uid, name),
        ),
        "workout_exercise_template": (
            "SELECT COUNT(*) FROM workout_exercise_template WHERE user_id = ? AND exercise = ?",
            (uid, name),
        ),
    }
    counts: dict[str, int] = {}
    for key, (sql, params) in checks.items():
        try:
            row = conn.execute(sql, params).fetchone()
            counts[key] = int(row[0] or 0) if row else 0
        except Exception:
            counts[key] = 0
    counts["total"] = sum(counts.values())
    return counts


def update_catalog_exercise(exercise_id: int, name: str) -> dict[str, Any]:
    """Update catalog metadata only; workout history rows are not renamed."""
    title = str(name).strip()
    if not title:
        raise ValueError("Укажите название упражнения")
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        row = conn.execute(
            "SELECT id, name FROM all_exercises WHERE id = ?",
            (int(exercise_id),),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        existing_rows = conn.execute(
            """
            SELECT id, name FROM all_exercises
            WHERE id != ?
            """,
            (int(exercise_id),),
        ).fetchall()
        if any(str(r[1] or "").strip().casefold() == title.casefold() for r in existing_rows):
            raise ValueError("Упражнение с таким названием уже есть")
        conn.execute(
            """
            UPDATE all_exercises
            SET name = ?, is_archived = 0, updated_at = ?
            WHERE id = ?
            """,
            (title, _now(), int(exercise_id)),
        )
        conn.commit()
    except sqlite3.IntegrityError as err:
        conn.rollback()
        raise ValueError("Упражнение с таким названием уже есть") from err
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"id": int(exercise_id), "name": title}


def delete_catalog_exercise(exercise_id: int) -> dict[str, Any]:
    """Delete unused catalog rows, archive used rows to preserve history/templates."""
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        row = conn.execute(
            "SELECT id, name FROM all_exercises WHERE id = ?",
            (int(exercise_id),),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        name = str(row[1] or "")
        counts = _usage_counts(conn, name)
        if counts["total"] > 0:
            conn.execute(
                "UPDATE all_exercises SET is_archived = 1, updated_at = ? WHERE id = ?",
                (_now(), int(exercise_id)),
            )
            action = "archived"
        else:
            conn.execute("DELETE FROM all_exercises WHERE id = ?", (int(exercise_id),))
            action = "deleted"
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
    return {"id": int(exercise_id), "name": name, "action": action, "usage": counts}


def ensure_exercises(names: list[str]) -> None:
    """Пакетная регистрация названий (без ошибки при дубликатах)."""
    for raw in names:
        n = str(raw).strip()
        if n:
            try:
                ensure_exercise(n)
            except ValueError:
                pass


def rename_in_catalog(old_name: str, new_name: str) -> int:
    """Переименовать в справочнике. 0 — если записи не было."""
    old = old_name.strip()
    new = new_name.strip()
    if not old or not new:
        return 0
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        cur = conn.execute(
            "UPDATE all_exercises SET name = ? WHERE name = ?",
            (new, old),
        )
        conn.commit()
        return int(cur.rowcount)
    except Exception:
        conn.rollback()
        return 0
    finally:
        conn.close()
