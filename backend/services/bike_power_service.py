# -*- coding: utf-8 -*-
"""Мощность велотренировок: реальная из FIT и оценочная по модели."""
from __future__ import annotations

import logging
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import bike_settings_service
from backend.services import settings_service
from utils.constants import CARDIO_DB_BIKE
from utils.hr_profile import age_from_date_of_birth
from utils.power_estimation import (
    EstimationModel,
    average_estimated_power_from_sensor_rows,
    average_real_power,
    compute_cda,
)

logger = logging.getLogger(__name__)

PROFILE_ID = 1

POWER_SOURCE_REAL = "real"
POWER_SOURCE_ESTIMATED = "estimated"  # legacy
POWER_SOURCE_ESTIMATED_ADVANCED = "estimated_advanced"
POWER_SOURCE_ESTIMATED_BASIC = "estimated_basic"

_ESTIMATED_SOURCES = frozenset(
    {
        POWER_SOURCE_ESTIMATED,
        POWER_SOURCE_ESTIMATED_ADVANCED,
        POWER_SOURCE_ESTIMATED_BASIC,
    }
)

_MTB_TIRE_TYPES = frozenset({"gravel", "cx"})


def _sensor_rows(conn, workout_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT elapsed_sec, speed_kmh, elevation_m, power_watts
        FROM workout_sensors
        WHERE cardio_workout_id = ? AND user_id = ?
        ORDER BY elapsed_sec
        """,
        (int(workout_id), get_current_user_id()),
    ).fetchall()
    return [dict(r) for r in rows]


def _power_series(conn, workout_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT elapsed_sec, power_watts
        FROM workout_sensors
        WHERE cardio_workout_id = ? AND user_id = ?
          AND power_watts IS NOT NULL AND power_watts > 0
        ORDER BY elapsed_sec
        """,
        (int(workout_id), get_current_user_id()),
    ).fetchall()
    return [
        {"elapsed_sec": int(r["elapsed_sec"]), "power_watts": float(r["power_watts"])}
        for r in rows
    ]


def _real_power_values_from_rows(rows: list[dict[str, Any]]) -> list[float]:
    out: list[float] = []
    for row in rows:
        pw = row.get("power_watts")
        if pw is None:
            continue
        try:
            v = float(pw)
        except (TypeError, ValueError):
            continue
        if v > 0:
            out.append(v)
    return out


def _update_power_columns(
    conn,
    workout_id: int,
    *,
    has_power_data: bool,
    avg_power_watts: float | None,
    estimated_avg_power_watts: float | None,
    power_source: str | None,
    avg_power_legacy: float | None = None,
    max_power_legacy: float | None = None,
) -> None:
    conn.execute(
        """
        UPDATE cardio_workouts SET
            has_power_data = ?,
            avg_power_watts = ?,
            estimated_avg_power_watts = ?,
            power_source = ?,
            avg_power = COALESCE(?, avg_power),
            max_power = COALESCE(?, max_power)
        WHERE id = ?
        """,
        (
            1 if has_power_data else 0,
            avg_power_watts,
            estimated_avg_power_watts,
            power_source,
            avg_power_legacy,
            max_power_legacy,
            int(workout_id),
        ),
    )


def _has_stored_power(row) -> bool:
    if int(row["has_power_data"] or 0) == 1 or row["power_source"] == POWER_SOURCE_REAL:
        return True
    if row["power_source"] in _ESTIMATED_SOURCES:
        est = row["estimated_avg_power_watts"]
        return est is not None and float(est) > 0
    if row["avg_power_watts"] is not None and float(row["avg_power_watts"]) > 0:
        return True
    return False


def _latest_body_metrics(conn) -> dict[str, Any] | None:
    row = conn.execute(
        """
        SELECT weight_kg, body_fat_percent, date
        FROM body_metrics
        WHERE weight_kg IS NOT NULL AND weight_kg > 0
        ORDER BY date DESC
        LIMIT 1
        """
    ).fetchone()
    if row:
        return dict(row)
    row = conn.execute(
        """
        SELECT weight_kg, body_fat_percent, date
        FROM daily_weight
        WHERE weight_kg IS NOT NULL AND weight_kg > 0
        ORDER BY date DESC
        LIMIT 1
        """
    ).fetchone()
    return dict(row) if row else None


def _user_profile_physiology(conn) -> dict[str, Any]:
    row = conn.execute(
        """
        SELECT sex, date_of_birth, height_cm
        FROM user_profile
        WHERE id = ?
        """,
        (PROFILE_ID,),
    ).fetchone()
    if not row:
        return {}
    return dict(row)


def _resolve_drag_coefficient(settings: dict[str, Any], sex: str) -> float:
    tire = str(settings.get("tire_type") or bike_settings_service.DEFAULTS["tire_type"])
    if tire in _MTB_TIRE_TYPES:
        return 1.0
    if sex == "female":
        return 0.90
    return 0.88


