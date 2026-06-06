# -*- coding: utf-8 -*-
"""Привязка записей polar_pending_workouts к тренировкам в workouts.db."""
from __future__ import annotations

import json
import logging
import re
import sqlite3
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from database.db_utils import upsert_gps_track
from import_polar_historical import (
    HR_SOURCE_CARDIO,
    HR_SOURCE_STRENGTH,
    _dedupe_hr_points,
    _extract_hr_from_data,
    _extract_track_points_from_data,
    _field_empty,
    insert_hr_samples_if_empty,
    workout_has_hr_samples,
)
from utils.bike_track import build_enriched_geojson
from utils.constants import CARDIO_SOURCE_POLAR

POLAR_PENDING_TYPES = frozenset({"бег", "вело", "бассейн", "силовая"})
MANUAL_UPLOAD_PREFIX = "upload:"
GPS_SOURCE = CARDIO_SOURCE_POLAR

logger = logging.getLogger(__name__)


MIN_REASONABLE_HR = 25
MAX_REASONABLE_HR = 240
MIN_HR_LIKE_VALUES = 3
MIN_HR_LIKE_RATIO = 0.5
ACCESSLINK_EXPLICIT_HR_SAMPLE_TYPES = frozenset({"1", "HEART_RATE", "HEART RATE"})


def _normalize_hr_value(val: Any) -> int | None:
    if val is None:
        return None
    try:
        hr = int(round(float(val)))
        return hr if MIN_REASONABLE_HR <= hr <= MAX_REASONABLE_HR else None
    except (TypeError, ValueError):
        return None


def _parse_pt_duration_to_sec(text: str) -> int | None:
    match = re.match(
        r"^PT(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+(?:\.\d+)?)S)?$",
        str(text).strip(),
        re.I,
    )
    if not match:
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = float(match.group("seconds") or 0)
    return int(hours * 3600 + minutes * 60 + seconds)


def _has_heart_rate_summary(data: dict[str, Any]) -> bool:
    hr = data.get("heart-rate") or data.get("heart_rate") or data.get("heartRate")
    return isinstance(hr, dict) and bool(hr)


def _accesslink_sample_type(block: dict[str, Any]) -> str:
    for key in ("sample-type", "sample_type", "type"):
        if key in block and block[key] is not None:
            return str(block[key]).upper()
    return ""


def _accesslink_raw_values(block: dict[str, Any]) -> list[str]:
    raw = block.get("data")
    if not isinstance(raw, str) or not raw.strip():
        return []
    return [part.strip() for part in raw.split(",")]


def _accesslink_recording_rate(block: dict[str, Any], sample_type: str) -> int:
    raw_rate = block.get("recording-rate")
    if raw_rate is None:
        raw_rate = block.get("recording_rate")
    if raw_rate is None:
        logger.info(
            "Polar AccessLink sample has no recording-rate; using 1 sec fallback "
            "(sample_type=%s)",
            sample_type or "unknown",
        )
        return 1
    try:
        step = int(raw_rate)
    except (TypeError, ValueError):
        logger.warning(
            "Polar AccessLink sample has invalid recording-rate=%r; using 1 sec fallback "
            "(sample_type=%s)",
            raw_rate,
            sample_type or "unknown",
        )
        step = 1
    return max(1, step)


def _parse_accesslink_hr_values(
    values: list[str],
    recording_rate: int,
) -> list[tuple[int, int]]:
    rows: list[tuple[int, int]] = []
    for i, part in enumerate(values):
        hr = _normalize_hr_value(part)
        if hr is not None:
            rows.append((i * recording_rate, hr))
    return rows


def _looks_like_hr_series(rows: list[tuple[int, int]], values_count: int) -> bool:
    if values_count <= 0:
        return False
    return len(rows) >= MIN_HR_LIKE_VALUES and len(rows) / values_count >= MIN_HR_LIKE_RATIO


def _log_unrecognized_accesslink_sample(
    *,
    sample_type: str,
    recording_rate: int,
    values: list[str],
    reason: str,
) -> None:
    logger.info(
        "Polar AccessLink sample skipped: reason=%s sample_type=%s recording_rate=%s "
        "values_count=%s preview=%s",
        reason,
        sample_type or "unknown",
        recording_rate,
        len(values),
        values[:10],
    )


