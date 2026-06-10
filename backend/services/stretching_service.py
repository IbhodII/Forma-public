# -*- coding: utf-8 -*-
"""Учёт растяжки: упражнения, пресеты, журнал."""
from __future__ import annotations

import json
import logging
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from typing import Any, Callable

from backend.database import get_db
from backend.database.db_utils import get_current_user_id

logger = logging.getLogger(__name__)

_MUSCLE_RU: dict[str, str] = {
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


def _muscle_label(name: str) -> str:
    return _MUSCLE_RU.get(name.strip().lower(), name.strip())


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


_EXERCISE_COLUMNS = """
    id, name, original_name, description, original_description,
    target_muscle_group, images_json, translated, description_translated
"""


def _images_to_json(images: list[str] | None) -> str | None:
    if images is None:
        return None
    cleaned = [str(p).strip() for p in images if str(p).strip()]
    return json.dumps(cleaned, ensure_ascii=False)


def _parse_images_json(raw: Any) -> list[str]:
    if raw is None or raw == "":
        return []
    if isinstance(raw, list):
        return [str(p) for p in raw if p]
    try:
        data = json.loads(str(raw))
        return [str(p) for p in data] if isinstance(data, list) else []
    except (json.JSONDecodeError, TypeError, ValueError):
        return []


def _exercise_row(row: Any) -> dict[str, Any]:
    raw_id = row["id"]
    if raw_id is None:
        raise RuntimeError(
            "Некорректная схема stretching_exercises (id IS NULL). "
            "Перезапустите API для применения миграции v39."
        )
    keys = row.keys()
    return {
        "id": int(raw_id),
        "name": str(row["name"] or ""),
        "original_name": str(row["original_name"]) if "original_name" in keys and row["original_name"] else None,
        "description": row["description"] if "description" in keys else None,
        "original_description": (
            row["original_description"]
            if "original_description" in keys and row["original_description"]
            else None
        ),
        "target_muscle_group": row["target_muscle_group"] if "target_muscle_group" in keys else None,
        "images_json": _parse_images_json(row["images_json"] if "images_json" in keys else None),
        "translated": bool(int(row["translated"] or 0)) if "translated" in keys else False,
        "description_translated": bool(int(row["description_translated"] or 0))
        if "description_translated" in keys
        else False,
    }


def _preset_exercise_row(row: Any) -> dict[str, Any]:
    keys = row.keys()
    return {
        "id": int(row["id"]),
        "exercise_id": int(row["exercise_id"]),
        "exercise_name": str(row["exercise_name"]),
        "target_muscle_group": row["target_muscle_group"],
        "description": row["description"] if "description" in keys else None,
        "original_description": (
            row["original_description"]
            if "original_description" in keys and row["original_description"]
            else None
        ),
        "images_json": _parse_images_json(row["images_json"] if "images_json" in keys else None),
        "hold_seconds": int(row["hold_seconds"] or 30),
        "reps": int(row["reps"] or 1),
        "notes": row["notes"] or "",
        "exercise_order": int(row["exercise_order"] or 0),
    }


def _count_log_for_preset(conn, preset_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM stretching_log WHERE preset_id = ?",
        (int(preset_id),),
    ).fetchone()
    return int(row[0]) if row else 0


def _count_preset_usage_for_exercise(conn, exercise_id: int) -> int:
    row = conn.execute(
        "SELECT COUNT(*) FROM stretching_preset_exercises WHERE exercise_id = ?",
        (int(exercise_id),),
    ).fetchone()
    return int(row[0]) if row else 0


# --- Упражнения ---


def list_exercises(*, muscle_group: str | None = None) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        if muscle_group and muscle_group.strip():
            rows = conn.execute(
                f"""
                SELECT {_EXERCISE_COLUMNS}
                FROM shared.stretching_exercises
                WHERE target_muscle_group LIKE ?
                  AND COALESCE(exercise_category, 'stretching') = 'stretching'
                ORDER BY name COLLATE NOCASE
                """,
                (f"%{muscle_group.strip()}%",),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT {_EXERCISE_COLUMNS}
                FROM shared.stretching_exercises
                WHERE COALESCE(exercise_category, 'stretching') = 'stretching'
                ORDER BY name COLLATE NOCASE
                """
            ).fetchall()
        return [_exercise_row(r) for r in rows]
    finally:
        conn.close()


def get_exercise_by_id(exercise_id: int) -> dict[str, Any] | None:
    conn = get_db()
    try:
        row = conn.execute(
            f"""
            SELECT {_EXERCISE_COLUMNS}
            FROM shared.stretching_exercises WHERE id = ?
            """,
            (int(exercise_id),),
        ).fetchone()
        return _exercise_row(row) if row else None
    finally:
        conn.close()


def create_exercise(
    *,
    name: str,
    target_muscle_group: str | None = None,
    description: str | None = None,
    images: list[str] | None = None,
) -> dict[str, Any]:
    title = name.strip()
    if not title:
        raise ValueError("Укажите название упражнения")
    conn = get_db()
    try:
        dup = conn.execute(
            "SELECT id FROM shared.stretching_exercises WHERE name = ?",
            (title,),
        ).fetchone()
        if dup:
            raise ValueError(f"Упражнение «{title}» уже существует")
        images_json = _images_to_json(images) if images is not None else "[]"
        cur = conn.execute(
            """
            INSERT INTO shared.stretching_exercises
            (name, target_muscle_group, description, images_json, translated,
             description_translated, exercise_category)
            VALUES (?, ?, ?, ?, 1, 1, 'stretching')
            """,
            (
                title,
                (target_muscle_group or "").strip() or None,
                (description or "").strip() or None,
                images_json,
            ),
        )
        conn.commit()
        exercise_id = int(cur.lastrowid)
    finally:
        conn.close()
    result = get_exercise_by_id(exercise_id)
    if not result:
        raise RuntimeError("Не удалось создать упражнение")
    return result


def update_exercise(
    exercise_id: int,
    *,
    name: str | None = None,
    target_muscle_group: str | None = None,
    description: str | None = None,
    images: list[str] | None = None,
) -> dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name, target_muscle_group, description FROM shared.stretching_exercises WHERE id = ?",
            (int(exercise_id),),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        new_name = name.strip() if name is not None else str(row["name"])
        if not new_name:
            raise ValueError("Укажите название упражнения")
        if name is not None and new_name != str(row["name"]):
            dup = conn.execute(
                "SELECT id FROM shared.stretching_exercises WHERE name = ? AND id != ?",
                (new_name, exercise_id),
            ).fetchone()
            if dup:
                raise ValueError(f"Упражнение «{new_name}» уже существует")
        muscle = (
            (target_muscle_group or "").strip() or None
            if target_muscle_group is not None
            else row["target_muscle_group"]
        )
        desc = (
            (description or "").strip() or None
            if description is not None
            else row["description"]
        )
        if images is not None:
            images_json = _images_to_json(images) or "[]"
            conn.execute(
                """
                UPDATE shared.stretching_exercises
                SET name = ?, target_muscle_group = ?, description = ?,
                    images_json = ?, translated = 1, description_translated = 1
                WHERE id = ?
                """,
                (new_name, muscle, desc, images_json, int(exercise_id)),
            )
        else:
            conn.execute(
                """
                UPDATE shared.stretching_exercises
                SET name = ?, target_muscle_group = ?, description = ?,
                    translated = 1, description_translated = 1
                WHERE id = ?
                """,
                (new_name, muscle, desc, int(exercise_id)),
            )
        conn.commit()
    finally:
        conn.close()
    result = get_exercise_by_id(exercise_id)
    if not result:
        raise ValueError("Упражнение не найдено")
    return result


def delete_exercise(exercise_id: int) -> None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM shared.stretching_exercises WHERE id = ?",
            (int(exercise_id),),
        ).fetchone()
        if not row:
            raise ValueError("Упражнение не найдено")
        usage = _count_preset_usage_for_exercise(conn, exercise_id)
        if usage > 0:
            raise ValueError(
                "Нельзя удалить упражнение, которое используется в пресетах"
            )
        conn.execute("DELETE FROM shared.stretching_exercises WHERE id = ?", (int(exercise_id),))
        conn.commit()
    finally:
        conn.close()


# --- Пресеты ---


def _get_preset_exercises(conn, preset_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT pe.id, pe.exercise_id, e.name AS exercise_name, e.target_muscle_group,
               e.description, e.original_description, e.images_json,
               pe.hold_seconds, pe.reps, pe.notes, pe.exercise_order
        FROM stretching_preset_exercises pe
        JOIN shared.stretching_exercises e ON e.id = pe.exercise_id
        WHERE pe.preset_id = ?
        ORDER BY pe.exercise_order, pe.id
        """,
        (int(preset_id),),
    ).fetchall()
    return [_preset_exercise_row(r) for r in rows]


def _preset_summary(conn, row: Any) -> dict[str, Any]:
    pid = int(row["id"])
    exercises = _get_preset_exercises(conn, pid)
    log_count = _count_log_for_preset(conn, pid)
    return {
        "id": pid,
        "name": str(row["name"]),
        "is_active": int(row["is_active"] or 0),
        "sort_order": int(row["sort_order"] or 0),
        "exercise_count": len(exercises),
        "log_count": log_count,
        "created_at": str(row["created_at"]) if row["created_at"] else None,
        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,
    }


def list_presets(*, active_only: bool | None = None) -> list[dict[str, Any]]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        clauses: list[str] = ["(user_id = ? OR user_id IS NULL)"]
        params: list[Any] = [uid]
        if active_only is True:
            clauses.append("is_active = 1")
        elif active_only is False:
            clauses.append("is_active = 0")
        where = " WHERE " + " AND ".join(clauses)
        rows = conn.execute(
            f"""
            SELECT id, name, is_active, sort_order, created_at, updated_at
            FROM stretching_presets{where}
            ORDER BY sort_order, name COLLATE NOCASE
            """,
            tuple(params),
        ).fetchall()
        return [_preset_summary(conn, r) for r in rows]
    finally:
        conn.close()


def get_preset_by_id(preset_id: int) -> dict[str, Any] | None:
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, name, is_active, sort_order, created_at, updated_at
            FROM stretching_presets WHERE id = ?
            """,
            (int(preset_id),),
        ).fetchone()
        if not row:
            return None
        data = _preset_summary(conn, row)
        data["exercises"] = _get_preset_exercises(conn, preset_id)
        return data
    finally:
        conn.close()


def _save_preset_exercises(conn, preset_id: int, exercises: list[dict[str, Any]]) -> None:
    conn.execute(
        "DELETE FROM stretching_preset_exercises WHERE preset_id = ?",
        (int(preset_id),),
    )
    for idx, ex in enumerate(exercises):
        exercise_id = ex.get("exercise_id")
        if exercise_id is None:
            continue
        row = conn.execute(
            "SELECT id FROM shared.stretching_exercises WHERE id = ?",
            (int(exercise_id),),
        ).fetchone()
        if not row:
            raise ValueError(f"Упражнение id={exercise_id} не найдено")
        conn.execute(
            """
            INSERT INTO stretching_preset_exercises
            (preset_id, exercise_id, hold_seconds, reps, notes, exercise_order)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                int(preset_id),
                int(exercise_id),
                int(ex.get("hold_seconds") or 30),
                int(ex.get("reps") or 1),
                ex.get("notes") or "",
                int(ex.get("exercise_order", idx)),
            ),
        )