def _get_rider_cda(conn, settings: dict[str, Any] | None = None) -> float | None:
    """
    CdA (м²) по последним body_metrics + user_profile.
    None — недостаточно данных (нужны вес и рост).
    """
    settings = settings or bike_settings_service.get_or_create_bike_settings(conn=conn)
    body = _latest_body_metrics(conn)
    profile = _user_profile_physiology(conn)

    weight_kg: float | None = None
    if body and body.get("weight_kg") is not None:
        try:
            w = float(body["weight_kg"])
            if w > 0:
                weight_kg = w
        except (TypeError, ValueError):
            pass
    if weight_kg is None:
        weight_kg = bike_settings_service.resolve_rider_weight_kg(settings, conn)

    height_cm: float | None = None
    if profile.get("height_cm") is not None:
        try:
            h = float(profile["height_cm"])
            if h > 0:
                height_cm = h
        except (TypeError, ValueError):
            pass

    if weight_kg is None or weight_kg <= 0 or height_cm is None or height_cm <= 0:
        return None

    sex = str(profile.get("sex") or settings_service.get_sex() or "male").strip().lower()
    if sex not in ("male", "female"):
        sex = "male"
    cd = _resolve_drag_coefficient(settings, sex)
    cda = compute_cda(weight_kg, height_cm, cd=cd)
    age = age_from_date_of_birth(profile.get("date_of_birth"))
    logger.info(
        "Rider CdA: %.4f m² (Cd=%.2f, weight=%.1f kg, height=%.0f cm, sex=%s, tire=%s%s)",
        cda,
        cd,
        weight_kg,
        height_cm,
        sex,
        settings.get("tire_type"),
        f", age={age}" if age is not None else "",
    )
    return round(cda, 4)


def _resolve_estimation_plan(
    conn,
    settings: dict[str, Any],
) -> tuple[EstimationModel, float | None, str]:
    """Модель оценки, CdA (если есть) и краткая причина для лога."""
    cda = _get_rider_cda(conn, settings)
    if cda is not None and cda > 0:
        return "advanced", cda, "body metrics + profile (Barry A × Cd)"
    return "basic", None, "no weight/height for CdA — rolling + gravity only"


def _save_real_power_from_sensor_rows(
    conn,
    workout_id: int,
    rows: list[dict[str, Any]],
) -> bool:
    real_values = _real_power_values_from_rows(rows)
    if not real_values:
        return False
    avg_real = average_real_power(real_values)
    if avg_real is None:
        return False
    _update_power_columns(
        conn,
        workout_id,
        has_power_data=True,
        avg_power_watts=avg_real,
        estimated_avg_power_watts=None,
        power_source=POWER_SOURCE_REAL,
        avg_power_legacy=avg_real,
    )
    logger.info(
        "Workout %s: real power from sensors (avg %.1f W, n=%d)",
        workout_id,
        avg_real,
        len(real_values),
    )
    return True


def _try_save_estimated_power(conn, workout_id: int) -> bool:
    """Рассчитать и сохранить estimated power; False если данных недостаточно."""
    settings = bike_settings_service.get_or_create_bike_settings(conn=conn)
    rows = _sensor_rows(conn, workout_id)
    if not rows:
        logger.info("Power estimate skipped for workout %s: no sensor rows", workout_id)
        return False

    if _save_real_power_from_sensor_rows(conn, workout_id, rows):
        return True

    crr = bike_settings_service.resolve_effective_crr(settings, conn)
    total_mass = bike_settings_service.resolve_total_mass_kg(settings, conn)
    model, cda, reason = _resolve_estimation_plan(conn, settings)

    if model == "advanced":
        power_source = POWER_SOURCE_ESTIMATED_ADVANCED
    else:
        power_source = POWER_SOURCE_ESTIMATED_BASIC

    estimated = average_estimated_power_from_sensor_rows(
        rows,
        total_mass_kg=total_mass,
        crr=crr,
        cda=cda,
        model=model,
    )
    if estimated is None:
        logger.info("Power estimate skipped for workout %s: no speed points", workout_id)
        return False

    logger.info(
        "Workout %s: estimated power %.1f W — model=%s, source=%s (%s)",
        workout_id,
        estimated,
        model,
        power_source,
        reason,
    )
    _update_power_columns(
        conn,
        workout_id,
        has_power_data=False,
        avg_power_watts=None,
        estimated_avg_power_watts=estimated,
        power_source=power_source,
    )
    return True