def _extract_hr_from_accesslink_samples(data: dict[str, Any]) -> list[tuple[int, int]]:
    """Пульс из samples[] AccessLink API: known HR types + HR-like CSV fallback."""
    rows: list[tuple[int, int]] = []
    samples = data.get("samples")
    if not isinstance(samples, list):
        return rows
    has_hr_summary = _has_heart_rate_summary(data)
    for block in samples:
        if not isinstance(block, dict):
            continue
        sample_type = _accesslink_sample_type(block)
        values = _accesslink_raw_values(block)
        if not values:
            continue
        recording_rate = _accesslink_recording_rate(block, sample_type)
        block_rows = _parse_accesslink_hr_values(values, recording_rate)
        looks_like_hr = _looks_like_hr_series(block_rows, len(values))

        if sample_type in ACCESSLINK_EXPLICIT_HR_SAMPLE_TYPES:
            if block_rows:
                rows.extend(block_rows)
            else:
                _log_unrecognized_accesslink_sample(
                    sample_type=sample_type,
                    recording_rate=recording_rate,
                    values=values,
                    reason="known_hr_type_without_enough_valid_hr_values",
                )
            continue

        if has_hr_summary and looks_like_hr and sample_type == "0":
            rows.extend(block_rows)
            continue

        if has_hr_summary and looks_like_hr:
            logger.warning(
                "Polar AccessLink unknown sample-type treated as HR series: "
                "sample_type=%s recording_rate=%s values_count=%s valid_hr_count=%s preview=%s",
                sample_type or "unknown",
                recording_rate,
                len(values),
                len(block_rows),
                values[:10],
            )
            rows.extend(block_rows)
            continue

        if looks_like_hr:
            logger.warning(
                "Polar AccessLink sample looks like HR but was skipped without heart-rate summary: "
                "sample_type=%s recording_rate=%s values_count=%s valid_hr_count=%s preview=%s",
                sample_type or "unknown",
                recording_rate,
                len(values),
                len(block_rows),
                values[:10],
            )
        else:
            _log_unrecognized_accesslink_sample(
                sample_type=sample_type,
                recording_rate=recording_rate,
                values=values,
                reason="not_hr_like",
            )
            continue
    return rows


def extract_hr_samples(data: dict[str, Any]) -> list[tuple[int, int]]:
    merged = list(_extract_hr_from_upload(data))
    if not merged:
        merged = list(_extract_hr_from_data(data))
    if not merged:
        merged = _extract_hr_from_accesslink_samples(data)
    return _dedupe_hr_points(merged)


def count_hr_in_payload(data: dict[str, Any]) -> int:
    return len(extract_hr_samples(data))


def resolve_hr_parser_source(
    data: dict[str, Any],
    pending: sqlite3.Row | dict[str, Any],
) -> str:
    """Источник HR samples: TCX / GPX / FIT / upload / AccessLink / summary_only."""
    upload_source = data.get("_upload_source")
    if upload_source:
        label = str(upload_source).strip().upper()
        if label in ("TCX", "GPX", "FIT"):
            return label
        return "upload"
    if data.get("_upload_hr_pairs"):
        return "upload"
    tid = str(
        pending["polar_transaction_id"]
        if hasattr(pending, "keys")
        else pending.get("polar_transaction_id", "")
    )
    if tid.startswith(MANUAL_UPLOAD_PREFIX):
        return "upload"
    if _extract_hr_from_accesslink_samples(data):
        return "AccessLink"
    if _extract_hr_from_data(data):
        return "AccessLink"
    if data.get("samples") or data.get("transaction-id") or data.get("transaction_id"):
        return "AccessLink"
    return "summary_only"


def count_hr_rows(
    conn: sqlite3.Connection,
    workout_id: int,
    source_type: str,
) -> int:
    row = conn.execute(
        """
        SELECT COUNT(*) FROM workout_heart_rate
        WHERE cardio_workout_id = ?
          AND COALESCE(source_type, 'cardio') = ?
        """,
        (int(workout_id), source_type),
    ).fetchone()
    return int(row[0]) if row else 0