def create_preset(name: str, exercises: list[dict[str, Any]]) -> dict[str, Any]:
    title = name.strip()
    if not title:
        raise ValueError("Укажите название пресета")
    if not exercises:
        raise ValueError("Добавьте хотя бы одно упражнение")
    uid = get_current_user_id()
    conn = get_db()
    try:
        dup = conn.execute(
            "SELECT id FROM stretching_presets WHERE name = ? AND (user_id = ? OR user_id IS NULL)",
            (title, uid),
        ).fetchone()
        if dup:
            raise ValueError(f"Пресет «{title}» уже существует")
        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM stretching_presets"
        ).fetchone()[0]
        ts = _now()
        cur = conn.execute(
            """
            INSERT INTO stretching_presets
            (user_id, name, is_active, sort_order, created_at, updated_at)
            VALUES (?, ?, 1, ?, ?, ?)
            """,
            (uid, title, int(max_order) + 1, ts, ts),
        )
        preset_id = int(cur.lastrowid)
        _save_preset_exercises(conn, preset_id, exercises)
        conn.commit()
    finally:
        conn.close()
    result = get_preset_by_id(preset_id)
    if not result:
        raise RuntimeError("Не удалось создать пресет")
    return result


def update_preset(
    preset_id: int,
    *,
    name: str | None = None,
    exercises: list[dict[str, Any]] | None = None,
    sort_order: int | None = None,
) -> dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id, name FROM stretching_presets WHERE id = ?",
            (int(preset_id),),
        ).fetchone()
        if not row:
            raise ValueError("Пресет не найден")
        new_name = name.strip() if name is not None else str(row["name"])
        if not new_name:
            raise ValueError("Укажите название пресета")
        if name is not None and new_name != str(row["name"]):
            dup = conn.execute(
                "SELECT id FROM stretching_presets WHERE name = ? AND id != ?",
                (new_name, preset_id),
            ).fetchone()
            if dup:
                raise ValueError(f"Пресет «{new_name}» уже существует")
        updates: list[str] = ["updated_at = ?"]
        params: list[Any] = [_now()]
        if name is not None:
            updates.append("name = ?")
            params.append(new_name)
        if sort_order is not None:
            updates.append("sort_order = ?")
            params.append(sort_order)
        params.append(int(preset_id))
        conn.execute(
            f"UPDATE stretching_presets SET {', '.join(updates)} WHERE id = ?",
            params,
        )
        if exercises is not None:
            if not exercises:
                raise ValueError("Добавьте хотя бы одно упражнение")
            _save_preset_exercises(conn, preset_id, exercises)
        conn.commit()
    finally:
        conn.close()
    result = get_preset_by_id(preset_id)
    if not result:
        raise ValueError("Пресет не найден")
    return result


