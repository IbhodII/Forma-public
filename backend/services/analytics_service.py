# -*- coding: utf-8 -*-
"""Аналитика — только SQLite через get_db()."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pandas as pd

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import cardio_service, food_service
from backend.services.food_service import week_dates_from_anchor


def get_calories_by_day(date_from: str, date_to: str) -> list[dict[str, Any]]:
    """Калории по дням (аналог query_daily_calories)."""
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    conn = get_db()
    try:
        uid = get_current_user_id()
        strength = pd.read_sql_query(
            """
            SELECT date, SUM(kcal) AS strength_kcal FROM (
                SELECT date, workout_title,
                       MAX(COALESCE(calories_chest, calories_hr, 0)) AS kcal
                FROM strength_workouts
                WHERE date BETWEEN ? AND ? AND user_id = ?
                GROUP BY date, workout_title
            ) GROUP BY date
            """,
            conn,
            params=(d_from, d_to, uid),
        )
        cardio = pd.read_sql_query(
            """
            SELECT date, SUM(COALESCE(calories_chest, calories_hr, calories, 0)) AS cardio_kcal
            FROM cardio_workouts
            WHERE date BETWEEN ? AND ? AND user_id = ?
            GROUP BY date
            """,
            conn,
            params=(d_from, d_to, uid),
        )
    finally:
        conn.close()

    all_dates = pd.DataFrame(
        {"date": pd.date_range(d_from, d_to, freq="D").strftime("%Y-%m-%d")}
    )
    out = all_dates.merge(strength, on="date", how="left").merge(cardio, on="date", how="left")
    out["strength_kcal"] = out["strength_kcal"].fillna(0)
    out["cardio_kcal"] = out["cardio_kcal"].fillna(0)
    out["total_kcal"] = out["strength_kcal"] + out["cardio_kcal"]

    items: list[dict[str, Any]] = []
    for _, r in out.iterrows():
        items.append(
            {
                "date": str(r["date"])[:10],
                "strength_kcal": float(r["strength_kcal"]),
                "cardio_kcal": float(r["cardio_kcal"]),
                "total_kcal": float(r["total_kcal"]),
            }
        )
    return items


def get_workout_expenditure(date_from: str, date_to: str) -> list[dict[str, Any]]:
    """
    Суммы calories_watch / calories_chest / calories_hr по дням
    (cardio_workouts + strength_workouts; сила — MAX на тренировку, затем SUM по дню).
    """
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    acc: dict[str, dict[str, int]] = {}

    def _add(day: str, watch: float, chest: float, hr: float) -> None:
        d = str(day)[:10]
        if d not in acc:
            acc[d] = {"calories_watch_sum": 0, "calories_chest_sum": 0, "calories_hr_sum": 0}
        acc[d]["calories_watch_sum"] += int(max(0, watch or 0))
        acc[d]["calories_chest_sum"] += int(max(0, chest or 0))
        acc[d]["calories_hr_sum"] += int(max(0, hr or 0))

    conn = get_db()
    try:
        uid = get_current_user_id()
        cardio_rows = conn.execute(
            """
            SELECT date,
                   SUM(COALESCE(calories_watch, 0)) AS w,
                   SUM(COALESCE(calories_chest, 0)) AS c,
                   SUM(COALESCE(calories_hr, 0)) AS h
            FROM cardio_workouts
            WHERE date BETWEEN ? AND ? AND user_id = ?
            GROUP BY date
            """,
            (d_from, d_to, uid),
        ).fetchall()
        for row in cardio_rows:
            _add(row["date"], row["w"], row["c"], row["h"])

        strength_rows = conn.execute(
            """
            SELECT date,
                   SUM(w_max) AS w,
                   SUM(c_max) AS c,
                   SUM(h_max) AS h
            FROM (
                SELECT date,
                       workout_title,
                       MAX(COALESCE(calories_watch, 0)) AS w_max,
                       MAX(COALESCE(calories_chest, 0)) AS c_max,
                       MAX(COALESCE(calories_hr, 0)) AS h_max
                FROM strength_workouts
                WHERE date BETWEEN ? AND ? AND user_id = ?
                GROUP BY date, workout_title
            )
            GROUP BY date
            """,
            (d_from, d_to, uid),
        ).fetchall()
        for row in strength_rows:
            _add(row["date"], row["w"], row["c"], row["h"])
    finally:
        conn.close()

    start = date.fromisoformat(d_from)
    end = date.fromisoformat(d_to)
    items: list[dict[str, Any]] = []
    cur = start
    while cur <= end:
        d = cur.isoformat()
        vals = acc.get(
            d,
            {"calories_watch_sum": 0, "calories_chest_sum": 0, "calories_hr_sum": 0},
        )
        items.append({"date": d, **vals})
        cur += timedelta(days=1)
    return items


def _round0(n: float) -> int:
    return int(round(max(0, n)))


def get_daily_bracelet_calories_range(
    date_from: str, date_to: str
) -> list[dict[str, Any]]:
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT date, total_calories, source, updated_at
            FROM daily_bracelet_calories
            WHERE user_id = ? AND date BETWEEN ? AND ?
            ORDER BY date
            """,
            (uid, d_from, d_to),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "date": str(r["date"])[:10],
            "total_calories": int(r["total_calories"]),
            "source": r["source"] or "manual",
            "updated_at": r["updated_at"],
        }
        for r in rows
    ]


