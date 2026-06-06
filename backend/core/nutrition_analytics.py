# -*- coding: utf-8 -*-
"""Централизованная аналитика питания: ккал/кг, % жира, прогнозы, предупреждения."""
from __future__ import annotations

import math
from datetime import date, timedelta
from typing import Any, Literal

from backend.services import nutrition_analysis

Sex = Literal["male", "female"]

# --- Справочники и пороги ---
KCAL_PER_KG_BODY_DEFICIT_MAX = 35.0
KCAL_PER_KG_BODY_EXPENDITURE_MAX = 75.0
KCAL_PER_KG_FAT_SAFE_MAX = 35.0
KCAL_PER_KG_FAT_EXTREME = 45.0

TEF_MACRO_RATES = {
    "protein": {"label": "Белки", "min_pct": 20, "max_pct": 30, "rate": nutrition_analysis.TEF_RATE_PROTEIN},
    "carbs": {"label": "Углеводы", "min_pct": 5, "max_pct": 10, "rate": nutrition_analysis.TEF_RATE_CARBS},
    "fat": {"label": "Жиры", "min_pct": 0, "max_pct": 3, "rate": nutrition_analysis.TEF_RATE_FAT},
}

BODY_FAT_CATEGORIES: dict[Sex, list[dict[str, Any]]] = {
    "male": [
        {"key": "essential", "label": "Essential", "min": 2, "max": 5, "color": "red"},
        {"key": "athletic", "label": "Athletic", "min": 6, "max": 13, "color": "green"},
        {"key": "fit", "label": "Fit", "min": 14, "max": 17, "color": "lime"},
        {"key": "average", "label": "Average", "min": 18, "max": 24, "color": "yellow"},
        {"key": "overweight", "label": "Overweight", "min": 25, "max": 29, "color": "orange"},
        {"key": "obese", "label": "Obese", "min": 30, "max": 60, "color": "red"},
    ],
    "female": [
        {"key": "essential", "label": "Essential", "min": 10, "max": 13, "color": "red"},
        {"key": "athletic", "label": "Athletic", "min": 14, "max": 20, "color": "green"},
        {"key": "fit", "label": "Fit", "min": 21, "max": 24, "color": "lime"},
        {"key": "average", "label": "Average", "min": 25, "max": 31, "color": "yellow"},
        {"key": "overweight", "label": "Overweight", "min": 32, "max": 39, "color": "orange"},
        {"key": "obese", "label": "Obese", "min": 40, "max": 60, "color": "red"},
    ],
}

MIN_BODY_FAT_MALE = 5.0
MIN_BODY_FAT_FEMALE = 12.0


def _round1(n: float | None) -> float | None:
    if n is None:
        return None
    return round(float(n), 1)


def _normalize_sex(sex: str | None) -> Sex:
    s = (sex or "male").strip().lower()
    return "female" if s in ("female", "f", "ж", "жен") else "male"


def fat_mass_kg(weight_kg: float | None, body_fat_percent: float | None) -> float | None:
    if weight_kg is None or body_fat_percent is None or weight_kg <= 0:
        return None
    return weight_kg * body_fat_percent / 100.0


def avg_daily_expenditure(week_expenditure_totals: dict[str, float], days: int = 7) -> float | None:
    total = week_expenditure_totals.get("total_out_kcal")
    if total is None or total <= 0:
        return None
    return float(total) / max(days, 1)


def expenditure_without_tef(week_expenditure_totals: dict[str, float], days: int = 7) -> float | None:
    total = week_expenditure_totals.get("total_out_kcal") or 0
    tef = week_expenditure_totals.get("tef_kcal") or 0
    if total <= 0:
        return None
    return (float(total) - float(tef)) / max(days, 1)


def _metric_status(
    value: float | None,
    *,
    safe_max: float | None = None,
    extreme_max: float | None = None,
    low_danger: float | None = None,
) -> str:
    if value is None:
        return "unknown"
    if low_danger is not None and value < low_danger:
        return "danger"
    if extreme_max is not None and value >= extreme_max:
        return "danger"
    if safe_max is not None and value > safe_max:
        return "caution"
    return "ok"


