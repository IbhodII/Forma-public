# -*- coding: utf-8 -*-
"""
Импорт велотренировок из FIT-файлов в workouts.db.

parse_fit_file -> (metadata, heart_rate_points, track_points)
save_workout_to_db -> cardio_workouts + workout_heart_rate + workout_sensors + gps_tracks

Запуск:
    python fit_importer.py --folder "E:/fit activity"
    python fit_importer.py --reimport
"""
from __future__ import annotations

import argparse
import json
import re
import sqlite3
import statistics
import sys
from datetime import datetime

from utils.date_guard import is_future_workout_date
from pathlib import Path
from typing import Any, Callable

from database.connection import open_db
from database.db_utils import (
    DB_PATH,
    cleanup_stale_fit_bike_duplicates,
    delete_cardio_workout_cascade,
    ensure_fit_import_schema,
    is_file_imported,
    mark_file_imported,
    migrate_fit_calories_watch_to_chest,
    upsert_cardio_workout,
)
from utils.bike_track import build_enriched_geojson
from utils.constants import CARDIO_SOURCE_FIT
from utils.fit_coords import normalize_lon_lat

from utils.fit_folder_config import (
    DEFAULT_FIT_FOLDER,
    FALLBACK_FIT_FOLDER,
    PROJECT_ROOT,
    get_fit_folder_path,
    resolve_fit_folder,
)
FIT_SOURCE = "fit_coospo"
CARDIO_TYPE_BIKE = "вело"
# Оценка ккал, если в FIT нет total_calories / calories
DEFAULT_FIT_WEIGHT_KG = 80.0
KCAL_ESTIMATE_FACTOR = 0.05

NO_FIT_FILES_MESSAGE = (
    "Не найдено FIT-файлов в папке. Подключите велокомпьютер и скопируйте файлы"
)

FILENAME_DATE_RE = re.compile(r"^(?P<date>\d{8})(?P<time>\d{6}|\d{4})?")


class FitImportError(Exception):
    """Папка FIT недоступна, не существует или не содержит .fit файлов."""


def _ms_to_kmh(speed_ms: float | None) -> float | None:
    if speed_ms is None:
        return None
    try:
        return round(float(speed_ms) * 3.6, 2)
    except (TypeError, ValueError):
        return None


def _to_datetime(val: Any) -> datetime | None:
    if val is None:
        return None
    if isinstance(val, datetime):
        return val
    try:
        return datetime.fromisoformat(str(val).replace("Z", "+00:00"))
    except ValueError:
        return None


def _normalize_dt(dt: datetime) -> datetime:
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt.replace(microsecond=0)


def _iso_local(dt: datetime) -> str:
    return _normalize_dt(dt).isoformat(sep=" ")


def _session_seconds(session: dict[str, Any], key: str) -> int | None:
    raw = session.get(key)
    if raw is None:
        return None
    if hasattr(raw, "total_seconds"):
        sec = int(raw.total_seconds())
    else:
        try:
            sec = int(float(raw))
        except (TypeError, ValueError):
            return None
    return sec if sec > 0 else None


