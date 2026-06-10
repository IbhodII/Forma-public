# -*- coding: utf-8 -*-
"""Наборы упражнений по типам силовых тренировок."""
from __future__ import annotations

from typing import Any

from database.db_utils import (
    get_active_set_id,
    get_all_sets,
    get_exercise_set,
    get_exercise_set_row,
    get_set_exercise_items,
    get_set_exercises,
    save_exercise_set,
    update_exercise_set_by_id,
)
from utils.constants import EXERCISE_SET_DEFAULT_FROM
from utils.helpers import (
    get_last_exercise_stats,
    get_last_strength_session_metrics,
    get_last_warmup_sets,
)


def list_workout_types() -> list[str]:
    """Типы тренировок: пресеты, константы и пользовательские типы из exercise_sets."""
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id
    from backend.services import preset_service

    ordered: list[str] = []
    seen: set[str] = set()

    for t in preset_service.list_active_preset_names():
        if t not in seen:
            ordered.append(t)
            seen.add(t)

    conn = get_db()
    uid = get_current_user_id()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT workout_type FROM exercise_sets
            WHERE user_id = ? AND workout_type IS NOT NULL AND TRIM(workout_type) != ''
            ORDER BY workout_type COLLATE NOCASE
            """,
            (uid,),
        ).fetchall()
    except Exception:
        rows = []
    finally:
        conn.close()

    for r in rows:
        t = str(r[0])
        if t not in seen:
            ordered.append(t)
            seen.add(t)
    return ordered


def get_active_exercises(workout_type: str, on_date: str) -> list[str]:
    return get_exercise_set(workout_type, on_date)


def get_exercises_from_set(set_id: int) -> list[dict[str, Any]]:
    """Упражнения набора с порядком (только набор текущего user_id)."""
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    uid = get_current_user_id()
    conn = get_db()
    try:
        owned = conn.execute(
            "SELECT 1 FROM exercise_sets WHERE id = ? AND user_id = ?",
            (set_id, uid),
        ).fetchone()
        if not owned:
            return []
        rows = conn.execute(
            """
            SELECT exercise_name, exercise_order
            FROM exercise_set_items
            WHERE set_id = ?
            ORDER BY exercise_order, id
            """,
            (set_id,),
        ).fetchall()
    finally:
        conn.close()
    seen: set[str] = set()
    out: list[dict[str, Any]] = []
    for r in rows:
        name = str(r[0]).strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append({"exercise_name": name, "exercise_order": int(r[1])})
    out.sort(key=lambda x: x["exercise_order"])
    return out


def _items_from_blocks(blocks: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    if not blocks:
        return items
    order = 0
    for block_order, block in enumerate(blocks):
        block_uid = str(block.get("id") or block.get("block_uid") or f"block-{block_order}")
        block_type = str(block.get("type") or block.get("block_type") or "normal")
        if block_type not in {"normal", "superset", "circuit"}:
            block_type = "normal"
        block_rounds = int(block.get("rounds") or block.get("block_rounds") or 1)
        block_title = block.get("title") or block.get("block_title")
        rows = block.get("exercises") or block.get("approaches") or block.get("items") or []
        for exercise_order, row in enumerate(rows):
            exercise = str(row.get("exercise") or row.get("exercise_name") or "").strip()
            if not exercise:
                continue
            items.append(
                {
                    "exercise_name": exercise,
                    "exercise_order": order,
                    "block_uid": block_uid,
                    "block_type": block_type,
                    "block_order": block_order,
                    "block_rounds": max(1, block_rounds),
                    "block_exercise_order": exercise_order,
                    "block_title": block_title,
                    "target_reps": row.get("reps") or row.get("target_reps"),
                    "target_weight": row.get("weight") if row.get("weight") is not None else row.get("target_weight"),
                    "target_duration_sec": row.get("duration_sec") or row.get("target_duration_sec"),
                    "is_bodyweight": bool(row.get("is_bodyweight")),
                    "is_warmup": bool(row.get("is_warmup")),
                }
            )
            order += 1
    return items


def _blocks_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    block_rows = [
        item for item in items
        if item.get("block_uid") or item.get("block_type") or item.get("block_order") is not None
    ]
    if not block_rows:
        return []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for item in block_rows:
        key = str(item.get("block_uid") or f"block-{item.get('block_order') or 0}")
        grouped.setdefault(key, []).append(item)
    blocks: list[dict[str, Any]] = []
    for key, rows in grouped.items():
        rows.sort(key=lambda r: (int(r.get("block_exercise_order") or 0), int(r.get("exercise_order") or 0)))
        first = rows[0]
        blocks.append(
            {
                "id": key,
                "type": first.get("block_type") or "normal",
                "title": first.get("block_title"),
                "rounds": int(first.get("block_rounds") or 1),
                "exercises": [
                    {
                        "exercise": r.get("exercise_name") or r.get("exercise"),
                        "reps": int(r.get("target_reps") or 8),
                        "weight": r.get("target_weight"),
                        "duration_sec": r.get("target_duration_sec"),
                        "is_bodyweight": bool(r.get("is_bodyweight")),
                        "is_warmup": bool(r.get("is_warmup")),
                    }
                    for r in rows
                ],
            }
        )
    blocks.sort(key=lambda b: min(
        int(r.get("block_order") or 0)
        for r in grouped[str(b["id"])]
    ))
    return blocks


def get_active_exercise_set(workout_type: str, for_date: str) -> dict[str, Any] | None:
    """
    Активный набор на дату: effective_from <= date и (effective_to IS NULL или >= date).
    При нескольких — с максимальным effective_from.
    """
    date_str = str(for_date)[:10]
    set_id = get_active_set_id(workout_type, date_str)
    if not set_id:
        return None
    exercises = get_exercises_from_set(set_id)
    items = get_set_exercise_items(set_id)
    return {"set_id": set_id, "exercises": exercises, "blocks": _blocks_from_items(items)}


def get_editor_state(workout_type: str, effective_date: str) -> dict[str, Any]:
    """Список наборов типа и id набора, действующего на дату."""
    eff = effective_date[:10]
    sets = get_all_sets(workout_type)
    active_id = get_active_set_id(workout_type, eff)
    return {
        "workout_type": workout_type,
        "effective_date": eff,
        "active_set_id": active_id,
        "active_exercises": get_exercise_set(workout_type, eff),
        "active_blocks": _blocks_from_items(get_set_exercise_items(active_id)) if active_id else [],
        "sets": sets,
    }


def get_set_detail(set_id: int) -> dict[str, Any]:
    row = get_exercise_set_row(set_id)
    if not row:
        raise ValueError("Набор не найден")
    exercises = get_set_exercises(set_id)
    items = get_set_exercise_items(set_id)
    return {
        "id": int(row["id"]),
        "workout_type": row["workout_type"],
        "set_name": row["set_name"],
        "effective_from": str(row["effective_from"])[:10],
        "effective_to": str(row["effective_to"])[:10] if row["effective_to"] else None,
        "is_default": int(row["is_default"] or 0),
        "exercises": exercises,
        "blocks": _blocks_from_items(items),
    }


def update_set_from_editor(
    set_id: int,
    active_exercises: list[str],
    set_name: str | None = None,
    active_blocks: list[dict[str, Any]] | None = None,
) -> int:
    from backend.services import exercise_catalog_service

    exercise_catalog_service.ensure_exercises(active_exercises)
    block_items = _items_from_blocks(active_blocks)
    return update_exercise_set_by_id(
        set_id,
        active_exercises,
        set_name=set_name,
        items=block_items or None,
    )


def save_exercise_set_from_editor(
    workout_type: str,
    effective_from: str,
    active_exercises: list[str],
    set_name: str | None = None,
    active_blocks: list[dict[str, Any]] | None = None,
    *,
    show_on_main_panel: bool = False,
) -> int:
    if effective_from[:10] == EXERCISE_SET_DEFAULT_FROM:
        raise ValueError(
            f"Дата {EXERCISE_SET_DEFAULT_FROM} зарезервирована для исходного набора"
        )
    from backend.services import exercise_catalog_service, preset_service

    exercise_catalog_service.ensure_exercises(active_exercises)
    block_items = _items_from_blocks(active_blocks)
    set_id = save_exercise_set(
        workout_type,
        effective_from[:10],
        active_exercises,
        set_name=set_name,
        items=block_items or None,
    )
    if show_on_main_panel:
        preset_service.ensure_preset_for_workout_type(
            workout_type,
            active_exercises,
            is_active=True,
            sync_exercises=True,
        )
    return set_id


def create_workout_type(
    workout_type: str,
    exercises: list[str],
    effective_from: str,
    *,
    show_on_main_panel: bool = True,
) -> tuple[int, int | None]:
    title = workout_type.strip()
    if not title:
        raise ValueError("Укажите название типа тренировки")
    clean = [e.strip() for e in exercises if e and e.strip()]
    if not clean:
        raise ValueError("Добавьте хотя бы одно упражнение")
    from backend.services import exercise_catalog_service, preset_service

    exercise_catalog_service.ensure_exercises(clean)
    set_id = save_exercise_set(title, effective_from[:10], clean, set_name="Начальный набор")
    preset = preset_service.ensure_preset_for_workout_type(
        title,
        clean,
        is_active=show_on_main_panel,
        sync_exercises=True,
    )
    return set_id, int(preset["id"]) if preset else None


def _count_strength_workouts(workout_type: str) -> int:
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT COUNT(DISTINCT date || '|' || COALESCE(workout_title, ''))
            FROM strength_workouts
            WHERE workout_title = ? AND user_id = ?
            """,
            (workout_type.strip(), get_current_user_id()),
        ).fetchone()
    finally:
        conn.close()
    return int(row[0] or 0) if row else 0


