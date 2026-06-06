# -*- coding: utf-8 -*-
"""Средний баланс калорий за неделю, контроль дефицита и цели набора."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from backend.services import analytics_service, food_service, user_service
from database.db_utils import get_nutrition_input_snapshot

KCAL_PER_GRAM_MASS = 7700 / 1000  # 7.7 ккал/г (7700 ккал/кг)
DEFAULT_MAX_DEFICIT_PER_KG_FAT = 35.0
DEFAULT_MAX_PHYSIOLOGICAL_DEFICIT_PER_KG_FAT = 70.0
DEFAULT_TARGET_BULK_GRAMS_PER_WEEK = 300.0
FORECAST_READINESS_MAX_WEEKS_SCAN = 8
# Сколько дней назад от «вчера» начинается окно (вчера включительно в конец).
# Пример: сегодня 30.05 → вчера 29.05, start = 29.05 − 14 д = 15.05.
FORECAST_BALANCE_DAYS_BACK = 14
ROLLING_BALANCE_PERIODS = frozenset({"rolling_7", "rolling_14"})


def rolling_balance_dates_through_yesterday(
    days_back: int = FORECAST_BALANCE_DAYS_BACK,
    *,
    on_date: date | None = None,
) -> tuple[date, date]:
    """Инclusive-диапазон: [вчера − days_back … вчера], сегодня не входит."""
    today = on_date or date.today()
    end = today - timedelta(days=1)
    start = end - timedelta(days=max(0, int(days_back)))
    return start, end


def fetch_phase_energy_balance(
    phase: str,
    balance_period: str,
    *,
    prefer_chest: bool,
    week_start_day: int,
    days_back: int = FORECAST_BALANCE_DAYS_BACK,
) -> tuple[dict[str, Any], str, str]:
    """Баланс калорий за период. Возвращает (balance, period_key, label)."""
    from backend.core import week_calendar

    ph = phase if phase in food_service.FOOD_PHASES else "cut"
    wsd = week_calendar.normalize_week_start_day(week_start_day)
    period = balance_period if balance_period in ("previous_week", *ROLLING_BALANCE_PERIODS) else "rolling_14"

    if period == "previous_week":
        p_start, p_end = week_calendar.previous_week_range(start_day=wsd)
        balance = get_week_energy_balance(
            ph,
            prefer_chest=prefer_chest,
            date_from=p_start,
            date_to=p_end,
        )
        return balance, "previous_week", "прошлая неделя"

    p_start, p_end = rolling_balance_dates_through_yesterday(days_back)
    balance = get_week_energy_balance(
        ph,
        prefer_chest=prefer_chest,
        date_from=p_start,
        date_to=p_end,
    )
    n_days = (p_end - p_start).days + 1
    period_key = "rolling_14"
    label = f"последние {n_days} дн. (до вчера)"
    return balance, period_key, label


def _round1(v: float) -> float:
    return round(float(v), 1)


def get_calorie_control_defaults() -> dict[str, float]:
    profile = user_service.get_profile() or {}
    max_def = profile.get("max_deficit_per_kg_fat")
    max_phys = profile.get("max_physiological_deficit_per_kg_fat")
    bulk_g = profile.get("target_bulk_grams_per_week")
    return {
        "max_deficit_per_kg_fat": float(max_def) if max_def is not None else DEFAULT_MAX_DEFICIT_PER_KG_FAT,
        "max_physiological_deficit_per_kg_fat": float(max_phys)
        if max_phys is not None
        else DEFAULT_MAX_PHYSIOLOGICAL_DEFICIT_PER_KG_FAT,
        "target_bulk_grams_per_week": float(bulk_g)
        if bulk_g is not None
        else DEFAULT_TARGET_BULK_GRAMS_PER_WEEK,
    }


def target_daily_surplus_kcal(grams_per_week: float) -> float:
    """Целевой дневной профицит для набора (г/нед → ккал/день)."""
    return _round1((float(grams_per_week) / 7.0) * KCAL_PER_GRAM_MASS)


def _day_has_food_entries(conn, day: str, phase: str) -> bool:
    from backend.database.db_utils import get_current_user_id

    row = conn.execute(
        """
        SELECT 1 FROM food_entries
        WHERE user_id = ? AND date = ? AND phase = ?
        LIMIT 1
        """,
        (get_current_user_id(), day, phase),
    ).fetchone()
    return row is not None


def _resolve_fat_kg() -> tuple[float | None, str | None]:
    """Жировая масса для расчёта ккал/кг жира (вес × % жира из последнего замера)."""
    snap = get_nutrition_input_snapshot()
    weight = snap.get("weight_kg")
    bf = snap.get("body_fat_percent")
    if weight is None:
        return None, "no_weight"
    if bf is None:
        return None, "no_body_fat"
    fat = float(weight) * float(bf) / 100.0
    if fat <= 0:
        return None, "no_fat_mass"
    return _round1(fat), "snapshot"


def get_week_energy_balance(
    phase: str = "cut",
    *,
    lookback_days: int = FORECAST_BALANCE_DAYS_BACK,
    prefer_chest: bool = True,
    date_from: date | None = None,
    date_to: date | None = None,
) -> dict[str, Any]:
    """
    Средние потребление, расход и фактический дефицит за период.

    На каждый день с известным расходом:
      real_deficit_kcal = expenditure_kcal - intake_kcal  (intake=0, если нет записей)

    Средние считаются по всем дням с расходом (один знаменатель), без подстановки целевого дефицита.
    """
    ph = phase if phase in food_service.FOOD_PHASES else "cut"
    if date_from is not None and date_to is not None:
        start = date_from
        end = date_to
        n_days = (end - start).days + 1
    else:
        if int(lookback_days) == FORECAST_BALANCE_DAYS_BACK:
            start, end = rolling_balance_dates_through_yesterday(FORECAST_BALANCE_DAYS_BACK)
        else:
            end = date.today() - timedelta(days=1)
            start = end - timedelta(days=max(0, int(lookback_days) - 1))
        n_days = (end - start).days + 1

    fat_kg, fat_source = _resolve_fat_kg()
    days_detail: list[dict[str, Any]] = []
    expenditure_days = 0
    days_with_intake = 0
    days_missing = 0
    intake_sum = 0.0
    expenditure_sum = 0.0
    deficit_sum = 0.0

    from backend.database import get_db

    conn = get_db()
    try:
        exp_by_day = analytics_service.get_daily_expenditure_range(
            start.isoformat(),
            end.isoformat(),
            ph,
            prefer_chest=prefer_chest,
            conn=conn,
        )
        cur = start
        while cur <= end:
            d = cur.isoformat()
            daily = food_service._daily_totals_for_day(conn, d, ph)
            intake = float(daily.get("calories") or 0)
            has_entries = _day_has_food_entries(conn, d, ph)

            exp = exp_by_day.get(d) or {}
            total_out = exp.get("total_expenditure")
            if total_out is None:
                cur += timedelta(days=1)
                continue

            total_out_f = float(total_out)
            expenditure_days += 1
            intake_sum += intake
            expenditure_sum += total_out_f
            real_deficit = total_out_f - intake
            deficit_sum += real_deficit

            is_complete = has_entries
            if not has_entries:
                days_missing += 1
            if has_entries and intake > 0:
                days_with_intake += 1

            per_kg: float | None = None
            if fat_kg is not None and fat_kg > 0:
                per_kg = _round1(real_deficit / fat_kg)

            days_detail.append(
                {
                    "date": d,
                    "intake_kcal": _round1(intake),
                    "expenditure_kcal": _round1(total_out_f),
                    "real_deficit_kcal": _round1(real_deficit),
                    "balance_kcal": _round1(intake - total_out_f),
                    "fat_mass_kg_used": fat_kg,
                    "real_deficit_per_kg_fat": per_kg,
                    "is_complete": is_complete,
                    "has_food_entries": has_entries,
                    "fat_mass_source": fat_source,
                }
            )
            cur += timedelta(days=1)
    finally:
        conn.close()

    if expenditure_days == 0:
        return {
            "ok": False,
            "error": (
                "Недостаточно данных за период по расходу. "
                "Заполните дневник питания, профиль (рост, дата рождения, вес) "
                "и при необходимости калории по браслету."
            ),
            "days_with_expenditure": 0,
            "days_with_intake": 0,
            "days_missing": n_days,
        }

    avg_intake = _round1(intake_sum / expenditure_days)
    avg_expenditure = _round1(expenditure_sum / expenditure_days)
    average_real_deficit_kcal = _round1(deficit_sum / expenditure_days)
    daily_balance = _round1(avg_intake - avg_expenditure)

    average_real_deficit_per_kg_fat: float | None = None
    if fat_kg is not None and fat_kg > 0:
        average_real_deficit_per_kg_fat = _round1(average_real_deficit_kcal / fat_kg)

    return {
        "ok": True,
        "phase": ph,
        "lookback_days": n_days,
        "period_start": start.isoformat(),
        "period_end": end.isoformat(),
        "average_daily_intake": avg_intake,
        "average_daily_expenditure": avg_expenditure,
        "daily_balance_kcal": daily_balance,
        "average_real_deficit_kcal": average_real_deficit_kcal,
        "average_real_deficit_per_kg_fat": average_real_deficit_per_kg_fat,
        "fat_kg": fat_kg,
        "fat_mass_source": fat_source,
        "days_with_expenditure": expenditure_days,
        "days_with_intake": days_with_intake,
        "days_counted": expenditure_days,
        "days_missing": days_missing,
        "days": days_detail,
    }


def get_cut_deficit_control(
    *,
    max_deficit_per_kg_fat: float | None = None,
    prefer_chest: bool = True,
    lookback_days: int = FORECAST_BALANCE_DAYS_BACK,
) -> dict[str, Any]:
    defaults = get_calorie_control_defaults()
    target_per_kg = float(
        max_deficit_per_kg_fat if max_deficit_per_kg_fat is not None else defaults["max_deficit_per_kg_fat"]
    )

    snap = get_nutrition_input_snapshot()
    weight = snap.get("weight_kg")
    bf = snap.get("body_fat_percent")

    if weight is None:
        return {
            "ok": False,
            "error": "Нет веса. Добавьте запись в разделе «Тело → Вес».",
        }
    if bf is None:
        return {
            "ok": False,
            "error": "Заполните % жира в разделе «Тело» для расчёта лимита дефицита.",
        }

    weight_f = float(weight)
    bf_f = float(bf)
    fat_kg = _round1(weight_f * bf_f / 100.0)

    balance_data = get_week_energy_balance(
        "cut", lookback_days=lookback_days, prefer_chest=prefer_chest
    )
    if not balance_data.get("ok"):
        return balance_data

    real_deficit_kcal = float(
        balance_data.get("average_real_deficit_kcal")
        or max(0.0, -float(balance_data["daily_balance_kcal"]))
    )
    real_deficit_kcal = _round1(real_deficit_kcal)

    if fat_kg <= 0:
        real_deficit_per_kg = 0.0
    else:
        real_deficit_per_kg = _round1(real_deficit_kcal / fat_kg)

    target_deficit_kcal = _round1(target_per_kg * fat_kg)
    difference_kcal = _round1(real_deficit_kcal - target_deficit_kcal)

    status = "ok"
    message: str | None = None
    extra_kcal = 0.0
    reduce_kcal = 0.0

    if real_deficit_kcal <= 0:
        status = "no_deficit"
        message = "За период дефицита нет (профицит или баланс). Контроль лимита не применяется."
    elif real_deficit_per_kg > target_per_kg:
        status = "over_limit"
        extra_kcal = _round1(max(0.0, difference_kcal))
        message = (
            f"Фактический дефицит выше цели ({real_deficit_per_kg:.1f} vs {target_per_kg:.0f} ккал/кг жира). "
            f"Чтобы не терять мышцы, добавьте в рацион дополнительно {int(round(extra_kcal))} ккал в день."
        )
    elif real_deficit_per_kg < target_per_kg - 0.5:
        status = "below_target"
        reduce_kcal = _round1(max(0.0, -difference_kcal))
        message = (
            f"Фактический дефицит ниже цели ({real_deficit_per_kg:.1f} vs {target_per_kg:.0f} ккал/кг жира). "
            f"Можно усилить дефицит, убрав ~{int(round(reduce_kcal))} ккал/день из рациона."
        )
    else:
        status = "within_limit"
        message = "Фактический дефицит в пределах целевой зоны. Можно продолжать."

    return {
        "ok": True,
        "target_deficit_per_kg_fat": target_per_kg,
        "max_deficit_per_kg_fat": target_per_kg,
        "current_weight_kg": _round1(weight_f),
        "body_fat_percent": _round1(bf_f),
        "fat_kg": fat_kg,
        "average_daily_intake": balance_data["average_daily_intake"],
        "average_daily_expenditure": balance_data["average_daily_expenditure"],
        "real_deficit_kcal": real_deficit_kcal,
        "average_daily_deficit_kcal": real_deficit_kcal,
        "real_deficit_per_kg_fat": real_deficit_per_kg,
        "deficit_per_kg_fat": real_deficit_per_kg,
        "target_deficit_kcal_per_day": target_deficit_kcal,
        "difference_kcal_per_day": difference_kcal,
        "extra_kcal_per_day": extra_kcal,
        "reduce_kcal_per_day": reduce_kcal,
        "status": status,
        "message": message,
        "daily_balance_kcal": balance_data["daily_balance_kcal"],
        "days_counted": balance_data.get("days_counted"),
        "days_missing": balance_data.get("days_missing"),
        "days_with_intake": balance_data.get("days_with_intake"),
        "days": balance_data.get("days"),
        "period_start": balance_data.get("period_start"),
        "period_end": balance_data.get("period_end"),
    }


def _count_intake_days_in_range(phase: str, start: date, end: date) -> int:
    from backend.database import get_db

    ph = phase if phase in food_service.FOOD_PHASES else "cut"
    intake_days = 0
    conn = get_db()
    try:
        cur = start
        while cur <= end:
            daily = food_service._daily_totals_for_day(conn, cur.isoformat(), ph)
            if float(daily.get("calories") or 0) > 0:
                intake_days += 1
            cur += timedelta(days=1)
    finally:
        conn.close()
    return intake_days


def get_forecast_readiness(
    phase: str = "cut",
    *,
    required_weeks: int = 2,
    min_days_with_intake: int = 3,
    week_start_day: int | None = None,
) -> dict[str, Any]:
    """Достаточно ли заполненных календарных недель питания для прогноза (сканирует назад)."""
    from backend.core import week_calendar
    from backend.services import settings_service

    wsd = week_calendar.normalize_week_start_day(
        week_start_day if week_start_day is not None else settings_service.get_week_start_day()
    )
    check_anchor = date.today()
    filled = 0
    weeks_detail: list[dict[str, Any]] = []

    for _ in range(FORECAST_READINESS_MAX_WEEKS_SCAN):
        w_start, w_end = week_calendar.previous_week_range(on_date=check_anchor, start_day=wsd)
        intake_days = _count_intake_days_in_range(phase, w_start, w_end)
        is_filled = intake_days >= min_days_with_intake
        if is_filled:
            filled += 1
        weeks_detail.append(
            {
                "period_start": w_start.isoformat(),
                "period_end": w_end.isoformat(),
                "days_with_intake": intake_days,
                "filled": is_filled,
            }
        )
        if filled >= required_weeks:
            break
        check_anchor = w_start - timedelta(days=1)

    ok = filled >= required_weeks
    message: str | None = None
    if not ok:
        message = (
            f"Нужны данные за {required_weeks} заполненные недели питания "
            f"(минимум {min_days_with_intake} дней с записями в каждой). "
            f"Сейчас: {filled} из {required_weeks}."
        )

    return {
        "ok": ok,
        "filled_weeks": filled,
        "required_weeks": required_weeks,
        "min_days_with_intake": min_days_with_intake,
        "message": message,
        "weeks": weeks_detail,
    }


def get_bulk_gain_control(
    *,
    target_grams_per_week: float | None = None,
    prefer_chest: bool = True,
    lookback_days: int = FORECAST_BALANCE_DAYS_BACK,
) -> dict[str, Any]:
    defaults = get_calorie_control_defaults()
    target_g = float(
        target_grams_per_week
        if target_grams_per_week is not None
        else defaults["target_bulk_grams_per_week"]
    )
    target_surplus = target_daily_surplus_kcal(target_g)
    target_kg_per_week = _round1(target_g / 1000.0)

    snap = get_nutrition_input_snapshot()
    if snap.get("weight_kg") is None:
        return {"ok": False, "error": "Нет веса. Добавьте запись в разделе «Тело → Вес»."}

    balance_data = get_week_energy_balance(
        "bulk", lookback_days=lookback_days, prefer_chest=prefer_chest
    )
    if not balance_data.get("ok"):
        return balance_data

    daily_balance = float(balance_data["daily_balance_kcal"])
    current_surplus = _round1(daily_balance) if daily_balance > 0 else 0.0

    diff = _round1(target_surplus - current_surplus)
    if current_surplus < target_surplus - 5:
        recommendation = f"Увеличьте калорийность примерно на {int(round(abs(diff)))} ккал/день."
        status = "below_target"
    elif current_surplus > target_surplus + 5:
        recommendation = f"Снизьте калорийность примерно на {int(round(abs(diff)))} ккал/день."
        status = "above_target"
    else:
        recommendation = "Текущий профицит соответствует цели набора."
        status = "on_target"

    return {
        "ok": True,
        "target_grams_per_week": _round1(target_g),
        "target_kg_per_week": target_kg_per_week,
        "target_daily_surplus_kcal": target_surplus,
        "current_daily_surplus_kcal": current_surplus,
        "surplus_difference_kcal": diff,
        "status": status,
        "recommendation": recommendation,
        "average_daily_intake": balance_data["average_daily_intake"],
        "average_daily_expenditure": balance_data["average_daily_expenditure"],
        "daily_balance_kcal": balance_data["daily_balance_kcal"],
    }
