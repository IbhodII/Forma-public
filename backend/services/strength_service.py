# -*- coding: utf-8 -*-
"""Силовые тренировки — только SQLite через get_db()."""
from __future__ import annotations

import re
import sqlite3
from datetime import date, timedelta
from typing import Any

import pandas as pd
from fastapi import HTTPException

from backend.database import get_db
from backend.database.user_scope import prepend_user_clause, user_where
from backend.database.db_utils import get_current_user_id
from backend.services._sql_helpers import float_or_none, int_or_none, records_from_df
from utils.helpers import exercise_order_for_session
from utils.date_utils import normalize_date_column
from utils.math_utils import epley_1rm, format_reps

_DEFAULT_REP_TARGET = 8
_SUCCESS_REASON = "Вы успешно выполнили все повторения в прошлый раз"
_INCREMENT_BY_EQUIPMENT: dict[str, float] = {
    "barbell": 2.5,
    "dumbbell": 1.0,
    "unknown": 2.5,
}
# Подстроки в названии упражнения (ё → е при сравнении)
_DUMBBELL_HINTS = ("гантел", "dumbbell")
_BARBELL_HINTS = (
    "штанг",
    "жим леж",
    "жим лёж",
    "присед",
    "станов",
    "выпад",
    "рывок",
    "толчок",
    "шраги",
    "гакк",
    "сгибание ног",
    "разгибание ног",
    "гиперэкстенз",
)


_WORKING_SETS_SQL = "COALESCE(is_warmup, 0) = 0"


def _warmup_clause(include_warmup: bool) -> str:
    """Пустая строка — все подходы; иначе только рабочие."""
    return "" if include_warmup else f" AND {_WORKING_SETS_SQL}"


def _exercise_is_bodyweight(sub: pd.DataFrame) -> bool:
    if "is_bodyweight" in sub.columns and not sub.empty:
        if (sub["is_bodyweight"].fillna(0).astype(int) == 1).any():
            return True
    if "exercise" in sub.columns and not sub.empty:
        name = str(sub.iloc[0]["exercise"]).lower().replace("ё", "е")
        return "планк" in name
    return False


def _display_blocks_for_sets(rows: pd.DataFrame, *, is_warmup: bool) -> list[dict[str, Any]]:
    """Блоки для UI: планка/вес тела — по подходу; иначе группировка по весу."""
    flag = 1 if is_warmup else 0
    subset = rows[rows["is_warmup"].fillna(0).astype(int) == flag].sort_values("set_number")
    if subset.empty:
        return []
    if _exercise_is_bodyweight(subset):
        blocks: list[dict[str, Any]] = []
        for _, row in subset.iterrows():
            dur = row.get("duration_sec")
            if dur is not None and not pd.isna(dur) and int(dur) > 0:
                label = f"{int(dur)} сек"
            else:
                label = format_reps([int(row["reps"])])
            blocks.append(
                {
                    "weight": 0,
                    "reps_str": label,
                    "duration_sec": int(dur) if dur is not None and not pd.isna(dur) else None,
                    "is_bodyweight": True,
                    "is_warmup": is_warmup,
                }
            )
        return blocks
    return _group_sets_by_weight(subset, is_warmup=is_warmup)


def _count_sets_in_reps_str(reps_str: str) -> int:
    """Число подходов в строке вида «7+7+7» или «30 сек»."""
    if not reps_str or "сек" in reps_str:
        return 1
    parts = [p.strip() for p in str(reps_str).split("+") if p.strip()]
    return len(parts) if parts else 1


def _count_actual_sets_from_df(df_rows: pd.DataFrame, workout_title: str) -> int:
    """Подходы как в UI: блоки по весу и «7+7+7» считаются отдельными подходами."""
    if df_rows.empty:
        return 0
    if _session_uses_order_index(df_rows):
        return int(len(df_rows))
    total = 0
    order = exercise_order_for_session(df_rows, workout_title)
    for exercise_name in order:
        sub = df_rows[df_rows["exercise"] == exercise_name]
        if sub.empty:
            continue
        for is_warmup in (True, False):
            for block in _display_blocks_for_sets(sub, is_warmup=is_warmup):
                total += _count_sets_in_reps_str(block["reps_str"])
    return total


def _reps_values_from_display_block(block: dict[str, Any]) -> list[int]:
    reps_str = str(block.get("reps_str") or "")
    if "сек" in reps_str:
        digits = "".join(ch for ch in reps_str if ch.isdigit())
        return [int(digits) if digits else 0]
    if "+" in reps_str:
        return [int(p.strip()) for p in reps_str.split("+") if p.strip()]
    try:
        return [int(reps_str)]
    except ValueError:
        return [0]


def _ordered_sets_expanded_legacy(
    df_rows: pd.DataFrame,
    workout_title: str,
) -> list[dict[str, Any]]:
    """Legacy sessions (без order_index): один элемент на каждый фактический подход."""
    out: list[dict[str, Any]] = []
    order_index = 1
    for exercise_name in exercise_order_for_session(df_rows, workout_title):
        sub = df_rows[df_rows["exercise"] == exercise_name]
        if sub.empty:
            continue
        is_bw = _exercise_is_bodyweight(sub)
        for is_warmup in (True, False):
            for block in _display_blocks_for_sets(sub, is_warmup=is_warmup):
                weight = float(block.get("weight") or 0)
                dur = block.get("duration_sec")
                dur_i = int(dur) if dur is not None else None
                for reps_i in _reps_values_from_display_block(block):
                    if is_bw and dur_i:
                        reps_str = f"{dur_i} сек"
                    elif "+" in str(block.get("reps_str") or ""):
                        reps_str = str(reps_i)
                    else:
                        reps_str = str(block.get("reps_str") or reps_i)
                    out.append(
                        {
                            "order_index": order_index,
                            "set_number": order_index,
                            "exercise": exercise_name,
                            "weight": weight,
                            "reps": reps_i,
                            "reps_str": reps_str,
                            "is_warmup": bool(is_warmup),
                            "is_bodyweight": is_bw,
                            "duration_sec": dur_i,
                        }
                    )
                    order_index += 1
    return out


def ordered_sets_for_hr_analysis(date: str, workout_title: str) -> list[dict[str, Any]]:
    """Плоский порядок подходов для сопоставления с HR-блоками (incl. legacy)."""
    date_str = str(date)[:10]
    title_where, title_params = _session_title_clause(date_str, workout_title)
    conn = get_db()
    try:
        row_where = title_where.replace("sw.", "")
        block_select = _strength_block_select_expr(conn)
        df_rows = pd.read_sql_query(
            f"""
            SELECT id, exercise, weight, reps, set_number, order_index,
                   is_warmup, duration_sec, is_bodyweight, is_circuit,
                   {block_select}
            FROM strength_workouts
            WHERE {row_where}
            ORDER BY id ASC
            """,
            conn,
            params=title_params,
        )
    finally:
        conn.close()
    if df_rows.empty:
        return []
    if _session_uses_order_index(df_rows):
        return _ordered_sets_from_df(df_rows)
    return _ordered_sets_expanded_legacy(df_rows, workout_title)