def _archive_preset_for_type(workout_type: str) -> bool:
    from backend.services import preset_service

    preset = preset_service.get_preset_by_name(workout_type.strip())
    if not preset:
        return False
    if int(preset.get("is_active") or 0) == 1:
        preset_service.archive_preset(int(preset["id"]))
        return True
    return False


def _count_sets_for_type(workout_type: str) -> int:
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM exercise_sets WHERE workout_type = ? AND user_id = ?",
            (workout_type.strip(), uid),
        ).fetchone()
    finally:
        conn.close()
    return int(row[0] or 0) if row else 0


def delete_exercise_set_version(set_id: int) -> dict[str, Any]:
    """Удалить версию набора. История strength_workouts сохраняется."""
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, workout_type, effective_from, effective_to, is_default, set_name
            FROM exercise_sets WHERE id = ? AND user_id = ?
            """,
            (int(set_id), uid),
        ).fetchone()
        if not row:
            raise ValueError("Набор не найден")
        if int(row["is_default"] or 0) == 1:
            raise ValueError("Нельзя удалить исходный набор встроенного типа")
        workout_type = str(row["workout_type"])
        conn.execute("DELETE FROM exercise_set_items WHERE set_id = ?", (int(set_id),))
        conn.execute("DELETE FROM exercise_sets WHERE id = ? AND user_id = ?", (int(set_id), uid))
        conn.commit()
    finally:
        conn.close()

    preset_archived = False
    type_removed = False
    if _count_sets_for_type(workout_type) == 0:
        preset_archived = _archive_preset_for_type(workout_type)
        type_removed = True

    return {
        "set_id": int(set_id),
        "workout_type": workout_type,
        "workout_count": _count_strength_workouts(workout_type),
        "preset_archived": preset_archived,
        "type_removed": type_removed,
        "message": "ok",
    }


def delete_workout_type(workout_type: str) -> dict[str, Any]:
    """Удалить пользовательский тип: наборы снимаются, пресет в архив, история сохраняется."""
    title = workout_type.strip()
    if not title:
        raise ValueError("Укажите тип тренировки")

    workout_count = _count_strength_workouts(title)
    preset_archived = _archive_preset_for_type(title)

    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    uid = get_current_user_id()
    conn = get_db()
    try:
        set_ids = conn.execute(
            "SELECT id FROM exercise_sets WHERE workout_type = ? AND user_id = ?",
            (title, uid),
        ).fetchall()
        for sid in set_ids:
            conn.execute("DELETE FROM exercise_set_items WHERE set_id = ?", (int(sid[0]),))
        conn.execute(
            "DELETE FROM exercise_sets WHERE workout_type = ? AND user_id = ?",
            (title, uid),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "workout_type": title,
        "workout_count": workout_count,
        "preset_archived": preset_archived,
        "message": "ok",
    }


def append_exercise_to_workout(
    workout_title: str,
    on_date: str,
    exercise_name: str,
) -> dict[str, Any]:
    """Добавить упражнение в активный набор типа тренировки (inline creation)."""
    from backend.services import exercise_catalog_service

    name = exercise_name.strip()
    if not name:
        raise ValueError("Укажите название упражнения")
    exercise_catalog_service.ensure_exercise(name)
    eff = on_date[:10]
    set_id = get_active_set_id(workout_title, eff)
    if not set_id:
        raise ValueError(
            "Нет активного набора упражнений. Создайте тип тренировки во вкладке «Упражнения»."
        )
    current = get_set_exercises(set_id)
    if any(e.lower() == name.lower() for e in current):
        return {
            "exercise": name,
            "set_id": set_id,
            "added": False,
            "exercises": current,
            "message": "Упражнение уже в наборе",
        }
    updated = [*current, name]
    update_exercise_set_by_id(set_id, updated)
    return {
        "exercise": name,
        "set_id": set_id,
        "added": True,
        "exercises": updated,
        "message": "ok",
    }


def _merge_exercise_name_order(preferred: list[str], template_names: list[str]) -> list[str]:
    """Порядок из последней сессии + новые упражнения из шаблона в конце."""
    seen: set[str] = set()
    out: list[str] = []
    for raw in preferred:
        name = str(raw).strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    for raw in template_names:
        name = str(raw).strip()
        if not name:
            continue
        key = name.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(name)
    return out


def _get_last_session_detail_for_prefill(workout_title: str) -> dict[str, Any] | None:
    """Последняя сессия типа тренировки: режим круга и порядок (текущий user_id)."""
    from backend.database import get_db
    from backend.database.db_utils import get_current_user_id

    title = workout_title.strip()
    if not title:
        return None
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT date FROM strength_workouts
            WHERE user_id = ? AND workout_title = ?
            GROUP BY date
            ORDER BY date DESC
            LIMIT 1
            """,
            (uid, title),
        ).fetchone()
        if not row:
            return None
        date_str = str(row[0])[:10]
        circuit_row = conn.execute(
            """
            SELECT MAX(COALESCE(is_circuit, 0))
            FROM strength_workouts
            WHERE user_id = ? AND workout_title = ? AND date = ?
            """,
            (uid, title, date_str),
        ).fetchone()
        is_circuit = bool(int(circuit_row[0] or 0)) if circuit_row else False
        if is_circuit:
            set_rows = conn.execute(
                """
                SELECT exercise, weight, reps,
                       COALESCE(is_warmup, 0), COALESCE(is_bodyweight, 0),
                       duration_sec, COALESCE(order_index, 0), set_number, id
                FROM strength_workouts
                WHERE user_id = ? AND workout_title = ? AND date = ?
                ORDER BY
                  CASE WHEN COALESCE(order_index, 0) > 0 THEN order_index ELSE set_number END ASC,
                  id ASC
                """,
                (uid, title, date_str),
            ).fetchall()
            ordered_sets: list[dict[str, Any]] = []
            for r in set_rows:
                exercise = str(r[0] or "").strip()
                if not exercise:
                    continue
                is_bw = bool(int(r[4] or 0))
                dur = r[5]
                dur_i = int(dur) if dur is not None else None
                reps_i = int(r[2] or 1)
                ordered_sets.append(
                    {
                        "exercise": exercise,
                        "weight": float(r[1] or 0) if not is_bw else 0.0,
                        "reps": reps_i,
                        "reps_str": str(reps_i),
                        "is_warmup": bool(int(r[3] or 0)),
                        "is_bodyweight": is_bw,
                        "duration_sec": dur_i,
                        "order_index": int(r[6] or 0),
                        "set_number": int(r[7] or 0),
                    }
                )
            return {
                "date": date_str,
                "workout_title": title,
                "is_circuit": True,
                "uses_ordered_sets": True,
                "ordered_sets": ordered_sets,
                "exercises": [],
            }

        ex_rows = conn.execute(
            """
            SELECT exercise FROM strength_workouts
            WHERE user_id = ? AND workout_title = ? AND date = ?
              AND exercise IS NOT NULL AND TRIM(exercise) != ''
            GROUP BY exercise
            ORDER BY MIN(COALESCE(NULLIF(order_index, 0), set_number, 9999)) ASC,
                     MIN(rowid) ASC
            """,
            (uid, title, date_str),
        ).fetchall()
        exercises = [{"exercise": str(r[0]).strip()} for r in ex_rows if str(r[0]).strip()]
        return {
            "date": date_str,
            "workout_title": title,
            "is_circuit": False,
            "uses_ordered_sets": False,
            "ordered_sets": [],
            "exercises": exercises,
        }
    finally:
        conn.close()


