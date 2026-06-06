# -*- coding: utf-8 -*-
"""Кардио — только SQLite через get_db()."""
from __future__ import annotations

import json
import logging
from typing import Any

import pandas as pd

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.database.user_scope import prepend_user_clause, user_where
from backend.services.user_service import get_effective_max_heart_rate
from backend.services._sql_helpers import int_or_none, records_from_df
from utils.constants import (
    CARDIO_DB_BIKE,
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_POLAR,
)
from utils.date_guard import is_future_workout_date
from utils.date_utils import normalize_cardio_date_column
from utils.bike_track import enrich_geojson_from_sensors, geojson_to_track_points
from utils.sensor_downsample import apply_sensor_downsample, thin_rows_by_interval
from utils.math_utils import calc_pace_min_km, calc_pace_sec_100m, calc_speed_kmh

logger = logging.getLogger(__name__)

IMMUTABLE_ON_FIT = frozenset({"data_source", "start_time", "type"})
ALLOWED_UPDATE_FIELDS = frozenset(
    {
        "date",
        "distance_km",
        "duration_sec",
        "avg_hr",
        "max_hr",
        "calories",
        "calories_chest",
        "calories_watch",
        "swolf",
    }
)


def _positive_kcal(value: Any) -> int | None:
    if value is None:
        return None
    try:
        n = int(value)
        return n if n > 0 else None
    except (TypeError, ValueError):
        return None


def _hr_stats_from_row(row: Any) -> dict[str, int | None]:
    if row is None or row[2] is None:
        return {"avg_hr": None, "max_hr": None, "duration_sec": None}
    avg_hr = int(row[0]) if row[0] is not None else None
    max_hr = int(row[1]) if row[1] is not None else None
    duration_sec = int(row[2]) + 1 if row[2] is not None else None
    return {"avg_hr": avg_hr, "max_hr": max_hr, "duration_sec": duration_sec}


def hr_stats_for_workout(
    conn,
    workout_id: int,
    *,
    source_type: str = "cardio",
) -> dict[str, int | None]:
    """Средний/макс. пульс и длительность по посекундным данным workout_heart_rate."""
    row = conn.execute(
        """
        SELECT ROUND(AVG(heart_rate)), MAX(heart_rate), MAX(elapsed_sec)
        FROM workout_heart_rate
        WHERE cardio_workout_id = ?
          AND COALESCE(source_type, 'cardio') = ?
        """,
        (int(workout_id), source_type),
    ).fetchone()
    return _hr_stats_from_row(row)


def batch_hr_stats_for_workouts(
    conn,
    workout_ids: list[int],
    *,
    source_type: str = "cardio",
) -> dict[int, dict[str, int | None]]:
    """Один запрос HR-агрегатов для списка кардио (list endpoint hot path)."""
    ids = [int(wid) for wid in workout_ids if wid]
    if not ids:
        return {}
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"""
        SELECT cardio_workout_id,
               ROUND(AVG(heart_rate)),
               MAX(heart_rate),
               MAX(elapsed_sec)
        FROM workout_heart_rate
        WHERE cardio_workout_id IN ({placeholders})
          AND COALESCE(source_type, 'cardio') = ?
        GROUP BY cardio_workout_id
        """,
        (*ids, source_type),
    ).fetchall()
    out: dict[int, dict[str, int | None]] = {}
    for row in rows:
        wid = int(row[0])
        out[wid] = _hr_stats_from_row((row[1], row[2], row[3]))
    return out


def _is_device_sourced_cardio(rec: dict[str, Any]) -> bool:
    src = str(rec.get("data_source") or "")
    return src in (CARDIO_SOURCE_POLAR, CARDIO_SOURCE_FIT)


def _apply_device_chest_kcal(rec: dict[str, Any]) -> None:
    chest = (
        _positive_kcal(rec.get("calories_chest"))
        or _positive_kcal(rec.get("calories_hr"))
        or _positive_kcal(rec.get("calories"))
    )
    if chest is not None:
        rec["calories_chest"] = chest


def enrich_cardio_from_device(
    conn,
    rec: dict[str, Any],
    *,
    hr_stats: dict[str, int | None] | None = None,
) -> None:
    """Пульс, ккал пульсометра и длительность — в первую очередь из Polar/FIT/HR."""
    wid = rec.get("id")
    if not wid:
        return

    stats = hr_stats if hr_stats is not None else hr_stats_for_workout(
        conn, int(wid), source_type="cardio"
    )
    has_hr = stats["duration_sec"] is not None
    device = _is_device_sourced_cardio(rec) or has_hr

    if not device:
        return

    _apply_device_chest_kcal(rec)
    if not rec.get("avg_hr") and stats["avg_hr"]:
        rec["avg_hr"] = stats["avg_hr"]
    if not rec.get("max_hr") and stats["max_hr"]:
        rec["max_hr"] = stats["max_hr"]
    if (not rec.get("duration_sec") or int(rec.get("duration_sec") or 0) <= 0) and stats[
        "duration_sec"
    ]:
        rec["duration_sec"] = stats["duration_sec"]