def _build_attach_warnings(
    *,
    received: int,
    parsed: int,
    inserted: int,
    had_existing: bool,
    hr_saved: bool,
) -> list[str]:
    warnings: list[str] = []
    if received == 0:
        warnings.append("В raw_data нет inline HR samples (только summary)")
    if parsed > received:
        warnings.append("AccessLink hydration добавила samples")
    if parsed == 0:
        warnings.append("Parsed=0: parser не извлёк точки")
    if parsed > 0 and inserted == 0 and (had_existing or not hr_saved):
        warnings.append("Insert пропущен: строки уже существуют")
    return warnings


def _attach_debug_fields(
    *,
    pending: sqlite3.Row,
    workout_id: int,
    workout_type: str,
    data_raw: dict[str, Any],
    data: dict[str, Any],
    hr_samples: list[tuple[int, int]],
    hr_saved: bool,
    had_existing_before: bool,
    rows_before: int,
    rows_after: int,
    avg_hr: int | None,
    max_hr: int | None,
    calories: int | None,
    gps_saved: bool,
    fields_updated: bool,
) -> dict[str, Any]:
    received = count_hr_in_payload(data_raw)
    parsed = len(hr_samples)
    inserted = max(0, rows_after - rows_before) if hr_saved else 0
    parser_source = resolve_hr_parser_source(data, pending)
    warnings = _build_attach_warnings(
        received=received,
        parsed=parsed,
        inserted=inserted,
        had_existing=had_existing_before,
        hr_saved=hr_saved,
    )
    logger.info(
        "Polar attach: tx=%s workout_id=%s type=%s parser=%s received=%d parsed=%d "
        "inserted=%d db_total=%d avg_hr=%s max_hr=%s calories=%s gps=%s fields=%s warnings=%s",
        pending["polar_transaction_id"],
        workout_id,
        workout_type,
        parser_source,
        received,
        parsed,
        inserted,
        rows_after,
        avg_hr,
        max_hr,
        calories,
        gps_saved,
        fields_updated,
        warnings,
    )
    return {
        "hr_samples_received": received,
        "hr_samples_parsed": parsed,
        "hr_samples_inserted": inserted,
        "hr_parser_source": parser_source,
        "scalar_fields_updated": fields_updated,
        "warnings": warnings,
    }


def _extract_hr_from_upload(data: dict[str, Any]) -> list[tuple[int, int]]:
    """Пульс из raw_data, загруженного через POST /sync/polar/upload."""
    pairs = data.get("_upload_hr_pairs")
    if not isinstance(pairs, list):
        return []
    rows: list[tuple[int, int]] = []
    for item in pairs:
        if isinstance(item, (list, tuple)) and len(item) >= 2:
            hr = _normalize_hr_value(item[1])
            if hr is not None:
                try:
                    rows.append((int(item[0]), hr))
                except (TypeError, ValueError):
                    continue
    return rows


def _extract_route_from_accesslink(data: dict[str, Any]) -> list[dict[str, Any]]:
    route = data.get("route")
    if not isinstance(route, list):
        return []
    points: list[dict[str, Any]] = []
    for i, item in enumerate(route):
        if not isinstance(item, dict):
            continue
        lat = item.get("latitude") if item.get("latitude") is not None else item.get("lat")
        lon = item.get("longitude") if item.get("longitude") is not None else item.get("lon")
        if lat is None or lon is None:
            continue
        elapsed = _parse_pt_duration_to_sec(str(item.get("time") or ""))
        if elapsed is None:
            elapsed = i
        pt: dict[str, Any] = {
            "lat": float(lat),
            "lon": float(lon),
            "elapsed_sec": elapsed,
        }
        elev = item.get("elevation") or item.get("elevation_m") or item.get("altitude")
        if elev is not None:
            try:
                pt["elevation_m"] = float(elev)
            except (TypeError, ValueError):
                pass
        points.append(pt)
    return points


def extract_track_points(data: dict[str, Any]) -> list[dict[str, Any]]:
    points = list(_extract_track_from_upload(data))
    if not points:
        points = list(_extract_track_points_from_data(data))
    if not points:
        points = _extract_route_from_accesslink(data)
    return points


