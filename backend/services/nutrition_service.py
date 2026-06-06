# -*- coding: utf-8 -*-
"""Динамический прогноз сушки с учётом лимита дефицита на кг жира."""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any

from fastapi import HTTPException

KCAL_PER_KG = 7700.0
MIN_BODY_FAT_PERCENT = 3.0
DEFAULT_MAX_SAFE_DEFICIT_PER_KG_FAT = 35.0
DEFAULT_MAX_PHYSIOLOGICAL_DEFICIT_PER_KG_FAT = 70.0


class UnreachableCutGoalError(ValueError):
    """Цель по составу тела недостижима при сохранении сухой массы."""


class PhysiologicalDeficitExceededError(ValueError):
    """Дефицит выше физиологического предела — прогноз не строится."""

    def __init__(
        self,
        message: str,
        *,
        recommended_additional_calories: float,
        current_deficit_kcal: float,
        physiological_limit_kcal: float,
        max_physiological_per_kg_fat: float,
    ) -> None:
        super().__init__(message)
        self.recommended_additional_calories = recommended_additional_calories
        self.current_deficit_kcal = current_deficit_kcal
        self.physiological_limit_kcal = physiological_limit_kcal
        self.max_physiological_per_kg_fat = max_physiological_per_kg_fat


def assess_deficit_zone(
    real_avg_deficit_per_day: float,
    current_fat_kg: float,
    max_safe_per_kg_fat: float,
    max_physiological_per_kg_fat: float,
) -> dict[str, Any]:
    """Статус дефицита: safe | warning | danger."""
    safe_limit = max_safe_per_kg_fat * current_fat_kg
    phys_limit = max_physiological_per_kg_fat * current_fat_kg
    real = float(real_avg_deficit_per_day)

    if real > phys_limit + 0.5:
        extra = int(round(real - phys_limit))
        return {
            "deficit_status": "danger",
            "deficit_warning_message": (
                "Опасный уровень дефицита: вероятна потеря мышц, а не только жира. "
                f"Физиологический предел — до {int(round(phys_limit))} ккал/день "
                f"({max_physiological_per_kg_fat:.0f} ккал/кг жира). "
                f"Рекомендуем увеличить калорийность на {extra} ккал/день."
            ),
            "recommended_additional_calories": extra,
            "current_deficit_limit_safe_kcal": _round1(safe_limit),
            "current_deficit_limit_physiological_kcal": _round1(phys_limit),
        }

    if real > safe_limit + 0.5:
        extra = int(round(real - safe_limit))
        return {
            "deficit_status": "warning",
            "deficit_warning_message": (
                f"Ваш дефицит превышает безопасную зону ({max_safe_per_kg_fat:.0f} ккал/кг жира в день, "
                f"сейчас до {int(round(safe_limit))} ккал/день). Это может ускорить потерю мышц. "
                f"Рекомендуем снизить дефицит — добавить ~{extra} ккал/день в рацион."
            ),
            "recommended_additional_calories": extra,
            "current_deficit_limit_safe_kcal": _round1(safe_limit),
            "current_deficit_limit_physiological_kcal": _round1(phys_limit),
        }

    return {
        "deficit_status": "safe",
        "deficit_warning_message": None,
        "recommended_additional_calories": 0,
        "current_deficit_limit_safe_kcal": _round1(safe_limit),
        "current_deficit_limit_physiological_kcal": _round1(phys_limit),
    }


def _safe_float(v: float | int | None, default: float = 0.0) -> float:
    try:
        n = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return default
    if not math.isfinite(n):
        return default
    return n


def _round1(v: float, *, default: float = 0.0) -> float:
    n = _safe_float(v, default=default)
    return round(n, 1)


def _resolve_target_fat_kg(
    *,
    lean_mass_kg: float,
    current_fat_kg: float,
    target_weight_kg: float | None,
    target_body_fat_percent: float | None,
) -> tuple[float, float | None]:
    """Возвращает (target_fat_kg, implied_target_weight_kg)."""
    if target_body_fat_percent is not None and target_weight_kg is not None:
        target_fat = target_weight_kg * target_body_fat_percent / 100.0
        return target_fat, target_weight_kg

    if target_body_fat_percent is not None:
        bf = float(target_body_fat_percent)
        if bf >= 100:
            raise UnreachableCutGoalError("Некорректный целевой % жира.")
        implied_weight = lean_mass_kg / (1.0 - bf / 100.0)
        return implied_weight * bf / 100.0, implied_weight

    if target_weight_kg is not None:
        return target_weight_kg - lean_mass_kg, target_weight_kg

    raise ValueError("Укажите целевой вес и/или целевой % жира.")


