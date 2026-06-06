# -*- coding: utf-8 -*-

"""CRUD пресетов тренировок (workout_presets + preset_exercises + preset_sets)."""

from __future__ import annotations



from datetime import datetime

from typing import Any



from backend.database import get_db
from backend.database.db_utils import get_current_user_id

from backend.services.preset_sets_utils import (

    default_sets_for_new_exercise,

    normalize_exercise_sets_input,

)





def _now() -> str:

    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")





def _preset_row_to_dict(

    row: Any,

    *,

    workout_count: int = 0,

    exercise_count: int = 0,

    exercise_names: list[str] | None = None,

) -> dict[str, Any]:

    data = {

        "id": int(row["id"]),

        "name": str(row["name"]),

        "is_active": int(row["is_active"] or 0),

        "sort_order": int(row["sort_order"] or 0),

        "workout_count": workout_count,

        "exercise_count": exercise_count,

        "created_at": str(row["created_at"]) if row["created_at"] else None,

        "updated_at": str(row["updated_at"]) if row["updated_at"] else None,

    }

    if exercise_names is not None:

        data["exercise_names"] = exercise_names

    return data





def _fetch_sets_for_exercise(
    conn, preset_exercise_id: int, *, user_id: int
) -> list[dict[str, Any]]:

    rows = conn.execute(

        """

        SELECT set_number, reps, weight, duration_sec, is_warmup

        FROM preset_sets

        WHERE preset_exercise_id = ? AND user_id = ?

        ORDER BY set_number

        """,

        (preset_exercise_id, int(user_id)),

    ).fetchall()

    return [

        {

            "set_number": int(r[0]),

            "reps": int(r[1]),

            "weight": float(r[2]) if r[2] is not None else None,

            "duration_sec": int(r[3]) if r[3] is not None else None,

            "is_warmup": bool(int(r[4] or 0)),

        }

        for r in rows

    ]





def _get_preset_exercises(conn, preset_id: int, *, user_id: int) -> list[dict[str, Any]]:

    rows = conn.execute(

        """

        SELECT id, exercise_name, exercise_order, default_sets, default_reps,

               default_weight, notes, COALESCE(is_bodyweight, 0) AS is_bodyweight

        FROM preset_exercises

        WHERE preset_id = ? AND user_id = ?

        ORDER BY exercise_order, id

        """,

        (preset_id, int(user_id)),

    ).fetchall()

    out: list[dict[str, Any]] = []

    for r in rows:

        pe_id = int(r["id"])

        sets = _fetch_sets_for_exercise(conn, pe_id, user_id=int(user_id))

        out.append(

            {

                "id": pe_id,

                "exercise_name": str(r["exercise_name"]),

                "exercise_order": int(r["exercise_order"] or 0),

                "is_bodyweight": bool(int(r["is_bodyweight"] or 0)),

                "notes": r["notes"] or "",

                "sets": sets,

                # legacy (не использовать в новом коде)

                "default_sets": len(sets) or int(r["default_sets"] or 4),

                "default_reps": r["default_reps"] or "",

                "default_weight": float(r["default_weight"]) if r["default_weight"] is not None else None,

            }

        )

    return out





def _count_exercises_for_preset(conn, preset_id: int) -> int:
    uid = get_current_user_id()

    row = conn.execute(

        "SELECT COUNT(*) FROM preset_exercises WHERE preset_id = ? AND user_id = ?",

        (preset_id, uid),

    ).fetchone()

    return int(row[0]) if row else 0





def _exercise_names_for_preset(conn, preset_id: int) -> list[str]:
    uid = get_current_user_id()

    rows = conn.execute(

        """

        SELECT exercise_name FROM preset_exercises

        WHERE preset_id = ? AND user_id = ?

        ORDER BY exercise_order, id

        """,

        (preset_id, uid),

    ).fetchall()

    return [str(r[0]) for r in rows]





def _count_workouts_for_preset(conn, preset_id: int, preset_name: str) -> int:
    uid = get_current_user_id()
    row = conn.execute(

        """

        SELECT COUNT(*) FROM (

            SELECT 1 FROM strength_workouts

            WHERE (preset_id = ?
               OR (preset_id IS NULL AND workout_title = ?))
              AND user_id = ?

            GROUP BY date, workout_title

        )

        """,

        (preset_id, preset_name, uid),

    ).fetchone()

    return int(row[0]) if row else 0





def list_presets(*, active_only: bool | None = None) -> list[dict[str, Any]]:

    conn = get_db()

    try:

        uid = get_current_user_id()
        clauses: list[str] = ["user_id = ?"]
        params: list[Any] = [uid]

        if active_only is True:

            clauses.append("is_active = 1")

        elif active_only is False:

            clauses.append("is_active = 0")

        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = conn.execute(

            f"""

            SELECT id, name, is_active, sort_order, created_at, updated_at

            FROM workout_presets{where}

            ORDER BY sort_order, name COLLATE NOCASE

            """,
            params,
        ).fetchall()

        out: list[dict[str, Any]] = []

        for row in rows:

            pid = int(row["id"])

            name = str(row["name"])

            wc = _count_workouts_for_preset(conn, pid, name)

            ec = _count_exercises_for_preset(conn, pid)

            names = _exercise_names_for_preset(conn, pid)

            out.append(

                _preset_row_to_dict(

                    row,

                    workout_count=wc,

                    exercise_count=ec,

                    exercise_names=names,

                )

            )

        return out

    finally:

        conn.close()