def apply_power_from_import(
    conn,
    workout_id: int,
    *,
    by_second: dict[int, dict[str, Any]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> None:
    """Вызывается из fit_importer после сохранения датчиков."""
    metadata = metadata or {}
    by_second = by_second or {}
    real_values = [
        float(slot["power_watts"])
        for slot in by_second.values()
        if slot.get("power_watts") is not None and float(slot["power_watts"]) > 0
    ]
    if not real_values and metadata.get("avg_power"):
        try:
            real_values = [float(metadata["avg_power"])]
        except (TypeError, ValueError):
            pass

    max_power = metadata.get("max_power")
    try:
        max_power_f = float(max_power) if max_power is not None else None
    except (TypeError, ValueError):
        max_power_f = None

    if real_values:
        avg_real = average_real_power(real_values)
        _update_power_columns(
            conn,
            workout_id,
            has_power_data=True,
            avg_power_watts=avg_real,
            estimated_avg_power_watts=None,
            power_source=POWER_SOURCE_REAL,
            avg_power_legacy=avg_real,
            max_power_legacy=max_power_f,
        )
        logger.info("Workout %s: real power from FIT import (avg %.1f W)", workout_id, avg_real)
        return

    if _try_save_estimated_power(conn, workout_id):
        return
    _update_power_columns(
        conn,
        workout_id,
        has_power_data=False,
        avg_power_watts=None,
        estimated_avg_power_watts=None,
        power_source=None,
    )


def estimate_workout_power(workout_id: int) -> dict[str, Any] | None:
    """Пересчёт оценочной мощности для существующей тренировки."""
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, type, has_power_data, power_source
            FROM cardio_workouts WHERE id = ? AND user_id = ?
            """,
            (int(workout_id), get_current_user_id()),
        ).fetchone()
        if row is None:
            return None
        if str(row["type"]) != CARDIO_DB_BIKE:
            raise ValueError("Расчёт мощности доступен только для велотренировок")
        if int(row["has_power_data"] or 0) == 1 or row["power_source"] == POWER_SOURCE_REAL:
            raise ValueError("У тренировки уже есть реальные данные мощности")

        if not _try_save_estimated_power(conn, workout_id):
            raise ValueError("Недостаточно данных (скорость/GPS) для расчёта мощности")
        conn.commit()
    finally:
        conn.close()
    return get_workout_power(workout_id)


def backfill_missing_bike_power(*, limit: int = 500) -> dict[str, int]:
    """Рассчитать мощность для велотренировок без сохранённых данных."""
    conn = get_db()
    estimated = 0
    skipped = 0
    already = 0
    try:
        rows = conn.execute(
            """
            SELECT id, type, has_power_data, avg_power_watts, estimated_avg_power_watts,
                   power_source
            FROM cardio_workouts
            WHERE type = ? AND user_id = ?
            ORDER BY date DESC, id DESC
            LIMIT ?
            """,
            (CARDIO_DB_BIKE, get_current_user_id(), int(limit)),
        ).fetchall()
        for row in rows:
            if _has_stored_power(row):
                already += 1
                continue
            if _try_save_estimated_power(conn, int(row["id"])):
                estimated += 1
            else:
                skipped += 1
        if estimated:
            conn.commit()
    finally:
        conn.close()
    return {"estimated": estimated, "skipped": skipped, "already_had_power": already}


def get_workout_power(workout_id: int, *, auto_estimate: bool = True) -> dict[str, Any] | None:
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, type, has_power_data, avg_power_watts, estimated_avg_power_watts,
                   power_source, avg_power
            FROM cardio_workouts WHERE id = ? AND user_id = ?
            """,
            (int(workout_id), get_current_user_id()),
        ).fetchone()
        if row is None:
            return None
        if str(row["type"]) != CARDIO_DB_BIKE:
            return None

        if auto_estimate and not _has_stored_power(row):
            if _try_save_estimated_power(conn, workout_id):
                conn.commit()
                row = conn.execute(
                    """
                    SELECT id, type, has_power_data, avg_power_watts, estimated_avg_power_watts,
                           power_source, avg_power
                    FROM cardio_workouts WHERE id = ? AND user_id = ?
                    """,
                    (int(workout_id), get_current_user_id()),
                ).fetchone()
                if row is None:
                    return None

        source = row["power_source"]
        has_real = bool(int(row["has_power_data"] or 0)) or source == POWER_SOURCE_REAL
        has_estimated = source in _ESTIMATED_SOURCES
        avg_power = row["avg_power_watts"]
        if avg_power is None and has_estimated:
            avg_power = row["estimated_avg_power_watts"]
        if avg_power is None and row["avg_power"] is not None:
            avg_power = row["avg_power"]

        series: list[dict[str, Any]] = []
        if has_real:
            series = _power_series(conn, workout_id)

        return {
            "workout_id": int(workout_id),
            "has_real": has_real,
            "has_estimated": has_estimated,
            "avg_power": float(avg_power) if avg_power is not None else None,
            "source": source,
            "series": series if has_real else [],
        }
    finally:
        conn.close()