def enrich_bike_workout(rec: dict[str, Any], conn=None) -> None:
    """Ккал/пульс/длительность вело — из Polar/FIT и посекундного HR в БД."""
    if rec.get("type") != CARDIO_DB_BIKE:
        return
    if conn is not None:
        enrich_cardio_from_device(conn, rec)
    else:
        _apply_device_chest_kcal(rec)


def _bike_has_fit(conn, workout_date: str) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM cardio_workouts
        WHERE type = ? AND date = ? AND data_source = ? AND user_id = ?
        LIMIT 1
        """,
        (CARDIO_DB_BIKE, workout_date[:10], CARDIO_SOURCE_FIT, get_current_user_id()),
    ).fetchone()
    return row is not None


def _workout_where_clause(
    workout_type: str | None = None,
    exclude_type: str | None = None,
    fit_only: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[str, list[Any]]:
    clauses: list[str] = []
    params: list[Any] = []
    clauses, params = prepend_user_clause(clauses, params)
    clauses.append("date IS NOT NULL AND TRIM(COALESCE(date, '')) != ''")
    clauses.append("type IS NOT NULL AND TRIM(COALESCE(type, '')) != ''")
    if date_from:
        clauses.append("date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("date <= ?")
        params.append(str(date_to)[:10])
    if workout_type:
        clauses.append("type = ?")
        params.append(workout_type)
    if exclude_type:
        clauses.append("type != ?")
        params.append(exclude_type)
    if fit_only:
        clauses.append(
            "start_time IS NOT NULL AND TRIM(COALESCE(start_time, '')) != ''"
        )
    uid = get_current_user_id()
    schema_conn = get_db()
    try:
        cardio_cols = {
            r[1] for r in schema_conn.execute("PRAGMA table_info(cardio_workouts)").fetchall()
        }
        has_source_links = schema_conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='workout_source_links'"
        ).fetchone()
    finally:
        schema_conn.close()
    if "deleted_at" in cardio_cols:
        clauses.append("(deleted_at IS NULL OR TRIM(COALESCE(deleted_at, '')) = '')")
    if has_source_links:
        clauses.append(
            """
            id NOT IN (
                SELECT linked_workout_id FROM workout_source_links WHERE user_id = ?
            )
            """
        )
        params.append(uid)
    if not clauses:
        uf, up = user_where()
        return uf, up
    return " WHERE " + " AND ".join(clauses), params


def count_visible_workouts(*, workout_type: str | None = None) -> int:
    """Число реальных кардио-записей пользователя (те же правила, что в get_workouts)."""
    where_sql, where_params = _workout_where_clause(workout_type=workout_type)
    conn = get_db()
    try:
        row = conn.execute(
            f"SELECT COUNT(*) FROM cardio_workouts{where_sql}",
            where_params,
        ).fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def list_cardio_types() -> list[str]:
    """Уникальные значения type из cardio_workouts."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT type
            FROM cardio_workouts
            WHERE type IS NOT NULL AND TRIM(type) != ''
            ORDER BY type COLLATE NOCASE
            """
        ).fetchall()
    finally:
        conn.close()
    return [str(r[0]) for r in rows]


def get_workouts(
    limit: int,
    offset: int,
    *,
    workout_type: str | None = None,
    exclude_type: str | None = None,
    fit_only: bool = False,
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[list[dict[str, Any]], int]:
    """Список кардио-тренировок (с опциональными фильтрами)."""
    where_sql, where_params = _workout_where_clause(
        workout_type,
        exclude_type,
        fit_only,
        date_from,
        date_to,
    )
    conn = get_db()
    try:
        total = int(
            conn.execute(
                f"SELECT COUNT(*) FROM cardio_workouts{where_sql}",
                where_params,
            ).fetchone()[0]
        )
        # idx_cardio_date / idx_cardio_type_date — см. database/migrations.py
        df = pd.read_sql_query(
            f"""
            SELECT * FROM cardio_workouts{where_sql}
            ORDER BY date DESC, id DESC
            LIMIT ? OFFSET ?
            """,
            conn,
            params=(*where_params, int(limit), int(offset)),
        )
        if df.empty:
            return [], total
        df = normalize_cardio_date_column(df, "date")
        df["speed_kmh"] = df.apply(
            lambda r: calc_speed_kmh(r["distance_km"], r["duration_sec"]), axis=1
        )
        df["pace_min_km"] = df.apply(
            lambda r: calc_pace_min_km(r["distance_km"], r["duration_sec"]), axis=1
        )
        df["pace_sec_100m"] = df.apply(
            lambda r: calc_pace_sec_100m(r["distance_km"], r["duration_sec"]), axis=1
        )
        items = records_from_df(df)
        hr_by_id = batch_hr_stats_for_workouts(
            conn, [int(rec["id"]) for rec in items if rec.get("id")]
        )
        for rec in items:
            wid = rec.get("id")
            precomputed = hr_by_id.get(int(wid)) if wid else None
            enrich_cardio_from_device(conn, rec, hr_stats=precomputed)
            if rec.get("type") == CARDIO_DB_BIKE:
                rec["swolf"] = None
                enrich_bike_workout(rec, conn=conn)
        return items, total
    finally:
        conn.close()


def get_heart_rate_data(
    workout_id: int,
    *,
    source_type: str | None = "cardio",
) -> list[dict[str, Any]]:
    """
    Пульс из workout_heart_rate.
    Формат: [{"seconds": int, "heart_rate": int}, ...]
    source_type: cardio | strength; None — без фильтра по типу.
    """
    conn = get_db()
    try:
        info = {row[1] for row in conn.execute("PRAGMA table_info(workout_heart_rate)")}
        has_dist = "distance_m" in info
        has_source = "source_type" in info
        cols = "elapsed_sec, heart_rate"
        if has_dist:
            cols += ", distance_m"
        if has_source:
            cols += ", source_type"
        where = "cardio_workout_id = ?"
        params: list[Any] = [int(workout_id)]
        if has_source and source_type is not None:
            where += " AND COALESCE(source_type, 'cardio') = ?"
            params.append(source_type)
        rows = conn.execute(
            f"""
            SELECT {cols}
            FROM workout_heart_rate
            WHERE {where}
            ORDER BY elapsed_sec
            """,
            params,
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return []
    out: list[dict[str, Any]] = []
    for r in rows:
        point: dict[str, Any] = {
            "seconds": int(r["elapsed_sec"]),
            "heart_rate": int(r["heart_rate"]),
        }
        if has_dist and r["distance_m"] is not None:
            try:
                point["distance_m"] = float(r["distance_m"])
            except (TypeError, ValueError):
                pass
        if has_source:
            st = r["source_type"]
            point["source_type"] = str(st) if st is not None else "cardio"
        out.append(point)
    return out


def compute_workout_trimp(workout_id: int) -> float | None:
    """TRIMP Эдвардса по точкам пульса; max HR — из профиля."""
    from utils.hr_profile import compute_edwards_trimp

    wid = int(workout_id)
    points = get_heart_rate_data(wid)
    if not points:
        return None
    duration_sec = None
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT duration_sec FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (wid, get_current_user_id()),
        ).fetchone()
        if row and row["duration_sec"] is not None:
            duration_sec = int(row["duration_sec"])
    finally:
        conn.close()
    return compute_edwards_trimp(
        points,
        get_effective_max_heart_rate(),
        duration_sec=duration_sec,
    )


def save_workout_trimp(workout_id: int, trimp: float | None) -> None:
    conn = get_db()
    try:
        conn.execute(
            "UPDATE cardio_workouts SET trimp = ? WHERE id = ? AND user_id = ?",
            (trimp, int(workout_id), get_current_user_id()),
        )
        conn.commit()
    finally:
        conn.close()


def count_missing_trimp(user_id: int | None = None) -> int:
    """Cardio workouts with HR but no stored TRIMP."""
    uid = user_id if user_id is not None else get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT COUNT(DISTINCT c.id)
            FROM cardio_workouts c
            INNER JOIN workout_heart_rate h ON h.cardio_workout_id = c.id
            WHERE c.trimp IS NULL AND c.user_id = ?
            """,
            (uid,),
        ).fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def _refresh_missing_trimp_if_needed(limit: int = 500) -> int:
    missing = count_missing_trimp()
    if missing <= 0:
        return 0
    return refresh_missing_trimp(limit=min(int(limit), missing))


