# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from datetime import date

import pandas as pd

from database.db_utils import DB_PATH, get_exercises_for_workout_on_date
from utils.constants import CARDIO_ARCHIVE_TYPE, CARDIO_TYPES
from utils.math_utils import format_reps

def ordered_exercises(workout_title: str, on_date: str | None = None) -> list[str]:
    d = on_date or date.today().isoformat()
    return get_exercises_for_workout_on_date(workout_title, d)


def _col_chest(row_or_df) -> int | None:
    """Калории с нагрудного пульсометра из строки/Series."""
    for name in ("calories_chest", "calories_hr"):
        if name in row_or_df.index if hasattr(row_or_df, "index") else name in row_or_df:
            v = row_or_df.get(name) if hasattr(row_or_df, "get") else row_or_df[name]
            if v is not None and pd.notna(v):
                return int(v)
    if "calories" in (row_or_df.index if hasattr(row_or_df, "index") else row_or_df):
        v = row_or_df.get("calories") if hasattr(row_or_df, "get") else row_or_df["calories"]
        if v is not None and pd.notna(v):
            return int(v)
    return None


def _col_watch(row_or_df) -> int | None:
    if "calories_watch" not in (row_or_df.index if hasattr(row_or_df, "index") else row_or_df):
        return None
    v = row_or_df.get("calories_watch") if hasattr(row_or_df, "get") else row_or_df["calories_watch"]
    return int(v) if v is not None and pd.notna(v) else None


def get_session_metrics(df_session: pd.DataFrame) -> dict:
    def first(col):
        if col not in df_session.columns:
            return None
        for v in df_session[col]:
            if pd.notna(v) and v != "":
                return v
        return None

    return {
        "avg_hr": first("avg_hr"),
        "calories_chest": first("calories_chest") or first("calories_hr"),
        "calories_watch": first("calories_watch"),
    }

def cardio_display_name(db_type: str) -> str:
    for label, db_val in CARDIO_TYPES.items():
        if db_val == db_type:
            return label
    return "Бег (архив)" if db_type == CARDIO_ARCHIVE_TYPE else str(db_type)

def exercise_order_for_session(df_session: pd.DataFrame, workout_title: str) -> list[str]:
    """Порядок как в Excel: по первому появлению строки (id), затем шаблон набора."""
    if df_session.empty:
        return []
    session_date = (
        str(df_session.iloc[0]["date"])[:10]
        if "date" in df_session.columns
        else date.today().isoformat()
    )
    present_order: list[str] = []
    seen: set[str] = set()
    if "id" in df_session.columns:
        for ex in df_session.sort_values("id")["exercise"]:
            if pd.isna(ex):
                continue
            name = str(ex)
            if name not in seen:
                seen.add(name)
                present_order.append(name)
    else:
        for ex in df_session["exercise"].dropna().tolist():
            name = str(ex)
            if name not in seen:
                seen.add(name)
                present_order.append(name)

    template = get_exercises_for_workout_on_date(workout_title, session_date)
    ordered = list(present_order)
    for ex in template:
        if ex not in ordered:
            ordered.append(ex)
    return ordered


def get_last_exercise_stats(exercise: str, workout_title: str) -> tuple:
    conn = sqlite3.connect(DB_PATH)
    d = pd.read_sql_query(
        """
        SELECT date FROM strength_workouts
        WHERE exercise=? AND workout_title=? AND COALESCE(is_warmup, 0) = 0
        ORDER BY date DESC LIMIT 1
        """,
        conn,
        params=(exercise, workout_title),
    )
    if d.empty:
        conn.close()
        return None, None, None
    last_date = d.iloc[0]["date"]
    sets_df = pd.read_sql_query(
        """
        SELECT weight, reps FROM strength_workouts
        WHERE exercise=? AND workout_title=? AND date=? AND COALESCE(is_warmup, 0) = 0
        ORDER BY set_number
        """,
        conn,
        params=(exercise, workout_title, last_date),
    )
    conn.close()
    if sets_df.empty:
        return None, None, None
    reps_str = format_reps(sets_df["reps"].tolist())
    return sets_df.iloc[0]["weight"], reps_str if reps_str != "—" else None, last_date