def _int_kcal(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        val = int(float(raw))
        return val if val > 0 else None
    except (TypeError, ValueError):
        return None


def _estimate_calories_chest(
    avg_hr: int | None,
    duration_sec: int | None,
    *,
    weight_kg: float = DEFAULT_FIT_WEIGHT_KG,
) -> int | None:
    """calories ≈ avg_hr * weight_kg * (duration_h) * 0.05"""
    if avg_hr is None or duration_sec is None or duration_sec <= 0:
        return None
    try:
        kcal = float(avg_hr) * float(weight_kg) * (float(duration_sec) / 3600.0) * KCAL_ESTIMATE_FACTOR
        val = int(round(kcal))
        return val if val > 0 else None
    except (TypeError, ValueError):
        return None


def _fit_calories_chest(
    session: dict[str, Any],
    laps: list[dict[str, Any]],
    record_calories: list[int],
    last_record_calories: int | None,
    *,
    avg_hr: int | None,
    duration_sec: int | None,
) -> int | None:
    """
    Ккал пульсометра: session.total_calories / calories,
    сумма по lap, затем record (max если накопительные),
    иначе оценка по пульсу.
    """
    for key in ("total_calories", "calories", "total_calories_burned", "active_calories"):
        val = _int_kcal(session.get(key))
        if val is not None:
            return val

    lap_vals: list[int] = []
    for lap in laps:
        for key in ("total_calories", "calories"):
            v = _int_kcal(lap.get(key))
            if v is not None:
                lap_vals.append(v)
    if lap_vals:
        return int(sum(lap_vals))

    if record_calories:
        if len(record_calories) >= 2 and record_calories[-1] >= record_calories[0]:
            return int(max(record_calories))
        return int(sum(record_calories))

    if last_record_calories is not None:
        return last_record_calories

    return _estimate_calories_chest(avg_hr, duration_sec)


def _fit_avg_cadence_from_records(cadences: list[int]) -> float | None:
    """Средний каденс — только среднее по record.cadence (>0)."""
    active = [int(c) for c in cadences if c and int(c) > 0]
    if not active:
        return None
    return round(statistics.mean(active), 1)


def _fit_max_hr(session: dict[str, Any], heart_rates: list[int]) -> int | None:
    """Макс. пульс — max heart_rate в record; иначе max_heart_rate в session."""
    if heart_rates:
        return int(max(heart_rates))
    for key in ("max_heart_rate", "max_hr"):
        raw = session.get(key)
        if raw is None:
            continue
        try:
            val = int(float(raw))
            if 0 < val < 250:
                return val
        except (TypeError, ValueError):
            continue
    return None


def _fit_active_duration_sec(
    session: dict[str, Any], timestamps: list[datetime]
) -> int | None:
    for key in ("total_timer_time", "total_moving_time"):
        sec = _session_seconds(session, key)
        if sec:
            return sec
    sec = _session_seconds(session, "total_elapsed_time")
    if sec:
        return sec
    if len(timestamps) >= 2:
        return int(
            (_normalize_dt(timestamps[-1]) - _normalize_dt(timestamps[0])).total_seconds()
        )
    return None


def _record_hr(fields: dict[str, Any]) -> int | None:
    for key in ("heart_rate", "heart_rate_bpm", "filtered_heart_rate"):
        if key not in fields:
            continue
        try:
            val = int(fields[key])
            return val if 0 < val < 250 else None
        except (TypeError, ValueError):
            continue
    return None


def _record_elevation(fields: dict[str, Any]) -> float | None:
    for key in ("enhanced_altitude", "altitude", "gps_altitude"):
        if key not in fields:
            continue
        try:
            return float(fields[key])
        except (TypeError, ValueError):
            continue
    return None


def _record_temperature(fields: dict[str, Any]) -> float | None:
    for key in ("temperature", "core_temperature"):
        if key not in fields:
            continue
        try:
            return round(float(fields[key]), 1)
        except (TypeError, ValueError):
            continue
    return None


def parse_fit_file(
    path: Path,
) -> tuple[dict[str, Any], list[dict[str, int]], list[dict[str, Any]]]:
    """
    Разбор FIT.
    Возвращает:
      metadata — поля для cardio_workouts
      heart_rate_points — [{"seconds": int, "heart_rate": int}, ...]
      track_points — упорядоченные точки с GPS и датчиками
    """
    try:
        import fitdecode
    except ImportError as err:
        raise ImportError("Установите fitdecode: pip install fitdecode") from err

    timestamps: list[datetime] = []
    heart_rates: list[int] = []
    first_timestamp: datetime | None = None
    last_timestamp: datetime | None = None
    by_second: dict[int, dict[str, Any]] = {}
    gps_samples: list[dict[str, Any]] = []

    speeds_ms: list[float] = []
    powers: list[int] = []
    cadences: list[int] = []
    last_distance_m: float | None = None

    session: dict[str, Any] = {}
    laps: list[dict[str, Any]] = []
    record_calories: list[int] = []
    last_record_calories: int | None = None

    with fitdecode.FitReader(str(path)) as fit:
        for frame in fit:
            if frame.frame_type != fitdecode.FIT_FRAME_DATA:
                continue

            fields = {
                f.name: f.value
                for f in frame.fields
                if f.name and f.value is not None
            }

            if frame.name == "session":
                session.update(fields)
                continue

            if frame.name == "lap":
                laps.append(fields)
                continue

            if frame.name != "record":
                continue

            ts = _to_datetime(fields.get("timestamp"))
            if ts is not None:
                ts_norm = _normalize_dt(ts)
                timestamps.append(ts_norm)
                last_timestamp = ts_norm
                if first_timestamp is None:
                    first_timestamp = ts_norm

            dist_m: float | None = None
            if "distance" in fields:
                try:
                    dist_m = float(fields["distance"])
                    last_distance_m = dist_m
                except (TypeError, ValueError):
                    dist_m = None

            seconds: int | None = None
            elapsed_f: float | None = None
            if first_timestamp is not None:
                ref_ts = last_timestamp or first_timestamp
                elapsed_f = (ref_ts - first_timestamp).total_seconds()
                if elapsed_f < 0:
                    elapsed_f = None
                elif elapsed_f is not None:
                    seconds = int(elapsed_f)

            if seconds is not None:
                slot = by_second.setdefault(seconds, {"elapsed_sec": seconds})

                hr = _record_hr(fields)
                if hr is not None:
                    heart_rates.append(hr)
                    slot["heart_rate"] = hr
                if dist_m is not None:
                    slot["distance_m"] = dist_m

                if "speed" in fields:
                    try:
                        spd = float(fields["speed"])
                        speeds_ms.append(spd)
                        kmh = _ms_to_kmh(spd)
                        if kmh is not None:
                            slot["speed_kmh"] = kmh
                    except (TypeError, ValueError):
                        pass

                if "cadence" in fields:
                    try:
                        cad = int(fields["cadence"])
                        cadences.append(cad)
                        slot["cadence"] = cad
                    except (TypeError, ValueError):
                        pass

                elev = _record_elevation(fields)
                if elev is not None:
                    slot["elevation_m"] = elev

                temp = _record_temperature(fields)
                if temp is not None:
                    slot["temperature_c"] = temp

                if "power" in fields:
                    try:
                        pwr = int(fields["power"])
                        if pwr > 0:
                            powers.append(pwr)
                            slot["power_watts"] = float(pwr)
                    except (TypeError, ValueError):
                        pass

                lat = fields.get("position_lat")
                lon = fields.get("position_long")
                if lat is not None and lon is not None:
                    lon_deg, lat_deg = normalize_lon_lat(float(lon), float(lat))
                    slot["lon"] = lon_deg
                    slot["lat"] = lat_deg
                    if elapsed_f is not None:
                        gps_samples.append(
                            {
                                "elapsed_sec": round(elapsed_f, 3),
                                "lon": lon_deg,
                                "lat": lat_deg,
                                "speed_kmh": slot.get("speed_kmh"),
                                "cadence": slot.get("cadence"),
                                "elevation_m": slot.get("elevation_m"),
                                "temperature_c": slot.get("temperature_c"),
                                "heart_rate": slot.get("heart_rate"),
                                "distance_m": slot.get("distance_m"),
                            }
                        )

            if "calories" in fields:
                rec_kcal = _int_kcal(fields["calories"])
                if rec_kcal is not None:
                    record_calories.append(rec_kcal)
                    last_record_calories = rec_kcal

    ordered_secs = sorted(by_second.keys())
    dist_by_second = {
        sec: float(by_second[sec]["distance_m"])
        for sec in ordered_secs
        if by_second[sec].get("distance_m") is not None
    }
    heart_rate_points = [
        {"seconds": sec, "heart_rate": int(by_second[sec]["heart_rate"])}
        for sec in ordered_secs
        if by_second[sec].get("heart_rate") is not None
    ]
    track_points = (
        sorted(gps_samples, key=lambda p: float(p["elapsed_sec"]))
        if len(gps_samples) >= 2
        else [
            by_second[sec]
            for sec in ordered_secs
            if by_second[sec].get("lon") is not None and by_second[sec].get("lat") is not None
        ]
    )

    start_dt = (
        first_timestamp
        or (timestamps[0] if timestamps else None)
        or _to_datetime(session.get("start_time"))
    )
    if start_dt is None:
        raise ValueError("нет timestamp в record/session")

    distance_km: float | None = None
    if last_distance_m is not None and last_distance_m > 0:
        distance_km = round(last_distance_m / 1000.0, 3)
    elif session.get("total_distance") is not None:
        try:
            distance_km = round(float(session["total_distance"]) / 1000.0, 3)
        except (TypeError, ValueError):
            pass

    duration_sec = _fit_active_duration_sec(session, timestamps)
    max_plausible = 6 * 3600
    if duration_sec and duration_sec > max_plausible:
        alt = _session_seconds(session, "total_timer_time")
        if alt and alt <= max_plausible:
            duration_sec = alt
        elif len(timestamps) >= 2:
            span = int(
                (_normalize_dt(timestamps[-1]) - _normalize_dt(timestamps[0])).total_seconds()
            )
            if span <= max_plausible:
                duration_sec = span
        if duration_sec and duration_sec > max_plausible:
            duration_sec = None

    speeds_kmh = [s for s in (_ms_to_kmh(v) for v in speeds_ms) if s is not None and s > 0]
    avg_hr = int(round(statistics.mean(heart_rates))) if heart_rates else None
    max_hr = _fit_max_hr(session, heart_rates)

    avg_speed: float | None = None
    if distance_km and duration_sec and duration_sec > 0:
        avg_speed = round(float(distance_km) / (duration_sec / 3600.0), 2)
    elif speeds_kmh:
        avg_speed = round(statistics.mean(speeds_kmh), 2)
    max_speed = round(max(speeds_kmh), 2) if speeds_kmh else None
    avg_power = int(round(statistics.mean(powers))) if powers else None
    max_power = max(powers) if powers else None
    avg_cadence = _fit_avg_cadence_from_records(cadences)
    calories_chest = _fit_calories_chest(
        session,
        laps,
        record_calories,
        last_record_calories,
        avg_hr=avg_hr,
        duration_sec=duration_sec,
    )

    start_time = _iso_local(start_dt)
    date_str = _normalize_dt(start_dt).date().isoformat()

    metadata: dict[str, Any] = {
        "date": date_str,
        "start_time": start_time,
        "duration_sec": duration_sec,
        "distance_km": distance_km,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "avg_speed_kmh": avg_speed,
        "max_speed_kmh": max_speed,
        "avg_power": avg_power,
        "max_power": max_power,
        "avg_cadence": avg_cadence,
        "calories_chest": calories_chest,
        "calories_watch": None,
        "calories": calories_chest,
        "dist_by_second": dist_by_second,
        "source_file": path.name,
        "_by_second": by_second,
    }
    return metadata, heart_rate_points, track_points


def _refresh_fit_bike_summary_from_hr(conn: sqlite3.Connection) -> int:
    """
    После импорта: для FIT-вело без max_hr/avg_hr/ккал — дополнить из workout_heart_rate.
    """
    rows = conn.execute(
        """
        SELECT id, duration_sec, avg_hr, max_hr, calories_chest
        FROM cardio_workouts
        WHERE type = ? AND start_time IS NOT NULL
          AND TRIM(COALESCE(start_time, '')) != ''
        """,
        (CARDIO_TYPE_BIKE,),
    ).fetchall()
    updated = 0
    for row in rows:
        wid = int(row[0])
        duration_sec = row[1]
        avg_hr = row[2]
        max_hr = row[3]
        calories_chest = row[4]

        hr_rows = conn.execute(
            """
            SELECT heart_rate FROM workout_heart_rate
            WHERE cardio_workout_id = ? AND heart_rate > 0
            """,
            (wid,),
        ).fetchall()
        hrs = [int(r[0]) for r in hr_rows]
        if hrs:
            if not avg_hr:
                avg_hr = int(round(statistics.mean(hrs)))
            if not max_hr:
                max_hr = max(hrs)

        if calories_chest is None or int(calories_chest or 0) <= 0:
            calories_chest = _estimate_calories_chest(
                int(avg_hr) if avg_hr else None,
                int(duration_sec) if duration_sec else None,
            )

        if avg_hr != row[2] or max_hr != row[3] or calories_chest != row[4]:
            calories = calories_chest
            conn.execute(
                """
                UPDATE cardio_workouts SET
                    avg_hr = COALESCE(?, avg_hr),
                    max_hr = COALESCE(?, max_hr),
                    calories_chest = COALESCE(?, calories_chest),
                    calories = COALESCE(?, calories)
                WHERE id = ?
                """,
                (avg_hr, max_hr, calories_chest, calories, wid),
            )
            updated += 1
    return updated


def _write_cardio_summary_columns(
    conn: sqlite3.Connection,
    workout_id: int,
    metadata: dict[str, Any],
) -> None:
    """Явно обновляет сводные поля cardio_workouts после импорта FIT."""
    calories_chest = metadata.get("calories_chest")
    calories_watch = metadata.get("calories_watch")
    calories = metadata.get("calories") or calories_chest or calories_watch
    conn.execute(
        """
        UPDATE cardio_workouts SET
            avg_hr = ?,
            max_hr = ?,
            avg_cadence = ?,
            calories_chest = ?,
            calories_watch = ?,
            calories = ?
        WHERE id = ?
        """,
        (
            metadata.get("avg_hr"),
            metadata.get("max_hr"),
            metadata.get("avg_cadence"),
            calories_chest,
            calories_watch,
            calories,
            int(workout_id),
        ),
    )


def _delete_workout_hr_gps(conn: sqlite3.Connection, workout_id: int) -> None:
    conn.execute(
        "DELETE FROM workout_heart_rate WHERE cardio_workout_id = ?",
        (int(workout_id),),
    )
    conn.execute(
        "DELETE FROM workout_sensors WHERE cardio_workout_id = ?",
        (int(workout_id),),
    )
    conn.execute(
        "DELETE FROM gps_tracks WHERE cardio_workout_id = ?",
        (int(workout_id),),
    )


def _insert_workout_sensors(
    conn: sqlite3.Connection,
    workout_id: int,
    by_second: dict[int, dict[str, Any]],
) -> None:
    rows: list[tuple[Any, ...]] = []
    for sec in sorted(by_second.keys()):
        slot = by_second[sec]
        if not any(
            slot.get(k) is not None
            for k in ("speed_kmh", "cadence", "elevation_m", "temperature_c", "power_watts")
        ):
            continue
        rows.append(
            (
                workout_id,
                int(sec),
                slot.get("speed_kmh"),
                slot.get("cadence"),
                slot.get("elevation_m"),
                slot.get("temperature_c"),
                slot.get("power_watts"),
            )
        )
    if not rows:
        return
    conn.executemany(
        """
        INSERT INTO workout_sensors (
            cardio_workout_id, elapsed_sec, speed_kmh, cadence, elevation_m,
            temperature_c, power_watts
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def save_workout_to_db(
    conn: sqlite3.Connection,
    metadata: dict[str, Any],
    heart_rate_points: list[dict[str, int]],
    track_points: list[dict[str, Any]],
    *,
    file_name: str,
) -> int:
    """Upsert cardio_workouts, затем пульс и GPS (с предварительным DELETE)."""
    ensure_fit_import_schema()

    if is_future_workout_date(metadata.get("date")):
        raise ValueError(
            f"Дата тренировки в будущем: {metadata.get('date')}"
        )

    workout_id = upsert_cardio_workout(
        metadata["date"],
        CARDIO_TYPE_BIKE,
        start_time=metadata["start_time"],
        distance_km=metadata.get("distance_km"),
        duration_sec=metadata.get("duration_sec"),
        avg_hr=metadata.get("avg_hr"),
        max_hr=metadata.get("max_hr"),
        avg_speed_kmh=metadata.get("avg_speed_kmh"),
        max_speed_kmh=metadata.get("max_speed_kmh"),
        avg_power=metadata.get("avg_power"),
        max_power=metadata.get("max_power"),
        avg_cadence=metadata.get("avg_cadence"),
        calories_chest=metadata.get("calories_chest"),
        calories_watch=metadata.get("calories_watch"),
        swolf=None,
        data_source=CARDIO_SOURCE_FIT,
        conn=conn,
    )
    workout_id = int(workout_id)
    conn.execute(
        "UPDATE cardio_workouts SET swolf = NULL WHERE id = ? AND type = ?",
        (workout_id, CARDIO_TYPE_BIKE),
    )

    _delete_workout_hr_gps(conn, workout_id)

    dist_by_second: dict[int, float] = metadata.get("dist_by_second") or {}
    if heart_rate_points:
        rows = [
            (
                workout_id,
                int(p["seconds"]),
                int(p["heart_rate"]),
                dist_by_second.get(int(p["seconds"])),
            )
            for p in heart_rate_points
        ]
        conn.executemany(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, distance_m
            ) VALUES (?, ?, ?, ?)
            """,
            rows,
        )

    by_second_all: dict[int, dict[str, Any]] = dict(metadata.pop("_by_second", None) or {})
    _insert_workout_sensors(conn, workout_id, by_second_all)

    geo = build_enriched_geojson(track_points)
    if geo and metadata.get("start_time"):
        geo["features"][0]["properties"]["start_time"] = metadata["start_time"]
    if geo:
        track_json = json.dumps(geo, ensure_ascii=False)
        now = datetime.now().isoformat(timespec="seconds")
        existing = conn.execute(
            "SELECT id FROM gps_tracks WHERE cardio_workout_id = ?",
            (workout_id,),
        ).fetchone()
        if existing:
            conn.execute(
                """
                UPDATE gps_tracks SET
                    source = ?, activity_date = ?, file_name = ?,
                    track_data = ?, created_at = ?
                WHERE cardio_workout_id = ?
                """,
                (
                    FIT_SOURCE,
                    str(metadata["date"])[:10],
                    file_name,
                    track_json,
                    now,
                    workout_id,
                ),
            )
        else:
            conn.execute(
                """
                INSERT INTO gps_tracks (
                    source, activity_date, file_name, track_data, created_at, cardio_workout_id
                ) VALUES (?, ?, ?, ?, ?, ?)
                """,
                (
                    FIT_SOURCE,
                    str(metadata["date"])[:10],
                    file_name,
                    track_json,
                    now,
                    workout_id,
                ),
            )

    _write_cardio_summary_columns(conn, workout_id, metadata)
    from backend.services.bike_power_service import apply_power_from_import

    apply_power_from_import(
        conn,
        workout_id,
        by_second=by_second_all,
        metadata=metadata,
    )
    try:
        from backend.services import source_resolver_service

        source_resolver_service.register_fit_import(
            workout_id,
            metadata,
            has_hr=bool(heart_rate_points),
            has_gps=bool(geo),
            has_sensors=bool(by_second_all),
            file_name=file_name,
        )
    except Exception:
        pass
    return workout_id


def _fit_import_still_has_workout(conn: sqlite3.Connection, file_name: str) -> bool:
    """Файл помечен импортированным и соответствующая тренировка ещё есть в БД."""
    row = conn.execute(
        """
        SELECT g.cardio_workout_id FROM gps_tracks g
        WHERE g.file_name = ?
        LIMIT 1
        """,
        (file_name,),
    ).fetchone()
    if row and row[0] is not None:
        exists = conn.execute(
            "SELECT 1 FROM cardio_workouts WHERE id = ?",
            (int(row[0]),),
        ).fetchone()
        return exists is not None

    stem = Path(file_name).stem
    if len(stem) == 14 and stem.isdigit():
        start_time = (
            f"{stem[0:4]}-{stem[4:6]}-{stem[6:8]} "
            f"{stem[8:10]}:{stem[10:12]}:{stem[12:14]}"
        )
        row = conn.execute(
            """
            SELECT 1 FROM cardio_workouts
            WHERE type = ? AND start_time = ?
            LIMIT 1
            """,
            (CARDIO_TYPE_BIKE, start_time),
        ).fetchone()
        return row is not None
    return False


def _delete_existing_for_reimport(
    conn: sqlite3.Connection,
    *,
    file_name: str,
    start_time: str | None,
) -> None:
    """Удаляет старую тренировку перед повторным импортом того же FIT."""
    ids: set[int] = set()
    for (wid,) in conn.execute(
        """
        SELECT DISTINCT cardio_workout_id FROM gps_tracks
        WHERE file_name = ? AND cardio_workout_id IS NOT NULL
        """,
        (file_name,),
    ).fetchall():
        if wid is not None:
            ids.add(int(wid))
    if start_time:
        row = conn.execute(
            """
            SELECT id FROM cardio_workouts
            WHERE type = ? AND start_time = ?
            """,
            (CARDIO_TYPE_BIKE, start_time),
        ).fetchone()
        if row:
            ids.add(int(row[0]))
    for wid in ids:
        delete_cardio_workout_cascade(conn, wid)


def _filename_date_start_time(file_name: str) -> tuple[str | None, str | None]:
    """Fast metadata from names like 20250619... or 20250619143000..."""
    match = FILENAME_DATE_RE.match(Path(file_name).stem)
    if not match:
        return None, None
    raw_date = match.group("date")
    raw_time = match.group("time")
    try:
        dt = datetime.strptime(raw_date, "%Y%m%d")
    except ValueError:
        return None, None
    date_str = dt.strftime("%Y-%m-%d")
    if not raw_time:
        return date_str, None
    if len(raw_time) == 4:
        raw_time = f"{raw_time}00"
    try:
        t = datetime.strptime(raw_time, "%H%M%S")
    except ValueError:
        return date_str, None
    return date_str, f"{date_str} {t.strftime('%H:%M:%S')}"


def _fit_import_has_existing_date(conn: sqlite3.Connection, workout_date: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM cardio_workouts cw
        WHERE cw.type = ?
          AND cw.date = ?
          AND (
            cw.data_source = ?
            OR EXISTS (
              SELECT 1
              FROM gps_tracks g
              WHERE g.cardio_workout_id = cw.id
                AND g.source = ?
            )
          )
        LIMIT 1
        """,
        (CARDIO_TYPE_BIKE, workout_date, CARDIO_SOURCE_FIT, FIT_SOURCE),
    ).fetchone()
    return row is not None


def _fit_import_has_existing_start_time(conn: sqlite3.Connection, start_time: str) -> bool:
    row = conn.execute(
        """
        SELECT 1
        FROM cardio_workouts cw
        WHERE cw.type = ?
          AND cw.start_time = ?
          AND (
            cw.data_source = ?
            OR EXISTS (
              SELECT 1
              FROM gps_tracks g
              WHERE g.cardio_workout_id = cw.id
                AND g.source = ?
            )
          )
        LIMIT 1
        """,
        (CARDIO_TYPE_BIKE, start_time, CARDIO_SOURCE_FIT, FIT_SOURCE),
    ).fetchone()
    return row is not None


def list_fit_files(folder: Path) -> list[Path]:
    """
    Проверяет папку и возвращает список .fit файлов.
    Учитывает путь из get_fit_folder_path (в т.ч. user_profile.fit_folder_path).
    """
    folder = folder.resolve()
    if not folder.exists():
        raise FitImportError(
            f"Папка с FIT-файлами не найдена: {folder}. "
            "Укажите путь в Настройки → Интеграции."
        )
    if not folder.is_dir():
        raise FitImportError(f"Указанный путь не является папкой: {folder}")
    try:
        fit_files = sorted({*folder.rglob("*.fit"), *folder.rglob("*.FIT")})
    except OSError as exc:
        raise FitImportError(
            f"Нет доступа к папке: {folder}. Проверьте путь в Настройки → Интеграции."
        ) from exc
    if not fit_files:
        raise FitImportError(NO_FIT_FILES_MESSAGE)
    return fit_files


def _emit_fit_progress(
    on_progress: Callable[[dict[str, int]], None] | None,
    *,
    files_total: int,
    files_processed: int,
    stats: dict[str, int],
) -> None:
    if on_progress is None:
        return
    on_progress(
        {
            "files_total": files_total,
            "files_processed": files_processed,
            "imported": int(stats.get("imported") or 0),
            "repaired": int(stats.get("repaired") or 0),
            "skipped": int(stats.get("skipped") or 0),
            "errors": int(stats.get("errors") or 0),
            "files_seen": int(stats.get("files_seen") or 0),
            "skipped_by_filename_date": int(stats.get("skipped_by_filename_date") or 0),
            "parsed_files": int(stats.get("parsed_files") or 0),
            "imported_files": int(stats.get("imported_files") or 0),
            "duplicates_skipped": int(stats.get("duplicates_skipped") or 0),
        }
    )


def import_fit_folder(
    folder: Path,
    *,
    reimport: bool = False,
    on_progress: Callable[[dict[str, int]], None] | None = None,
) -> dict[str, int]:
    ensure_fit_import_schema()
    prep = open_db(attach=True)
    try:
        from database.shared_schema import ensure_shared_schema

        ensure_shared_schema(prep)
        prep.commit()
    finally:
        prep.close()

    stats = {
        "files": 0,
        "imported": 0,
        "skipped": 0,
        "repaired": 0,
        "errors": 0,
        "files_seen": 0,
        "skipped_by_filename_date": 0,
        "parsed_files": 0,
        "imported_files": 0,
        "duplicates_skipped": 0,
    }
    fit_files = list_fit_files(folder)
    files_total = len(fit_files)
    _emit_fit_progress(on_progress, files_total=files_total, files_processed=0, stats=stats)

    conn = open_db(attach=True)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        for path in fit_files:
            stats["files"] += 1
            stats["files_seen"] += 1
            name = path.name
            was_repair = False

            if not reimport and is_file_imported(name, FIT_SOURCE, conn=conn):
                if _fit_import_still_has_workout(conn, name):
                    stats["skipped"] += 1
                    stats["duplicates_skipped"] += 1
                    print(f"[SKIP] {name} (уже в imported_files)")
                    _emit_fit_progress(
                        on_progress,
                        files_total=files_total,
                        files_processed=int(stats["files"]),
                        stats=stats,
                    )
                    continue
                was_repair = True
                print(f"[REPAIR] {name} (помечен импортированным, но тренировки нет в БД)")

            filename_date, filename_start_time = _filename_date_start_time(name)
            if (
                not reimport
                and not was_repair
                and filename_date
                and filename_start_time
                and _fit_import_has_existing_date(conn, filename_date)
                and _fit_import_has_existing_start_time(conn, filename_start_time)
            ):
                stats["skipped"] += 1
                stats["skipped_by_filename_date"] += 1
                stats["duplicates_skipped"] += 1
                print(
                    f"[SKIP] {name} (уже есть FIT-велотренировка "
                    f"со стартом {filename_start_time})"
                )
                _emit_fit_progress(
                    on_progress,
                    files_total=files_total,
                    files_processed=int(stats["files"]),
                    stats=stats,
                )
                continue

            try:
                stats["parsed_files"] += 1
                metadata, heart_rate_points, track_points = parse_fit_file(path)
            except Exception as err:
                stats["errors"] += 1
                print(f"[ERROR] {name}: {err}")
                _emit_fit_progress(
                    on_progress,
                    files_total=files_total,
                    files_processed=int(stats["files"]),
                    stats=stats,
                )
                continue

            if is_future_workout_date(metadata.get("date")):
                stats["skipped"] += 1
                print(f"[SKIP] {name}: дата в будущем ({metadata.get('date')})")
                _emit_fit_progress(
                    on_progress,
                    files_total=files_total,
                    files_processed=int(stats["files"]),
                    stats=stats,
                )
                continue

            if reimport:
                _delete_existing_for_reimport(
                    conn,
                    file_name=name,
                    start_time=metadata.get("start_time"),
                )

            workout_id = save_workout_to_db(
                conn,
                metadata,
                heart_rate_points,
                track_points,
                file_name=name,
            )
            mark_file_imported(name, FIT_SOURCE, conn=conn)
            conn.commit()

            hr_saved = conn.execute(
                "SELECT COUNT(*) FROM workout_heart_rate WHERE cardio_workout_id = ?",
                (workout_id,),
            ).fetchone()[0]
            gps_saved = conn.execute(
                "SELECT COUNT(*) FROM gps_tracks WHERE cardio_workout_id = ?",
                (workout_id,),
            ).fetchone()[0]

            if was_repair:
                stats["repaired"] += 1
            else:
                stats["imported"] += 1
                stats["imported_files"] += 1
            print(
                f"[OK] {name} -> id={workout_id} ({metadata['start_time']}, "
                f"{metadata.get('distance_km') or 0} км, "
                f"каденс={metadata.get('avg_cadence')}, "
                f"ккал={metadata.get('calories_chest')}, "
                f"пульс ср/макс={metadata.get('avg_hr')}/{metadata.get('max_hr')}, "
                f"точек HR: {len(heart_rate_points)} -> {hr_saved} в БД, "
                f"GPS: {len(track_points)} точек, track={'да' if gps_saved else 'нет'})"
            )
            _emit_fit_progress(
                on_progress,
                files_total=files_total,
                files_processed=int(stats["files"]),
                stats=stats,
            )
    finally:
        conn.close()

    try:
        removed = cleanup_stale_fit_bike_duplicates()
        if removed:
            print(f"[CLEANUP] Удалено устаревших дубликатов FIT: {removed}")
    except Exception as post_err:
        has_imported_data = (
            stats.get("imported", 0) > 0
            or stats.get("repaired", 0) > 0
            or stats.get("skipped", 0) > 0
        )
        if not has_imported_data:
            raise
        print(f"[WARN] FIT post-import cleanup skipped: {post_err}", flush=True)

    if stats.get("imported", 0) > 0 or stats.get("repaired", 0) > 0 or reimport:
        conn = open_db(attach=True)
        try:
            try:
                moved = migrate_fit_calories_watch_to_chest(conn)
                refreshed = _refresh_fit_bike_summary_from_hr(conn)
                print(
                    f"[SYNC] Ккал FIT→пульсометр: {moved}, "
                    f"обновлено сводок FIT: {refreshed}"
                )
            except Exception as post_err:
                print(f"[WARN] FIT post-import sync skipped: {post_err}", flush=True)
        finally:
            conn.close()

    return stats


def run_import(
    folder_path: Path | str | None = None,
    *,
    reimport: bool = False,
    on_progress: Callable[[dict[str, int]], None] | None = None,
) -> dict[str, int]:
    """
    Импорт велотренировок из FIT (как CLI без argparse).
    Синхронный вызов; при необходимости можно запускать в фоновом потоке/Celery.

    Args:
        folder_path: каталог с .fit; None — get_fit_folder_path() (настройки / дефолт).
        reimport: повторный импорт уже учтённых файлов.

    Returns:
        Статистика import_fit_folder (files, imported, skipped, errors).
    """
    folder = get_fit_folder_path(folder_path)
    print(f"Импорт FIT запущен: {folder}", flush=True)
    stats = import_fit_folder(folder, reimport=reimport, on_progress=on_progress)
    print(
        f"Импорт FIT завершён: imported={stats.get('imported', 0)}, "
        f"repaired={stats.get('repaired', 0)}, "
        f"skipped={stats.get('skipped', 0)}, errors={stats.get('errors', 0)}, "
        f"files_seen={stats.get('files_seen', stats.get('files', 0))}, "
        f"skipped_by_filename_date={stats.get('skipped_by_filename_date', 0)}, "
        f"parsed_files={stats.get('parsed_files', 0)}, "
        f"imported_files={stats.get('imported_files', stats.get('imported', 0))}, "
        f"duplicates_skipped={stats.get('duplicates_skipped', 0)}",
        flush=True,
    )
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Импорт FIT -> workouts.db")
    parser.add_argument(
        "--folder",
        type=Path,
        default=None,
        help="Папка с .fit; по умолчанию — из настроек или E:\\fit activity / ./fit_files",
    )
    parser.add_argument("--reimport", action="store_true")
    args = parser.parse_args()

    folder = get_fit_folder_path(args.folder)

    print(f"База: {DB_PATH.resolve()}")
    print(f"FIT:  {folder}")

    try:
        stats = run_import(args.folder, reimport=args.reimport)
    except FitImportError as err:
        print(f"[ERROR] {err}", file=sys.stderr)
        return 1

    print(
        f"\nИмпортировано {stats['imported']}, пропущено {stats['skipped']}, "
        f"ошибок {stats['errors']}"
    )
    return 0 if stats["errors"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