def refresh_missing_trimp(limit: int = 500) -> int:
    """Пересчитать TRIMP для тренировок с пульсом, где trimp ещё не записан."""
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT c.id
            FROM cardio_workouts c
            INNER JOIN workout_heart_rate h ON h.cardio_workout_id = c.id
            WHERE c.trimp IS NULL AND c.user_id = ?
            LIMIT ?
            """,
            (uid, int(limit)),
        ).fetchall()
    finally:
        conn.close()
    updated = 0
    for row in rows:
        wid = int(row[0])
        val = compute_workout_trimp(wid)
        if val is not None:
            save_workout_trimp(wid, val)
            updated += 1
    return updated


STRENGTH_ZONE_TYPE = "__strength__"
_HR_SOURCE_CARDIO = "cardio"
_HR_SOURCE_STRENGTH = "strength"


def _zone_time_empty(
    days: int,
    max_hr: int,
    workout_type: str | None,
    *,
    available_types: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    from utils.hr_profile import analytics_heart_rate_zones

    zones = analytics_heart_rate_zones(max_hr)
    return {
        "days": days,
        "max_heart_rate": max_hr,
        "workout_type": workout_type,
        "zones": zones,
        "items": [
            {
                "zone_id": z["id"],
                "name": z["name"],
                "seconds": 0.0,
                "minutes": 0.0,
                "percent": 0.0,
            }
            for z in zones
        ],
        "total_seconds": 0,
        "available_types": available_types or [],
        "workouts_with_hr": 0,
    }


def get_zone_time_distribution(
    days: int = 30,
    workout_type: str | None = None,
) -> dict[str, Any]:
    """Суммарное время в зонах пульса за период (кардио и силовые с HR)."""
    from datetime import date, timedelta

    from utils.hr_profile import accumulate_zone_seconds, analytics_heart_rate_zones

    days = max(1, min(int(days), 365))
    d_to = date.today().isoformat()
    d_from = (date.today() - timedelta(days=days - 1)).isoformat()
    max_hr = get_effective_max_heart_rate()
    type_filter = (workout_type or "").strip() or None
    include_cardio = type_filter is None or (
        type_filter != STRENGTH_ZONE_TYPE
    )
    include_strength = type_filter is None or type_filter == STRENGTH_ZONE_TYPE

    uid = get_current_user_id()
    conn = get_db()
    try:
        cardio_types: set[str] = set()
        if include_cardio:
            cardio_rows = conn.execute(
                """
                SELECT DISTINCT c.type
                FROM cardio_workouts c
                WHERE c.date >= ? AND c.date <= ? AND c.user_id = ?
                  AND EXISTS (
                    SELECT 1 FROM workout_heart_rate h
                    WHERE h.cardio_workout_id = c.id
                      AND COALESCE(h.source_type, 'cardio') = ?
                    LIMIT 1
                  )
                ORDER BY c.type COLLATE NOCASE
                """,
                (d_from, d_to, uid, _HR_SOURCE_CARDIO),
            ).fetchall()
            cardio_types = {str(r[0]) for r in cardio_rows if r[0]}

        strength_sessions = 0
        if include_strength:
            strength_sessions = int(
                conn.execute(
                    """
                    SELECT COUNT(*) FROM (
                        SELECT 1
                        FROM strength_workouts sw
                        WHERE sw.date >= ? AND sw.date <= ? AND sw.user_id = ?
                          AND EXISTS (
                            SELECT 1 FROM workout_heart_rate h
                            WHERE h.cardio_workout_id = sw.id
                              AND COALESCE(h.source_type, 'cardio') = ?
                            LIMIT 1
                          )
                        GROUP BY sw.date, sw.workout_title
                    )
                    """,
                    (d_from, d_to, uid, _HR_SOURCE_STRENGTH),
                ).fetchone()[0]
            )

        available_types: list[dict[str, str]] = []
        for t in sorted(cardio_types, key=lambda x: x.casefold()):
            available_types.append({"id": t, "label": t})
        if strength_sessions > 0:
            available_types.append({"id": STRENGTH_ZONE_TYPE, "label": "Силовые"})

        if not cardio_types and strength_sessions <= 0:
            return _zone_time_empty(
                days,
                max_hr,
                type_filter,
                available_types=available_types,
            )

        workout_specs: list[tuple[int, int | None, str]] = []

        if include_cardio:
            clauses = ["c.date >= ?", "c.date <= ?"]
            params: list[Any] = [d_from, d_to]
            clauses, params = prepend_user_clause(clauses, params, alias="c")
            if type_filter and type_filter != STRENGTH_ZONE_TYPE:
                clauses.append("c.type = ?")
                params.append(type_filter)
            where = " AND ".join(clauses)
            for r in conn.execute(
                f"""
                SELECT c.id, c.duration_sec
                FROM cardio_workouts c
                WHERE {where}
                  AND EXISTS (
                    SELECT 1 FROM workout_heart_rate h
                    WHERE h.cardio_workout_id = c.id
                      AND COALESCE(h.source_type, 'cardio') = ?
                    LIMIT 1
                  )
                """,
                (*params, _HR_SOURCE_CARDIO),
            ).fetchall():
                workout_specs.append(
                    (
                        int(r["id"]),
                        int(r["duration_sec"]) if r["duration_sec"] is not None else None,
                        _HR_SOURCE_CARDIO,
                    )
                )

        if include_strength:
            for r in conn.execute(
                """
                SELECT MIN(sw.id) AS id, MAX(sw.duration_sec) AS duration_sec
                FROM strength_workouts sw
                WHERE sw.date >= ? AND sw.date <= ? AND sw.user_id = ?
                  AND EXISTS (
                    SELECT 1 FROM workout_heart_rate h
                    WHERE h.cardio_workout_id = sw.id
                      AND COALESCE(h.source_type, 'cardio') = ?
                    LIMIT 1
                  )
                GROUP BY sw.date, sw.workout_title
                """,
                (d_from, d_to, uid, _HR_SOURCE_STRENGTH),
            ).fetchall():
                dur = r["duration_sec"]
                workout_specs.append(
                    (
                        int(r["id"]),
                        int(dur) if dur is not None else None,
                        _HR_SOURCE_STRENGTH,
                    )
                )
    finally:
        conn.close()

    if not workout_specs:
        return _zone_time_empty(
            days,
            max_hr,
            type_filter,
            available_types=available_types,
        )

    allowed = {(wid, src) for wid, _dur, src in workout_specs}
    duration_by_id = {wid: dur for wid, dur, _src in workout_specs}
    all_ids = [wid for wid, _dur, _src in workout_specs]

    conn = get_db()
    try:
        placeholders = ",".join("?" * len(all_ids))
        hr_rows = conn.execute(
            f"""
            SELECT cardio_workout_id, elapsed_sec, heart_rate,
                   COALESCE(source_type, 'cardio') AS source_type
            FROM workout_heart_rate
            WHERE cardio_workout_id IN ({placeholders})
            ORDER BY cardio_workout_id, elapsed_sec
            """,
            all_ids,
        ).fetchall()
    finally:
        conn.close()

    by_workout: dict[int, list[dict[str, Any]]] = {}
    for r in hr_rows:
        wid = int(r["cardio_workout_id"])
        src = str(r["source_type"] or _HR_SOURCE_CARDIO)
        if (wid, src) not in allowed:
            continue
        by_workout.setdefault(wid, []).append(
            {"seconds": int(r["elapsed_sec"]), "heart_rate": int(r["heart_rate"])}
        )

    totals = {z: 0.0 for z in ("z1", "z2", "z3", "z4", "z5")}
    for wid, points in by_workout.items():
        if not points:
            continue
        part = accumulate_zone_seconds(
            points,
            max_hr,
            duration_sec=duration_by_id.get(wid),
        )
        for zid, sec in part.items():
            totals[zid] += sec

    zone_meta = {z["id"]: z for z in analytics_heart_rate_zones(max_hr)}
    items: list[dict[str, Any]] = []
    total_sec = sum(totals.values())
    for zid in ("z1", "z2", "z3", "z4", "z5"):
        sec = totals[zid]
        meta = zone_meta.get(zid, {})
        items.append(
            {
                "zone_id": zid,
                "name": meta.get("name", zid),
                "seconds": round(sec, 0),
                "minutes": round(sec / 60.0, 1),
                "percent": round((sec / total_sec * 100.0), 1) if total_sec > 0 else 0.0,
            }
        )

    return {
        "days": days,
        "max_heart_rate": max_hr,
        "workout_type": type_filter,
        "zones": list(zone_meta.values()),
        "items": items,
        "total_seconds": round(total_sec, 0),
        "available_types": available_types,
        "workouts_with_hr": len(by_workout),
    }


def get_last_workout_trimp(*, refresh: bool = True) -> dict[str, Any] | None:
    """TRIMP последней кардио-тренировки с ненулевым импульсом."""
    if refresh:
        _refresh_missing_trimp_if_needed()
    where_sql, params = user_where()
    conn = get_db()
    try:
        row = conn.execute(
            f"""
            SELECT id, date, type, trimp
            FROM cardio_workouts
            {where_sql} AND trimp IS NOT NULL AND trimp > 0
            ORDER BY date DESC, id DESC
            LIMIT 1
            """,
            params,
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {
        "workout_id": int(row["id"]),
        "date": str(row["date"])[:10],
        "type": str(row["type"] or ""),
        "trimp": round(float(row["trimp"]), 1),
    }


def get_daily_trimp(
    date_from: str,
    date_to: str,
    *,
    refresh: bool = True,
) -> list[dict[str, Any]]:
    """Сумма TRIMP по дням (опционально дозаполняет пропуски)."""
    if refresh:
        _refresh_missing_trimp_if_needed()
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    uid = get_current_user_id()
    conn = get_db()
    try:
        df = pd.read_sql_query(
            """
            SELECT date, SUM(trimp) AS trimp
            FROM cardio_workouts
            WHERE date BETWEEN ? AND ? AND user_id = ?
              AND trimp IS NOT NULL AND trimp > 0
            GROUP BY date
            ORDER BY date
            """,
            conn,
            params=(d_from, d_to, uid),
        )
    finally:
        conn.close()
    if df.empty:
        return []
    return [
        {"date": str(r["date"])[:10], "trimp": round(float(r["trimp"]), 1)}
        for _, r in df.iterrows()
    ]


def get_gps_geojson(workout_id: int) -> str | None:
    """GeoJSON-строка из gps_tracks.track_data; None если трека нет."""
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT track_data FROM gps_tracks WHERE cardio_workout_id = ? LIMIT 1",
            (int(workout_id),),
        ).fetchone()
    finally:
        conn.close()
    if not row or row["track_data"] is None:
        return None
    raw = row["track_data"]
    if isinstance(raw, str):
        text = raw.strip()
        if not text:
            return None
        return text
    try:
        return json.dumps(raw, ensure_ascii=False)
    except (TypeError, ValueError):
        return None


def get_workout_sensors_raw(workout_id: int) -> list[dict[str, Any]]:
    """Строки workout_sensors по elapsed_sec."""
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT elapsed_sec, speed_kmh, cadence, elevation_m, temperature_c
            FROM workout_sensors
            WHERE cardio_workout_id = ?
            ORDER BY elapsed_sec
            """,
            (int(workout_id),),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "elapsed_sec": int(r["elapsed_sec"]),
            "speed_kmh": float(r["speed_kmh"]) if r["speed_kmh"] is not None else None,
            "cadence": float(r["cadence"]) if r["cadence"] is not None else None,
            "elevation_m": float(r["elevation_m"]) if r["elevation_m"] is not None else None,
            "temperature_c": float(r["temperature_c"]) if r["temperature_c"] is not None else None,
        }
        for r in rows
    ]