def save_daily_bracelet_calories(
    day: str,
    total_calories: int,
    source: str = "manual",
) -> dict[str, Any]:
    d = str(day)[:10]
    if total_calories < 0:
        raise ValueError("total_calories must be >= 0")
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO daily_bracelet_calories (user_id, date, total_calories, source, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, date) DO UPDATE SET
                total_calories = excluded.total_calories,
                source = excluded.source,
                updated_at = CURRENT_TIMESTAMP
            """,
            (uid, d, int(total_calories), source or "manual"),
        )
        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "daily_bracelet_calories", "date", d)
        conn.commit()
        row = conn.execute(
            """
            SELECT date, total_calories, source, updated_at
            FROM daily_bracelet_calories WHERE user_id = ? AND date = ?
            """,
            (uid, d),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        raise RuntimeError("Failed to save daily_bracelet_calories")
    return {
        "date": str(row["date"])[:10],
        "total_calories": int(row["total_calories"]),
        "source": row["source"] or "manual",
        "updated_at": row["updated_at"],
    }


def _raw_bracelet_row(day: str) -> tuple[int | None, str | None]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT total_calories, source FROM daily_bracelet_calories
            WHERE user_id = ? AND date = ?
            """,
            (uid, str(day)[:10]),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None, None
    source = str(row["source"] or "") if row["source"] else None
    return int(row["total_calories"]), source


def _bracelet_total_for_day(day: str, manual: int | None) -> int | None:
    if manual is not None:
        return int(manual)
    total, source = _raw_bracelet_row(day)
    if total is None:
        return None
    from backend.services.hc_analytics_service import should_use_hc_bracelet

    if not should_use_hc_bracelet(source):
        return None
    return total


def _bracelet_source_for_day(day: str) -> str | None:
    _, source = _raw_bracelet_row(day)
    if source is None:
        return None
    from backend.services.hc_analytics_service import should_use_hc_bracelet

    if not should_use_hc_bracelet(source):
        return None
    return source


def _expenditure_hc_meta(source: str | None) -> dict[str, Any]:
    from backend.services.hc_analytics_service import bracelet_gate_meta, HC_SOURCE

    meta = bracelet_gate_meta()
    src = str(source or "").lower()
    if src != HC_SOURCE:
        return {
            "hc_analytics_enabled": meta["hc_analytics_enabled"],
            "hc_stale": False,
            "hc_stale_warning": None,
        }
    return {
        "hc_analytics_enabled": meta["hc_analytics_enabled"],
        "hc_stale": bool(meta["hc_analytics_enabled"] and meta["hc_stale"]),
        "hc_stale_warning": meta["hc_stale_warning"] if meta["hc_analytics_enabled"] else None,
    }


def _format_workout_label(name: str, day: str, start_time: str | None) -> str:
    """Название тренировки для предупреждений (тип/заголовок + время или дата)."""
    label = (name or "Тренировка").strip()
    if not label:
        label = "Тренировка"
    if start_time:
        st = str(start_time).strip()
        if "T" in st:
            time_part = st.split("T", 1)[1][:5]
        elif len(st) >= 5 and ":" in st:
            time_part = st[:5]
        else:
            time_part = st[:8]
        return f"{label} {time_part}"
    try:
        d = date.fromisoformat(str(day)[:10])
        return f"{label} {d.strftime('%d.%m.%Y')}"
    except ValueError:
        return f"{label} {day}"


