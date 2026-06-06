# -*- coding: utf-8 -*-
"""Diagnostics: strength_workouts in DB vs what Workouts UI can list."""
from __future__ import annotations

import logging
from datetime import date, timedelta
from typing import Any

from backend.database.db_utils import database_paths
from backend.database.request_context import get_request_user_id, set_current_user_id

logger = logging.getLogger("workout_visibility")


def workouts_page_default_date_range() -> tuple[str, str]:
    """Match frontend WorkoutsPage default period '3m' (approximate)."""
    today = date.today()
    to_str = today.isoformat()
    from_d = today - timedelta(days=92)
    return from_d.isoformat(), to_str


def _table_has_column(conn, table: str, column: str) -> bool:
    rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    return any(str(r[1]) == column for r in rows)


def _count_raw(conn, sql: str, params: tuple[Any, ...] = ()) -> int:
    row = conn.execute(sql, params).fetchone()
    return int(row[0]) if row else 0


def _count_sessions_for_user(
    conn,
    user_id: int,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
) -> int:
    from backend.services.strength_service import _count_sessions, _sessions_where

    prev = get_request_user_id()
    set_current_user_id(user_id)
    try:
        where_sql, where_params = _sessions_where(date_from, date_to, workout_title)
        return _count_sessions(conn, where_sql, where_params)
    finally:
        if prev is None:
            from backend.database.request_context import clear_current_user_id

            clear_current_user_id()
        else:
            set_current_user_id(prev)


def _get_sessions_total_for_user(
    user_id: int,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
) -> int:
    from backend.services import strength_service

    prev = get_request_user_id()
    set_current_user_id(user_id)
    try:
        _items, total = strength_service.get_sessions(
            1,
            0,
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
        )
        return int(total)
    finally:
        if prev is None:
            from backend.database.request_context import clear_current_user_id

            clear_current_user_id()
        else:
            set_current_user_id(prev)


def _active_preset_names(conn, user_id: int) -> list[str]:
    if not _table_has_column(conn, "workout_presets", "user_id"):
        rows = conn.execute(
            "SELECT name FROM workout_presets WHERE is_active = 1 ORDER BY name"
        ).fetchall()
    else:
        rows = conn.execute(
            "SELECT name FROM workout_presets WHERE is_active = 1 AND user_id = ? ORDER BY name",
            (int(user_id),),
        ).fetchall()
    return [str(r[0]) for r in rows if r[0]]


def _infer_likely_causes(
    report: dict[str, Any],
    *,
    date_from: str | None,
    date_to: str | None,
    workout_title: str | None,
) -> list[str]:
    causes: list[str] = []
    uid = int(report["current_user_id"])
    raw_sessions = int(report.get("sessions_for_current_user") or 0)
    ui_sessions = int(report.get("ui_visible_sessions") or 0)
    ui_all = int(report.get("ui_visible_sessions_all_time") or 0)

    other_ids = [i for i in report.get("import_detected_user_ids") or [] if int(i) != uid]
    if other_ids and int(report.get("rows_for_current_user") or 0) == 0:
        causes.append(
            f"user_id: в базе есть записи с user_id {other_ids}, у профиля {uid} — 0 строк"
        )

    if raw_sessions > 0 and ui_sessions == 0 and ui_all > 0:
        causes.append(
            f"фильтр периода: за {date_from} — {date_to} сессий нет, "
            f"за всё время — {ui_all}"
        )
    elif raw_sessions > 0 and ui_sessions == 0 and ui_all == 0:
        if workout_title:
            causes.append(
                f"фильтр вкладки: workout_title={workout_title!r} не совпадает с данными"
            )
        else:
            causes.append("данные есть, но get_sessions возвращает 0 — проверьте user_id и даты")

    min_d = report.get("min_date")
    max_d = report.get("max_date")
    if raw_sessions > 0 and date_from and max_d and str(max_d) < str(date_from):
        causes.append(
            f"все даты тренировок до начала периода (max={max_d}, период с {date_from})"
        )
    if raw_sessions > 0 and date_to and min_d and str(min_d) > str(date_to):
        causes.append(
            f"все даты тренировок после конца периода (min={min_d}, период по {date_to})"
        )

    titles = report.get("distinct_workout_titles") or []
    active = set(report.get("active_preset_names") or [])
    if workout_title and raw_sessions > 0 and ui_sessions == 0:
        if workout_title not in titles and titles:
            causes.append(
                f"вкладка «{workout_title}»: в базе другие названия, например {titles[:3]}"
            )
    elif raw_sessions > 0 and ui_sessions == 0 and active and titles:
        overlap = [t for t in titles if t in active]
        if not overlap:
            causes.append(
                "ни одно workout_title из базы не совпадает с активными пресетами (вкладками)"
            )

    return causes


