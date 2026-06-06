# -*- coding: utf-8 -*-
"""Приём и сохранение данных из Google Health Connect (мобильное приложение)."""
from __future__ import annotations

import logging
import sqlite3
from datetime import datetime
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.analytics_service import save_daily_bracelet_calories
from backend.services import source_resolver_service
from backend.services.passive_hr_service import insert_samples_batch
from backend.services.health_connect_audit import (
    ACTION_SAVED,
    ACTION_SKIPPED,
    SKIP_DUPLICATE,
    SKIP_EXISTING_HEALTH_CONNECT,
    SKIP_MISSING_REQUIRED_FIELDS,
    SKIP_NEGATIVE_VALUE,
    SKIP_PROTECTED_EXISTING,
    SKIP_UNSUPPORTED_TYPE,
    WARNING_PERMISSION_MISSING,
    aggregate_batch_audit,
    skip_entry,
    summarize_received,
)
from backend.database.daily_weight_store import save_daily_weight
from import_polar_historical import HR_SOURCE_CARDIO, insert_hr_samples_if_empty
from utils.constants import (
    CARDIO_ARCHIVE_TYPE,
    CARDIO_DB_BIKE,
    CARDIO_SOURCE_EXCEL,
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_HEALTH_CONNECT,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_POLAR,
    CARDIO_TYPES,
)

HC_STRENGTH_TYPES = frozenset({70})  # ExerciseType.STRENGTH_TRAINING
HC_BIKE_TYPES = frozenset({8, 9, 25, 54})  # BIKING, STATIONARY, ELLIPTICAL, ROWING_MACHINE
HC_RUN_TYPES = frozenset({37, 56, 57, 68, 69})  # HIKING, RUNNING, TREADMILL, STAIR_*
HC_SWIM_TYPES = frozenset({73, 74})

PROTECTED_CARDIO_SOURCES = frozenset({
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_POLAR,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_EXCEL,
})

logger = logging.getLogger(__name__)


def _parse_iso(ts: str | None) -> datetime | None:
    if not ts:
        return None
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None


def _map_exercise_type(exercise_type: int | None) -> tuple[str, str]:
    """Возвращает (category, cardio_db_type). category: cardio | skip."""
    et = int(exercise_type or 0)
    if et in HC_STRENGTH_TYPES:
        return "skip", ""
    if et in HC_BIKE_TYPES:
        return "cardio", CARDIO_DB_BIKE
    if et in HC_SWIM_TYPES:
        return "cardio", CARDIO_TYPES["Бассейн"]
    if et in HC_RUN_TYPES:
        return "cardio", CARDIO_ARCHIVE_TYPE
    return "cardio", CARDIO_ARCHIVE_TYPE