def get_last_warmup_sets(
    exercise: str,
    workout_title: str,
    on_date: str | None = None,
) -> list[dict[str, float | str]]:
    """Разминочные подходы упражнения с указанной даты или последней разминки."""
    conn = sqlite3.connect(DB_PATH)
    if on_date:
        last_date = str(on_date)[:10]
    else:
        d = pd.read_sql_query(
            """
            SELECT date FROM strength_workouts
            WHERE exercise=? AND workout_title=? AND COALESCE(is_warmup, 0) = 1
            ORDER BY date DESC LIMIT 1
            """,
            conn,
            params=(exercise, workout_title),
        )
        if d.empty:
            conn.close()
            return []
        last_date = d.iloc[0]["date"]
    sets_df = pd.read_sql_query(
        """
        SELECT weight, reps FROM strength_workouts
        WHERE exercise=? AND workout_title=? AND date=? AND COALESCE(is_warmup, 0) = 1
        ORDER BY set_number
        """,
        conn,
        params=(exercise, workout_title, last_date),
    )
    conn.close()
    if sets_df.empty:
        return []
    return _group_weight_reps_blocks(sets_df)


def _group_weight_reps_blocks(df: pd.DataFrame) -> list[dict[str, float | str]]:
    blocks: list[dict[str, float | str]] = []
    current_weight: float | None = None
    reps: list[int] = []
    for _, row in df.iterrows():
        w = float(row["weight"])
        r = int(row["reps"])
        if current_weight is not None and w != current_weight:
            blocks.append(
                {
                    "weight": current_weight,
                    "reps_str": format_reps(reps) if format_reps(reps) != "—" else str(reps[0]),
                }
            )
            reps = []
        current_weight = w
        reps.append(r)
    if current_weight is not None and reps:
        blocks.append(
            {
                "weight": current_weight,
                "reps_str": format_reps(reps) if format_reps(reps) != "—" else str(reps[0]),
            }
        )
    return blocks


def get_last_strength_session_metrics(workout_title: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    d = pd.read_sql_query(
        "SELECT date FROM strength_workouts WHERE workout_title=? ORDER BY date DESC LIMIT 1",
        conn, params=(workout_title,),
    )
    if d.empty:
        conn.close()
        return None
    session = pd.read_sql_query(
        "SELECT * FROM strength_workouts WHERE workout_title=? AND date=?",
        conn, params=(workout_title, d.iloc[0]["date"]),
    )
    conn.close()
    return get_session_metrics(session)


def get_last_cardio_stats(cardio_type_db: str) -> dict | None:
    conn = sqlite3.connect(DB_PATH)
    df = pd.read_sql_query(
        "SELECT * FROM cardio_workouts WHERE type=? ORDER BY date DESC LIMIT 1",
        conn, params=(cardio_type_db,),
    )
    conn.close()
    if df.empty:
        return None
    row = df.iloc[0]
    mins, secs = divmod(int(row["duration_sec"] or 0), 60)
    m = get_session_metrics(row.to_frame().T)
    return {
        "date": row["date"], "distance_km": float(row["distance_km"] or 0),
        "duration_min": mins, "duration_sec": secs,
        "avg_hr": int(row["avg_hr"]) if pd.notna(row["avg_hr"]) else 0,
        "max_hr": int(row["max_hr"]) if pd.notna(row["max_hr"]) else 0,
        "calories_chest": int(m["calories_chest"]) if m.get("calories_chest") is not None else 0,
        "calories_watch": int(m["calories_watch"]) if m.get("calories_watch") is not None else 0,
        "swolf": int(row["swolf"]) if pd.notna(row.get("swolf")) else 0,
    }