def archive_preset(preset_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM stretching_presets WHERE id = ?",
            (int(preset_id),),
        ).fetchone()
        if not row:
            raise ValueError("Пресет не найден")
        conn.execute(
            "UPDATE stretching_presets SET is_active = 0, updated_at = ? WHERE id = ?",
            (_now(), int(preset_id)),
        )
        conn.commit()
    finally:
        conn.close()
    result = get_preset_by_id(preset_id)
    if not result:
        raise ValueError("Пресет не найден")
    return result


def restore_preset(preset_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM stretching_presets WHERE id = ?",
            (int(preset_id),),
        ).fetchone()
        if not row:
            raise ValueError("Пресет не найден")
        conn.execute(
            "UPDATE stretching_presets SET is_active = 1, updated_at = ? WHERE id = ?",
            (_now(), int(preset_id)),
        )
        conn.commit()
    finally:
        conn.close()
    result = get_preset_by_id(preset_id)
    if not result:
        raise ValueError("Пресет не найден")
    return result


def delete_preset(preset_id: int) -> None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM stretching_presets WHERE id = ?",
            (int(preset_id),),
        ).fetchone()
        if not row:
            raise ValueError("Пресет не найден")
        log_count = _count_log_for_preset(conn, preset_id)
        if log_count > 0:
            raise ValueError(
                "Нельзя удалить пресет с историей выполнений. Архивируйте его."
            )
        conn.execute(
            "DELETE FROM stretching_preset_exercises WHERE preset_id = ?",
            (int(preset_id),),
        )
        conn.execute("DELETE FROM stretching_presets WHERE id = ?", (int(preset_id),))
        conn.commit()
    finally:
        conn.close()