def list_active_preset_names() -> list[str]:

    conn = get_db()

    try:

        rows = conn.execute(

            """

            SELECT name FROM workout_presets

            WHERE user_id = ? AND is_active = 1

            ORDER BY sort_order, name COLLATE NOCASE

            """,
            (get_current_user_id(),),
        ).fetchall()

        return [str(r[0]) for r in rows]

    finally:

        conn.close()





def get_preset_by_id(preset_id: int) -> dict[str, Any] | None:

    conn = get_db()

    try:

        row = conn.execute(

            """

            SELECT id, name, is_active, sort_order, created_at, updated_at

            FROM workout_presets WHERE id = ? AND user_id = ?

            """,

            (preset_id, get_current_user_id()),

        ).fetchone()

        if not row:

            return None

        name = str(row["name"])

        wc = _count_workouts_for_preset(conn, preset_id, name)

        ec = _count_exercises_for_preset(conn, preset_id)

        data = _preset_row_to_dict(row, workout_count=wc, exercise_count=ec)

        data["exercises"] = _get_preset_exercises(conn, preset_id, user_id=get_current_user_id())

        return data

    finally:

        conn.close()





def get_preset_by_name(name: str) -> dict[str, Any] | None:

    conn = get_db()

    try:

        row = conn.execute(

            """

            SELECT id, name, is_active, sort_order, created_at, updated_at

            FROM workout_presets WHERE name = ? AND user_id = ?

            """,

            (name.strip(), get_current_user_id()),

        ).fetchone()

        if not row:

            return None

        pid = int(row["id"])

        name = str(row["name"])

        wc = _count_workouts_for_preset(conn, pid, name)

        ec = _count_exercises_for_preset(conn, pid)

        data = _preset_row_to_dict(row, workout_count=wc, exercise_count=ec)

        data["exercises"] = _get_preset_exercises(conn, pid, user_id=get_current_user_id())

        return data

    finally:

        conn.close()





def get_preset_id_by_name(name: str) -> int | None:

    conn = get_db()

    try:

        row = conn.execute(
            "SELECT id FROM workout_presets WHERE name = ? AND user_id = ?",
            (name.strip(), get_current_user_id()),
        ).fetchone()

        return int(row[0]) if row else None

    finally:

        conn.close()





def get_preset_exercises_for_name(name: str) -> list[dict[str, Any]]:

    preset = get_preset_by_name(name)

    if preset:

        return preset["exercises"]

    return []





def _save_exercises(conn, preset_id: int, exercises: list[dict[str, Any]]) -> None:
    from datetime import datetime as _dt

    # Регистрируем упражнения в справочнике через уже открытое соединение,
    # чтобы избежать deadlock (второй writer на SQLite без WAL).
    _now_ts = _dt.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    for ex in exercises:
        ex_name = str(ex.get("exercise_name") or ex.get("exercise") or "").strip()
        if ex_name:
            conn.execute(
                "INSERT OR IGNORE INTO all_exercises (name, created_at) VALUES (?, ?)",
                (ex_name, _now_ts),
            )

    uid = get_current_user_id()
    conn.execute(
        "DELETE FROM preset_exercises WHERE preset_id = ? AND user_id = ?",
        (preset_id, uid),
    )

    for idx, ex in enumerate(exercises):

        ex_name = str(ex.get("exercise_name") or ex.get("exercise") or "").strip()

        if not ex_name:

            continue

        sets, is_bw = normalize_exercise_sets_input(ex)

        if not sets:

            sets, is_bw = default_sets_for_new_exercise(ex_name)

        cur = conn.execute(

            """

            INSERT INTO preset_exercises

            (user_id, preset_id, exercise_name, exercise_order, default_sets, default_reps,

             default_weight, notes, is_bodyweight)

            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)

            """,

            (

                uid,
                preset_id,

                ex_name,

                int(ex.get("exercise_order", idx)),

                len(sets),

                "",

                None,

                ex.get("notes") or "",

                1 if is_bw else 0,

            ),

        )

        pe_id = int(cur.lastrowid)

        for s in sets:

            conn.execute(

                """

                INSERT INTO preset_sets

                (user_id, preset_exercise_id, set_number, reps, weight, duration_sec, is_warmup)

                VALUES (?, ?, ?, ?, ?, ?, ?)

                """,

                (

                    uid,
                    pe_id,

                    s["set_number"],

                    s["reps"],

                    s.get("weight"),

                    s.get("duration_sec"),

                    s.get("is_warmup", 0),

                ),

            )