def _circuit_steps_from_session(detail: dict[str, Any]) -> list[dict[str, Any]]:
    """Плоский порядок шагов круга из прошлой сессии."""
    ordered = list(detail.get("ordered_sets") or [])
    steps: list[dict[str, Any]] = []
    for s in ordered:
        exercise = str(s.get("exercise") or "").strip()
        if not exercise:
            continue
        is_bw = bool(s.get("is_bodyweight"))
        dur = s.get("duration_sec")
        dur_i = int(dur) if dur is not None else None
        steps.append(
            {
                "exercise": exercise,
                "reps": int(s.get("reps") or 1),
                "weight": None if is_bw else float(s.get("weight") or 0),
                "is_warmup": bool(s.get("is_warmup")),
                "is_bodyweight": is_bw,
                "duration_sec": dur_i,
            }
        )
    return steps


def get_workout_form_prefill(
    workout_title: str,
    on_date: str,
    preset_id: int | None = None,
) -> dict[str, Any]:
    """
    Упражнения для формы ручного ввода.
    preset_id задан — из workout_presets; иначе только активный exercise_set (не история).
    """
    from backend.services import preset_service
    from backend.services.preset_sets_utils import is_time_based_exercise

    eff_date = str(on_date)[:10]
    names: list[str] = []
    defaults: dict[str, dict[str, Any]] = {}
    resolved_preset_id: int | None = None
    template_blocks: list[dict[str, Any]] = []

    if preset_id is not None:
        preset = preset_service.get_preset_by_id(int(preset_id))
        if preset:
            resolved_preset_id = int(preset_id)
            for ex in preset["exercises"]:
                key = str(ex["exercise_name"])
                names.append(key)
                defaults[key] = ex
    else:
        active = get_active_exercise_set(workout_title, eff_date)
        if active:
            template_blocks = list(active.get("blocks") or [])
            for ex in sorted(active["exercises"], key=lambda x: x["exercise_order"]):
                names.append(str(ex["exercise_name"]))

    exercises: list[dict[str, Any]] = []
    for name in names:
        lw, lr, ld = get_last_exercise_stats(name, workout_title)
        warmup_sets = get_last_warmup_sets(name, workout_title, str(ld)[:10] if ld else None)
        preset_def = defaults.get(name, {})

        if preset_def:
            default_reps = preset_def.get("default_reps") or ""
            default_weight = preset_def.get("default_weight")
            default_sets = int(preset_def.get("default_sets") or 4)
            preset_sets = list(preset_def.get("sets") or [])
            is_bodyweight = bool(preset_def.get("is_bodyweight") or False)
            weight = float(lw) if lw is not None else (
                float(default_weight) if default_weight is not None else None
            )
            reps = lr if lr else default_reps
        else:
            default_sets = 4
            default_reps = ""
            default_weight = None
            preset_sets = []
            is_bodyweight = is_time_based_exercise(name)
            weight = float(lw) if lw is not None else None
            reps = lr if lr else ""

        exercises.append(
            {
                "exercise": name,
                "last_weight": weight,
                "last_reps": reps,
                "last_date": str(ld)[:10] if ld else None,
                "last_warmup_sets": warmup_sets,
                "default_sets": default_sets,
                "default_reps": default_reps,
                "default_weight": default_weight,
                "sets": preset_sets,
                "is_bodyweight": is_bodyweight,
            }
        )

    last_session = _get_last_session_detail_for_prefill(workout_title)
    is_circuit = bool(last_session.get("is_circuit")) if last_session else False
    circuit_steps: list[dict[str, Any]] = []
    if last_session and is_circuit:
        circuit_steps = _circuit_steps_from_session(last_session)
        if not circuit_steps:
            is_circuit = False
        elif circuit_steps:
            exercises = []
            seen_ex: set[str] = set()
            for step in circuit_steps:
                key = str(step["exercise"]).casefold()
                if key in seen_ex:
                    continue
                seen_ex.add(key)
                name = str(step["exercise"])
                lw, lr, ld = get_last_exercise_stats(name, workout_title)
                warmup_sets = get_last_warmup_sets(name, workout_title, str(ld)[:10] if ld else None)
                preset_def = defaults.get(name, {})
                is_bodyweight = bool(step.get("is_bodyweight")) or bool(
                    preset_def.get("is_bodyweight")
                )
                exercises.append(
                    {
                        "exercise": name,
                        "last_weight": float(step["weight"])
                        if step.get("weight") is not None and not is_bodyweight
                        else (float(lw) if lw is not None else None),
                        "last_reps": str(step.get("reps") or lr or ""),
                        "last_date": str(ld)[:10] if ld else None,
                        "last_warmup_sets": warmup_sets,
                        "default_sets": 1,
                        "default_reps": str(step.get("reps") or ""),
                        "default_weight": step.get("weight"),
                        "sets": [
                            {
                                "set_number": 1,
                                "reps": int(step.get("reps") or 1),
                                "weight": step.get("weight"),
                                "duration_sec": step.get("duration_sec"),
                                "is_warmup": bool(step.get("is_warmup")),
                            }
                        ],
                        "is_bodyweight": is_bodyweight,
                    }
                )
    elif last_session and not is_circuit and last_session.get("exercises"):
        last_order = [str(e["exercise"]) for e in last_session["exercises"] if e.get("exercise")]
        if last_order:
            names = _merge_exercise_name_order(last_order, names)
            exercises = []
            for name in names:
                lw, lr, ld = get_last_exercise_stats(name, workout_title)
                warmup_sets = get_last_warmup_sets(name, workout_title, str(ld)[:10] if ld else None)
                preset_def = defaults.get(name, {})
                if preset_def:
                    default_reps = preset_def.get("default_reps") or ""
                    default_weight = preset_def.get("default_weight")
                    default_sets = int(preset_def.get("default_sets") or 4)
                    preset_sets = list(preset_def.get("sets") or [])
                    is_bodyweight = bool(preset_def.get("is_bodyweight") or False)
                    weight = float(lw) if lw is not None else (
                        float(default_weight) if default_weight is not None else None
                    )
                    reps = lr if lr else default_reps
                else:
                    default_sets = 4
                    default_reps = ""
                    default_weight = None
                    preset_sets = []
                    is_bodyweight = is_time_based_exercise(name)
                    weight = float(lw) if lw is not None else None
                    reps = lr if lr else ""
                exercises.append(
                    {
                        "exercise": name,
                        "last_weight": weight,
                        "last_reps": reps,
                        "last_date": str(ld)[:10] if ld else None,
                        "last_warmup_sets": warmup_sets,
                        "default_sets": default_sets,
                        "default_reps": default_reps,
                        "default_weight": default_weight,
                        "sets": preset_sets,
                        "is_bodyweight": is_bodyweight,
                    }
                )

    metrics = get_last_strength_session_metrics(workout_title) or {}
    return {
        "workout_title": workout_title,
        "date": eff_date,
        "preset_id": resolved_preset_id,
        "is_circuit": is_circuit,
        "circuit_steps": circuit_steps,
        "blocks": template_blocks,
        "exercises": exercises,
        "session_metrics": {
            "avg_hr": metrics.get("avg_hr"),
            "calories_chest": metrics.get("calories_chest"),
            "calories_watch": metrics.get("calories_watch"),
        },
    }