def build_kcal_per_kg_body(
    week_expenditure_totals: dict[str, float],
    weight_kg: float | None,
    week_daily_average: dict[str, float] | None = None,
    days: int = 7,
) -> dict[str, Any]:
    avg_exp = avg_daily_expenditure(week_expenditure_totals, days)
    value = avg_exp / weight_kg if avg_exp and weight_kg and weight_kg > 0 else None
    avg_intake = None
    deficit_per_kg = None
    if week_daily_average and weight_kg and weight_kg > 0:
        avg_intake = float(week_daily_average.get("calories") or 0)
        if avg_exp is not None:
            deficit_per_kg = (avg_exp - avg_intake) / weight_kg

    status = "unknown"
    if value is not None:
        if value >= KCAL_PER_KG_BODY_EXPENDITURE_MAX:
            status = "danger"
        elif deficit_per_kg is not None and deficit_per_kg > KCAL_PER_KG_BODY_DEFICIT_MAX:
            status = "danger"
        elif deficit_per_kg is not None and deficit_per_kg > KCAL_PER_KG_BODY_DEFICIT_MAX * 0.85:
            status = "caution"
        elif value >= 50:
            status = "caution"
        else:
            status = "ok"

    return {
        "value": _round1(value),
        "avg_daily_expenditure_kcal": _round1(avg_exp),
        "deficit_per_kg_body": _round1(deficit_per_kg),
        "status": status,
        "ranges": {
            "deficit_recommended_max": KCAL_PER_KG_BODY_DEFICIT_MAX,
            "expenditure_physiological_max": KCAL_PER_KG_BODY_EXPENDITURE_MAX,
        },
        "tooltips": {
            "deficit_max": "~35 ккал/кг — рекомендуемый максимум дефицита для сохранения мышц",
            "expenditure_max": "~75 ккал/кг — теоретический физиологический предел энергозатрат",
        },
    }


def build_kcal_per_kg_fat(
    week_expenditure_totals: dict[str, float],
    weight_kg: float | None,
    body_fat_percent: float | None,
    week_daily_average: dict[str, float] | None = None,
    days: int = 7,
) -> dict[str, Any]:
    exp_no_tef = expenditure_without_tef(week_expenditure_totals, days)
    avg_exp_total = avg_daily_expenditure(week_expenditure_totals, days)
    fat_kg = fat_mass_kg(weight_kg, body_fat_percent)
    value = exp_no_tef / fat_kg if exp_no_tef and fat_kg and fat_kg > 0 else None

    deficit_per_kg_fat = None
    if week_daily_average and fat_kg and fat_kg > 0 and avg_exp_total is not None:
        intake = float(week_daily_average.get("calories") or 0)
        deficit_per_kg_fat = (avg_exp_total - intake) / fat_kg

    status = _metric_status(
        deficit_per_kg_fat if deficit_per_kg_fat is not None else value,
        safe_max=KCAL_PER_KG_FAT_SAFE_MAX,
        extreme_max=KCAL_PER_KG_FAT_EXTREME,
    )
    if value is not None and value > KCAL_PER_KG_FAT_EXTREME:
        status = "danger"

    return {
        "value": _round1(value),
        "expenditure_without_tef_kcal": _round1(exp_no_tef),
        "fat_mass_kg": _round1(fat_kg),
        "deficit_per_kg_fat": _round1(deficit_per_kg_fat),
        "status": status,
        "ranges": {"safe_max": KCAL_PER_KG_FAT_SAFE_MAX, "extreme_max": KCAL_PER_KG_FAT_EXTREME},
        "note": "Расход без учёта TEF (BMR + активность + тренировки) / кг жира",
    }