def _validate_cut_goal(
    *,
    lean_mass_kg: float,
    current_fat_kg: float,
    current_weight_kg: float,
    target_fat_kg: float,
    target_weight_kg: float | None,
) -> None:
    min_weight_at_3pct = lean_mass_kg / (1.0 - MIN_BODY_FAT_PERCENT / 100.0)

    if target_fat_kg <= 0:
        raise UnreachableCutGoalError(
            "Цель недостижима без потери мышечной массы: целевой жир ≤ 0 кг."
        )

    if target_fat_kg >= current_fat_kg - 0.05:
        raise UnreachableCutGoalError(
            "Целевой жир не ниже текущего — при сушке цель должна уменьшать долю жира."
        )

    if target_weight_kg is not None and target_weight_kg < min_weight_at_3pct - 0.05:
        raise UnreachableCutGoalError(
            f"Цель недостижима без потери мышечной массы: минимальный вес при ~{MIN_BODY_FAT_PERCENT:.0f}% "
            f"жира ≈ {_round1(min_weight_at_3pct)} кг."
        )

    target_lean = current_weight_kg - target_fat_kg if target_weight_kg is None else (
        target_weight_kg - target_fat_kg
    )
    if target_lean < lean_mass_kg - 0.1:
        raise UnreachableCutGoalError(
            "Цель недостижима без потери мышечной массы: целевая сухая масса ниже текущей."
        )


