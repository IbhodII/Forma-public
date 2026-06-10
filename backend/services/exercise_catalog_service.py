# -*- coding: utf-8 -*-
"""Справочник силовых упражнений: shared.strength_exercises + user_strength_exercises."""
from __future__ import annotations

import sqlite3
from datetime import datetime
from typing import Any

from backend.database.db_utils import get_current_user_id
from database.connection import attach_shared, is_shared_attached, shared_table
from database.exercise_category import (
    EXERCISE_CATEGORY_STRENGTH,
    collect_stretching_name_keys,
    is_strength_catalog_name,
    load_free_exercise_db_categories,
    normalize_exercise_name_key,
)


def _ensure_catalog_ready() -> None:
    """Ленивая миграция: таблицы могли не создаться, если ensure_db_schema упала с database is locked."""
    from backend.database import get_db as open_workouts_db
    from database.migrations import _ensure_shared_strength_exercises

    conn = open_workouts_db()
    try:
        attach_shared(conn)
        _ensure_shared_strength_exercises(conn)
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS user_strength_exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                exercise_category TEXT NOT NULL DEFAULT 'strength',
                is_archived INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _strength_shared() -> str:
    return shared_table("strength_exercises")


def _stretching_shared() -> str:
    return shared_table("stretching_exercises")


def _strength_category_filter_sql() -> str:
    return f"COALESCE(exercise_category, '{EXERCISE_CATEGORY_STRENGTH}') = '{EXERCISE_CATEGORY_STRENGTH}'"


def _catalog_classification_context(conn) -> tuple[dict[str, str], set[str]]:
    json_categories = load_free_exercise_db_categories()
    stretching_keys = collect_stretching_name_keys(conn, shared_table=_stretching_shared())
    stretching_keys.update(
        key
        for key, cat in json_categories.items()
        if cat == "stretching"
    )
    return json_categories, stretching_keys


def _shared_id_to_api(row_id: int) -> int:
    return -int(row_id)


def _insert_shared_strength_name(conn: sqlite3.Connection, title: str) -> tuple[int, str] | None:
    """Insert a strength catalog name into shared.db; return (id, name) if present after insert."""
    from database.migrations import _strength_exercise_is_time_based

    existing = _find_shared_row(conn, title)
    if existing:
        return existing
    is_time = 1 if _strength_exercise_is_time_based(title) else 0
    conn.execute(
        f"""
        INSERT OR IGNORE INTO {_strength_shared()}
            (name, category, exercise_category, is_time_based)
        VALUES (?, 'strength', 'strength', ?)
        """,
        (title, is_time),
    )
    return _find_shared_row(conn, title)


def _user_archived_name_keys(conn: sqlite3.Connection, uid: int) -> set[str]:
    rows = conn.execute(
        """
        SELECT name FROM user_strength_exercises
        WHERE user_id = ? AND COALESCE(is_archived, 0) = 1 AND TRIM(name) != ''
        """,
        (uid,),
    ).fetchall()
    return {normalize_exercise_name_key(str(r[0] or "")) for r in rows if str(r[0] or "").strip()}


def _find_shared_row(conn, name: str) -> tuple[int, str] | None:
    row = conn.execute(
        f"""
        SELECT id, name FROM {_strength_shared()}
        WHERE name = ? COLLATE NOCASE AND {_strength_category_filter_sql()}
        """,
        (name,),
    ).fetchone()
    if not row:
        return None
    return int(row[0]), str(row[1])


def is_time_based_in_catalog(conn, name: str) -> bool:
    title = str(name or "").strip()
    if not title:
        return False
    row = conn.execute(
        f"""
        SELECT is_time_based FROM {_strength_shared()}
        WHERE name = ? COLLATE NOCASE AND {_strength_category_filter_sql()}
        """,
        (title,),
    ).fetchone()
    return bool(int(row[0] or 0)) if row else False


