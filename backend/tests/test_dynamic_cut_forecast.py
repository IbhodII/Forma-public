# -*- coding: utf-8 -*-
"""Проверки динамического прогноза сушки и зон дефицита."""
from __future__ import annotations

import math

import pytest

from backend.services.nutrition_service import (
    UnreachableCutGoalError,
    assess_deficit_zone,
    calculate_dynamic_cut_forecast,
)


def test_deficit_500_30kg_fat_not_capped_at_start():
    r = calculate_dynamic_cut_forecast(
        100.0,
        30.0,
        target_weight_kg=90.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=500.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    assert r["weeks_log"][1]["deficit_used"] == pytest.approx(500.0, rel=0.01)
    assert r["observed_deficit_per_kg_fat"] == pytest.approx(500.0 / 30.0, rel=0.01)
    if len(r["weeks_log"]) > 2:
        assert r["weeks_log"][2]["deficit_used"] < r["weeks_log"][1]["deficit_used"]
    assert r["deficit_status"] == "safe"
    assert r["goal_reached"]


def test_deficit_1500_warning_and_capped_forecast():
    zone = assess_deficit_zone(1500.0, 30.0, 35.0, 70.0)
    assert zone["deficit_status"] == "warning"

    r = calculate_dynamic_cut_forecast(
        100.0,
        30.0,
        target_weight_kg=85.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=1500.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    assert r["deficit_status"] == "warning"
    assert r["weeks_log"][1]["deficit_used"] == pytest.approx(1500.0, rel=0.01)
    if len(r["weeks_log"]) > 2:
        assert r["weeks_log"][2]["deficit_used"] < r["weeks_log"][1]["deficit_used"]


def test_deficit_2500_danger_returns_capped_forecast():
    """~83 kcal/kg fat: danger zone, but forecast still returned with capped deficit."""
    zone = assess_deficit_zone(2500.0, 30.0, 35.0, 70.0)
    assert zone["deficit_status"] == "danger"
    assert zone["recommended_additional_calories"] == 400
    assert "Опасный уровень дефицита" in (zone["deficit_warning_message"] or "")

    r = calculate_dynamic_cut_forecast(
        100.0,
        30.0,
        target_weight_kg=90.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=2500.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    phys_limit = 70.0 * 30.0
    assert r["deficit_status"] == "danger"
    assert r["deficit_capped_at_start"] is True
    assert len(r["weeks_log"]) >= 2
    assert r["weeks_log"][1]["deficit_used"] == pytest.approx(phys_limit, rel=0.01)
    if len(r["weeks_log"]) > 2:
        assert r["weeks_log"][2]["deficit_used"] < r["weeks_log"][1]["deficit_used"]
    assert all(float(w["weight_kg"]) > 0 for w in r["weeks_log"])
    assert r["goal_reached"]


def test_deficit_2130_danger_at_71_kcal_per_kg_fat():
    """71 kcal/kg fat (2130 kcal/day at 30 kg fat) — danger with capped projection."""
    r = calculate_dynamic_cut_forecast(
        100.0,
        30.0,
        target_weight_kg=90.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=2130.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    phys_limit = 70.0 * 30.0
    assert r["deficit_status"] == "danger"
    assert r["deficit_capped_at_start"] is True
    assert r["weeks_log"][1]["deficit_used"] == pytest.approx(phys_limit, rel=0.01)


def test_projected_deficit_scales_with_fat_mass():
    """20 kg fat, 700 kcal/day → 35 kcal/kg; at ~15 kg fat deficit ≈ 525."""
    r = calculate_dynamic_cut_forecast(
        100.0,
        20.0,
        target_weight_kg=None,
        target_body_fat_percent=10.0,
        real_avg_deficit_per_day=700.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    assert r["observed_deficit_per_kg_fat"] == pytest.approx(35.0, rel=0.01)
    assert r["weeks_log"][1]["deficit_used"] == pytest.approx(700.0, rel=0.01)

    mid = next(
        (w for w in r["weeks_log"] if w["week"] > 0 and float(w["fat_kg"]) <= 15.5),
        None,
    )
    assert mid is not None
    assert float(mid["deficit_used"]) == pytest.approx(35.0 * float(mid["fat_kg"]), rel=0.05)


def test_long_forecast_slower_than_linear():
    r = calculate_dynamic_cut_forecast(
        100.0,
        30.0,
        target_weight_kg=88.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=600.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    assert r["goal_reached"]
    assert r["linear_weeks_to_target"] is not None
    assert r["weeks_to_target"] > r["linear_weeks_to_target"]
    assert r["weeks_longer_than_linear"] is not None
    assert r["weeks_longer_than_linear"] > 0


def test_projected_deficit_uses_real_rate_not_planned():
    """50 kcal/kg real vs 35 planned — week 1 deficit must follow real rate."""
    r = calculate_dynamic_cut_forecast(
        100.0,
        20.0,
        target_weight_kg=None,
        target_body_fat_percent=10.0,
        real_avg_deficit_per_day=1000.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
        observed_deficit_per_kg_fat=50.0,
    )
    assert r["observed_deficit_per_kg_fat"] == pytest.approx(50.0, rel=0.01)
    assert r["weeks_log"][1]["deficit_projected"] == pytest.approx(1000.0, rel=0.01)
    assert r["weeks_log"][1]["deficit_projected"] != pytest.approx(35.0 * 20.0, rel=0.01)


def test_near_target_converges():
    r = calculate_dynamic_cut_forecast(
        100.0,
        25.0,
        target_weight_kg=96.0,
        target_body_fat_percent=None,
        real_avg_deficit_per_day=500.0,
        max_deficit_per_kg_fat=35.0,
        max_physiological_deficit_per_kg_fat=70.0,
    )
    assert r["goal_reached"]
    assert len(r["weeks_log"]) >= 2
    week_rows = [w for w in r["weeks_log"] if w["week"] > 0]
    assert float(week_rows[-1]["deficit_used"]) < 500.0
    weights = [float(w["weight_kg"]) for w in r["weeks_log"]]
    for i in range(len(weights) - 1):
        assert weights[i] >= weights[i + 1] - 0.05


def test_round1_handles_nan():
    from backend.services.nutrition_service import _round1

    assert _round1(float("nan")) == 0.0
    assert _round1(float("inf")) == 0.0
    assert math.isfinite(_round1(12.34))


def test_unreachable_lean_preservation():
    lean = 70.0
    min_w = lean / (1 - 3 / 100)
    with pytest.raises(UnreachableCutGoalError):
        calculate_dynamic_cut_forecast(
            100.0,
            30.0,
            target_weight_kg=min_w - 1.0,
            target_body_fat_percent=None,
            real_avg_deficit_per_day=500.0,
        )