def calculate_dynamic_cut_forecast(
    current_weight_kg: float,
    current_body_fat_percent: float,
    target_weight_kg: float | None,
    target_body_fat_percent: float | None,
    real_avg_deficit_per_day: float,
    max_deficit_per_kg_fat: float = DEFAULT_MAX_SAFE_DEFICIT_PER_KG_FAT,
    max_physiological_deficit_per_kg_fat: float = DEFAULT_MAX_PHYSIOLOGICAL_DEFICIT_PER_KG_FAT,
    weeks_limit: int = 52,
    observed_deficit_per_kg_fat: float | None = None,
) -> dict[str, Any]:
    """
    Пошаговый прогноз сушки по жировой массе.

    real_avg_deficit_per_day — фактический дефicit за период (ккал/день).
    Ставка ккал/кг жира фиксируется на старте; на каждом шаге projected deficit
    = ставка × текущий жир, с потолком max_physiological × жир (кг).
    """
    if real_avg_deficit_per_day <= 0:
        raise ValueError("Нет дефицита калорий — прогноз сушки невозможен.")

    cw = float(current_weight_kg)
    bf_pct = float(current_body_fat_percent)
    lean_mass = cw * (1.0 - bf_pct / 100.0)
    current_fat_kg = cw * bf_pct / 100.0
    max_safe = float(max_deficit_per_kg_fat)
    max_phys = float(max_physiological_deficit_per_kg_fat)

    if current_fat_kg <= 0:
        raise ValueError("Жировая масса должна быть > 0 для прогноза сушки.")

    if observed_deficit_per_kg_fat is not None and float(observed_deficit_per_kg_fat) > 0:
        observed_deficit_per_kg_fat = float(observed_deficit_per_kg_fat)
    else:
        observed_deficit_per_kg_fat = real_avg_deficit_per_day / current_fat_kg
    projected_at_start = observed_deficit_per_kg_fat * current_fat_kg
    deficit_capped_at_start = projected_at_start > max_phys * current_fat_kg + 0.5

    zone = assess_deficit_zone(real_avg_deficit_per_day, current_fat_kg, max_safe, max_phys)

    target_fat_kg, implied_target_weight = _resolve_target_fat_kg(
        lean_mass_kg=lean_mass,
        current_fat_kg=current_fat_kg,
        target_weight_kg=target_weight_kg,
        target_body_fat_percent=target_body_fat_percent,
    )
    _validate_cut_goal(
        lean_mass_kg=lean_mass,
        current_fat_kg=current_fat_kg,
        current_weight_kg=cw,
        target_fat_kg=target_fat_kg,
        target_weight_kg=implied_target_weight or target_weight_kg,
    )

    weeks_limit = max(1, int(weeks_limit))

    weeks = 0
    fat_kg = current_fat_kg
    weight_kg = cw
    weeks_log: list[dict[str, Any]] = [
        {
            "week": 0,
            "weight_kg": _round1(weight_kg),
            "body_fat_percent": _round1(bf_pct),
            "fat_kg": _round1(fat_kg),
            "deficit_used": 0.0,
            "deficit_limit_safe": _round1(max_safe * fat_kg),
            "deficit_limit_physiological": _round1(max_phys * fat_kg),
        }
    ]

    goal_reached = fat_kg <= target_fat_kg + 0.05

    while fat_kg > target_fat_kg + 0.001 and weeks < weeks_limit:
        deficit_limit_safe = max_safe * fat_kg
        deficit_limit_physiological = max_phys * fat_kg
        projected_deficit = observed_deficit_per_kg_fat * fat_kg
        effective_deficit = min(projected_deficit, deficit_limit_physiological)
        fat_loss_week = effective_deficit * 7.0 / KCAL_PER_KG
        if fat_loss_week <= 0:
            break
        fat_kg = max(target_fat_kg, fat_kg - fat_loss_week)
        weight_kg = lean_mass + fat_kg
        bf_now = (fat_kg / weight_kg * 100.0) if weight_kg > 0 else 0.0
        weeks += 1
        weeks_log.append(
            {
                "week": weeks,
                "weight_kg": _round1(weight_kg),
                "body_fat_percent": _round1(bf_now),
                "fat_kg": _round1(fat_kg),
                "deficit_used": _round1(effective_deficit),
                "deficit_projected": _round1(projected_deficit),
                "deficit_limit_safe": _round1(deficit_limit_safe),
                "deficit_limit_physiological": _round1(deficit_limit_physiological),
            }
        )
        if fat_kg <= target_fat_kg + 0.001:
            goal_reached = True
            break

    approximate = not goal_reached and weeks >= weeks_limit

    linear_fat_per_week = real_avg_deficit_per_day * 7.0 / KCAL_PER_KG
    fat_to_lose = current_fat_kg - target_fat_kg
    linear_weeks = (
        _round1(fat_to_lose / linear_fat_per_week) if linear_fat_per_week > 0 else None
    )

    return {
        "weeks_to_target": float(weeks if goal_reached else weeks_limit),
        "goal_reached": goal_reached,
        "approximate": approximate,
        "target_fat_kg": _round1(target_fat_kg),
        "target_weight_kg_reached": _round1(lean_mass + target_fat_kg),
        "target_body_fat_percent_reached": _round1(
            (target_fat_kg / (lean_mass + target_fat_kg) * 100.0)
            if (lean_mass + target_fat_kg) > 0
            else 0.0
        ),
        "implied_target_weight_kg": _round1(implied_target_weight)
        if implied_target_weight is not None
        else None,
        "lean_mass_kg": _round1(lean_mass),
        "linear_weeks_to_target": linear_weeks,
        "weeks_longer_than_linear": (
            _round1(float(weeks) - float(linear_weeks))
            if linear_weeks is not None and goal_reached and weeks > linear_weeks
            else None
        ),
        "weeks_log": weeks_log,
        "real_avg_deficit_per_day": _round1(real_avg_deficit_per_day),
        "observed_deficit_per_kg_fat": _round1(observed_deficit_per_kg_fat),
        "max_deficit_per_kg_fat": max_safe,
        "max_physiological_deficit_per_kg_fat": max_phys,
        "deficit_status": zone["deficit_status"],
        "deficit_warning_message": zone.get("deficit_warning_message"),
        "recommended_additional_calories": zone.get("recommended_additional_calories", 0),
        "current_deficit_limit_safe_kcal": zone.get("current_deficit_limit_safe_kcal"),
        "current_deficit_limit_physiological_kcal": zone.get(
            "current_deficit_limit_physiological_kcal"
        ),
        "deficit_capped_at_start": deficit_capped_at_start,
    }