def _sync_user_catalog_from_sources(conn) -> None:
    if not is_shared_attached(conn):
        return
    try:
        shared_names = {
            normalize_exercise_name_key(str(r[0] or ""))
            for r in conn.execute(
                f"""
                SELECT name FROM {_strength_shared()}
                WHERE TRIM(name) != '' AND {_strength_category_filter_sql()}
                """
            )
            if str(r[0] or "").strip()
        }
        json_categories, stretching_keys = _catalog_classification_context(conn)
    except sqlite3.OperationalError:
        return
    uid = get_current_user_id()
    for sql, params in (
        (
            """
            SELECT DISTINCT TRIM(exercise) AS name
            FROM strength_workouts
            WHERE user_id = ? AND exercise IS NOT NULL AND TRIM(exercise) != ''
            """,
            (uid,),
        ),
        (
            """
            SELECT DISTINCT TRIM(exercise_name) AS name
            FROM preset_exercises
            WHERE user_id = ? AND exercise_name IS NOT NULL AND TRIM(exercise_name) != ''
            """,
            (uid,),
        ),
        (
            """
            SELECT DISTINCT TRIM(esi.exercise_name) AS name
            FROM exercise_set_items esi
            INNER JOIN exercise_sets es ON es.id = esi.set_id
            WHERE es.user_id = ?
              AND esi.exercise_name IS NOT NULL AND TRIM(esi.exercise_name) != ''
            """,
            (uid,),
        ),
    ):
        try:
            rows = conn.execute(sql, params).fetchall()
        except Exception:
            continue
        for row in rows:
            title = str(row[0] or "").strip()
            key = normalize_exercise_name_key(title)
            if not title or key in shared_names:
                continue
            if not is_strength_catalog_name(
                title,
                json_categories=json_categories,
                stretching_keys=stretching_keys,
            ):
                continue
            try:
                inserted = _insert_shared_strength_name(conn, title)
                if inserted:
                    shared_names.add(key)
            except Exception:
                continue


