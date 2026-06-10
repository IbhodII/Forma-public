# -*- coding: utf-8 -*-
"""Сбор истории и прогнозы для сушки/набора."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any

from backend.core import nutrition_analytics
from backend.database import get_db
from backend.services import food_service


def _profile_sex() -> str:
    from backend.services import user_service

    profile = user_service.get_profile() or {}
    return str(profile.get("sex") or "male")


def collect_weight_fat_series(days_back: int = 120) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Вес из daily_weight; % жира из body_metrics (последний на дату)."""
    since = (date.today() - timedelta(days=days_back)).isoformat()
    conn = get_db()
    weight_rows: list[dict[str, Any]] = []
    fat_rows: list[dict[str, Any]] = []
    try:
        w_cur = conn.execute(
            """
            SELECT date, weight_kg FROM daily_weight
            WHERE date >= ? AND weight_kg IS NOT NULL
            ORDER BY date ASC
            """,
            (since,),
        )
        weight_rows = [
            {"date": r[0], "weight_kg": float(r[1])}
            for r in w_cur.fetchall()
            if r[1] is not None
        ]

        b_cur = conn.execute(
            """
            SELECT date, body_fat_percent FROM body_metrics
            WHERE date >= ? AND body_fat_percent IS NOT NULL
            ORDER BY date ASC
            """,
            (since,),
        )
        fat_rows = [
            {"date": r[0], "body_fat_percent": float(r[1])}
            for r in b_cur.fetchall()
            if r[1] is not None
        ]
    finally:
        conn.close()
    return weight_rows, fat_rows


def _weekly_nutrition_averages(phase: str, weeks: int = 8) -> tuple[float | None, float | None]:
    """Средние калории и расход за последние недели с данными."""
    anchor = date.today().isoformat()
    cal_samples: list[float] = []
    exp_samples: list[float] = []
    for i in range(weeks):
        d = date.fromisoformat(anchor[:10]) - timedelta(days=7 * i)
        try:
            log = food_service.get_week_log(d.isoformat(), phase)
        except Exception:
            continue
        avg = log.get("week_daily_average") or {}
        exp = log.get("week_expenditure_totals") or {}
        if float(avg.get("calories") or 0) > 0:
            cal_samples.append(float(avg["calories"]))
        total_out = exp.get("total_out_kcal")
        if total_out and float(total_out) > 0:
            exp_samples.append(float(total_out) / 7.0)
    if not cal_samples:
        return None, None
    avg_cal = sum(cal_samples) / len(cal_samples)
    avg_exp = sum(exp_samples) / len(exp_samples) if exp_samples else None
    return avg_cal, avg_exp


def get_progress_analytics(phase: str) -> dict[str, Any]:
    from database.db_utils import get_nutrition_input_snapshot, load_nutrition_plan

    ph = phase if phase in ("cut", "bulk") else "cut"
    snap = get_nutrition_input_snapshot()
    plan = load_nutrition_plan(ph)
    weight_series, fat_series = collect_weight_fat_series()
    avg_cal, avg_exp = _weekly_nutrition_averages(ph)

    plan_out = dict(plan) if plan else {}
    if ph == "bulk" and snap.get("lean_mass_kg") and plan_out.get("target_weight_kg"):
        # целевая сухая масса при том же % жира (упрощение)
        tw = float(plan_out["target_weight_kg"])
        fat_pct = snap.get("body_fat_percent")
        if fat_pct is not None:
            plan_out["target_lean_mass_kg"] = tw * (1.0 - float(fat_pct) / 100.0)

    sex = _profile_sex()
    bf_scale = nutrition_analytics.classify_body_fat(snap.get("body_fat_percent"), sex)
    warnings = nutrition_analytics.build_health_warnings(
        sex=sex,
        body_fat_percent=snap.get("body_fat_percent"),
        kcal_per_kg_body={"deficit_per_kg_body": None, "value": None},
        kcal_per_kg_fat={"deficit_per_kg_fat": None, "value": None},
        body_fat_class=bf_scale,
    )
    forecast = nutrition_analytics.build_progress_forecast(
        phase=ph,
        sex=sex,
        weight_series=weight_series,
        fat_series=fat_series,
        avg_calories=avg_cal,
        avg_expenditure=avg_exp,
        plan=plan_out,
        snapshot=snap,
    )
    return {
        "snapshot": snap,
        "plan": plan_out,
        "progress": forecast,
        "body_fat_scale": bf_scale,
        "health_warnings": warnings,
    }


def build_week_analytics_for_log(week_log: dict[str, Any]) -> dict[str, Any]:
    return nutrition_analytics.build_week_analytics(
        phase=str(week_log.get("phase") or "cut"),
        sex=_profile_sex(),
        weight_kg=(week_log.get("body_summary") or {}).get("weight_kg"),
        body_fat_percent=(week_log.get("body_summary") or {}).get("body_fat_percent"),
        week_expenditure_totals=week_log.get("week_expenditure_totals") or {},
        week_daily_average=week_log.get("week_daily_average") or {},
        tef=(week_log.get("insights") or {}).get("tef") or {},
    )