def _effective_workout_kcal(
    watch: int,
    chest_raw: int | None,
    *,
    prefer_chest: bool,
) -> tuple[int, bool]:
    """
    Ккал на тренировку для формулы браслета и флаг fallback (пульсометр → часы).
    """
    w = int(watch or 0)
    c = int(chest_raw) if chest_raw is not None else 0
    if not prefer_chest:
        return w, False
    if c > 0:
        return c, False
    used_fallback = w > 0
    return w, used_fallback


def _workout_calorie_totals_for_day(
    conn,
    day: str,
    *,
    prefer_chest: bool,
) -> tuple[int, int, int, list[str]]:
    """
    watch_total, chest_raw_total, chest_effective_total, fallback_used_for.

    chest_effective_total = SUM(chest если >0 иначе watch) при prefer_chest;
    иначе совпадает с watch_total.
    """
    d = str(day)[:10]
    uid = get_current_user_id()
    watch_total = 0
    chest_raw_total = 0
    chest_effective_total = 0
    fallback_used_for: list[str] = []

    cardio_rows = conn.execute(
        """
        SELECT type, start_time,
               COALESCE(calories_watch, 0) AS w,
               calories_chest AS c_raw
        FROM cardio_workouts WHERE date = ? AND user_id = ?
        """,
        (d, uid),
    ).fetchall()
    for row in cardio_rows:
        w = int(row["w"] or 0)
        c_raw = row["c_raw"]
        c_int = int(c_raw) if c_raw is not None else 0
        watch_total += w
        chest_raw_total += max(0, c_int)
        eff, used_fb = _effective_workout_kcal(w, c_raw, prefer_chest=prefer_chest)
        chest_effective_total += eff
        if used_fb:
            fallback_used_for.append(
                _format_workout_label(str(row["type"] or ""), d, row["start_time"])
            )

    strength_rows = conn.execute(
        """
        SELECT workout_title,
               MAX(COALESCE(calories_watch, 0)) AS w,
               MAX(calories_chest) AS c_raw
        FROM strength_workouts
        WHERE date = ? AND user_id = ?
        GROUP BY workout_title
        """,
        (d, uid),
    ).fetchall()
    for row in strength_rows:
        w = int(row["w"] or 0)
        c_raw = row["c_raw"]
        c_int = int(c_raw) if c_raw is not None else 0
        watch_total += w
        chest_raw_total += max(0, c_int)
        eff, used_fb = _effective_workout_kcal(w, c_raw, prefer_chest=prefer_chest)
        chest_effective_total += eff
        if used_fb:
            fallback_used_for.append(
                _format_workout_label(str(row["workout_title"] or ""), d, None)
            )

    if not prefer_chest:
        chest_effective_total = watch_total

    return watch_total, chest_raw_total, chest_effective_total, fallback_used_for


def get_corrected_daily_expenditure(
    day: str,
    manual_bracelet_calories: int | None = None,
    *,
    prefer_chest: bool = True,
) -> dict[str, Any]:
    """
    Скорректированная активность за день (браслет − часы + пульсометр по тренировкам).
    Без данных браслета — corrected_activity=None, needs_bracelet_input=True.
    """
    d = str(day)[:10]
    raw_total, raw_source = (
        (int(manual_bracelet_calories), "manual")
        if manual_bracelet_calories is not None
        else _raw_bracelet_row(d)
    )
    bracelet_total = _bracelet_total_for_day(d, manual_bracelet_calories)
    bracelet_source = _bracelet_source_for_day(d)

    conn = get_db()
    try:
        watch_total, chest_raw_total, chest_effective_total, fallback_used_for = (
            _workout_calorie_totals_for_day(conn, d, prefer_chest=prefer_chest)
        )
    finally:
        conn.close()

    corrected_activity: int | None = None
    needs_bracelet = bracelet_total is None
    mode = "fallback"
    has_fallback = bool(prefer_chest and fallback_used_for)

    if bracelet_total is not None:
        from backend.services.calibration_service import get_bracelet_calibration_factor

        calibration = get_bracelet_calibration_factor()
        raw_activity = bracelet_total - watch_total + chest_effective_total
        corrected_activity = _round0(raw_activity * calibration)
        mode = "bracelet"

    return {
        "date": d,
        "bracelet_total": bracelet_total,
        "bracelet_source": bracelet_source,
        "watch_total": watch_total,
        "chest_total": chest_effective_total,
        "chest_raw_total": chest_raw_total,
        "workout_effective_total": chest_effective_total,
        "corrected_activity": corrected_activity,
        "needs_bracelet_input": needs_bracelet,
        "calculation_mode": mode,
        "prefer_chest": prefer_chest,
        "has_fallback": has_fallback,
        "fallback_used_for": fallback_used_for,
        "fallback_workout_kcal": chest_effective_total if mode == "fallback" else None,
        **_expenditure_hc_meta(raw_source if manual_bracelet_calories is None else "manual"),
    }