def classify_body_fat(body_fat_percent: float | None, sex: str | None) -> dict[str, Any]:
    sex_n = _normalize_sex(sex)
    categories = BODY_FAT_CATEGORIES[sex_n]
    if body_fat_percent is None:
        return {
            "sex": sex_n,
            "percent": None,
            "category": None,
            "position_in_category": None,
            "status": "unknown",
            "categories": categories,
        }

    pct = float(body_fat_percent)
    chosen = categories[-1]
    position = 0.0
    for cat in categories:
        if pct <= cat["max"]:
            chosen = cat
            span = max(cat["max"] - cat["min"], 0.1)
            position = max(0.0, min(100.0, (pct - cat["min"]) / span * 100.0))
            break

    status = chosen.get("color", "neutral")
    if chosen["key"] == "essential":
        status = "danger"
    elif chosen["key"] in ("obese", "overweight"):
        status = "caution" if chosen["key"] == "overweight" else "danger"

    return {
        "sex": sex_n,
        "percent": _round1(pct),
        "category": chosen,
        "position_in_category": _round1(position),
        "status": status,
        "categories": categories,
    }


def build_tef_help(tef: dict[str, float]) -> dict[str, Any]:
    return {
        "description": (
            "TEF (Thermic Effect of Food) — количество энергии, "
            "которое организм тратит на переваривание и усвоение пищи."
        ),
        "macro_coefficients": [
            {
                "key": k,
                "label": v["label"],
                "min_pct": v["min_pct"],
                "max_pct": v["max_pct"],
                "rate_used": v["rate"],
            }
            for k, v in TEF_MACRO_RATES.items()
        ],
        "tef_kcal_in_calculation": tef.get("tef_kcal"),
    }


def build_health_warnings(
    *,
    sex: str | None,
    body_fat_percent: float | None,
    kcal_per_kg_body: dict[str, Any],
    kcal_per_kg_fat: dict[str, Any],
    body_fat_class: dict[str, Any],
) -> list[dict[str, str]]:
    warnings: list[dict[str, str]] = []
    sex_n = _normalize_sex(sex)
    min_fat = MIN_BODY_FAT_FEMALE if sex_n == "female" else MIN_BODY_FAT_MALE

    if body_fat_percent is not None and body_fat_percent < min_fat:
        warnings.append(
            {
                "level": "danger",
                "code": "body_fat_too_low",
                "message": "Слишком низкий процент жира",
            }
        )
    elif body_fat_class and (body_fat_class.get("category") or {}).get("key") == "essential":
        warnings.append(
            {
                "level": "orange",
                "code": "essential_fat_zone",
                "message": "Слишком низкий процент жира",
            }
        )

    deficit_body = kcal_per_kg_body.get("deficit_per_kg_body")
    if deficit_body is not None and deficit_body > KCAL_PER_KG_BODY_DEFICIT_MAX:
        warnings.append(
            {
                "level": "danger",
                "code": "aggressive_deficit",
                "message": "Агрессивный дефицит",
            }
        )
    elif deficit_body is not None and deficit_body > KCAL_PER_KG_BODY_DEFICIT_MAX * 0.85:
        warnings.append(
            {
                "level": "yellow",
                "code": "elevated_deficit",
                "message": "Риск потери мышечной массы",
            }
        )

    exp_kg = kcal_per_kg_body.get("value")
    if exp_kg is not None and exp_kg >= KCAL_PER_KG_BODY_EXPENDITURE_MAX:
        warnings.append(
            {
                "level": "orange",
                "code": "extreme_expenditure",
                "message": "Экстремальные энергозатраты на кг массы",
            }
        )

    d_fat = kcal_per_kg_fat.get("deficit_per_kg_fat")
    if d_fat is not None and d_fat > KCAL_PER_KG_FAT_SAFE_MAX:
        warnings.append(
            {
                "level": "danger" if d_fat >= KCAL_PER_KG_FAT_EXTREME else "orange",
                "code": "extreme_fat_deficit",
                "message": "Агрессивный дефицит относительно жировой массы",
            }
        )

    return warnings