# --- Журнал ---


def _log_row(conn, row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "date": str(row["date"]),
        "preset_id": int(row["preset_id"]),
        "preset_name": str(row["preset_name"]),
        "duration_minutes": int(row["duration_minutes"])
        if row["duration_minutes"] is not None
        else None,
        "notes": row["notes"] or "",
    }


def list_log(*, days: int = 90, date_from: str | None = None, date_to: str | None = None) -> list[dict[str, Any]]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(stretching_log)").fetchall()}
        active_clause = "AND (l.deleted_at IS NULL OR l.deleted_at = '')" if "deleted_at" in cols else ""
        if date_from and date_to:
            rows = conn.execute(
                f"""
                SELECT l.id, l.date, l.preset_id, p.name AS preset_name,
                       l.duration_minutes, l.notes
                FROM stretching_log l
                JOIN stretching_presets p ON p.id = l.preset_id
                WHERE (l.user_id = ? OR l.user_id IS NULL)
                  AND l.date >= ? AND l.date <= ?
                  {active_clause}
                ORDER BY l.date DESC, l.id DESC
                """,
                (uid, date_from, date_to),
            ).fetchall()
        else:
            since = (date.today() - timedelta(days=max(1, int(days)))).isoformat()
            rows = conn.execute(
                f"""
                SELECT l.id, l.date, l.preset_id, p.name AS preset_name,
                       l.duration_minutes, l.notes
                FROM stretching_log l
                JOIN stretching_presets p ON p.id = l.preset_id
                WHERE (l.user_id = ? OR l.user_id IS NULL) AND l.date >= ?
                  {active_clause}
                ORDER BY l.date DESC, l.id DESC
                """,
                (uid, since),
            ).fetchall()
        return [_log_row(conn, r) for r in rows]
    finally:
        conn.close()