def _dates_inclusive(date_from: str, date_to: str) -> list[str]:
    start = date.fromisoformat(str(date_from)[:10])
    end = date.fromisoformat(str(date_to)[:10])
    out: list[str] = []
    cur = start
    while cur <= end:
        out.append(cur.isoformat())
        cur += timedelta(days=1)
    return out


def _batch_bracelet_map(conn, date_from: str, date_to: str) -> dict[str, dict[str, Any]]:
    uid = get_current_user_id()
    rows = conn.execute(
        """
        SELECT date, total_calories, source
        FROM daily_bracelet_calories
        WHERE user_id = ? AND date BETWEEN ? AND ?
        """,
        (uid, str(date_from)[:10], str(date_to)[:10]),
    ).fetchall()
    out: dict[str, dict[str, Any]] = {}
    for row in rows:
        day = str(row["date"])[:10]
        out[day] = {
            "total": int(row["total_calories"]),
            "source": str(row["source"]) if row["source"] else None,
        }
    return out


def _batch_workout_calorie_details(
    conn,
    date_from: str,
    date_to: str,
    *,
    prefer_chest: bool,
) -> dict[str, tuple[int, int, int, list[str]]]:
    """Per day: watch_total, chest_raw, chest_effective, fallback_used_for."""
    uid = get_current_user_id()
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    per_day: dict[str, dict[str, Any]] = {}

    def _acc(day: str) -> dict[str, Any]:
        if day not in per_day:
            per_day[day] = {
                "watch": 0,
                "chest_raw": 0,
                "chest_eff": 0,
                "fallback": [],
            }
        return per_day[day]

    cardio_rows = conn.execute(
        """
        SELECT date, type, start_time,
               COALESCE(calories_watch, 0) AS w,
               calories_chest AS c_raw
        FROM cardio_workouts
        WHERE date BETWEEN ? AND ? AND user_id = ?
        """,
        (d_from, d_to, uid),
    ).fetchall()
    for row in cardio_rows:
        d = str(row["date"])[:10]
        bucket = _acc(d)
        w = int(row["w"] or 0)
        c_raw = row["c_raw"]
        c_int = int(c_raw) if c_raw is not None else 0
        bucket["watch"] += w
        bucket["chest_raw"] += max(0, c_int)
        eff, used_fb = _effective_workout_kcal(w, c_raw, prefer_chest=prefer_chest)
        bucket["chest_eff"] += eff
        if used_fb:
            bucket["fallback"].append(
                _format_workout_label(str(row["type"] or ""), d, row["start_time"])
            )

    strength_rows = conn.execute(
        """
        SELECT date, workout_title,
               MAX(COALESCE(calories_watch, 0)) AS w,
               MAX(calories_chest) AS c_raw
        FROM strength_workouts
        WHERE date BETWEEN ? AND ? AND user_id = ?
        GROUP BY date, workout_title
        """,
        (d_from, d_to, uid),
    ).fetchall()
    for row in strength_rows:
        d = str(row["date"])[:10]
        bucket = _acc(d)
        w = int(row["w"] or 0)
        c_raw = row["c_raw"]
        c_int = int(c_raw) if c_raw is not None else 0
        bucket["watch"] += w
        bucket["chest_raw"] += max(0, c_int)
        eff, used_fb = _effective_workout_kcal(w, c_raw, prefer_chest=prefer_chest)
        bucket["chest_eff"] += eff
        if used_fb:
            bucket["fallback"].append(
                _format_workout_label(str(row["workout_title"] or ""), d, None)
            )

    if not prefer_chest:
        for bucket in per_day.values():
            bucket["chest_eff"] = bucket["watch"]

    return {
        day: (v["watch"], v["chest_raw"], v["chest_eff"], v["fallback"])
        for day, v in per_day.items()
    }