def build_week_analytics(
    *,
    phase: str,
    sex: str | None,
    weight_kg: float | None,
    body_fat_percent: float | None,
    week_expenditure_totals: dict[str, float],
    week_daily_average: dict[str, float],
    tef: dict[str, float],
) -> dict[str, Any]:
    kcal_body = build_kcal_per_kg_body(
        week_expenditure_totals, weight_kg, week_daily_average
    )
    kcal_fat = build_kcal_per_kg_fat(
        week_expenditure_totals, weight_kg, body_fat_percent, week_daily_average
    )
    bf_class = classify_body_fat(body_fat_percent, sex)
    warnings = build_health_warnings(
        sex=sex,
        body_fat_percent=body_fat_percent,
        kcal_per_kg_body=kcal_body,
        kcal_per_kg_fat=kcal_fat,
        body_fat_class=bf_class,
    )
    out: dict[str, Any] = {
        "body_fat_scale": bf_class,
        "tef_help": build_tef_help(tef),
        "health_warnings": warnings,
    }
    if phase == "cut":
        out["kcal_per_kg_body"] = kcal_body
        out["kcal_per_kg_fat"] = kcal_fat
    return out


def _linear_slope(points: list[tuple[float, float]]) -> float | None:
    """Наклон линейного тренда y по x (дни)."""
    n = len(points)
    if n < 2:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_mean = sum(xs) / n
    y_mean = sum(ys) / n
    num = sum((xs[i] - x_mean) * (ys[i] - y_mean) for i in range(n))
    den = sum((xs[i] - x_mean) ** 2 for i in range(n))
    if abs(den) < 1e-9:
        return None
    return num / den


def _r_squared(points: list[tuple[float, float]], slope: float) -> float | None:
    if len(points) < 3 or slope is None:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    intercept = y_mean - slope * x_mean
    ss_res = sum((ys[i] - (slope * xs[i] + intercept)) ** 2 for i in range(len(points)))
    ss_tot = sum((y - y_mean) ** 2 for y in ys)
    if ss_tot < 1e-9:
        return 1.0
    return max(0.0, min(1.0, 1.0 - ss_res / ss_tot))


def _confidence_from_points(n: int, r2: float | None, min_days: int = 8) -> dict[str, Any]:
    if n < min_days:
        return {
            "level": "low",
            "score": max(0.1, n / min_days * 0.4),
            "message": "Недостаточно данных для точного прогноза (нужно больше недели)",
        }
    base = min(1.0, 0.5 + n / 60.0)
    if r2 is not None:
        base *= 0.5 + 0.5 * r2
    level = "high" if base >= 0.75 else "medium" if base >= 0.45 else "low"
    msg = None
    if level == "low":
        msg = "Низкая точность: мало точек или слабый тренд"
    elif level == "medium":
        msg = "Средняя точность: тренд приблизительный"
    return {"level": level, "score": _round1(base), "message": msg}


def _days_to_target(current: float, target: float, slope_per_day: float) -> float | None:
    if slope_per_day == 0:
        return None
    delta = target - current
    if (delta > 0 and slope_per_day <= 0) or (delta < 0 and slope_per_day >= 0):
        return None
    days = delta / slope_per_day
    return days if days > 0 else None