def build_dynamic_cut_forecast_response(
    *,
    target_weight_kg: float | None,
    target_body_fat_percent: float | None,
    prefer_chest_workout: bool = True,
    balance_period: str = "rolling_14",
    max_deficit_per_kg_fat: float | None = None,
    persist_plan: bool = False,
) -> dict[str, Any]:
    """Полный ответ API: баланс за период + динамический прогноз."""
    from backend.core import week_calendar
    from backend.services import nutrition_balance_service, settings_service
    from database.db_utils import get_nutrition_input_snapshot, save_nutrition_plan

    if target_weight_kg is None and target_body_fat_percent is None:
        raise HTTPException(
            status_code=400,
            detail="Укажите целевой вес и/или целевой % жира.",
        )

    snap = get_nutrition_input_snapshot()
    weight = snap.get("weight_kg")
    bf = snap.get("body_fat_percent")
    if weight is None:
        raise HTTPException(status_code=400, detail="Нет веса. Добавьте запись в разделе «Тело».")
    if bf is None:
        raise HTTPException(
            status_code=400,
            detail="Нет % жира — динамический прогноз сушки требует замеров состава тела.",
        )

    cw = float(weight)
    bf_f = float(bf)

    defaults = nutrition_balance_service.get_calorie_control_defaults()
    max_def = float(
        max_deficit_per_kg_fat
        if max_deficit_per_kg_fat is not None
        else defaults["max_deficit_per_kg_fat"]
    )
    max_phys = float(defaults["max_physiological_deficit_per_kg_fat"])

    wsd = week_calendar.normalize_week_start_day(settings_service.get_week_start_day())
    balance, period, balance_period_label = nutrition_balance_service.fetch_phase_energy_balance(
        "cut",
        balance_period,
        prefer_chest=prefer_chest_workout,
        week_start_day=wsd,
    )

    if not balance.get("ok"):
        raise HTTPException(status_code=400, detail=balance.get("error", "Нет данных"))

    real_deficit = float(balance["average_real_deficit_kcal"])
    if real_deficit <= 0:
        raise HTTPException(
            status_code=400,
            detail="Нет дефицита за выбранный период — прогноз сушки невозможен.",
        )
    real_deficit = _round1(real_deficit)

    balance_real_per_kg = balance.get("average_real_deficit_per_kg_fat")
    if balance_real_per_kg is not None and cw * bf_f / 100.0 > 0:
        observed_from_balance = float(balance_real_per_kg)
    else:
        observed_from_balance = real_deficit / (cw * bf_f / 100.0)

    try:
        dynamic = calculate_dynamic_cut_forecast(
            cw,
            bf_f,
            target_weight_kg,
            target_body_fat_percent,
            real_deficit,
            max_deficit_per_kg_fat=max_def,
            max_physiological_deficit_per_kg_fat=max_phys,
            observed_deficit_per_kg_fat=observed_from_balance,
        )
    except UnreachableCutGoalError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e

    weeks_to_target = _safe_float(dynamic["weeks_to_target"], default=0.0)
    end = date.today()
    target_date = (
        end + timedelta(days=int(math.ceil(max(0.0, weeks_to_target) * 7)))
    ).isoformat()

    weight_projection: list[dict[str, Any]] = []
    for row in dynamic["weeks_log"]:
        w = _safe_float(row.get("weight_kg"))
        if w <= 0:
            continue
        bf_row = row.get("body_fat_percent")
        bf_val = _round1(bf_row) if bf_row is not None and math.isfinite(float(bf_row)) else None
        weight_projection.append(
            {
                "week": int(row["week"]),
                "date": (end + timedelta(days=int(row["week"]) * 7)).isoformat(),
                "weight_kg": _round1(w),
                "body_fat_percent": bf_val,
            }
        )

    resolved_target_weight = (
        target_weight_kg
        if target_weight_kg is not None
        else dynamic.get("implied_target_weight_kg")
    )

    result: dict[str, Any] = {
        "model": "dynamic_cut",
        "phase": "cut",
        "current_weight_kg": _round1(cw),
        "current_body_fat_percent": _round1(bf_f),
        "average_daily_calorie_intake": balance["average_daily_intake"],
        "average_daily_expenditure": balance["average_daily_expenditure"],
        "daily_surplus_or_deficit": _round1(float(balance["daily_balance_kcal"])),
        "real_avg_deficit_per_day": real_deficit,
        "change_per_week_kg": _round1(
            (
                _safe_float(dynamic["weeks_log"][0]["weight_kg"])
                - _safe_float(dynamic["weeks_log"][-1]["weight_kg"])
            )
            / max(1.0, weeks_to_target)
            if len(dynamic["weeks_log"]) > 1 and weeks_to_target > 0
            else 0.0
        ),
        "weeks_to_target": weeks_to_target,
        "target_date": target_date,
        "target_weight_kg": _round1(resolved_target_weight) if resolved_target_weight else None,
        "target_body_fat_percent": (
            _round1(target_body_fat_percent) if target_body_fat_percent is not None else None
        ),
        "target_fat_kg": dynamic["target_fat_kg"],
        "target_lean_mass_kg": dynamic["lean_mass_kg"],
        "goal_reached": dynamic["goal_reached"],
        "approximate": dynamic["approximate"],
        "goal_reached_message": "Цель достигнута." if dynamic["goal_reached"] else None,
        "lookback_days": balance.get("lookback_days", nutrition_balance_service.FORECAST_BALANCE_DAYS_BACK),
        "balance_period": period,
        "balance_period_label": balance_period_label,
        "balance_from": balance.get("period_start"),
        "balance_to": balance.get("period_end"),
        "average_real_deficit_per_kg_fat": balance.get("average_real_deficit_per_kg_fat"),
        "target_deficit_per_kg_fat": max_def,
        "deficit_over_planned": (
            balance.get("average_real_deficit_per_kg_fat") is not None
            and float(balance["average_real_deficit_per_kg_fat"]) > max_def + 0.5
        ),
        "difference_kcal_per_day": _round1(real_deficit - max_def * (cw * bf_f / 100.0))
        if bf_f > 0
        else None,
        "days_counted": balance.get("days_counted"),
        "days_missing": balance.get("days_missing"),
        "balance_days": balance.get("days"),
        "weight_projection": weight_projection,
        "weeks_log": dynamic["weeks_log"],
        "linear_weeks_to_target": dynamic.get("linear_weeks_to_target"),
        "weeks_longer_than_linear": dynamic.get("weeks_longer_than_linear"),
        "max_deficit_per_kg_fat": max_def,
        "max_physiological_deficit_per_kg_fat": max_phys,
        "deficit_status": dynamic.get("deficit_status", "safe"),
        "deficit_warning_message": dynamic.get("deficit_warning_message"),
        "recommended_additional_calories": dynamic.get("recommended_additional_calories", 0),
        "current_deficit_limit_safe_kcal": dynamic.get("current_deficit_limit_safe_kcal"),
        "current_deficit_limit_physiological_kcal": dynamic.get(
            "current_deficit_limit_physiological_kcal"
        ),
        "deficit_capped_at_start": dynamic.get("deficit_capped_at_start", False),
        "observed_deficit_per_kg_fat": dynamic.get("observed_deficit_per_kg_fat"),
        "dynamic_explanation": (
            "Дефицит в прогнозе пересчитывается по мере снижения жировой массы "
            f"(~{dynamic.get('observed_deficit_per_kg_fat', 0):.1f} ккал/кг жира × текущий жир). "
            "По мере похудения абсолютный дефицит и скорость потери веса снижаются."
        ),
    }

    if dynamic.get("weeks_longer_than_linear") and dynamic["weeks_longer_than_linear"] > 0:
        result["dynamic_explanation"] = (
            f"Динамический прогноз на ~{dynamic['weeks_longer_than_linear']:.1f} нед. дольше линейного: "
            "дефицит уменьшается вместе с жировой массой (фактическая ставка ккал/кг × текущий жир), "
            "поэтому скорость похудения ниже, чем при фиксированном стартовом дефиците."
        )
    elif dynamic.get("deficit_capped_at_start"):
        result["dynamic_explanation"] = (
            "В прогнозе дефицит ограничен физиологическим потолком и дополнительно "
            "снижается по мере уменьшения жировой массы."
        )

    if persist_plan and resolved_target_weight is not None:
        plan_fields: dict[str, Any] = {
            "target_weight_kg": _round1(resolved_target_weight),
        }
        if target_body_fat_percent is not None:
            plan_fields["target_fat_percent"] = float(target_body_fat_percent)
        save_nutrition_plan("cut", **plan_fields)

    return result
