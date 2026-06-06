# -*- coding: utf-8 -*-
"""Расчёт предполагаемой мощности: качение, гравитация, опционально аэродинамика."""
from __future__ import annotations

import logging
import statistics
from typing import Any, Literal

logger = logging.getLogger(__name__)

GRAVITY = 9.81
AIR_DENSITY_KG_M3 = 1.225
DEFAULT_FALLBACK_CDA_M2 = 0.4

EstimationModel = Literal["advanced", "fixed_cda", "basic"]


def frontal_area_barry_m2(weight_kg: float, height_cm: float) -> float:
    """
    Эмпирическая фронтальная площадь (м²).
    A ≈ 0.053 * m^0.425 * h_m^0.725 (рост в метрах; типично ~0.4–0.5 м²).
    """
    w = float(weight_kg)
    h_m = float(height_cm) / 100.0
    if w <= 0 or h_m <= 0:
        raise ValueError("weight_kg и height_cm должны быть > 0")
    return 0.053 * (w**0.425) * (h_m**0.725)


def frontal_area_cyclist_m2(weight_kg: float, height_cm: float) -> float:
    """A = 0.05 * (рост_м^0.7) * (вес^0.425) — вариант для посадки на шоссе."""
    w = float(weight_kg)
    h_m = float(height_cm) / 100.0
    if w <= 0 or h_m <= 0:
        raise ValueError("weight_kg и height_cm должны быть > 0")
    return 0.05 * (h_m**0.7) * (w**0.425)


def compute_cda(
    weight_kg: float,
    height_cm: float,
    *,
    cd: float,
    area_formula: str = "barry",
) -> float:
    if area_formula == "cyclist":
        area = frontal_area_cyclist_m2(weight_kg, height_cm)
    else:
        area = frontal_area_barry_m2(weight_kg, height_cm)
    return float(cd) * area


def estimate_power(
    speed_mps: float,
    slope_percent: float,
    total_mass_kg: float,
    crr: float,
    *,
    cda: float | None = None,
) -> float:
    """
    P = v * (m*g*(Crr + slope) + 0.5*rho*CdA*v²) при заданном cda;
    иначе P = m*g*v*(Crr + slope) без аэродинамики.
    """
    if speed_mps <= 0 or total_mass_kg <= 0:
        return 0.0
    v = float(speed_mps)
    slope_frac = float(slope_percent) / 100.0
    rolling_gravity = float(total_mass_kg) * GRAVITY * (float(crr) + slope_frac)
    if cda is not None and cda > 0:
        aero = 0.5 * AIR_DENSITY_KG_M3 * float(cda) * (v**2)
        return max(0.0, v * (rolling_gravity + aero))
    return max(0.0, float(total_mass_kg) * GRAVITY * v * (float(crr) + slope_frac))


def slope_percent(delta_elevation_m: float, delta_distance_m: float) -> float:
    if delta_distance_m <= 0:
        return 0.0
    return (float(delta_elevation_m) / float(delta_distance_m)) * 100.0


def average_estimated_power_from_sensor_rows(
    rows: list[dict[str, Any]],
    *,
    total_mass_kg: float,
    crr: float,
    cda: float | None = None,
    model: EstimationModel = "basic",
) -> float | None:
    """Средняя оценочная мощность по точкам workout_sensors (скорость + уклон)."""
    if not rows or total_mass_kg <= 0:
        return None

    effective_cda: float | None
    if model == "advanced":
        effective_cda = cda
    elif model == "fixed_cda":
        effective_cda = float(cda) if cda is not None and cda > 0 else DEFAULT_FALLBACK_CDA_M2
        if cda is None or cda <= 0:
            logger.warning(
                "Power estimation: fixed CdA fallback %.2f m² (no body metrics for CdA)",
                effective_cda,
            )
    else:
        effective_cda = None

    ordered = sorted(rows, key=lambda r: int(r.get("elapsed_sec") or 0))
    powers: list[float] = []
    prev: dict[str, Any] | None = None

    for row in ordered:
        speed_kmh = row.get("speed_kmh")
        if speed_kmh is None:
            prev = row
            continue
        try:
            speed_mps = float(speed_kmh) / 3.6
        except (TypeError, ValueError):
            prev = row
            continue
        if speed_mps <= 0:
            prev = row
            continue

        slope = 0.0
        if prev is not None:
            elev_prev = prev.get("elevation_m")
            elev_curr = row.get("elevation_m")
            if elev_prev is not None and elev_curr is not None:
                dt = int(row.get("elapsed_sec") or 0) - int(prev.get("elapsed_sec") or 0)
                if dt > 0:
                    dist_m = speed_mps * dt
                    slope = slope_percent(float(elev_curr) - float(elev_prev), dist_m)

        pwr = estimate_power(speed_mps, slope, total_mass_kg, crr, cda=effective_cda)
        if pwr > 0:
            powers.append(pwr)
        prev = row

    if not powers:
        logger.info("No valid speed points for power estimation")
        return None
    return round(statistics.mean(powers), 1)


def average_real_power(values: list[float | int]) -> float | None:
    positive = [float(v) for v in values if v is not None and float(v) > 0]
    if not positive:
        return None
    return round(statistics.mean(positive), 1)