def get_sensors(workout_id: int, *, interval_sec: int = 2) -> dict[str, Any]:
    """Массивы датчиков для графиков (и синхронизации с картой)."""
    rows = get_workout_sensors_raw(workout_id)
    hr = get_heart_rate_data(workout_id)
    elapsed: list[int] = []
    speed_kmh: list[float | None] = []
    cadence: list[float | None] = []
    elevation_m: list[float | None] = []
    temperature_c: list[float | None] = []
    distance_m: list[float | None] = []
    heart_rate: list[int | None] = []

    hr_by_sec = {int(p["seconds"]): p for p in hr}
    row_by_sec = {int(r["elapsed_sec"]): r for r in rows}
    all_secs = sorted({r["elapsed_sec"] for r in rows} | set(hr_by_sec.keys()))

    for sec in all_secs:
        elapsed.append(sec)
        row = row_by_sec.get(sec, {})
        h = hr_by_sec.get(sec, {})
        speed_kmh.append(row.get("speed_kmh"))
        cadence.append(row.get("cadence"))
        elevation_m.append(row.get("elevation_m"))
        temperature_c.append(row.get("temperature_c"))
        heart_rate.append(int(h["heart_rate"]) if h.get("heart_rate") else None)
        distance_m.append(float(h["distance_m"]) if h.get("distance_m") is not None else None)

    def _has(values: list[Any]) -> bool:
        return any(v is not None for v in values)

    start_time: str | None = None
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT start_time FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (int(workout_id), get_current_user_id()),
        ).fetchone()
        if row and row["start_time"]:
            start_time = str(row["start_time"])
    finally:
        conn.close()

    payload = {
        "workout_id": int(workout_id),
        "start_time": start_time,
        "elapsed_sec": elapsed,
        "speed_kmh": speed_kmh,
        "cadence": cadence,
        "elevation_m": elevation_m,
        "temperature_c": temperature_c,
        "distance_m": distance_m,
        "heart_rate": heart_rate,
        "has_cadence": _has(cadence),
        "has_elevation": _has(elevation_m),
        "has_temperature": _has(temperature_c),
        "has_speed": _has(speed_kmh),
    }
    if interval_sec == 1:
        return payload
    return apply_sensor_downsample(payload, interval_sec=interval_sec)