def create_log_entry(
    *,
    date_str: str,
    preset_id: int,
    duration_minutes: int | None = None,
    notes: str | None = None,
) -> dict[str, Any]:
    d = date_str.strip()
    if not d:
        raise ValueError("Укажите дату")
    conn = get_db()
    try:
        preset = conn.execute(
            "SELECT id FROM stretching_presets WHERE id = ?",
            (int(preset_id),),
        ).fetchone()
        if not preset:
            raise ValueError("Пресет не найден")
        cur = conn.execute(
            """
            INSERT INTO stretching_log (user_id, date, preset_id, duration_minutes, notes)
            VALUES (?, ?, ?, ?, ?)
            """,
            (get_current_user_id(), d, int(preset_id), duration_minutes, (notes or "").strip() or None),
        )
        log_id = int(cur.lastrowid)
        from backend.services.forma_sync.change_tracker import mark_row_pending_on_insert

        mark_row_pending_on_insert(conn, "stretching_log", "id", log_id)
        conn.commit()
        row = conn.execute(
            """
            SELECT l.id, l.date, l.preset_id, p.name AS preset_name,
                   l.duration_minutes, l.notes
            FROM stretching_log l
            JOIN stretching_presets p ON p.id = l.preset_id
            WHERE l.id = ?
            """,
            (log_id,),
        ).fetchone()
        return _log_row(conn, row) if row else {}
    finally:
        conn.close()


def delete_log_entry(log_id: int) -> None:
    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(stretching_log)").fetchall()}
        row = conn.execute(
            "SELECT id FROM stretching_log WHERE id = ?",
            (int(log_id),),
        ).fetchone()
        if not row:
            raise ValueError("Запись не найдена")
        if {"deleted_at", "sync_status"}.issubset(cols):
            from backend.services.forma_sync.change_tracker import mark_local_change
            from backend.services.forma_sync.entity_mappers import now_iso

            deleted_at = now_iso()
            mark_local_change(conn, "stretching_log", "id", int(log_id), deleted_at=deleted_at)
        else:
            conn.execute("DELETE FROM stretching_log WHERE id = ?", (int(log_id),))
        conn.commit()
    finally:
        conn.close()


def _exercise_needs_translation(name: str, original_name: str | None, translated: int | None) -> bool:
    if int(translated or 0) == 1:
        return False
    if not original_name:
        return True
    return name.strip().casefold() == str(original_name).strip().casefold()