def _build_corrected_from_parts(
    day: str,
    bracelet_row: dict[str, Any] | None,
    workout_parts: tuple[int, int, int, list[str]] | None,
    *,
    prefer_chest: bool,
    calibration: float,
) -> dict[str, Any]:
    d = str(day)[:10]
    raw_source = bracelet_row.get("source") if bracelet_row else None
    bracelet_total: int | None = None
    bracelet_source: str | None = None
    if bracelet_row:
        from backend.services.hc_analytics_service import should_use_hc_bracelet

        if should_use_hc_bracelet(raw_source):
            bracelet_total = int(bracelet_row["total"])
            bracelet_source = raw_source
    watch_total, chest_raw_total, chest_effective_total, fallback_used_for = workout_parts or (
        0,
        0,
        0,
        [],
    )
    corrected_activity: int | None = None
    needs_bracelet = bracelet_total is None
    mode = "fallback"
    has_fallback = bool(prefer_chest and fallback_used_for)
    if bracelet_total is not None:
        raw_activity = bracelet_total - watch_total + chest_effective_total
        corrected_activity = _round0(raw_activity * calibration)
        mode = "bracelet"
    return {
        "date": d,
        "bracelet_total": bracelet_total,
        "bracelet_source": bracelet_source,
        "watch_total": watch_total,
        "chest_total": chest_effective_total,
        "chest_raw_total": chest_raw_total,
        "workout_effective_total": chest_effective_total,
        "corrected_activity": corrected_activity,
        "needs_bracelet_input": needs_bracelet,
        "calculation_mode": mode,
        "prefer_chest": prefer_chest,
        "has_fallback": has_fallback,
        "fallback_used_for": fallback_used_for,
        "fallback_workout_kcal": chest_effective_total if mode == "fallback" else None,
        **_expenditure_hc_meta(raw_source),
    }


def get_daily_expenditure_range(
    date_from: str,
    date_to: str,
    phase: str = "cut",
    *,
    prefer_chest: bool = True,
    conn=None,
    calibration_override: float | None = None,
) -> dict[str, dict[str, Any]]:
    """Batch daily expenditure for a date range (single connection, few queries)."""
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    ph = phase if phase in food_service.FOOD_PHASES else "cut"
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    try:
        if calibration_override is None:
            from backend.services.calibration_service import get_bracelet_calibration_factor

            calibration = get_bracelet_calibration_factor()
        else:
            calibration = float(calibration_override)
        food_by_day = food_service._daily_totals_for_range(conn, d_from, d_to, ph)
        bracelet_map = _batch_bracelet_map(conn, d_from, d_to)
        workout_map = _batch_workout_calorie_details(
            conn, d_from, d_to, prefer_chest=prefer_chest
        )
        weight_rows = food_service._weights_for_range(conn, d_to)
        profile = None
        try:
            from backend.services import user_service

            profile = user_service.get_profile() or {}
        except Exception:
            profile = {}

        workout_kcal_by_day = food_service._workout_calories_for_range(conn, d_from, d_to)
        out: dict[str, dict[str, Any]] = {}
        for day in _dates_inclusive(d_from, d_to):
            daily = food_by_day.get(day) or {
                "protein": 0.0,
                "fat": 0.0,
                "carbs": 0.0,
                "calories": 0.0,
                "fiber": 0.0,
            }
            exp_base = food_service.get_expenditure(
                day,
                daily,
                conn=conn,
                profile=profile,
                weight_kg=food_service._weight_on_day(weight_rows, day),
                workout_totals=workout_kcal_by_day.get(
                    day,
                    {"cardio_kcal": 0.0, "strength_kcal": 0.0, "workout_kcal": 0.0},
                ),
            )
            corrected = _build_corrected_from_parts(
                day,
                bracelet_map.get(day),
                workout_map.get(day),
                prefer_chest=prefer_chest,
                calibration=calibration,
            )
            bmr = exp_base.get("bmr")
            tef_kcal = float(exp_base.get("tef_kcal") or 0)
            if corrected["corrected_activity"] is not None:
                activity_out = int(corrected["corrected_activity"])
                total_expenditure = (
                    round((float(bmr or 0) + tef_kcal + activity_out), 1)
                    if bmr is not None
                    else None
                )
            else:
                workout_fallback = int(corrected["workout_effective_total"] or 0)
                total_expenditure = (
                    round((float(bmr or 0) + tef_kcal + workout_fallback), 1)
                    if bmr is not None
                    else None
                )
            out[day] = {
                "date": day,
                "bmr": bmr,
                "tef": round(tef_kcal, 1),
                "bracelet_total": corrected["bracelet_total"],
                "bracelet_source": corrected.get("bracelet_source"),
                "watch_total": corrected["watch_total"],
                "chest_total": corrected["chest_total"],
                "workout_effective_total": corrected["workout_effective_total"],
                "corrected_activity": corrected["corrected_activity"],
                "total_expenditure": total_expenditure,
                "needs_bracelet_input": corrected["needs_bracelet_input"],
                "calculation_mode": corrected["calculation_mode"],
                "prefer_chest": prefer_chest,
                "fallback_workout_kcal": corrected.get("fallback_workout_kcal"),
                "has_fallback": corrected.get("has_fallback", False),
                "fallback_used_for": corrected.get("fallback_used_for") or [],
                "chest_raw_total": corrected.get("chest_raw_total", 0),
            }
        return out
    finally:
        if own_conn:
            conn.close()