def list_all_exercise_names() -> list[str]:
    """Уникальные упражнения текущего пользователя (shared + custom + история)."""
    uid = get_current_user_id()
    from backend.database import get_db as open_workouts_db

    _ensure_catalog_ready()
    conn = open_workouts_db()
    try:
        attach_shared(conn)
        _sync_user_catalog_from_sources(conn)
        conn.commit()
        json_categories, stretching_keys = _catalog_classification_context(conn)
        shared_rows = (
            conn.execute(
                f"""
                SELECT name FROM {_strength_shared()}
                WHERE TRIM(name) != '' AND {_strength_category_filter_sql()}
                ORDER BY name COLLATE NOCASE
                """
            ).fetchall()
            if is_shared_attached(conn)
            else []
        )
        archived_keys = _user_archived_name_keys(conn, uid)
        usage_rows = conn.execute(
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
    finally:
        conn.close()
    from database.exercise_names import dedupe_exercise_names_ordered

    return dedupe_exercise_names_ordered(
        str(r[0])
        for r in (*shared_rows, *usage_rows)
        if normalize_exercise_name_key(str(r[0])) not in archived_keys
        and is_strength_catalog_name(
            str(r[0]),
            json_categories=json_categories,
            stretching_keys=stretching_keys,
        )
    )


def list_catalog_items(include_archived: bool = False) -> list[dict[str, Any]]:
    """Shared reference rows + per-user custom exercises."""
    uid = get_current_user_id()
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        attach_shared(conn)
        _sync_user_catalog_from_sources(conn)
        conn.commit()
        shared_rows = (
            conn.execute(
                f"""
                SELECT id, name
                FROM {_strength_shared()}
                WHERE TRIM(name) != '' AND {_strength_category_filter_sql()}
                ORDER BY name COLLATE NOCASE, id
                """
            ).fetchall()
            if is_shared_attached(conn)
            else []
        )
        shared_name_keys = {
            normalize_exercise_name_key(str(r[1] or ""))
            for r in shared_rows
            if str(r[1] or "").strip()
        }
        archived_keys = _user_archived_name_keys(conn, uid)
        user_rows = conn.execute(
            f"""
            SELECT id, name, COALESCE(is_archived, 0), created_at, updated_at
            FROM user_strength_exercises
            WHERE user_id = ?
              AND COALESCE(exercise_category, '{EXERCISE_CATEGORY_STRENGTH}') = '{EXERCISE_CATEGORY_STRENGTH}'
            ORDER BY CASE WHEN TRIM(name) = '' THEN 1 ELSE 0 END, name COLLATE NOCASE, id
            """,
            (uid,),
        ).fetchall()
    finally:
        conn.close()

    items: list[dict[str, Any]] = []
    for r in shared_rows:
        name = str(r[1] or "")
        key = normalize_exercise_name_key(name)
        is_archived = key in archived_keys
        if not include_archived and is_archived:
            continue
        items.append(
            {
                "id": _shared_id_to_api(int(r[0])),
                "name": name,
                "display_name": name.strip() or "Без названия",
                "is_archived": is_archived,
                "is_shared": True,
                "created_at": None,
                "updated_at": None,
            }
        )
    items.extend(
        {
            "id": int(r[0]),
            "name": str(r[1] or ""),
            "display_name": str(r[1] or "").strip() or "Без названия",
            "is_archived": bool(int(r[2] or 0)),
            "is_shared": False,
            "created_at": r[3],
            "updated_at": r[4],
        }
        for r in user_rows
        if normalize_exercise_name_key(str(r[1] or "")) not in shared_name_keys
        and (include_archived or not int(r[2] or 0))
    )
    items.sort(key=lambda x: (0 if x.get("is_shared") else 1, str(x.get("name") or "").casefold()))
    return items


def ensure_exercise(name: str) -> dict[str, Any]:
    """
    Добавить пользовательское упражнение или вернуть shared-запись.
    При дубликате возвращает существующую запись (id, name).
    """
    title = str(name).strip()
    if not title:
        raise ValueError("Укажите название упражнения")

    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    uid = get_current_user_id()
    conn = open_workouts_db()
    try:
        attach_shared(conn)
        shared = _insert_shared_strength_name(conn, title)
        if not shared:
            raise RuntimeError("Не удалось сохранить упражнение в справочник")
        conn.execute(
            """
            UPDATE user_strength_exercises
            SET is_archived = 0, updated_at = ?
            WHERE user_id = ? AND name = ? COLLATE NOCASE AND COALESCE(is_archived, 0) = 1
            """,
            (_now(), uid, shared[1]),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": _shared_id_to_api(shared[0]),
        "name": shared[1],
        "is_shared": True,
    }


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
    """Update user catalog metadata only; workout history rows are not renamed."""
    if int(exercise_id) < 0:
        raise ValueError("Общие упражнения из каталога нельзя изменять")
    title = str(name).strip()
    if not title:
        raise ValueError("Укажите название упражнения")
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    uid = get_current_user_id()
    conn = open_workouts_db()
    try:
        attach_shared(conn)
        if _find_shared_row(conn, title):
            raise ValueError("Упражнение с таким названием уже есть в общем каталоге")
        row = conn.execute(
            """
            SELECT id, name FROM user_strength_exercises
            WHERE id = ? AND user_id = ?
            """,
            (int(exercise_id), uid),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        existing_rows = conn.execute(
            """
            SELECT id, name FROM user_strength_exercises
            WHERE user_id = ? AND id != ?
            """,
            (uid, int(exercise_id)),
        ).fetchall()
        if any(str(r[1] or "").strip().casefold() == title.casefold() for r in existing_rows):
            raise ValueError("Упражнение с таким названием уже есть")
        conn.execute(
            """
            UPDATE user_strength_exercises
            SET name = ?, is_archived = 0, updated_at = ?
            WHERE id = ? AND user_id = ?
            """,
            (title, _now(), int(exercise_id), uid),
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
    """Delete unused user catalog rows, archive used rows to preserve history/templates."""
    if int(exercise_id) < 0:
        raise ValueError("Общие упражнения из каталога нельзя удалять")
    _ensure_catalog_ready()
    from backend.database import get_db as open_workouts_db

    uid = get_current_user_id()
    conn = open_workouts_db()
    try:
        row = conn.execute(
            """
            SELECT id, name FROM user_strength_exercises
            WHERE id = ? AND user_id = ?
            """,
            (int(exercise_id), uid),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        name = str(row[1] or "")
        counts = _usage_counts(conn, name)
        if counts["total"] > 0:
            conn.execute(
                """
                UPDATE user_strength_exercises
                SET is_archived = 1, updated_at = ?
                WHERE id = ? AND user_id = ?
                """,
                (_now(), int(exercise_id), uid),
            )
            action = "archived"
        else:
            conn.execute(
                "DELETE FROM user_strength_exercises WHERE id = ? AND user_id = ?",
                (int(exercise_id), uid),
            )
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
    """Переименовать в пользовательском справочнике. 0 — если записи не было."""
    old = old_name.strip()
    new = new_name.strip()
    if not old or not new:
        return 0
    uid = get_current_user_id()
    from backend.database import get_db as open_workouts_db

    conn = open_workouts_db()
    try:
        attach_shared(conn)
        cur = conn.execute(
            f"""
            UPDATE {_strength_shared()}
            SET name = ?
            WHERE name = ? COLLATE NOCASE AND {_strength_category_filter_sql()}
            """,
            (new, old),
        )
        changed = int(cur.rowcount)
        if changed == 0:
            cur = conn.execute(
                """
                UPDATE user_strength_exercises
                SET name = ?, updated_at = ?
                WHERE user_id = ? AND name = ? COLLATE NOCASE
                """,
                (new, _now(), uid, old),
            )
            changed = int(cur.rowcount)
        conn.commit()
        return changed
    except Exception:
        conn.rollback()
        return 0
    finally:
        conn.close()