def get_points(workout_id: int, *, interval_sec: int = 2) -> dict[str, Any]:
    """
    Точки трека для карты/hover.

    interval_sec: 1 — все точки; 0 — 1/сек; N>=2 — 1 точка каждые N сек (по умолчанию 2).
    """
    geo = get_gps(workout_id)
    if geo is None:
        raise ValueError("Нет GPS-точек")
    points = geojson_to_track_points(geo)
    points = thin_rows_by_interval(points, interval_sec)
    return {
        "workout_id": int(workout_id),
        "points": points,
        "interval_sec": interval_sec,
    }


def get_gps(workout_id: int) -> dict[str, Any] | None:
    """GeoJSON FeatureCollection; properties — скорость, каденс, пульс по точкам."""
    text = get_gps_geojson(workout_id)
    if not text:
        return None
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    if data.get("type") == "LineString":
        data = {
            "type": "FeatureCollection",
            "features": [
                {
                    "type": "Feature",
                    "geometry": data,
                    "properties": {},
                }
            ],
        }
    props = {}
    if data.get("features"):
        props = (data["features"][0] or {}).get("properties") or {}
    if not props.get("elapsed_sec"):
        sensors = get_workout_sensors_raw(workout_id)
        hr = get_heart_rate_data(workout_id)
        if sensors or hr:
            data = enrich_geojson_from_sensors(data, sensors, hr)
    return data