def create_preset(name: str, exercises: list[dict[str, Any]], *, is_active: bool = True) -> dict[str, Any]:

    title = name.strip()

    if not title:

        raise ValueError("Укажите название пресета")

    clean = [

        ex for ex in exercises

        if str(ex.get("exercise_name") or ex.get("exercise") or "").strip()

    ]

    if not clean:

        raise ValueError("Добавьте хотя бы одно упражнение")



    conn = get_db()

    try:

        uid = get_current_user_id()
        existing = conn.execute(
            "SELECT id FROM workout_presets WHERE name = ? AND user_id = ?",
            (title, uid),
        ).fetchone()

        if existing:

            raise ValueError(f"Пресет «{title}» уже существует")



        max_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) FROM workout_presets WHERE user_id = ?",
            (uid,),
        ).fetchone()[0]

        ts = _now()

        cur = conn.execute(

            """

            INSERT INTO workout_presets (user_id, name, is_active, sort_order, created_at, updated_at)

            VALUES (?, ?, ?, ?, ?, ?)

            """,

            (uid, title, 1 if is_active else 0, int(max_order) + 1, ts, ts),

        )

        preset_id = int(cur.lastrowid)

        _save_exercises(conn, preset_id, clean)

        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "workout_presets", "id", preset_id)
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

        uid = get_current_user_id()
        row = conn.execute(
            "SELECT id, name FROM workout_presets WHERE id = ? AND user_id = ?",
            (preset_id, uid),
        ).fetchone()

        if not row:

            raise ValueError("Пресет не найден")



        new_name = name.strip() if name is not None else str(row["name"])

        if not new_name:

            raise ValueError("Укажите название пресета")



        if name is not None and new_name != str(row["name"]):

            dup = conn.execute(

                "SELECT id FROM workout_presets WHERE name = ? AND id != ? AND user_id = ?",

                (new_name, preset_id, uid),

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

        params.append(preset_id)
        params.append(uid)

        conn.execute(

            f"UPDATE workout_presets SET {', '.join(updates)} WHERE id = ? AND user_id = ?",

            params,

        )



        if exercises is not None:

            clean = [

                ex for ex in exercises

                if str(ex.get("exercise_name") or ex.get("exercise") or "").strip()

            ]

            if not clean:

                raise ValueError("Добавьте хотя бы одно упражнение")

            _save_exercises(conn, preset_id, clean)



        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "workout_presets", "id", preset_id)
        conn.commit()

    finally:

        conn.close()



    result = get_preset_by_id(preset_id)

    if not result:

        raise ValueError("Пресет не найден")

    return result





def _exercise_names_to_preset_payload(names: list[str]) -> list[dict[str, Any]]:
    return [
        {"exercise_name": n.strip(), "exercise_order": idx}
        for idx, n in enumerate(names)
        if n and str(n).strip()
    ]


def ensure_preset_for_workout_type(
    name: str,
    exercises: list[str],
    *,
    is_active: bool = True,
    sync_exercises: bool = False,
) -> dict[str, Any]:
    """Создать или обновить workout_presets для типа силовой тренировки."""
    title = name.strip()
    if not title:
        raise ValueError("Укажите название типа тренировки")
    clean_names = [e.strip() for e in exercises if e and str(e).strip()]
    payload = _exercise_names_to_preset_payload(clean_names)

    existing = get_preset_by_name(title)
    if existing:
        preset_id = int(existing["id"])
        if sync_exercises and payload:
            update_preset(preset_id, exercises=payload)
        if is_active and int(existing.get("is_active") or 0) == 0:
            restore_preset(preset_id)
        elif not is_active and int(existing.get("is_active") or 0) == 1:
            archive_preset(preset_id)
        result = get_preset_by_id(preset_id)
        if not result:
            raise RuntimeError("Не удалось обновить пресет")
        return result

    if not payload:
        raise ValueError("Добавьте хотя бы одно упражнение")

    return create_preset(title, payload, is_active=is_active)





def archive_preset(preset_id: int) -> dict[str, Any]:

    conn = get_db()

    try:

        row = conn.execute(

            "SELECT id FROM workout_presets WHERE id = ?", (preset_id,)

        ).fetchone()

        if not row:

            raise ValueError("Пресет не найден")

        conn.execute(

            "UPDATE workout_presets SET is_active = 0, updated_at = ? WHERE id = ?",

            (_now(), preset_id),

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

            "SELECT id FROM workout_presets WHERE id = ?", (preset_id,)

        ).fetchone()

        if not row:

            raise ValueError("Пресет не найден")

        conn.execute(

            "UPDATE workout_presets SET is_active = 1, updated_at = ? WHERE id = ?",

            (_now(), preset_id),

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

            "SELECT id FROM workout_presets WHERE id = ?", (preset_id,)

        ).fetchone()

        if not row:

            raise ValueError("Пресет не найден")

        name_row = conn.execute(

            "SELECT name FROM workout_presets WHERE id = ?", (preset_id,)

        ).fetchone()

        preset_name = str(name_row["name"]) if name_row else ""

        wc = _count_workouts_for_preset(conn, preset_id, preset_name)

        if wc > 0:

            raise ValueError(

                "Нельзя удалить пресет с историей тренировок. Архивируйте его вместо удаления."

            )

        conn.execute("DELETE FROM workout_presets WHERE id = ?", (preset_id,))

        conn.commit()

    finally:

        conn.close()