def _extract_track_from_upload(data: dict[str, Any]) -> list[dict[str, Any]]:
    raw_pts = data.get("_upload_track_points")
    if not isinstance(raw_pts, list):
        return []
    points: list[dict[str, Any]] = []
    for pt in raw_pts:
        if not isinstance(pt, dict):
            continue
        lat = pt.get("lat")
        lon = pt.get("lon")
        if lat is None or lon is None:
            continue
        item: dict[str, Any] = {
            "lat": float(lat),
            "lon": float(lon),
            "elapsed_sec": int(pt.get("elapsed_sec") or len(points)),
        }
        elev = pt.get("elevation_m")
        if elev is not None:
            try:
                item["elevation_m"] = float(elev)
            except (TypeError, ValueError):
                pass
        points.append(item)
    return points


def _field_empty(value: Any) -> bool:
    if value is None:
        return True
    try:
        return float(value) == 0
    except (TypeError, ValueError):
        return False


def get_pending_workout(date: str, workout_type: str) -> dict[str, Any] | None:
    date_str = str(date)[:10]
    wtype = str(workout_type).strip()
    if wtype not in POLAR_PENDING_TYPES:
        raise ValueError(f"Недопустимый тип: {wtype}")
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, polar_transaction_id, date, type, duration_sec, distance_km,
                   calories, avg_hr, max_hr, raw_data, imported
            FROM polar_pending_workouts
            WHERE local_user_id = ? AND date = ? AND type = ? AND imported = 0
            ORDER BY id ASC
            LIMIT 1
            """,
            (uid, date_str, wtype),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return dict(row)


def list_pending_workouts() -> list[dict[str, Any]]:
    """Все неимпортированные записи текущего пользователя, сначала новые по дате."""
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT polar_transaction_id, date, type, distance_km, duration_sec, calories
            FROM polar_pending_workouts
            WHERE local_user_id = ? AND imported = 0
            ORDER BY date DESC, id DESC
            """,
            (uid,),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            **dict(r),
            "is_manual_upload": str(r["polar_transaction_id"]).startswith(MANUAL_UPLOAD_PREFIX),
        }
        for r in rows
    ]