def get_heart_rate(workout_id: int) -> list[dict[str, Any]]:
    """Алиас для обратной совместимости (+ elapsed_sec для Streamlit)."""
    return [
        {**point, "elapsed_sec": point["seconds"]}
        for point in get_heart_rate_data(workout_id)
    ]


def _is_fit_protected(row: dict[str, Any]) -> bool:
    return str(row.get("data_source") or "") == CARDIO_SOURCE_FIT


def _finalize_workout_dict(rec: dict[str, Any]) -> dict[str, Any]:
    rec["speed_kmh"] = calc_speed_kmh(rec.get("distance_km"), rec.get("duration_sec"))
    rec["pace_min_km"] = calc_pace_min_km(rec.get("distance_km"), rec.get("duration_sec"))
    rec["pace_sec_100m"] = calc_pace_sec_100m(rec.get("distance_km"), rec.get("duration_sec"))
    if rec.get("type") == CARDIO_DB_BIKE:
        rec["swolf"] = None
        conn = get_db()
        try:
            enrich_bike_workout(rec, conn=conn)
        finally:
            conn.close()
    if rec.get("calories") is None:
        rec["calories"] = rec.get("calories_chest") or rec.get("calories_watch")
    return rec


def attach_source_summary(rec: dict[str, Any]) -> dict[str, Any]:
    """Compact resolver summary for API responses."""
    try:
        from backend.services import source_resolver_service

        summary = source_resolver_service.resolve_source_summary(int(rec["id"]))
        if summary:
            rec["source_summary"] = summary
    except Exception:
        pass
    return rec