def get_daily_expenditure(
    day: str,
    phase: str = "cut",
    *,
    prefer_chest: bool = True,
    bracelet_calories: int | None = None,
) -> dict[str, Any]:
    """BMR + TEF + скорректированная активность (или fallback по тренировкам)."""
    d = str(day)[:10]
    ph = phase if phase in food_service.FOOD_PHASES else "cut"

    conn = get_db()
    try:
        daily = food_service._daily_totals_for_day(conn, d, ph)
    finally:
        conn.close()

    exp_base = food_service.get_expenditure(d, daily)
    bmr = exp_base.get("bmr")
    tef_kcal = float(exp_base.get("tef_kcal") or 0)

    corrected = get_corrected_daily_expenditure(
        d, bracelet_calories, prefer_chest=prefer_chest
    )

    if corrected["corrected_activity"] is not None:
        activity_out = int(corrected["corrected_activity"])
        total_expenditure = (
            round((float(bmr or 0) + tef_kcal + activity_out), 1)
            if bmr is not None
            else None
        )
    else:
        workout_fallback = int(corrected["workout_effective_total"] or 0)
        activity_out = None
        total_expenditure = (
            round((float(bmr or 0) + tef_kcal + workout_fallback), 1)
            if bmr is not None
            else None
        )

    return {
        "date": d,
        "bmr": bmr,
        "tef": round(tef_kcal, 1),
        "bracelet_total": corrected["bracelet_total"],
        "bracelet_source": corrected.get("bracelet_source"),
        "watch_total": corrected["watch_total"],
        "chest_total": corrected["chest_total"],
        "workout_effective_total": corrected["workout_effective_total"],
        "corrected_activity": corrected["corrected_activity"],
        "total_expenditure": total_expenditure,
        "needs_bracelet_input": corrected["needs_bracelet_input"],
        "calculation_mode": corrected["calculation_mode"],
        "prefer_chest": prefer_chest,
        "fallback_workout_kcal": corrected.get("fallback_workout_kcal"),
        "has_fallback": corrected.get("has_fallback", False),
        "fallback_used_for": corrected.get("fallback_used_for") or [],
        "chest_raw_total": corrected.get("chest_raw_total", 0),
        "hc_analytics_enabled": corrected.get("hc_analytics_enabled", False),
        "hc_stale": corrected.get("hc_stale", False),
        "hc_stale_warning": corrected.get("hc_stale_warning"),
    }


def get_week_daily_expenditure(
    anchor_date: str,
    phase: str = "cut",
    *,
    prefer_chest: bool = True,
) -> dict[str, Any]:
    week_days = week_dates_from_anchor(anchor_date)
    if not week_days:
        return {
            "items": [],
            "days_with_bracelet": 0,
            "days_without_bracelet": 0,
            "total_corrected_expenditure": None,
        }
    by_day = get_daily_expenditure_range(
        week_days[0],
        week_days[-1],
        phase,
        prefer_chest=prefer_chest,
    )
    items = [by_day[d] for d in week_days if d in by_day]
    with_bracelet = sum(1 for i in items if i["calculation_mode"] == "bracelet")
    without = len(items) - with_bracelet
    totals = [
        float(i["total_expenditure"])
        for i in items
        if i.get("total_expenditure") is not None
        and i["calculation_mode"] == "bracelet"
    ]
    total_corrected = round(sum(totals), 1) if totals else None
    return {
        "items": items,
        "days_with_bracelet": with_bracelet,
        "days_without_bracelet": without,
        "total_corrected_expenditure": total_corrected,
    }


def get_ctl_atl_tsb(days: int = 90) -> list[dict[str, Any]]:
    """CTL / ATL / TSB by daily TRIMP (cardio). Delegates to analytics_query."""
    from backend.services import analytics_query

    return analytics_query.get_ctl_atl_tsb_series(days)