def translate_exercises_in_db(
    *,
    delay_sec: float = 0.3,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Перевести непереведённые упражнения в БД через MyMemory (идемпотентно)."""
    out = log or print
    stats: dict[str, Any] = {
        "total": 0,
        "pending": 0,
        "translated": 0,
        "skipped_already": 0,
        "translation_errors": 0,
        "update_errors": 0,
        "warnings": [],
    }

    conn = get_db()
    try:
        all_rows = conn.execute(
            "SELECT id, name, original_name, translated FROM shared.stretching_exercises ORDER BY id"
        ).fetchall()
        stats["total"] = len(all_rows)

        pending = [
            row
            for row in all_rows
            if _exercise_needs_translation(
                str(row["name"]),
                str(row["original_name"]).strip() if row["original_name"] else None,
                row["translated"],
            )
        ]
        stats["pending"] = len(pending)
        stats["skipped_already"] = stats["total"] - len(pending)

        if not pending:
            out("Все упражнения уже переведены.")
            return stats

        out(f"К переводу: {len(pending)} из {stats['total']} упражнений")

        for row in pending:
            exercise_id = int(row["id"])
            name = str(row["name"])
            original = row["original_name"]
            original_str = str(original).strip() if original else None
            source = original_str or name

            translated_text, ok = _translate_name_en_ru(source)
            if not ok:
                stats["translation_errors"] += 1
                out(f"Предупреждение: перевод не удался для «{source}», пропуск")
                if delay_sec > 0:
                    time.sleep(delay_sec)
                continue

            new_name = translated_text.strip()
            dup = conn.execute(
                """
                SELECT id FROM shared.stretching_exercises
                WHERE name = ? COLLATE NOCASE AND id != ?
                """,
                (new_name, exercise_id),
            ).fetchone()
            if dup:
                new_name = f"{new_name} ({exercise_id})"

            try:
                conn.execute(
                    """
                    UPDATE shared.stretching_exercises
                    SET name = ?, original_name = COALESCE(original_name, ?), translated = 1
                    WHERE id = ?
                    """,
                    (new_name, source, exercise_id),
                )
                conn.commit()
                stats["translated"] += 1
                out(f"Переведено {stats['translated']} из {len(pending)} упражнений")
            except Exception as err:
                stats["update_errors"] += 1
                logger.warning("Update failed for exercise %s: %s", exercise_id, err)
                out(f"Предупреждение: не удалось сохранить «{source}»: {err}")

            if delay_sec > 0:
                time.sleep(delay_sec)
    finally:
        conn.close()

    if stats["translation_errors"]:
        warn = (
            "Часть упражнений осталась без перевода — API недоступен "
            "или вернул тот же текст. Запустите скрипт повторно позже."
        )
        stats["warnings"].append(warn)
        out(warn)

    out(
        f"Готово. Всего в базе: {stats['total']}, переведено в этом запуске: {stats['translated']}, "
        f"уже были переведены: {stats['skipped_already']}, "
        f"ошибок перевода: {stats['translation_errors']}, "
        f"ошибок обновления: {stats['update_errors']}"
    )
    return stats


def get_activity_calendar(*, days: int = 365) -> list[dict[str, Any]]:
    """Данные для тепловой карты: date, count, total_minutes, level."""
    uid = get_current_user_id()
    since = (date.today() - timedelta(days=max(1, int(days)))).isoformat()
    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(stretching_log)").fetchall()}
        active_clause = "AND (deleted_at IS NULL OR deleted_at = '')" if "deleted_at" in cols else ""
        rows = conn.execute(
            f"""
            SELECT date,
                   COUNT(*) AS sessions,
                   SUM(COALESCE(duration_minutes, 0)) AS total_minutes
            FROM stretching_log
            WHERE (user_id = ? OR user_id IS NULL) AND date >= ?
              {active_clause}
            GROUP BY date
            ORDER BY date
            """,
            (uid, since),
        ).fetchall()
        out: list[dict[str, Any]] = []
        for r in rows:
            total = int(r["total_minutes"] or 0)
            sessions = int(r["sessions"] or 0)
            if total >= 30:
                level = 4
            elif total >= 20:
                level = 3
            elif total >= 10:
                level = 2
            elif total > 0 or sessions > 0:
                level = 1
            else:
                level = 0
            out.append(
                {
                    "date": str(r["date"]),
                    "count": sessions,
                    "total_minutes": total,
                    "level": level,
                }
            )
        return out
    finally:
        conn.close()


def estimate_preset_duration_minutes(preset_id: int) -> int | None:
    """Оценка длительности пресета по hold_seconds и reps."""
    preset = get_preset_by_id(preset_id)
    if not preset or not preset.get("exercises"):
        return None
    total_sec = 0
    for ex in preset["exercises"]:
        total_sec += int(ex.get("hold_seconds") or 30) * int(ex.get("reps") or 1)
    return max(1, round(total_sec / 60)) if total_sec else None


_MANUAL_EXERCISE_NAMES_RU: dict[str, str] = {
    "the straddle": "Поперечная растяжка (шпагат)",
    "groiners": "Растяжка паха",
    "windmills": "Упражнение «Мельница»",
}


def _translation_query_variants(name: str) -> list[str]:
    """Варианты запроса к API: короткие названия упражнений часто не переводятся напрямую."""
    text = name.strip()
    variants: list[str] = []
    seen: set[str] = set()

    def add(value: str) -> None:
        candidate = value.strip()
        if not candidate:
            return
        key = candidate.casefold()
        if key not in seen:
            seen.add(key)
            variants.append(candidate)

    add(text)

    lower = text.casefold()
    manual_query = {
        "groiners": "groin stretch exercise",
        "windmills": "windmill stretch exercise",
        "the straddle": "deep straddle flexibility stretch",
        "overhead lat": "overhead lat stretch",
        "lying hamstring": "lying hamstring stretch",
        "quad stretch": "quadriceps stretch",
        "90/90 hamstring": "90 90 hamstring stretch",
    }
    if lower in manual_query:
        add(manual_query[lower])

    if "-SMR" in text:
        add(text.replace("-SMR", " self myofascial release"))

    if "stretch" not in lower and "smr" not in lower:
        add(f"{text} stretch")

    if "/" in text and "stretch" not in lower:
        add(f"{text.replace('/', ' ')} stretch")

    if lower.startswith("smith machine "):
        rest = text[len("Smith Machine ") :].strip()
        add(f"smith machine {rest.lower()}")
        if "stretch" not in rest.casefold():
            add(f"{rest} stretch")

    return variants


def _call_mymemory(
    query: str,
    *,
    timeout: float = 20.0,
    max_retries: int = 6,
) -> tuple[str, bool, bool]:
    """Возвращает (текст, успех, был_ли_лимит_429)."""
    encoded = urllib.parse.quote(query[:500])
    url = f"https://api.mymemory.translated.net/get?q={encoded}&langpair=en|ru"
    last_err: Exception | None = None
    saw_429 = False

    for attempt in range(max_retries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "MyHealthDashboard/1.0"})
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                payload = json.loads(resp.read().decode("utf-8"))
            translated = str(payload.get("responseData", {}).get("translatedText") or "").strip()
            if not translated:
                return query, False, saw_429
            if translated.casefold() == query.casefold():
                return query, False, saw_429
            return translated, True, False
        except urllib.error.HTTPError as err:
            last_err = err
            if err.code == 429:
                saw_429 = True
                if attempt < max_retries - 1:
                    wait = min(120.0, 15.0 * (attempt + 1))
                    logger.warning("MyMemory rate limit for %r, retry in %ss", query[:40], wait)
                    time.sleep(wait)
                    continue
            logger.warning("Translation HTTP error for %r: %s", query[:40], err)
            return query, False, saw_429
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as err:
            last_err = err
            if attempt < max_retries - 1:
                time.sleep(3.0 * (attempt + 1))
                continue
            logger.warning("Translation failed for %r: %s", query[:40], err)
            return query, False, False

    if last_err:
        logger.warning("Translation failed after retries for %r: %s", query[:40], last_err)
    return query, False, saw_429


def _translate_name_en_ru(original: str, *, timeout: float = 20.0) -> tuple[str, bool]:
    """Перевод через MyMemory с запасными формулировками и ручным словарём."""
    text = original.strip()
    if not text:
        return text, False

    manual = _MANUAL_EXERCISE_NAMES_RU.get(text.casefold())
    if manual:
        return manual, True

    source_key = text.casefold()
    for query in _translation_query_variants(text):
        translated, ok, _rate = _call_mymemory(query, timeout=timeout)
        if ok and translated.casefold() not in {source_key, query.casefold()}:
            return translated, True

    return text, False


def _split_text_for_translation(text: str, max_len: int = 450) -> list[str]:
    """Разбить длинный текст на части для MyMemory (лимит ~500 символов на запрос)."""
    cleaned = text.strip()
    if not cleaned:
        return []
    if len(cleaned) <= max_len:
        return [cleaned]

    parts: list[str] = []
    remaining = cleaned
    while remaining:
        if len(remaining) <= max_len:
            parts.append(remaining)
            break
        cut = remaining.rfind(". ", 0, max_len)
        if cut < max_len // 2:
            cut = remaining.rfind(" ", 0, max_len)
        if cut < 1:
            cut = max_len
        chunk = remaining[:cut].strip()
        if chunk:
            parts.append(chunk)
        remaining = remaining[cut:].strip()
    return parts


def _translate_text_en_ru(
    text: str,
    *,
    timeout: float = 20.0,
    delay_sec: float = 0.0,
) -> tuple[str, bool, bool]:
    """Перевод произвольного текста (описания) через MyMemory."""
    source = text.strip()
    if not source:
        return source, False, False

    chunks = _split_text_for_translation(source)
    translated_chunks: list[str] = []
    rate_limited = False
    for chunk in chunks:
        translated, ok, chunk_rate = _call_mymemory(chunk, timeout=timeout)
        rate_limited = rate_limited or chunk_rate
        if not ok:
            return source, False, rate_limited
        translated_chunks.append(translated)
        if delay_sec > 0:
            time.sleep(delay_sec)

    result = " ".join(translated_chunks).strip()
    if not result or result.casefold() == source.casefold():
        return source, False, rate_limited
    return result, True, False


def _description_needs_translation(
    description: str | None,
    original_description: str | None,
    description_translated: int | None,
) -> bool:
    if int(description_translated or 0) == 1:
        return False
    desc = (description or "").strip()
    if not desc:
        return False
    orig = (original_description or "").strip()
    if not orig:
        return True
    return desc.casefold() == orig.casefold()


def translate_descriptions_in_db(
    *,
    delay_sec: float = 0.3,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any]:
    """Перевести описания упражнений в БД через MyMemory (идемпотентно)."""
    out = log or print
    stats: dict[str, Any] = {
        "total": 0,
        "pending": 0,
        "translated": 0,
        "skipped_already": 0,
        "skipped_empty": 0,
        "translation_errors": 0,
        "update_errors": 0,
        "warnings": [],
    }

    conn = get_db()
    try:
        all_rows = conn.execute(
            """
            SELECT id, name, description, original_description, description_translated
            FROM shared.stretching_exercises
            ORDER BY id
            """
        ).fetchall()
        stats["total"] = len(all_rows)

        pending = [
            row
            for row in all_rows
            if _description_needs_translation(
                str(row["description"]) if row["description"] else None,
                str(row["original_description"]).strip() if row["original_description"] else None,
                row["description_translated"],
            )
        ]
        stats["pending"] = len(pending)
        stats["skipped_already"] = stats["total"] - len(pending)
        stats["skipped_empty"] = stats["total"] - len(
            [r for r in all_rows if (r["description"] or "").strip()]
        )

        if not pending:
            out("Все описания уже переведены.")
            return stats

        out(f"Описаний к переводу: {len(pending)} из {stats['total']} упражнений")

        chunk_delay = delay_sec if delay_sec > 0 else 0.0

        for row in pending:
            exercise_id = int(row["id"])
            name = str(row["name"])
            description = str(row["description"]).strip()
            original = row["original_description"]
            original_str = str(original).strip() if original else description

            translated_text, ok, rate_limited = _translate_text_en_ru(
                original_str,
                delay_sec=chunk_delay,
            )
            if not ok:
                stats["translation_errors"] += 1
                out(f"Предупреждение: перевод описания не удался для «{name}», пропуск")
                if rate_limited:
                    out("Лимит MyMemory API — пауза 2 мин перед следующим упражнением...")
                    time.sleep(120)
                elif delay_sec > 0:
                    time.sleep(delay_sec)
                continue

            try:
                conn.execute(
                    """
                    UPDATE shared.stretching_exercises
                    SET description = ?,
                        original_description = COALESCE(original_description, ?),
                        description_translated = 1
                    WHERE id = ?
                    """,
                    (translated_text.strip(), original_str, exercise_id),
                )
                conn.commit()
                stats["translated"] += 1
                out(f"Описания: переведено {stats['translated']} из {len(pending)}")
            except Exception as err:
                stats["update_errors"] += 1
                logger.warning("Description update failed for exercise %s: %s", exercise_id, err)
                out(f"Предупреждение: не удалось сохранить описание «{name}»: {err}")

            if delay_sec > 0:
                time.sleep(delay_sec)
    finally:
        conn.close()

    if stats["translation_errors"]:
        warn = (
            "Часть описаний осталась без перевода — API недоступен "
            "или вернул тот же текст. Запустите скрипт повторно позже."
        )
        stats["warnings"].append(warn)
        out(warn)

    out(
        f"Описания готово. Всего: {stats['total']}, переведено в этом запуске: {stats['translated']}, "
        f"уже были переведены: {stats['skipped_already']}, "
        f"ошибок перевода: {stats['translation_errors']}, "
        f"ошибок обновления: {stats['update_errors']}"
    )
    return stats