def get_workout_by_id(workout_id: int) -> dict[str, Any] | None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (int(workout_id), get_current_user_id()),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    df = pd.DataFrame([dict(row)])
    df = normalize_cardio_date_column(df, "date")
    rec = records_from_df(df)[0]
    return attach_source_summary(_finalize_workout_dict(rec))


def update_workout(workout_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    """Частичное обновление кардио; FIT-тренировки сохраняют data_source и дочерние таблицы."""
    existing = get_workout_by_id(workout_id)
    if existing is None:
        return None

    is_fit = _is_fit_protected(existing)
    if is_fit:
        for blocked in IMMUTABLE_ON_FIT:
            if blocked in payload and payload.get(blocked) != existing.get(blocked):
                logger.warning(
                    "Ignoring %s update for FIT workout id=%s (data_source=%s)",
                    blocked,
                    workout_id,
                    existing.get("data_source"),
                )
        if payload.get("data_source") is not None and payload.get("data_source") != existing.get(
            "data_source"
        ):
            logger.warning(
                "Attempt to overwrite data_source on FIT workout id=%s — ignored",
                workout_id,
            )

    updates: dict[str, Any] = {}
    if "date" in payload and payload["date"] is not None:
        date_str = str(payload["date"])[:10]
        if is_future_workout_date(date_str):
            raise ValueError("Дата тренировки не может быть в будущем")
        updates["date"] = date_str

    if "type" in payload and payload["type"] is not None and not is_fit:
        updates["type"] = str(payload["type"]).strip()

    if "distance_km" in payload and payload["distance_km"] is not None:
        updates["distance_km"] = float(payload["distance_km"])

    if "duration_min" in payload or "duration_sec" in payload:
        dm = int(payload.get("duration_min") or 0)
        ds = int(payload.get("duration_sec") or 0)
        updates["duration_sec"] = dm * 60 + ds

    for key in ("avg_hr", "max_hr", "calories_chest", "calories_watch", "swolf"):
        if key in payload:
            updates[key] = payload[key]

    if "calories_chest" in updates or "calories_watch" in updates:
        chest = updates.get("calories_chest", existing.get("calories_chest"))
        watch = updates.get("calories_watch", existing.get("calories_watch"))
        updates["calories"] = chest or watch

    allowed = {
        k: v
        for k, v in updates.items()
        if k in ALLOWED_UPDATE_FIELDS and (not is_fit or k not in IMMUTABLE_ON_FIT)
    }
    if not allowed:
        return existing

    set_sql = ", ".join(f"{col} = ?" for col in allowed)
    params = [*allowed.values(), int(workout_id)]
    conn = get_db()
    try:
        cur = conn.execute(
            f"UPDATE cardio_workouts SET {set_sql} WHERE id = ?",
            params,
        )
        conn.commit()
        if cur.rowcount == 0:
            return None
        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "cardio_workouts", "id", workout_id)
        conn.commit()
    finally:
        conn.close()

    return get_workout_by_id(workout_id)