def delete_pending_workout(polar_transaction_id: str) -> None:
    """Удалить непривязанную запись из очереди Polar (AccessLink или ручной upload)."""
    tid = str(polar_transaction_id).strip()
    if not tid:
        raise ValueError("polar_transaction_id обязателен")
    uid = get_current_user_id()
    conn = get_db()
    try:
        cur = conn.execute(
            """
            DELETE FROM polar_pending_workouts
            WHERE local_user_id = ? AND polar_transaction_id = ? AND imported = 0
            """,
            (uid, tid),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise ValueError("Запись не найдена или уже привязана")
    finally:
        conn.close()


def delete_manual_pending_workout(polar_transaction_id: str) -> None:
    """Удалить запись, загруженную вручную (TCX/GPX/FIT). Синхронизация Polar не затрагивается."""
    delete_pending_workout(polar_transaction_id)


def _load_pending_row(
    conn: sqlite3.Connection,
    polar_transaction_id: str,
    local_user_id: int | None = None,
) -> sqlite3.Row:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    row = conn.execute(
        """
        SELECT id, polar_transaction_id, date, type, duration_sec, distance_km,
               calories, avg_hr, max_hr, raw_data, imported
        FROM polar_pending_workouts
        WHERE local_user_id = ? AND polar_transaction_id = ?
        LIMIT 1
        """,
        (uid, polar_transaction_id.strip()),
    ).fetchone()
    if row is None:
        raise ValueError("Запись Polar не найдена")
    return row


def _hydrate_polar_raw_data(
    conn: sqlite3.Connection,
    pending: sqlite3.Row,
    data: dict[str, Any],
) -> dict[str, Any]:
    """Догрузить samples с AccessLink, если в raw_data только сводка heart-rate."""
    if extract_hr_samples(data):
        return data
    transaction_id = data.get("transaction-id") or data.get("transaction_id")
    exercise_id = (
        data.get("id")
        or data.get("exercise-id")
        or data.get("exercise_id")
        or pending["polar_transaction_id"]
    )
    if not transaction_id or not exercise_id:
        return data
    try:
        from sync_polar import _load_polar_tokens, ensure_polar_exercise_hr_samples

        uid = get_current_user_id()
        access_token, polar_user_id = _load_polar_tokens(conn, uid)
        enriched = ensure_polar_exercise_hr_samples(
            access_token,
            str(polar_user_id),
            str(transaction_id),
            str(exercise_id),
            data,
        )
    except Exception as exc:
        logger.warning(
            "Polar HR hydration failed for %s: %s",
            pending["polar_transaction_id"],
            exc,
        )
        return data
    if not extract_hr_samples(enriched):
        return data
    if not extract_hr_samples(data):
        conn.execute(
            "UPDATE polar_pending_workouts SET raw_data = ? WHERE id = ?",
            (json.dumps(enriched, ensure_ascii=False), int(pending["id"])),
        )
    return enriched


def _save_gps_if_empty(
    conn: sqlite3.Connection,
    cardio_workout_id: int,
    data: dict[str, Any],
    *,
    date_str: str,
    workout_type: str,
) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM gps_tracks
        WHERE cardio_workout_id = ?
          AND track_data IS NOT NULL
          AND TRIM(track_data) != ''
        LIMIT 1
        """,
        (cardio_workout_id,),
    ).fetchone()
    if row is not None:
        return False
    track_points = extract_track_points(data)
    if not track_points:
        return False
    geo = build_enriched_geojson(track_points)
    if not geo:
        return False
    file_name = f"polar_{date_str}_{workout_type}.geojson"
    upsert_gps_track(
        cardio_workout_id,
        GPS_SOURCE,
        date_str,
        file_name,
        geo,
        conn=conn,
    )
    return True


def _avg_hr_from_samples(hr_samples: list[tuple[int, int]]) -> int | None:
    if not hr_samples:
        return None
    vals = [hr for _, hr in hr_samples if hr]
    if not vals:
        return None
    return int(round(sum(vals) / len(vals)))


def _polar_scalar_metrics(
    pending: sqlite3.Row,
    data: dict[str, Any],
    hr_samples: list[tuple[int, int]],
) -> tuple[int | None, int | None, int | None, int | None]:
    from backend.services.polar_hr_utils import polar_avg_max_hr_from_data

    avg_hr, max_hr = polar_avg_max_hr_from_data(
        data,
        pending_avg=pending["avg_hr"],
        pending_max=pending["max_hr"],
    )
    calories = pending["calories"]
    duration_sec = pending["duration_sec"]
    if _field_empty(avg_hr) and hr_samples:
        avg_hr = _avg_hr_from_samples(hr_samples)
    if _field_empty(max_hr) and hr_samples:
        vals = [hr for _, hr in hr_samples if hr]
        max_hr = max(vals) if vals else None
    try:
        duration_sec = int(duration_sec) if duration_sec is not None else None
    except (TypeError, ValueError):
        duration_sec = None
    if duration_sec is not None and duration_sec <= 0:
        duration_sec = None
    try:
        calories = int(calories) if calories is not None else None
    except (TypeError, ValueError):
        calories = None
    if calories is not None and calories <= 0:
        calories = None
    return avg_hr, max_hr, calories, duration_sec


def _update_cardio_scalars_if_empty(
    conn: sqlite3.Connection,
    cardio_workout_id: int,
    pending: sqlite3.Row,
    data: dict[str, Any],
    hr_samples: list[tuple[int, int]],
) -> bool:
    row = conn.execute(
        """
        SELECT avg_hr, max_hr, calories, calories_chest, duration_sec
        FROM cardio_workouts WHERE id = ? AND user_id = ?
        """,
        (cardio_workout_id, get_current_user_id()),
    ).fetchone()
    if row is None:
        raise ValueError("Кардио-тренировка не найдена")

    avg_hr, max_hr, calories, duration_sec = _polar_scalar_metrics(
        pending, data, hr_samples
    )

    sets: list[str] = []
    params: list[Any] = []
    if _field_empty(row["avg_hr"]) and avg_hr:
        sets.append("avg_hr = ?")
        params.append(int(avg_hr))
    if _field_empty(row["max_hr"]) and max_hr:
        sets.append("max_hr = ?")
        params.append(int(max_hr))
    if _field_empty(row["calories_chest"]) and calories:
        sets.append("calories_chest = ?")
        params.append(int(calories))
    if _field_empty(row["calories"]) and calories:
        sets.append("calories = ?")
        params.append(int(calories))
    if _field_empty(row["duration_sec"]) and duration_sec:
        sets.append("duration_sec = ?")
        params.append(int(duration_sec))
    if not sets:
        return False
    params.append(cardio_workout_id)
    params.append(get_current_user_id())
    conn.execute(
        f"UPDATE cardio_workouts SET {', '.join(sets)} WHERE id = ? AND user_id = ?",
        params,
    )
    return True


def _strength_session_where(
    date_str: str,
    workout_title: str | None,
) -> tuple[str, tuple[Any, ...]]:
    if workout_title is None or str(workout_title).strip() == "":
        return "date = ? AND workout_title IS NULL", (date_str,)
    return "date = ? AND workout_title = ?", (date_str, str(workout_title))


def _update_strength_session_from_polar(
    conn: sqlite3.Connection,
    strength_workout_id: int,
    pending: sqlite3.Row,
    data: dict[str, Any],
    hr_samples: list[tuple[int, int]],
) -> bool:
    anchor = conn.execute(
        "SELECT date, workout_title FROM strength_workouts WHERE id = ? AND user_id = ?",
        (int(strength_workout_id), get_current_user_id()),
    ).fetchone()
    if anchor is None:
        raise ValueError("Силовая тренировка не найдена")

    avg_hr, _max_hr, calories, _duration_sec = _polar_scalar_metrics(
        pending, data, hr_samples
    )
    date_str = str(anchor["date"])[:10]
    where_sql, where_params = _strength_session_where(
        date_str, anchor["workout_title"]
    )
    rows = conn.execute(
        f"""
        SELECT id, avg_hr, calories_chest
        FROM strength_workouts
        WHERE ({where_sql}) AND user_id = ?
        """,
        (*where_params, get_current_user_id()),
    ).fetchall()

    updated = False
    for row in rows:
        sets: list[str] = []
        params: list[Any] = []
        if avg_hr is not None:
            sets.append("avg_hr = ?")
            params.append(int(avg_hr))
        if calories is not None:
            sets.append("calories_chest = ?")
            params.append(int(calories))
        if not sets:
            continue
        params.append(int(row["id"]))
        conn.execute(
            f"UPDATE strength_workouts SET {', '.join(sets)} WHERE id = ?",
            params,
        )
        updated = True
    return updated


def _save_polar_hr_samples(
    conn: sqlite3.Connection,
    pending: sqlite3.Row,
    workout_id: int,
    hr_samples: list[tuple[int, int]],
    source_type: str,
) -> tuple[bool, bool, int]:
    """
    Сохранить HR samples и пометить pending imported.
    Returns (hr_saved, has_hr_chart, hr_samples_count).
    """
    hr_saved = insert_hr_samples_if_empty(
        conn,
        int(workout_id),
        hr_samples,
        source_type=source_type,
    )
    has_existing = workout_has_hr_samples(conn, int(workout_id), source_type)

    if hr_samples and not hr_saved and not has_existing:
        raise ValueError("Не удалось сохранить точки пульса Polar")

    has_hr_chart = hr_saved or has_existing
    hr_count = len(hr_samples) if hr_saved else 0

    conn.execute(
        "UPDATE polar_pending_workouts SET imported = 1 WHERE id = ?",
        (int(pending["id"]),),
    )
    return hr_saved, has_hr_chart, hr_count


def attach_polar_to_cardio(cardio_workout_id: int, polar_transaction_id: str) -> dict[str, Any]:
    conn = get_db()
    try:
        pending = _load_pending_row(conn, polar_transaction_id)
        raw = pending["raw_data"]
        if not raw:
            raise ValueError("В записи Polar нет raw_data")
        data_raw = json.loads(raw)
        if not isinstance(data_raw, dict):
            raise ValueError("raw_data Polar не является JSON-объектом")

        rows_before = count_hr_rows(conn, int(cardio_workout_id), HR_SOURCE_CARDIO)
        had_existing_before = workout_has_hr_samples(
            conn, int(cardio_workout_id), HR_SOURCE_CARDIO
        )

        data = _hydrate_polar_raw_data(conn, pending, dict(data_raw))
        hr_samples = extract_hr_samples(data)
        hr_saved, has_hr_chart, hr_count = _save_polar_hr_samples(
            conn,
            pending,
            int(cardio_workout_id),
            hr_samples,
            HR_SOURCE_CARDIO,
        )
        rows_after = count_hr_rows(conn, int(cardio_workout_id), HR_SOURCE_CARDIO)
        gps_saved = _save_gps_if_empty(
            conn,
            int(cardio_workout_id),
            data,
            date_str=str(pending["date"] or "")[:10],
            workout_type=str(pending["type"] or "cardio"),
        )
        fields_updated = _update_cardio_scalars_if_empty(
            conn, int(cardio_workout_id), pending, data, hr_samples
        )
        avg_hr, max_hr, calories, _duration = _polar_scalar_metrics(
            pending, data, hr_samples
        )
        from backend.services import source_resolver_service

        source_resolver_service.register_polar_attach(
            int(cardio_workout_id),
            avg_hr=avg_hr,
            max_hr=max_hr,
            calories=calories,
            gps_saved=gps_saved,
            external_ref=str(pending["polar_transaction_id"] or ""),
        )
        conn.commit()
        debug = _attach_debug_fields(
            pending=pending,
            workout_id=int(cardio_workout_id),
            workout_type="cardio",
            data_raw=data_raw,
            data=data,
            hr_samples=hr_samples,
            hr_saved=hr_saved,
            had_existing_before=had_existing_before,
            rows_before=rows_before,
            rows_after=rows_after,
            avg_hr=avg_hr,
            max_hr=max_hr,
            calories=calories,
            gps_saved=gps_saved,
            fields_updated=fields_updated,
        )
        return {
            "message": "Данные Polar привязаны к кардио-тренировке",
            "hr_samples": hr_count,
            "has_hr_chart": has_hr_chart,
            "gps_saved": gps_saved,
            "fields_updated": fields_updated,
            **debug,
        }
    finally:
        conn.close()


def attach_polar_to_strength(strength_workout_id: int, polar_transaction_id: str) -> dict[str, Any]:
    from backend.services.strength_service import get_session_detail

    conn = get_db()
    try:
        anchor = conn.execute(
            "SELECT date, workout_title FROM strength_workouts WHERE id = ? AND user_id = ?",
            (int(strength_workout_id), get_current_user_id()),
        ).fetchone()
        if anchor is None:
            raise ValueError("Силовая тренировка не найдена")

        pending = _load_pending_row(conn, polar_transaction_id)
        raw = pending["raw_data"]
        if not raw:
            raise ValueError("В записи Polar нет raw_data")
        data_raw = json.loads(raw)
        if not isinstance(data_raw, dict):
            raise ValueError("raw_data Polar не является JSON-объектом")

        rows_before = count_hr_rows(conn, int(strength_workout_id), HR_SOURCE_STRENGTH)
        had_existing_before = workout_has_hr_samples(
            conn, int(strength_workout_id), HR_SOURCE_STRENGTH
        )

        data = _hydrate_polar_raw_data(conn, pending, dict(data_raw))
        hr_samples = extract_hr_samples(data)
        hr_saved, has_hr_chart, hr_count = _save_polar_hr_samples(
            conn,
            pending,
            int(strength_workout_id),
            hr_samples,
            HR_SOURCE_STRENGTH,
        )
        rows_after = count_hr_rows(conn, int(strength_workout_id), HR_SOURCE_STRENGTH)
        fields_updated = _update_strength_session_from_polar(
            conn, int(strength_workout_id), pending, data, hr_samples
        )
        avg_hr, max_hr, calories, _duration = _polar_scalar_metrics(
            pending, data, hr_samples
        )
        conn.commit()

        date_str = str(anchor["date"])[:10]
        title_raw = anchor["workout_title"]
        if title_raw is None or str(title_raw).strip() == "":
            workout_title = "Без названия"
        else:
            workout_title = str(title_raw)

        debug = _attach_debug_fields(
            pending=pending,
            workout_id=int(strength_workout_id),
            workout_type="strength",
            data_raw=data_raw,
            data=data,
            hr_samples=hr_samples,
            hr_saved=hr_saved,
            had_existing_before=had_existing_before,
            rows_before=rows_before,
            rows_after=rows_after,
            avg_hr=avg_hr,
            max_hr=max_hr,
            calories=calories,
            gps_saved=False,
            fields_updated=fields_updated,
        )
        return {
            "message": "Данные Polar привязаны к силовой тренировке",
            "hr_samples": hr_count,
            "has_hr_chart": has_hr_chart,
            "gps_saved": False,
            "fields_updated": fields_updated,
            "workout": get_session_detail(date_str, workout_title),
            **debug,
        }
    finally:
        conn.close()