def upsert_steps_for_day(day: str, steps: int, *, source: str = "health_connect") -> None:
    d = str(day)[:10]
    if steps < 0:
        return
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO steps_history (user_id, date, steps, source, updated_at)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, date) DO UPDATE SET
                steps = MAX(steps_history.steps, excluded.steps),
                source = CASE
                    WHEN excluded.steps > steps_history.steps THEN excluded.source
                    ELSE steps_history.source
                END,
                updated_at = CURRENT_TIMESTAMP
            """,
            (uid, d, int(steps), source),
        )
        conn.commit()
    finally:
        conn.close()


def _save_sleep(user_id: int, sleep: dict[str, Any]) -> dict[str, Any]:
    external_id = str(sleep.get("external_id") or "").strip() or None
    start_time = str(sleep.get("start_time") or "")
    end_time = str(sleep.get("end_time") or "")
    if not start_time or not end_time:
        return {
            "action": ACTION_SKIPPED,
            "reason": SKIP_MISSING_REQUIRED_FIELDS,
            "detail": "sleep start_time/end_time required",
        }
    end_dt = _parse_iso(end_time)
    day = str(sleep.get("date") or (end_dt.date().isoformat() if end_dt else ""))[:10]
    if not day:
        return {
            "action": ACTION_SKIPPED,
            "reason": SKIP_MISSING_REQUIRED_FIELDS,
            "detail": "sleep date missing",
        }
    conn = get_db()
    try:
        if external_id:
            exists = conn.execute(
                """
                SELECT 1 FROM sleep_data
                WHERE user_id = ? AND external_id = ?
                """,
                (user_id, external_id),
            ).fetchone()
            if exists:
                return {
                    "action": ACTION_SKIPPED,
                    "reason": SKIP_DUPLICATE,
                    "detail": f"external_id={external_id}",
                }
        conn.execute(
            """
            INSERT INTO sleep_data (
                user_id, date, start_time, end_time, duration_seconds,
                light_seconds, deep_seconds, rem_seconds, source, external_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user_id,
                day,
                start_time,
                end_time,
                int(sleep.get("duration_seconds") or 0),
                int(sleep.get("light_seconds") or 0),
                int(sleep.get("deep_seconds") or 0),
                int(sleep.get("rem_seconds") or 0),
                sleep.get("source") or "health_connect",
                external_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return {"action": ACTION_SAVED}


def _save_workout(workout: dict[str, Any]) -> tuple[int | None, dict[str, Any]]:
    category, cardio_type = _map_exercise_type(workout.get("exercise_type"))
    start = _parse_iso(str(workout.get("start_time") or ""))
    end = _parse_iso(str(workout.get("end_time") or ""))
    if not start:
        return None, {
            "action": ACTION_SKIPPED,
            "reason": SKIP_MISSING_REQUIRED_FIELDS,
            "detail": "workout start_time missing",
        }
    date_str = str(workout.get("date") or start.date().isoformat())[:10]
    duration_sec = int(workout.get("duration_sec") or 0)
    if duration_sec <= 0 and end:
        duration_sec = max(0, int((end - start).total_seconds()))

    if category == "skip":
        et = int(workout.get("exercise_type") or 0)
        return None, {
            "action": ACTION_SKIPPED,
            "reason": SKIP_UNSUPPORTED_TYPE,
            "detail": f"exercise_type={et}",
        }

    distance_m = workout.get("distance_m")
    distance_km = round(float(distance_m) / 1000.0, 3) if distance_m else None
    calories = workout.get("calories_kcal")
    user_id = get_current_user_id()
    external_id = str(workout.get("external_id") or "").strip() or None
    wid = 0

    conn = get_db()
    try:
        blocked, existing_id, block_reason = source_resolver_service.should_block_hc_write(
            date_str, cardio_type
        )
        if blocked and existing_id:
            return int(existing_id), {
                "action": ACTION_SKIPPED,
                "reason": SKIP_PROTECTED_EXISTING,
                "detail": block_reason or "protected existing workout",
            }

        existing_rows = conn.execute(
            """
            SELECT id, data_source FROM cardio_workouts
            WHERE date = ? AND type = ? AND user_id = ?
            ORDER BY id DESC
            """,
            (date_str, cardio_type, user_id),
        ).fetchall()

        for row in existing_rows:
            src = str(row["data_source"] or "")
            if src == CARDIO_SOURCE_HEALTH_CONNECT:
                return int(row["id"]), {
                    "action": ACTION_SKIPPED,
                    "reason": SKIP_EXISTING_HEALTH_CONNECT,
                    "detail": f"date={date_str} type={cardio_type}",
                }

        calories_val = int(calories) if calories is not None else None
        cur = conn.execute(
            """
            INSERT INTO cardio_workouts (
                date, type, distance_km, duration_sec, avg_hr, max_hr, calories,
                calories_chest, calories_watch, data_source, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                date_str,
                cardio_type,
                distance_km,
                duration_sec,
                workout.get("avg_hr"),
                workout.get("max_hr"),
                calories_val,
                calories_val,
                calories_val,
                CARDIO_SOURCE_HEALTH_CONNECT,
                user_id,
            ),
        )
        conn.commit()
        wid = int(cur.lastrowid)
    finally:
        conn.close()

    if wid > 0:
        conn = get_db()
        try:
            samples = workout.get("heart_rate_samples") or []
            if samples:
                hr_rows: list[tuple[int, int]] = []
                for s in samples:
                    elapsed = s.get("elapsed_sec")
                    bpm = s.get("bpm")
                    if elapsed is None or bpm is None:
                        continue
                    hr_rows.append((int(elapsed), int(bpm)))
                if hr_rows:
                    insert_hr_samples_if_empty(conn, int(wid), hr_rows, HR_SOURCE_CARDIO)
                    conn.commit()
        finally:
            conn.close()
        source_resolver_service.register_health_connect_workout(
            wid,
            workout,
            external_ref=external_id,
        )
        return wid, {"action": ACTION_SAVED}

    return None, {
        "action": ACTION_SKIPPED,
        "reason": SKIP_MISSING_REQUIRED_FIELDS,
        "detail": "workout insert failed",
    }


def sync_health_connect_payload(item: dict[str, Any]) -> dict[str, Any]:
    """Сохранить один дневной пакет Health Connect."""
    user_id = get_current_user_id()
    day = str(item.get("date") or "")[:10]
    if not day:
        raise ValueError("Укажите date (YYYY-MM-DD)")

    received = summarize_received(item)
    saved_fields: dict[str, Any] = {}
    skipped: list[dict[str, Any]] = []
    result: dict[str, Any] = {"date": day, "received": received, "saved": saved_fields, "skipped": skipped}

    if item.get("steps") is not None:
        steps_val = int(item["steps"])
        if steps_val < 0:
            skipped.append(skip_entry("steps", SKIP_NEGATIVE_VALUE, str(steps_val)))
        else:
            upsert_steps_for_day(day, steps_val)
            saved_fields["steps"] = steps_val
            result["steps"] = steps_val

    total_kcal = item.get("total_calories")
    if total_kcal is not None:
        save_daily_bracelet_calories(day, int(round(float(total_kcal))), source="health_connect")
        val = int(round(float(total_kcal)))
        saved_fields["total_calories"] = val
        result["total_calories"] = val
    elif item.get("active_calories") is not None:
        val = int(round(float(item["active_calories"])))
        save_daily_bracelet_calories(day, val, source="health_connect")
        saved_fields["active_calories"] = val
        result["active_calories"] = val

    if item.get("weight_kg") is not None:
        w = float(item["weight_kg"])
        save_daily_weight(day, w, source="health_connect")
        saved_fields["weight_kg"] = w
        result["weight_kg"] = w

    if item.get("sleep"):
        sleep_outcome = _save_sleep(user_id, item["sleep"])
        if sleep_outcome.get("action") == ACTION_SAVED:
            saved_fields["sleep"] = True
            result["sleep"] = True
        else:
            skipped.append(
                skip_entry(
                    "sleep",
                    str(sleep_outcome.get("reason") or SKIP_MISSING_REQUIRED_FIELDS),
                    sleep_outcome.get("detail"),
                )
            )

    workouts = item.get("workouts") or []
    workout_ids: list[int] = []
    for idx, w in enumerate(workouts):
        if not isinstance(w, dict):
            skipped.append(skip_entry(f"workouts[{idx}]", SKIP_MISSING_REQUIRED_FIELDS, "not a dict"))
            continue
        wid, outcome = _save_workout(w)
        if outcome.get("action") == ACTION_SAVED and wid:
            workout_ids.append(wid)
        else:
            skipped.append(
                skip_entry(
                    f"workouts[{idx}]",
                    str(outcome.get("reason") or SKIP_MISSING_REQUIRED_FIELDS),
                    outcome.get("detail"),
                )
            )
    if workout_ids:
        saved_fields["workout_ids"] = workout_ids
        result["workout_ids"] = workout_ids

    hr_samples = item.get("heart_rate_samples") or []
    if hr_samples:
        outcome = insert_samples_batch(user_id, hr_samples)
        inserted = int(outcome.get("inserted") or 0)
        if inserted > 0 or outcome.get("received", 0) > 0:
            saved_fields["heart_rate_samples"] = outcome
            result["heart_rate_samples"] = outcome
            logger.info(
                "HR passive day=%s received=%s inserted=%s dup=%s rejected=%s",
                day,
                outcome.get("received"),
                outcome.get("inserted"),
                outcome.get("duplicates"),
                outcome.get("rejected_invalid"),
            )
        elif outcome.get("rejected_invalid", 0) == outcome.get("received", 0):
            skipped.append(
                skip_entry(
                    "heart_rate_samples",
                    "hr_invalid_bpm",
                    f"count={len(hr_samples)}",
                )
            )

    return result


def sync_health_connect_batch(
    items: list[dict[str, Any]],
    *,
    mobile_audit: dict[str, Any] | None = None,
    device_label: str | None = None,
) -> dict[str, Any]:
    if not items:
        raise ValueError("Пустой список данных")
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for raw in items:
        try:
            results.append(sync_health_connect_payload(raw))
        except (ValueError, sqlite3.Error) as exc:
            errors.append({"date": str(raw.get("date") or ""), "error": str(exc)})

    batch_audit = aggregate_batch_audit(items, results, errors)
    if mobile_audit:
        perms = mobile_audit.get("permissions") or {}
        missing = [k for k, v in perms.items() if v is False]
        if missing:
            if WARNING_PERMISSION_MISSING not in batch_audit["warnings"]:
                batch_audit["warnings"].append(WARNING_PERMISSION_MISSING)

    saved_totals = batch_audit["saved_totals"]
    skipped_totals = batch_audit["skipped_totals"]
    warnings = batch_audit["warnings"]
    saved_fields = int(saved_totals.get("fields") or 0)
    sync_ok = not errors and saved_fields > 0

    sync_log_id: int | None = None
    try:
        from backend.services.health_connect_debug_service import log_health_connect_batch

        preview = [{"date": r.get("date"), "keys": list((r.get("saved") or {}).keys())} for r in results[:3]]
        sync_log_id = log_health_connect_batch(
            days_count=len(items),
            saved_days=len(results),
            errors_count=len(errors),
            payload_preview=preview,
            audit_json=batch_audit,
            mobile_audit_json=mobile_audit,
            device_label=device_label,
        )
    except Exception:
        pass

    logger.info(
        "hc_sync user_id=%s received_days=%s saved=%s skipped=%s errors=%s warnings=%s sync_log_id=%s",
        get_current_user_id(),
        len(items),
        saved_totals,
        skipped_totals,
        len(errors),
        warnings,
        sync_log_id,
    )

    response: dict[str, Any] = {
        "ok": sync_ok,
        "status": "ok" if not errors else "partial",
        "received_days": len(items),
        "saved": saved_totals,
        "skipped": skipped_totals,
        "warnings": warnings,
        "sync_log_id": sync_log_id,
        "saved_days": len(results),
        "results": results,
        "errors": errors,
        "audit": batch_audit,
    }
    return response