def create_workout(payload: dict[str, Any]) -> int:
    """Ручное сохранение кардио. Возвращает id строки cardio_workouts."""
    date_str = str(payload["date"])[:10]
    if is_future_workout_date(date_str):
        return 0
    cardio_type = payload["type"]
    total_sec = int(payload.get("duration_min") or 0) * 60 + int(payload.get("duration_sec") or 0)
    calories_chest = payload.get("calories_chest")
    calories_watch = payload.get("calories_watch")
    calories = calories_chest or calories_watch
    conn = get_db()
    try:
        if cardio_type == CARDIO_DB_BIKE and _bike_has_fit(conn, date_str):
            row = conn.execute(
                """
                SELECT id FROM cardio_workouts
                WHERE date = ? AND type = ? AND data_source = ?
                ORDER BY id DESC LIMIT 1
                """,
                (date_str, cardio_type, CARDIO_SOURCE_FIT),
            ).fetchone()
            return int(row[0]) if row else 0
        conn.execute(
            "DELETE FROM cardio_workouts WHERE date = ? AND type = ? AND user_id = ?",
            (date_str, cardio_type, get_current_user_id()),
        )
        cur = conn.execute(
            """
            INSERT INTO cardio_workouts (
                date, type, distance_km, duration_sec, avg_hr, max_hr, calories,
                calories_chest, calories_watch, swolf, data_source, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                date_str,
                cardio_type,
                payload.get("distance_km"),
                total_sec,
                payload.get("avg_hr"),
                payload.get("max_hr"),
                calories,
                calories_chest,
                calories_watch,
                payload.get("swolf"),
                CARDIO_SOURCE_MANUAL,
                get_current_user_id(),
            ),
        )
        conn.commit()
        workout_id = int(cur.lastrowid)
        from backend.services.forma_sync.change_tracker import mark_row_pending_on_insert

        mark_row_pending_on_insert(conn, "cardio_workouts", "id", workout_id)
        conn.commit()
        from backend.services import source_resolver_service

        source_resolver_service.register_manual_workout(
            workout_id,
            {
                "date": date_str,
                "type": cardio_type,
                "distance_km": payload.get("distance_km"),
                "duration_sec": total_sec,
                "calories_chest": calories_chest,
                "calories_watch": calories_watch,
            },
        )
        return workout_id
    finally:
        conn.close()


def workouts_with_heart_rate(workout_ids: list[int]) -> list[int]:
    """Id тренировок, у которых есть точки пульса."""
    if not workout_ids:
        return []
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(workout_ids))
        rows = conn.execute(
            f"""
            SELECT DISTINCT cardio_workout_id
            FROM workout_heart_rate
            WHERE cardio_workout_id IN ({placeholders})
            """,
            workout_ids,
        ).fetchall()
    finally:
        conn.close()
    return [int(r[0]) for r in rows]


def workouts_with_sensors(workout_ids: list[int]) -> list[int]:
    if not workout_ids:
        return []
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(workout_ids))
        rows = conn.execute(
            f"""
            SELECT DISTINCT cardio_workout_id
            FROM workout_sensors
            WHERE cardio_workout_id IN ({placeholders})
            """,
            workout_ids,
        ).fetchall()
    finally:
        conn.close()
    return [int(r[0]) for r in rows]


def workouts_with_gps(workout_ids: list[int]) -> list[int]:
    """Id тренировок с GPS-треком."""
    if not workout_ids:
        return []
    conn = get_db()
    try:
        placeholders = ",".join("?" * len(workout_ids))
        rows = conn.execute(
            f"""
            SELECT DISTINCT cardio_workout_id
            FROM gps_tracks
            WHERE cardio_workout_id IN ({placeholders})
              AND track_data IS NOT NULL AND TRIM(track_data) != ''
            """,
            workout_ids,
        ).fetchall()
    finally:
        conn.close()
    return [int(r[0]) for r in rows]


def delete_workout(workout_id: int) -> bool:
    """Удаление кардио и связанных HR/GPS."""
    wid = int(workout_id)
    conn = get_db()
    try:
        conn.execute(
            "DELETE FROM workout_heart_rate WHERE cardio_workout_id = ?",
            (wid,),
        )
        conn.execute(
            "DELETE FROM workout_sensors WHERE cardio_workout_id = ?",
            (wid,),
        )
        conn.execute("DELETE FROM gps_tracks WHERE cardio_workout_id = ?", (wid,))
        cur = conn.execute(
            "DELETE FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (wid, get_current_user_id()),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