def build_workout_visibility_report(
    user_id: int,
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    include_ui_scenarios: bool = True,
) -> dict[str, Any]:
    """
    Snapshot for post-import diagnostics. Uses same queries as strength list API.
    """
    uid = int(user_id)
    df_default, dt_default = workouts_page_default_date_range()
    if date_from is None:
        date_from = df_default
    if date_to is None:
        date_to = dt_default

    from database.connection import open_db

    paths = database_paths()
    prev = get_request_user_id()
    set_current_user_id(uid)
    conn = open_db(attach=True)
    try:
        user_ids = [
            int(r[0])
            for r in conn.execute(
                "SELECT DISTINCT user_id FROM strength_workouts WHERE user_id IS NOT NULL ORDER BY user_id"
            ).fetchall()
        ]

        raw_rows = _count_raw(conn, "SELECT COUNT(*) FROM strength_workouts")
        raw_sessions = _count_raw(
            conn,
            """
            SELECT COUNT(*) FROM (
                SELECT 1 FROM strength_workouts
                GROUP BY date, COALESCE(workout_title, 'Без названия')
            )
            """,
        )
        rows_for_user = _count_raw(
            conn,
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ?",
            (uid,),
        )
        sessions_for_user = _count_sessions_for_user(conn, uid)
        rows_with_exercise = _count_raw(
            conn,
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ? AND exercise IS NOT NULL AND TRIM(exercise) != ''",
            (uid,),
        )
        rows_with_set = _count_raw(
            conn,
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ? AND set_number IS NOT NULL",
            (uid,),
        )
        min_max = conn.execute(
            "SELECT MIN(date), MAX(date) FROM strength_workouts WHERE user_id = ?",
            (uid,),
        ).fetchone()
        min_date = str(min_max[0])[:10] if min_max and min_max[0] else None
        max_date = str(min_max[1])[:10] if min_max and min_max[1] else None

        title_rows = conn.execute(
            """
            SELECT DISTINCT COALESCE(workout_title, 'Без названия') AS t
            FROM strength_workouts WHERE user_id = ?
            ORDER BY t
            LIMIT 50
            """,
            (uid,),
        ).fetchall()
        distinct_titles = [str(r[0]) for r in title_rows]
        active_names = _active_preset_names(conn, uid)
        matching = [t for t in distinct_titles if t in set(active_names)]

        applied = {
            "date_from": date_from,
            "date_to": date_to,
            "workout_title": workout_title,
        }

        ui_visible = _get_sessions_total_for_user(
            uid,
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
        )
        ui_all_time = _get_sessions_total_for_user(uid)

        scenarios: dict[str, Any] = {}
        if include_ui_scenarios:
            df, dt = workouts_page_default_date_range()
            scenarios["workouts_page_default_3m"] = {
                "date_from": df,
                "date_to": dt,
                "workout_title": None,
                "visible_sessions": _get_sessions_total_for_user(
                    uid, date_from=df, date_to=dt
                ),
            }
            if active_names:
                first_tab = active_names[0]
                scenarios["first_active_preset_tab"] = {
                    "workout_title": first_tab,
                    "date_from": df,
                    "date_to": dt,
                    "visible_sessions": _get_sessions_total_for_user(
                        uid,
                        date_from=df,
                        date_to=dt,
                        workout_title=first_tab,
                    ),
                }
            scenarios["all_time_no_title_filter"] = {
                "visible_sessions": ui_all_time,
            }

        report: dict[str, Any] = {
            "database_paths": paths,
            "current_user_id": uid,
            "import_detected_user_ids": user_ids,
            "raw_rows": raw_rows,
            "raw_sessions": raw_sessions,
            "rows_for_current_user": rows_for_user,
            "sessions_for_current_user": sessions_for_user,
            "ui_visible_sessions": ui_visible,
            "ui_visible_sessions_all_time": ui_all_time,
            "min_date": min_date,
            "max_date": max_date,
            "rows_with_exercise": rows_with_exercise,
            "rows_with_set_number": rows_with_set,
            "distinct_workout_titles": distinct_titles,
            "titles_matching_active_presets": matching,
            "active_preset_names": active_names,
            "sample_titles": distinct_titles[:5],
            "applied_filters": applied,
            "ui_scenarios": scenarios,
        }
        report["likely_causes"] = _infer_likely_causes(
            report,
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
        )
        logger.info(
            "workout_visibility user_id=%s rows=%s sessions_user=%s ui_visible=%s causes=%s",
            uid,
            rows_for_user,
            sessions_for_user,
            ui_visible,
            report["likely_causes"],
        )
        return report
    finally:
        conn.close()
        if prev is None:
            from backend.database.request_context import clear_current_user_id

            clear_current_user_id()
        else:
            set_current_user_id(prev)


def attach_workout_visibility_to_report(
    report: dict[str, Any],
    user_id: int,
) -> dict[str, Any]:
    """Add workout_visibility block to import/warmup report dict."""
    report = dict(report)
    report["workout_visibility"] = build_workout_visibility_report(user_id)
    return report