def build_progress_forecast(
    *,
    phase: str,
    sex: str | None,
    weight_series: list[dict[str, Any]],
    fat_series: list[dict[str, Any]],
    avg_calories: float | None,
    avg_expenditure: float | None,
    plan: dict[str, Any] | None,
    snapshot: dict[str, Any],
) -> dict[str, Any]:
    """Прогноз по историческим трендам веса и % жира."""
    today = date.today()

    def _to_points(series: list[dict[str, Any]], key: str) -> list[tuple[float, float]]:
        dated: list[tuple[date, float]] = []
        for row in series:
            d_str = str(row.get("date", ""))[:10]
            val = row.get(key)
            if val is None:
                continue
            try:
                dated.append((date.fromisoformat(d_str), float(val)))
            except ValueError:
                continue
        if not dated:
            return []
        dated.sort(key=lambda t: t[0])
        t0 = dated[0][0]
        return [(float((d - t0).days), v) for d, v in dated]

    weight_pts = _to_points(weight_series, "weight_kg")
    fat_pts = _to_points(fat_series, "body_fat_percent")

    n_obs = max(len(weight_pts), len(fat_pts))
    w_slope = _linear_slope(weight_pts)
    f_slope = _linear_slope(fat_pts)
    w_r2 = _r_squared(weight_pts, w_slope) if w_slope is not None else None
    span_days = 0
    if weight_pts:
        span_days = int(max(p[0] for p in weight_pts))
    elif fat_pts:
        span_days = int(max(p[0] for p in fat_pts))
    confidence = _confidence_from_points(max(n_obs, span_days), w_r2)

    current_weight = snapshot.get("weight_kg")
    current_fat = snapshot.get("body_fat_percent")
    lean_kg = snapshot.get("lean_mass_kg")

    forecasts: dict[str, Any] = {}

    if phase == "cut" and plan:
        target_fat = plan.get("target_fat_percent")
        if (
            current_fat is not None
            and target_fat is not None
            and f_slope is not None
            and f_slope != 0
        ):
            days = _days_to_target(float(current_fat), float(target_fat), f_slope)
            if days:
                target_dt = today + timedelta(days=int(round(days)))
                forecasts["target_body_fat"] = {
                    "target_value": float(target_fat),
                    "current_value": float(current_fat),
                    "rate_per_week": _round1(f_slope * 7),
                    "estimated_days": int(round(days)),
                    "estimated_weeks": _round1(days / 7),
                    "estimated_date": target_dt.isoformat(),
                }

        if current_weight is not None and w_slope is not None and target_fat and lean_kg:
            target_weight = float(lean_kg) / (1.0 - float(target_fat) / 100.0)
            days_w = _days_to_target(float(current_weight), target_weight, w_slope)
            if days_w:
                forecasts["target_weight"] = {
                    "target_value": _round1(target_weight),
                    "current_value": float(current_weight),
                    "rate_per_week": _round1(w_slope * 7),
                    "estimated_days": int(round(days_w)),
                    "estimated_weeks": _round1(days_w / 7),
                    "estimated_date": (today + timedelta(days=int(round(days_w)))).isoformat(),
                }

    if phase == "bulk" and plan:
        target_w = plan.get("target_weight_kg")
        if current_weight is not None and target_w is not None and w_slope is not None:
            days = _days_to_target(float(current_weight), float(target_w), w_slope)
            if days:
                forecasts["target_weight"] = {
                    "target_value": float(target_w),
                    "current_value": float(current_weight),
                    "rate_per_week": _round1(w_slope * 7),
                    "estimated_days": int(round(days)),
                    "estimated_weeks": _round1(days / 7),
                    "estimated_date": (today + timedelta(days=int(round(days)))).isoformat(),
                }

        target_lean = plan.get("target_lean_mass_kg")
        if lean_kg is not None and target_lean is not None and w_slope and current_fat is not None:
            # приближение: сухая масса растёт с тем же темпом, что вес × (1 - fat%)
            lean_slope = w_slope * (1.0 - float(current_fat) / 100.0)
            days_lean = _days_to_target(float(lean_kg), float(target_lean), lean_slope)
            if days_lean:
                forecasts["target_lean_mass"] = {
                    "target_value": float(target_lean),
                    "current_value": float(lean_kg),
                    "rate_per_week": _round1(lean_slope * 7),
                    "estimated_days": int(round(days_lean)),
                    "estimated_weeks": _round1(days_lean / 7),
                    "estimated_date": (today + timedelta(days=int(round(days_lean)))).isoformat(),
                }

    sufficient = span_days >= 7 and (w_slope is not None or f_slope is not None)

    return {
        "phase": phase,
        "sufficient_data": sufficient,
        "observation_count": n_obs,
        "confidence": confidence,
        "avg_daily_calories": _round1(avg_calories),
        "avg_daily_expenditure": _round1(avg_expenditure),
        "weight_trend_per_week": _round1(w_slope * 7) if w_slope is not None else None,
        "fat_trend_per_week": _round1(f_slope * 7) if f_slope is not None else None,
        "forecasts": forecasts,
    }