def _group_sets_by_weight(rows: pd.DataFrame, *, is_warmup: bool) -> list[dict[str, Any]]:
    """Склеивает подряд идущие подходы с одним весом в блоки для UI."""
    flag = 1 if is_warmup else 0
    subset = rows[rows["is_warmup"].fillna(0).astype(int) == flag].sort_values("set_number")
    if subset.empty:
        return []
    blocks: list[dict[str, Any]] = []
    current_weight: float | None = None
    reps: list[int] = []
    for _, row in subset.iterrows():
        w_raw = row["weight"]
        w = float(w_raw) if w_raw is not None and not pd.isna(w_raw) else 0.0
        r = int(row["reps"])
        if current_weight is not None and w != current_weight:
            blocks.append(
                {
                    "weight": current_weight,
                    "reps_str": format_reps(reps),
                    "is_warmup": is_warmup,
                }
            )
            reps = []
        current_weight = w
        reps.append(r)
    if current_weight is not None and reps:
        blocks.append(
            {
                "weight": current_weight,
                "reps_str": format_reps(reps),
                "is_warmup": is_warmup,
            }
        )
    return blocks


def _sessions_where(
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    preset_id: int | None = None,
    preset_name: str | None = None,
) -> tuple[str, list[Any]]:
    """WHERE для фильтрации строк перед GROUP BY date, workout_title."""
    clauses: list[str] = []
    params: list[Any] = []
    clauses, params = prepend_user_clause(clauses, params)
    if date_from:
        clauses.append("date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("date <= ?")
        params.append(str(date_to)[:10])
    if preset_id is not None:
        pid = int(preset_id)
        if preset_name:
            clauses.append(
                "(preset_id = ? OR (preset_id IS NULL AND workout_title = ?))"
            )
            params.extend([pid, preset_name])
        else:
            clauses.append("preset_id = ?")
            params.append(pid)
    if workout_title is not None and str(workout_title).strip() != "":
        title = str(workout_title)
        if title == "Без названия":
            clauses.append("workout_title IS NULL")
        else:
            clauses.append("workout_title = ?")
            params.append(title)
    if not clauses:
        uf, up = user_where()
        return uf, up
    return " WHERE " + " AND ".join(clauses), params


def _count_sessions(conn, where_sql: str = "", where_params: list[Any] | None = None) -> int:
    params = list(where_params or [])
    row = conn.execute(
        f"""
        SELECT COUNT(*) FROM (
            SELECT 1 FROM strength_workouts{where_sql}
            GROUP BY date, workout_title
        )
        """,
        params,
    ).fetchone()
    return int(row[0]) if row else 0


def list_unique_exercises() -> list[str]:
    """Список названий упражнений: shared.strength_exercises + пользовательские."""
    from backend.services import exercise_catalog_service

    return exercise_catalog_service.list_all_exercise_names()


def rename_exercise_globally(old_name: str, new_name: str) -> dict[str, int]:
    """Переименовать упражнение во всех таблицах с историей и шаблонами."""
    old = old_name.strip()
    new = new_name.strip()
    if not old:
        raise ValueError("Укажите текущее название упражнения")
    if not new:
        raise ValueError("Укажите новое название упражнения")
    if old == new:
        raise ValueError("Новое название совпадает с текущим")

    uid = get_current_user_id()
    conn = get_db()
    counts: dict[str, int] = {}
    try:
        updates: list[tuple[str, str, tuple[Any, ...]]] = [
            (
                "strength_workouts",
                "UPDATE strength_workouts SET exercise = ? WHERE exercise = ? AND user_id = ?",
                (new, old, uid),
            ),
            (
                "preset_exercises",
                "UPDATE preset_exercises SET exercise_name = ? WHERE exercise_name = ? AND user_id = ?",
                (new, old, uid),
            ),
            (
                "exercise_set_items",
                """
                UPDATE exercise_set_items SET exercise_name = ?
                WHERE exercise_name = ? AND user_id = ?
                """,
                (new, old, uid),
            ),
            (
                "workout_exercise_template",
                "UPDATE workout_exercise_template SET exercise = ? WHERE exercise = ? AND user_id = ?",
                (new, old, uid),
            ),
        ]
        from backend.services import exercise_catalog_service

        for table, sql, params in updates:
            try:
                cur = conn.execute(sql, params)
                counts[table] = int(cur.rowcount)
            except Exception:
                counts[table] = 0
        counts["all_exercises"] = exercise_catalog_service.rename_in_catalog(old, new)
        conn.commit()
    finally:
        conn.close()

    total = sum(counts.values())
    if total == 0:
        raise ValueError(f"Упражнение «{old}» не найдено в базе")
    counts["total"] = total
    return counts


def get_exercise_progress(
    exercise: str,
    date_from: str | None = None,
    date_to: str | None = None,
    *,
    include_warmup: bool = False,
) -> list[dict[str, Any]]:
    """
    По дате — подход с максимальным весом; max_weight и Epley 1ПМ.
    """
    clauses = ["exercise = ?"]
    params: list[Any] = [exercise]
    clauses, params = prepend_user_clause(clauses, params)
    if date_from:
        clauses.append("date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("date <= ?")
        params.append(str(date_to)[:10])
    where_sql = " AND ".join(clauses)
    warmup_sql = _warmup_clause(include_warmup)

    conn = get_db()
    try:
        df = pd.read_sql_query(
            f"""
            SELECT date, weight, reps
            FROM strength_workouts
            WHERE {where_sql}{warmup_sql}
            ORDER BY date
            """,
            conn,
            params=params,
        )
    finally:
        conn.close()

    if df.empty:
        return []

    df = normalize_date_column(df, "date")
    points: list[dict[str, Any]] = []
    for day, grp in df.groupby("date", sort=True):
        grp = grp.copy()
        grp["weight"] = pd.to_numeric(grp["weight"], errors="coerce")
        grp["reps"] = pd.to_numeric(grp["reps"], errors="coerce")
        one_rms: list[float] = []
        for _, row in grp.iterrows():
            w, r = row["weight"], row["reps"]
            if pd.isna(w) or pd.isna(r) or w <= 0 or r <= 0:
                continue
            one_rms.append(float(epley_1rm(float(w), int(r))))
        if not one_rms:
            continue
        max_1rm = max(one_rms)
        valid_w = grp.loc[grp["weight"] > 0, "weight"]
        max_weight = float(valid_w.max()) if not valid_w.empty else 0.0
        points.append(
            {
                "date": str(day)[:10],
                "max_weight": round(max_weight, 2),
                "max_1rm": round(max_1rm, 1),
                "epley_1rm": round(max_1rm, 1),
            }
        )
    return points


def get_1rm_chart(
    exercise_name: str,
    date_from: str | None = None,
    date_to: str | None = None,
    *,
    include_warmup: bool = False,
) -> list[dict[str, Any]]:
    """
    По каждому дню — максимальный e1RM (колонка epley_1rm или формула Epley).
    """
    name = str(exercise_name).strip()
    if not name:
        raise ValueError("Укажите exercise_name")

    clauses = ["exercise = ?"]
    params: list[Any] = [name]
    clauses, params = prepend_user_clause(clauses, params)
    if date_from:
        clauses.append("date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("date <= ?")
        params.append(str(date_to)[:10])
    where_sql = " AND ".join(clauses)
    warmup_sql = _warmup_clause(include_warmup)

    conn = get_db()
    try:
        df = pd.read_sql_query(
            f"""
            SELECT date, weight, reps, epley_1rm
            FROM strength_workouts
            WHERE {where_sql}{warmup_sql}
            """,
            conn,
            params=params,
        )
    finally:
        conn.close()

    if df.empty:
        return []

    df = normalize_date_column(df, "date")
    if date_from:
        df = df[df["date"] >= str(date_from)[:10]]
    if date_to:
        df = df[df["date"] <= str(date_to)[:10]]
    if df.empty:
        return []

    def _row_e1rm(row: pd.Series) -> float | None:
        stored = row.get("epley_1rm")
        if stored is not None and not pd.isna(stored) and float(stored) > 0:
            return float(stored)
        w, r = row.get("weight"), row.get("reps")
        if w is not None and r is not None and not pd.isna(w) and not pd.isna(r):
            wf, ri = float(w), int(r)
            if wf > 0 and ri > 0:
                return float(epley_1rm(wf, ri))
        return None

    df["_e1rm"] = df.apply(_row_e1rm, axis=1)
    df = df.dropna(subset=["_e1rm"])
    if df.empty:
        return []

    grouped = (
        df.groupby("date", as_index=False)["_e1rm"]
        .max()
        .sort_values("date")
    )
    return [
        {"date": str(row["date"])[:10], "epley_1rm": round(float(row["_e1rm"]), 1)}
        for _, row in grouped.iterrows()
    ]


def get_volume_by_day(
    date_from: str,
    date_to: str,
    *,
    include_warmup: bool = False,
) -> list[dict[str, Any]]:
    """Суммарный объём (weight × reps) по дням."""
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    warmup_sql = _warmup_clause(include_warmup)
    conn = get_db()
    try:
        df = pd.read_sql_query(
            f"""
            SELECT date, weight, reps
            FROM strength_workouts
            WHERE date BETWEEN ? AND ? AND user_id = ?{warmup_sql}
            """,
            conn,
            params=(d_from, d_to, get_current_user_id()),
        )
    finally:
        conn.close()
    if df.empty:
        return []
    df = normalize_date_column(df, "date")
    df["weight"] = pd.to_numeric(df["weight"], errors="coerce").fillna(0)
    df["reps"] = pd.to_numeric(df["reps"], errors="coerce").fillna(0)
    df["volume"] = df["weight"] * df["reps"]
    grouped = df.groupby("date", sort=True)["volume"].sum()
    return [
        {"date": str(day)[:10], "volume_kg": round(float(vol), 1)}
        for day, vol in grouped.items()
        if vol > 0
    ]


def _max_epley_1rm_in_df(grp: pd.DataFrame) -> float | None:
    one_rms: list[float] = []
    for _, row in grp.iterrows():
        w = pd.to_numeric(row.get("weight"), errors="coerce")
        r = pd.to_numeric(row.get("reps"), errors="coerce")
        if pd.isna(w) or pd.isna(r) or w <= 0 or r <= 0:
            continue
        one_rms.append(float(epley_1rm(float(w), int(r))))
    return max(one_rms) if one_rms else None


def get_top_exercises_progress(
    limit: int = 10,
    current_days: int = 7,
    past_days: int = 30,
    active_days: int = 60,
    *,
    include_warmup: bool = False,
) -> list[dict[str, Any]]:
    """
    Топ упражнений по числу подходов за active_days.
    current_1rm — макс. 1ПМ за последние current_days; past_1rm — за past_days до них.
    """
    limit = max(1, min(int(limit), 20))
    current_days = max(1, int(current_days))
    past_days = max(1, int(past_days))
    active_days = max(current_days + past_days, int(active_days))

    today = date.today()
    active_from = (today - timedelta(days=active_days - 1)).isoformat()
    current_from = (today - timedelta(days=current_days - 1)).isoformat()
    past_to = (today - timedelta(days=current_days)).isoformat()
    past_from = (today - timedelta(days=current_days + past_days - 1)).isoformat()
    warmup_sql = _warmup_clause(include_warmup)

    conn = get_db()
    try:
        top = conn.execute(
            f"""
            SELECT exercise, COUNT(*) AS cnt
            FROM strength_workouts
            WHERE date >= ? AND user_id = ?{warmup_sql}
              AND exercise IS NOT NULL AND TRIM(exercise) != ''
            GROUP BY exercise
            ORDER BY cnt DESC
            LIMIT ?
            """,
            (active_from, get_current_user_id(), limit),
        ).fetchall()
        if not top:
            return []
        names = [str(r[0]) for r in top]
        placeholders = ",".join("?" * len(names))
        df = pd.read_sql_query(
            f"""
            SELECT exercise, date, weight, reps
            FROM strength_workouts
            WHERE date >= ? AND user_id = ? AND exercise IN ({placeholders}){warmup_sql}
            """,
            conn,
            params=(past_from, get_current_user_id(), *names),
        )
    finally:
        conn.close()

    if df.empty:
        return []

    df = normalize_date_column(df, "date")
    df["date_str"] = df["date"].astype(str).str[:10]
    out: list[dict[str, Any]] = []

    for ex_row in top:
        exercise = str(ex_row[0])
        sub = df[df["exercise"] == exercise]
        if sub.empty:
            continue

        cur_df = sub[(sub["date_str"] >= current_from)]
        past_df = sub[(sub["date_str"] >= past_from) & (sub["date_str"] <= past_to)]

        current_1rm = _max_epley_1rm_in_df(cur_df)
        past_1rm = _max_epley_1rm_in_df(past_df)

        if current_1rm is None and past_1rm is None:
            continue

        change = None
        change_percent = None
        if current_1rm is not None and past_1rm is not None and past_1rm > 0:
            change = round(current_1rm - past_1rm, 1)
            change_percent = round((change / past_1rm) * 100.0, 1)

        out.append(
            {
                "exercise": exercise,
                "current_1rm": round(current_1rm, 1) if current_1rm is not None else None,
                "past_1rm": round(past_1rm, 1) if past_1rm is not None else None,
                "change": change,
                "change_percent": change_percent,
            }
        )

    out.sort(
        key=lambda r: (
            r["change_percent"] is None,
            -(r["change_percent"] or 0),
        ),
    )
    return out


def get_sessions(
    limit: int,
    offset: int,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    preset_id: int | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Сгруппированные сессии (аналог query_strength_sessions)."""
    preset_name: str | None = None
    if preset_id is not None:
        from backend.services import preset_service

        preset = preset_service.get_preset_by_id(int(preset_id))
        if preset is None:
            raise HTTPException(status_code=404, detail="Пресет не найден")
        preset_name = str(preset["name"])
    where_sql, where_params = _sessions_where(
        date_from,
        date_to,
        workout_title,
        preset_id=preset_id,
        preset_name=preset_name,
    )
    conn = get_db()
    try:
        total = _count_sessions(conn, where_sql, where_params)
        df = pd.read_sql_query(
            f"""
            SELECT date, COALESCE(workout_title, 'Без названия') AS workout_title,
                   MAX(avg_hr) AS avg_hr,
                   MAX(COALESCE(calories_chest, calories_hr)) AS calories_chest,
                   MAX(calories_watch) AS calories_watch,
                   COUNT(*) AS sets_count,
                   ROUND(SUM(COALESCE(weight, 0) * COALESCE(reps, 0)), 1) AS volume_kg
            FROM strength_workouts{where_sql}
            GROUP BY date, workout_title
            ORDER BY date DESC
            LIMIT ? OFFSET ?
            """,
            conn,
            params=(*where_params, limit, offset),
        )
        if df.empty:
            return [], total
        df = normalize_date_column(df, "date")
        page_keys = [
            (str(r["date"])[:10], str(r["workout_title"]))
            for _, r in df.iterrows()
        ]
        key_clauses: list[str] = []
        key_params: list[Any] = []
        for d, t in page_keys:
            key_clauses.append(
                "(date = ? AND COALESCE(workout_title, 'Без названия') = ?)"
            )
            key_params.extend([d, t])
        keys_sql = f" AND ({' OR '.join(key_clauses)})" if key_clauses else ""
        session_rows_df = pd.read_sql_query(
            f"""
            SELECT date, COALESCE(workout_title, 'Без названия') AS workout_title,
                   exercise, weight, reps, set_number,
                   COALESCE(order_index, 0) AS order_index,
                   COALESCE(is_warmup, 0) AS is_warmup,
                   duration_sec, COALESCE(is_bodyweight, 0) AS is_bodyweight
            FROM strength_workouts{where_sql}{keys_sql}
            """,
            conn,
            params=(*where_params, *key_params),
        )
        if not session_rows_df.empty:
            session_rows_df = normalize_date_column(session_rows_df, "date")

        uid = get_current_user_id()
        hr_map: dict[tuple[str, str], dict[str, Any]] = {}
        if page_keys:
            hr_clauses: list[str] = []
            hr_key_params: list[Any] = []
            for d, t in page_keys:
                hr_clauses.append(
                    "(sw.date = ? AND COALESCE(sw.workout_title, 'Без названия') = ?)"
                )
                hr_key_params.extend([d, t])
            hr_rows = conn.execute(
                f"""
                SELECT sw.date,
                       COALESCE(sw.workout_title, 'Без названия') AS workout_title,
                       MIN(sw.id) AS hr_workout_id,
                       ROUND(AVG(h.heart_rate)) AS avg_hr,
                       MAX(h.elapsed_sec) + 1 AS duration_sec
                FROM strength_workouts sw
                INNER JOIN workout_heart_rate h
                  ON h.cardio_workout_id = sw.id
                 AND COALESCE(h.source_type, 'cardio') = ?
                WHERE sw.user_id = ?
                  AND ({' OR '.join(hr_clauses)})
                GROUP BY sw.date, sw.workout_title
                """,
                (HR_SOURCE_STRENGTH, uid, *hr_key_params),
            ).fetchall()
            for row in hr_rows:
                key = (str(row["date"])[:10], str(row["workout_title"]))
                hr_map[key] = {
                    "has_hr": True,
                    "avg_hr": int(row["avg_hr"]) if row["avg_hr"] is not None else None,
                    "duration_sec": int(row["duration_sec"])
                    if row["duration_sec"] is not None
                    else None,
                    "hr_workout_id": int(row["hr_workout_id"]),
                }

        items = []
        for _, r in df.iterrows():
            date_str = str(r["date"])[:10]
            title = str(r["workout_title"])
            sets_count = int(r["sets_count"])
            if not session_rows_df.empty:
                sub = session_rows_df[
                    (session_rows_df["date"].astype(str).str[:10] == date_str)
                    & (session_rows_df["workout_title"].astype(str) == title)
                ]
                if not sub.empty:
                    sets_count = _count_actual_sets_from_df(sub, title)
            avg_hr = int_or_none(r.get("avg_hr"))
            calories_chest = int_or_none(r.get("calories_chest"))
            hr_info = hr_map.get((date_str, title), {})
            has_hr = bool(hr_info.get("has_hr"))
            duration_sec: int | None = hr_info.get("duration_sec")
            if has_hr and not avg_hr and hr_info.get("avg_hr"):
                avg_hr = hr_info["avg_hr"]
            items.append(
                {
                    "date": date_str,
                    "workout_title": title,
                    "avg_hr": avg_hr,
                    "calories_chest": calories_chest,
                    "calories_watch": int_or_none(r.get("calories_watch")),
                    "sets_count": sets_count,
                    "volume_kg": float(r["volume_kg"])
                    if r.get("volume_kg") is not None
                    and not pd.isna(r.get("volume_kg"))
                    else None,
                    "has_hr": has_hr,
                    "duration_sec": duration_sec,
                }
            )
    finally:
        conn.close()
    return items, total


HR_SOURCE_STRENGTH = "strength"


def strength_workout_exists(workout_id: int) -> bool:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT 1 FROM strength_workouts WHERE id = ? AND user_id = ? LIMIT 1",
            (int(workout_id), get_current_user_id()),
        ).fetchone()
    finally:
        conn.close()
    return row is not None


def get_strength_heart_rate_data(workout_id: int) -> list[dict[str, Any]]:
    """Пульс силовой строки (workout_heart_rate, source_type=strength)."""
    from backend.services.cardio_service import get_heart_rate_data

    return get_heart_rate_data(int(workout_id), source_type=HR_SOURCE_STRENGTH)


def _session_hr_workout_id(
    conn: sqlite3.Connection,
    title_where: str,
    title_params: tuple[Any, ...],
) -> int | None:
    """id строки strength_workouts с посекундным пульсом (source_type=strength)."""
    row = conn.execute(
        f"""
        SELECT sw.id
        FROM strength_workouts sw
        WHERE {title_where}
          AND EXISTS (
            SELECT 1 FROM workout_heart_rate h
            WHERE h.cardio_workout_id = sw.id
              AND COALESCE(h.source_type, 'cardio') = ?
            LIMIT 1
          )
        ORDER BY sw.set_number ASC, sw.id ASC
        LIMIT 1
        """,
        (*title_params, HR_SOURCE_STRENGTH),
    ).fetchone()
    return int(row[0]) if row else None


def _session_has_strength_hr(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
) -> bool:
    return resolve_session_hr_workout_id(date_str, workout_title, conn=conn) is not None


def _session_title_clause(
    date_str: str,
    workout_title: str,
) -> tuple[str, tuple[Any, ...]]:
    uid = get_current_user_id()
    title_val = None if workout_title == "Без названия" else workout_title
    if title_val is None:
        return "sw.date = ? AND sw.workout_title IS NULL AND sw.user_id = ?", (date_str, uid)
    return "sw.date = ? AND sw.workout_title = ? AND sw.user_id = ?", (date_str, title_val, uid)


def _session_row_where(date_str: str, workout_title: str) -> tuple[str, tuple[Any, ...]]:
    clause, params = _session_title_clause(date_str, workout_title)
    return clause.replace("sw.", ""), params


def _session_uses_order_index(df_rows: pd.DataFrame) -> bool:
    if df_rows.empty or "order_index" not in df_rows.columns:
        return False
    return bool((df_rows["order_index"].fillna(0).astype(int) > 0).any())


BLOCK_METADATA_COLUMNS = (
    "block_uid",
    "block_type",
    "block_order",
    "block_rounds",
    "block_exercise_order",
    "round_index",
    "block_title",
)


def _strength_block_select_expr(conn: sqlite3.Connection) -> str:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    return ", ".join(
        col if col in cols else f"NULL AS {col}"
        for col in BLOCK_METADATA_COLUMNS
    )


def _has_strength_block_columns(conn: sqlite3.Connection) -> bool:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    return all(col in cols for col in BLOCK_METADATA_COLUMNS)


def _ordered_sets_from_df(df_rows: pd.DataFrame) -> list[dict[str, Any]]:
    """Плоский список подходов в порядке выполнения."""
    sub = df_rows.sort_values(["order_index", "id"], ascending=[True, True])
    out: list[dict[str, Any]] = []
    for _, row in sub.iterrows():
        is_bw = int(row.get("is_bodyweight") or 0) == 1
        is_warmup = int(row.get("is_warmup") or 0) == 1
        dur = row.get("duration_sec")
        dur_i = int(dur) if dur is not None and not pd.isna(dur) else None
        w_raw = row.get("weight")
        weight = float(w_raw) if w_raw is not None and not pd.isna(w_raw) else 0.0
        reps_i = int(row["reps"])
        if is_bw and dur_i:
            reps_str = f"{dur_i} сек"
        else:
            reps_str = format_reps([reps_i])
        item = {
            "order_index": int(row.get("order_index") or 0),
            "set_number": int(row.get("set_number") or 0),
            "exercise": str(row["exercise"]),
            "weight": weight,
            "reps": reps_i,
            "reps_str": reps_str,
            "is_warmup": is_warmup,
            "is_bodyweight": is_bw,
            "duration_sec": dur_i,
        }
        for key in (
            "block_uid",
            "block_type",
            "block_order",
            "block_rounds",
            "block_exercise_order",
            "round_index",
            "block_title",
        ):
            if key in row.index:
                value = row.get(key)
                item[key] = None if value is None or pd.isna(value) else value
        out.append(item)
    return out


def resolve_session_hr_workout_id(
    date: str,
    workout_title: str,
    *,
    conn: sqlite3.Connection | None = None,
) -> int | None:
    """id строки strength_workouts с посекундным пульсом для сессии."""
    date_str = str(date)[:10]
    title_where, title_params = _session_title_clause(date_str, workout_title)
    own = conn is None
    if own:
        conn = get_db()
    try:
        return _session_hr_workout_id(conn, title_where, title_params)
    finally:
        if own:
            conn.close()


def get_session_detail(date: str, workout_title: str) -> dict[str, Any]:
    """
    Детали одной силовой тренировки: упражнения с подходами, пульс, калории.
    workout_title «Без названия» — строки с workout_title IS NULL.
    """
    date_str = str(date)[:10]
    title_val = None if workout_title == "Без названия" else workout_title
    title_where, title_params = _session_title_clause(date_str, workout_title)
    # для SQL без префикса sw.
    row_where = title_where.replace("sw.", "")
    hr_workout_id: int | None = None
    anchor_row_id: int | None = None
    avg_hr: int | None = None
    duration_sec: int | None = None
    metrics = None
    df_rows = pd.DataFrame()
    conn = get_db()
    try:
        cursor = conn.cursor()
        block_select = _strength_block_select_expr(conn)

        cursor.execute(
            f"""
            SELECT MAX(avg_hr) AS avg_hr,
                   MAX(COALESCE(calories_chest, calories_hr)) AS calories_chest,
                   MAX(calories_watch) AS calories_watch
            FROM strength_workouts
            WHERE {row_where}
            """,
            title_params,
        )
        metrics = cursor.fetchone()
        df_rows = pd.read_sql_query(
            f"""
            SELECT id, date, exercise, weight, reps, set_number,
                   COALESCE(order_index, 0) AS order_index,
                   COALESCE(is_warmup, 0) AS is_warmup,
                   COALESCE(is_circuit, 0) AS is_circuit,
                   duration_sec, COALESCE(is_bodyweight, 0) AS is_bodyweight,
                   {block_select}
            FROM strength_workouts
            WHERE {row_where}
            ORDER BY order_index ASC, set_number ASC, id ASC
            """,
            conn,
            params=title_params,
        )
        hr_workout_id = _session_hr_workout_id(conn, title_where, title_params)
        if not df_rows.empty:
            anchor_row_id = int(df_rows.iloc[0]["id"])

        avg_hr = int_or_none(metrics["avg_hr"]) if metrics else None
        duration_sec = None
        if hr_workout_id:
            from backend.services.cardio_service import hr_stats_for_workout

            stats = hr_stats_for_workout(
                conn, hr_workout_id, source_type=HR_SOURCE_STRENGTH
            )
            if not avg_hr and stats["avg_hr"]:
                avg_hr = stats["avg_hr"]
            duration_sec = stats["duration_sec"]
    finally:
        conn.close()

    uses_ordered = _session_uses_order_index(df_rows)
    ordered_sets: list[dict[str, Any]] = (
        _ordered_sets_from_df(df_rows) if uses_ordered else []
    )
    is_circuit = bool(int(df_rows["is_circuit"].max())) if not df_rows.empty else False

    exercises: list[dict[str, Any]] = []
    if not df_rows.empty and not uses_ordered:
        order = exercise_order_for_session(df_rows, workout_title)
        for exercise_name in order:
            sub = df_rows[df_rows["exercise"] == exercise_name].copy()
            if sub.empty:
                continue
            warmup_sets = _display_blocks_for_sets(sub, is_warmup=True)
            working_sets = _display_blocks_for_sets(sub, is_warmup=False)
            is_bw = _exercise_is_bodyweight(sub)
            exercises.append(
                {
                    "exercise": exercise_name,
                    "is_bodyweight": is_bw,
                    "warmup_sets": warmup_sets,
                    "working_sets": working_sets,
                    "weight": float(working_sets[0]["weight"]) if working_sets else (
                        float(warmup_sets[0]["weight"]) if warmup_sets else 0.0
                    ),
                    "reps_str": working_sets[0]["reps_str"] if working_sets else (
                        warmup_sets[0]["reps_str"] if warmup_sets else ""
                    ),
                }
            )

    return {
        "date": date_str,
        "workout_title": workout_title,
        "avg_hr": avg_hr,
        "calories_chest": int_or_none(metrics["calories_chest"]) if metrics else None,
        "calories_watch": int_or_none(metrics["calories_watch"]) if metrics else None,
        "exercises": exercises,
        "ordered_sets": ordered_sets,
        "uses_ordered_sets": uses_ordered,
        "is_circuit": is_circuit,
        "has_hr": hr_workout_id is not None,
        "hr_workout_id": hr_workout_id,
        "anchor_row_id": anchor_row_id,
        "duration_sec": duration_sec,
    }


def _insert_strength_set_row(
    conn: sqlite3.Connection,
    *,
    date_str: str,
    workout_title: str,
    exercise: str,
    weight_val: float | None,
    reps_i: int,
    set_num: int,
    order_index: int,
    notes: str,
    avg_hr: Any,
    calories_chest: Any,
    calories_watch: Any,
    e1rm: float | None,
    preset_id: Any,
    is_warmup: int,
    dur_i: int | None,
    is_bw: int,
    is_circuit: int = 0,
    block_uid: str | None = None,
    block_type: str | None = None,
    block_order: int | None = None,
    block_rounds: int | None = None,
    block_exercise_order: int | None = None,
    round_index: int | None = None,
    block_title: str | None = None,
) -> int | None:
    uid = get_current_user_id()
    if not _has_strength_block_columns(conn):
        cur = conn.execute(
            """
            INSERT INTO strength_workouts (
                date, exercise, weight, reps, set_number, order_index, notes, workout_title,
                avg_hr, calories_chest, calories_watch, epley_1rm, preset_id,
                is_warmup, duration_sec, is_bodyweight, is_circuit, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                date_str,
                exercise,
                weight_val,
                reps_i,
                set_num,
                order_index,
                notes,
                workout_title,
                avg_hr,
                calories_chest,
                calories_watch,
                e1rm,
                preset_id,
                is_warmup,
                dur_i,
                is_bw,
                is_circuit,
                uid,
            ),
        )
        return int(cur.lastrowid) if cur.lastrowid else None
    cur = conn.execute(
        """
        INSERT INTO strength_workouts (
            date, exercise, weight, reps, set_number, order_index, notes, workout_title,
            avg_hr, calories_chest, calories_watch, epley_1rm, preset_id,
            is_warmup, duration_sec, is_bodyweight, is_circuit, user_id,
            block_uid, block_type, block_order, block_rounds, block_exercise_order,
            round_index, block_title
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            date_str,
            exercise,
            weight_val,
            reps_i,
            set_num,
            order_index,
            notes,
            workout_title,
            avg_hr,
            calories_chest,
            calories_watch,
            e1rm,
            preset_id,
            is_warmup,
            dur_i,
            is_bw,
            is_circuit,
            uid,
            block_uid,
            block_type,
            block_order,
            block_rounds,
            block_exercise_order,
            round_index,
            block_title,
        ),
    )
    return int(cur.lastrowid) if cur.lastrowid else None


def _session_strength_row_ids(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
) -> list[int]:
    title_where, title_params = _session_title_clause(date_str, workout_title)
    rows = conn.execute(
        f"SELECT sw.id FROM strength_workouts sw WHERE {title_where} ORDER BY sw.id",
        title_params,
    ).fetchall()
    return [int(row[0]) for row in rows]


def _migrate_strength_hr_to_workout(
    conn: sqlite3.Connection,
    old_workout_ids: list[int],
    new_workout_id: int,
) -> None:
    """Перенос посекундного пульса на новую якорную строку силовой сессии."""
    if not old_workout_ids or not new_workout_id:
        return
    placeholders = ",".join("?" * len(old_workout_ids))
    conn.execute(
        f"""
        UPDATE workout_heart_rate
        SET cardio_workout_id = ?
        WHERE cardio_workout_id IN ({placeholders})
          AND COALESCE(source_type, 'cardio') = ?
        """,
        (int(new_workout_id), *old_workout_ids, HR_SOURCE_STRENGTH),
    )


def _delete_session_rows_only(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
) -> None:
    """Удалить строки сессии без затрагивания workout_heart_rate."""
    row_where, row_params = _session_row_where(date_str, workout_title)
    conn.execute(f"DELETE FROM strength_workouts WHERE {row_where}", row_params)


def create_workout(payload: dict[str, Any]) -> tuple[int, int]:
    """Сохранение силовой тренировки. Возвращает (inserted_sets, anchor_row_id)."""
    from backend.services import exercise_catalog_service, preset_service

    sets_list = payload.get("sets")
    exercises_list = payload.get("exercises") or []
    names = [
        str(item.get("exercise") or "").strip()
        for item in (sets_list or exercises_list)
        if str(item.get("exercise") or "").strip()
    ]
    exercise_catalog_service.ensure_exercises(names)

    date_str = str(payload["date"])[:10]
    workout_title = payload["workout_title"]
    edit_date = str(payload.get("edit_session_date") or date_str)[:10]
    edit_title = (
        payload["edit_session_title"]
        if payload.get("edit_session_title") is not None
        else workout_title
    )
    preset_id = payload.get("preset_id")
    if preset_id is None:
        preset_id = preset_service.get_preset_id_by_name(workout_title)
    avg_hr = payload.get("avg_hr")
    calories_chest = payload.get("calories_chest")
    calories_watch = payload.get("calories_watch")
    is_circuit = 1 if payload.get("is_circuit") else 0
    row_where, row_params = _session_row_where(date_str, workout_title)
    conn = get_db()
    inserted = 0
    first_row_id: int | None = None
    hr_source_ids: list[int] = []
    try:
        edit_where, edit_params = _session_title_clause(edit_date, edit_title)
        if _session_hr_workout_id(conn, edit_where, edit_params) is not None:
            hr_source_ids = _session_strength_row_ids(conn, edit_date, edit_title)
        if sets_list:
            conn.execute(
                f"DELETE FROM strength_workouts WHERE {row_where}",
                row_params,
            )
            exercise_set_nums: dict[str, int] = {}
            for idx, block in enumerate(sets_list):
                exercise = str(block.get("exercise") or "").strip()
                if not exercise:
                    continue
                has_block_metadata = any(
                    block.get(key) is not None
                    for key in (
                        "block_uid",
                        "block_type",
                        "block_order",
                        "block_rounds",
                        "block_exercise_order",
                        "round_index",
                        "block_title",
                    )
                )
                is_bw = 1 if block.get("is_bodyweight") else 0
                is_warmup = 1 if block.get("is_warmup") else 0
                duration_sec = block.get("duration_sec")
                if is_bw:
                    weight_val = None
                    dur_i = int(duration_sec) if duration_sec is not None else None
                    reps_i = int(block.get("reps") or 1)
                else:
                    weight_val = float(block.get("weight") or 0)
                    dur_i = None
                    reps_i = int(block.get("reps") or 0)
                if reps_i <= 0:
                    continue
                if is_circuit:
                    order_index = idx + 1
                    set_num = idx + 1
                elif has_block_metadata:
                    order_index = idx + 1
                    exercise_set_nums[exercise] = exercise_set_nums.get(exercise, 0) + 1
                    set_num = int(block.get("set_number") or exercise_set_nums[exercise])
                else:
                    order_index = 0
                    exercise_set_nums[exercise] = exercise_set_nums.get(exercise, 0) + 1
                    set_num = exercise_set_nums[exercise]
                w_for_e1rm = float(weight_val or 0)
                e1rm = (
                    float(epley_1rm(w_for_e1rm, reps_i))
                    if w_for_e1rm > 0 and reps_i > 0 and not is_warmup and not is_bw
                    else None
                )
                row_id = _insert_strength_set_row(
                    conn,
                    date_str=date_str,
                    workout_title=workout_title,
                    exercise=exercise,
                    weight_val=weight_val,
                    reps_i=reps_i,
                    set_num=set_num,
                    order_index=order_index,
                    notes=str(block.get("notes") or ""),
                    avg_hr=avg_hr,
                    calories_chest=calories_chest,
                    calories_watch=calories_watch,
                    e1rm=e1rm,
                    preset_id=preset_id,
                    is_warmup=is_warmup,
                    dur_i=dur_i,
                    is_bw=is_bw,
                    is_circuit=is_circuit,
                    block_uid=block.get("block_uid") if has_block_metadata else None,
                    block_type=block.get("block_type") if has_block_metadata else None,
                    block_order=block.get("block_order") if has_block_metadata else None,
                    block_rounds=block.get("block_rounds") if has_block_metadata else None,
                    block_exercise_order=block.get("block_exercise_order") if has_block_metadata else None,
                    round_index=block.get("round_index") if has_block_metadata else None,
                    block_title=block.get("block_title") if has_block_metadata else None,
                )
                if first_row_id is None and row_id:
                    first_row_id = row_id
                inserted += 1
        else:
            from collections import OrderedDict

            grouped: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
            for item in exercises_list:
                exercise = item["exercise"]
                grouped.setdefault(exercise, []).append(item)

            for exercise, blocks in grouped.items():
                conn.execute(
                    """
                    DELETE FROM strength_workouts
                    WHERE date = ? AND workout_title = ? AND exercise = ?
                    """,
                    (date_str, workout_title, exercise),
                )
                ordered_blocks = sorted(
                    enumerate(blocks),
                    key=lambda pair: (0 if pair[1].get("is_warmup") else 1, pair[0]),
                )
                set_num = 1
                for _, block in ordered_blocks:
                    is_bw = 1 if block.get("is_bodyweight") else 0
                    is_warmup = 1 if block.get("is_warmup") else 0
                    duration_sec = block.get("duration_sec")
                    if is_bw:
                        weight_val = None
                        dur_i = int(duration_sec) if duration_sec is not None else None
                    else:
                        weight_val = float(block.get("weight") or 0)
                        dur_i = None
                    for reps in block.get("reps_list") or []:
                        reps_i = int(reps)
                        w_for_e1rm = float(weight_val or 0)
                        e1rm = (
                            float(epley_1rm(w_for_e1rm, reps_i))
                            if w_for_e1rm > 0 and reps_i > 0 and not is_warmup and not is_bw
                            else None
                        )
                        row_id = _insert_strength_set_row(
                            conn,
                            date_str=date_str,
                            workout_title=workout_title,
                            exercise=exercise,
                            weight_val=weight_val,
                            reps_i=reps_i,
                            set_num=set_num,
                            order_index=0,
                            notes=block.get("notes") or "",
                            avg_hr=avg_hr,
                            calories_chest=calories_chest,
                            calories_watch=calories_watch,
                            e1rm=e1rm,
                            preset_id=preset_id,
                            is_warmup=is_warmup,
                            dur_i=dur_i,
                            is_bw=is_bw,
                            is_circuit=0,
                        )
                        if first_row_id is None and row_id:
                            first_row_id = row_id
                        inserted += 1
                        set_num += 1
        if hr_source_ids and first_row_id:
            _migrate_strength_hr_to_workout(conn, hr_source_ids, first_row_id)
        if (edit_date, edit_title) != (date_str, workout_title):
            _delete_session_rows_only(conn, edit_date, edit_title)
        from backend.services.forma_sync.change_tracker import touch_strength_session

        touch_strength_session(conn, date_str, workout_title)
        conn.commit()
    finally:
        conn.close()
    if first_row_id is None:
        conn2 = get_db()
        try:
            row = conn2.execute(
                """
                SELECT id FROM strength_workouts
                WHERE date = ? AND workout_title = ?
                ORDER BY set_number ASC, id ASC
                LIMIT 1
                """,
                (date_str, workout_title),
            ).fetchone()
            if row:
                first_row_id = int(row[0])
        finally:
            conn2.close()
    return inserted, int(first_row_id or 0)


def _parse_target_reps(raw: str | None) -> list[int]:
    if not raw or not str(raw).strip():
        return []
    result: list[int] = []
    for part in re.split(r"[,+;\s]+", str(raw).strip()):
        part = part.strip()
        if not part:
            continue
        try:
            n = int(float(part))
            if n > 0:
                result.append(n)
        except ValueError:
            continue
    return result


def _expand_target_reps(targets: list[int], n_sets: int) -> list[int]:
    if not targets or n_sets <= 0:
        return []
    if len(targets) == 1:
        return [targets[0]] * n_sets
    if len(targets) < n_sets:
        return targets + [targets[-1]] * (n_sets - len(targets))
    return targets[:n_sets]


def _normalize_exercise_name(name: str) -> str:
    return name.strip().lower().replace("ё", "е")


def detect_equipment_type(exercise_name: str) -> str:
    """
    barbell — штанга (шаг +2.5 кг);
    dumbbell — гантели (+1 кг на гантель в подсказке);
    unknown — по умолчанию +2.5 кг.
    """
    lower = _normalize_exercise_name(exercise_name)
    if not lower:
        return "unknown"
    if any(hint in lower for hint in _DUMBBELL_HINTS):
        return "dumbbell"
    if any(hint.replace("ё", "е") in lower for hint in _BARBELL_HINTS):
        return "barbell"
    return "unknown"


def suggested_increment_for_exercise(exercise_name: str) -> tuple[float, str]:
    """(кг, equipment_type)."""
    equipment = detect_equipment_type(exercise_name)
    return _INCREMENT_BY_EQUIPMENT[equipment], equipment


def _preset_target_values(workout_title: str | None, exercise_name: str) -> list[int]:
    """Целевые повторы или секунды (для is_bodyweight) из preset_sets."""
    if not workout_title:
        return []
    from backend.services import preset_service

    for ex in preset_service.get_preset_exercises_for_name(workout_title):
        if str(ex.get("exercise_name", "")).strip().lower() != exercise_name.strip().lower():
            continue
        working = [s for s in (ex.get("sets") or []) if not s.get("is_warmup")]
        if not working:
            break
        if ex.get("is_bodyweight"):
            return [
                int(s.get("duration_sec") or s.get("reps") or 0)
                for s in working
                if int(s.get("duration_sec") or s.get("reps") or 0) > 0
            ]
        return [int(s["reps"]) for s in working if int(s.get("reps") or 0) > 0]
    return []


def _working_values_for_session(
    conn: Any,
    exercise_name: str,
    session_date: str,
    session_title: str | None,
) -> tuple[list[int], bool]:
    """Фактические повторы или секунды (bodyweight) по рабочим подходам."""
    if session_title is None:
        where = "exercise = ? AND date = ? AND workout_title IS NULL AND COALESCE(is_warmup, 0) = 0"
        params: tuple[Any, ...] = (exercise_name, session_date)
    else:
        where = "exercise = ? AND date = ? AND workout_title = ? AND COALESCE(is_warmup, 0) = 0"
        params = (exercise_name, session_date, session_title)
    rows = conn.execute(
        f"""
        SELECT reps, duration_sec, COALESCE(is_bodyweight, 0) AS is_bodyweight
        FROM strength_workouts
        WHERE {where}
        ORDER BY set_number
        """,
        params,
    ).fetchall()
    if not rows:
        return [], False
    is_bw = any(int(r[2] or 0) for r in rows)
    values: list[int] = []
    for row in rows:
        try:
            if is_bw and row[1] is not None:
                n = int(row[1])
            else:
                n = int(row[0])
        except (TypeError, ValueError):
            return [], is_bw
        if n <= 0:
            return [], is_bw
        values.append(n)
    return values, is_bw


def _last_session_row(
    conn: Any,
    exercise_name: str,
    workout_title: str | None,
) -> tuple[str, str | None] | None:
    if workout_title:
        row = conn.execute(
            """
            SELECT date, workout_title FROM strength_workouts
            WHERE exercise = ? AND workout_title = ? AND COALESCE(is_warmup, 0) = 0
            ORDER BY date DESC
            LIMIT 1
            """,
            (exercise_name, workout_title),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT date, workout_title FROM strength_workouts
            WHERE exercise = ? AND COALESCE(is_warmup, 0) = 0
            ORDER BY date DESC
            LIMIT 1
            """,
            (exercise_name,),
        ).fetchone()
    if not row:
        return None
    return str(row[0])[:10], row[1] if row[1] is not None else None


def get_next_workout_suggestion(
    exercise_name: str,
    workout_title: str | None = None,
) -> dict[str, Any]:
    """
    Подсказка увеличить вес после успешной последней сессии.
    Цель по повторам: default_reps из пресета или 8 на подход.
    Шаг: 2.5 кг (штанга), 1.0 кг на гантель, иначе 2.5 кг.
    """
    name = exercise_name.strip()
    if not name:
        return {"should_increase": False}

    title_filter = workout_title.strip() if workout_title else None
    conn = get_db()
    try:
        last = _last_session_row(conn, name, title_filter)
        if not last:
            return {"should_increase": False}

        last_date, last_title = last
        actual, session_bw = _working_values_for_session(conn, name, last_date, last_title)
        if not actual:
            return {"should_increase": False}

        preset_title = title_filter or (str(last_title) if last_title else None)
        targets = _preset_target_values(preset_title, name)
        if targets:
            target_list = _expand_target_reps(targets, len(actual))
        else:
            target_list = [_DEFAULT_REP_TARGET] * len(actual)
        if session_bw and not targets:
            target_list = actual.copy()

        if len(target_list) != len(actual):
            return {"should_increase": False}

        if not all(a >= t for a, t in zip(actual, target_list)):
            return {"should_increase": False}

        inc, equipment_type = suggested_increment_for_exercise(name)
        return {
            "should_increase": True,
            "suggested_increment": inc,
            "reason": _SUCCESS_REASON,
            "equipment_type": equipment_type,
        }
    finally:
        conn.close()


def delete_session(workout_date: str, workout_title: str) -> bool:
    """Удаление сессии. Возвращает False, если строк не было."""
    date_str = str(workout_date)[:10]
    title_val = None if workout_title == "Без названия" else workout_title
    conn = get_db()
    try:
        hr_info = {row[1] for row in conn.execute("PRAGMA table_info(workout_heart_rate)")}
        has_source = "source_type" in hr_info
        if title_val is None:
            if has_source:
                conn.execute(
                    """
                    DELETE FROM workout_heart_rate
                    WHERE COALESCE(source_type, 'cardio') = 'strength'
                      AND cardio_workout_id IN (
                        SELECT id FROM strength_workouts
                        WHERE date = ? AND workout_title IS NULL
                      )
                    """,
                    (date_str,),
                )
            cur = conn.execute(
                "DELETE FROM strength_workouts WHERE date = ? AND workout_title IS NULL",
                (date_str,),
            )
        else:
            if has_source:
                conn.execute(
                    """
                    DELETE FROM workout_heart_rate
                    WHERE COALESCE(source_type, 'cardio') = 'strength'
                      AND cardio_workout_id IN (
                        SELECT id FROM strength_workouts
                        WHERE date = ? AND workout_title = ?
                      )
                    """,
                    (date_str, title_val),
                )
            cur = conn.execute(
                "DELETE FROM strength_workouts WHERE date = ? AND workout_title = ?",
                (date_str, title_val),
            )
        conn.commit()
        deleted = cur.rowcount > 0
    finally:
        conn.close()
    return deleted
