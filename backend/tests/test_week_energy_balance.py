# -*- coding: utf-8 -*-
"""Фактический дефицит vs целевой — расчёт баланса за период."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import MagicMock, patch

import pytest

from backend.services import nutrition_balance_service as nbs


def _mock_expenditure(total: float):
    return {"total_expenditure": total}


def _exp_range(date_from: str, date_to: str, total: float, **_kwargs):
    cur = date.fromisoformat(str(date_from)[:10])
    end = date.fromisoformat(str(date_to)[:10])
    out: dict[str, dict] = {}
    while cur <= end:
        out[cur.isoformat()] = _mock_expenditure(total)
        cur += timedelta(days=1)
    return out


@patch("backend.services.nutrition_balance_service._resolve_fat_kg")
@patch("backend.services.nutrition_balance_service.analytics_service.get_daily_expenditure_range")
@patch("backend.services.nutrition_balance_service._day_has_food_entries")
@patch("backend.services.food_service._daily_totals_for_day")
@patch("backend.database.get_db")
def test_near_zero_deficit_when_intake_matches_expenditure(
    mock_get_db, mock_daily, mock_has_entries, mock_exp_range, mock_fat
):
    """Case A: intake ≈ expenditure → real deficit near 0."""
    mock_get_db.return_value = MagicMock()
    mock_fat.return_value = (20.0, "snapshot")
    mock_has_entries.return_value = True
    mock_daily.return_value = {"calories": 2500.0}
    mock_exp_range.side_effect = lambda df, dt, ph, **kw: _exp_range(df, dt, 2500.0)

    end = date.today()
    start = end - timedelta(days=6)
    result = nbs.get_week_energy_balance(
        "cut", date_from=start, date_to=end, prefer_chest=True
    )

    assert result["ok"] is True
    assert result["average_real_deficit_kcal"] == pytest.approx(0.0, abs=0.1)
    assert result["average_real_deficit_per_kg_fat"] == pytest.approx(0.0, abs=0.01)


@patch("backend.services.nutrition_balance_service._resolve_fat_kg")
@patch("backend.services.nutrition_balance_service.analytics_service.get_daily_expenditure_range")
@patch("backend.services.nutrition_balance_service._day_has_food_entries")
@patch("backend.services.food_service._daily_totals_for_day")
@patch("backend.database.get_db")
def test_high_deficit_when_intake_much_lower(
    mock_get_db, mock_daily, mock_has_entries, mock_exp_range, mock_fat
):
    """Case B: intake << expenditure → high real deficit."""
    mock_get_db.return_value = MagicMock()
    mock_fat.return_value = (10.0, "snapshot")
    mock_has_entries.return_value = True
    mock_daily.return_value = {"calories": 1000.0}
    mock_exp_range.side_effect = lambda df, dt, ph, **kw: _exp_range(df, dt, 3000.0)

    end = date.today()
    start = end - timedelta(days=6)
    result = nbs.get_week_energy_balance("cut", date_from=start, date_to=end)

    assert result["ok"] is True
    assert result["average_real_deficit_kcal"] == pytest.approx(2000.0, rel=0.01)
    assert result["average_real_deficit_per_kg_fat"] == pytest.approx(200.0, rel=0.01)


@patch("backend.services.nutrition_balance_service._resolve_fat_kg")
@patch("backend.services.nutrition_balance_service.analytics_service.get_daily_expenditure_range")
@patch("backend.services.nutrition_balance_service._day_has_food_entries")
@patch("backend.services.food_service._daily_totals_for_day")
@patch("backend.database.get_db")
def test_zero_intake_day_increases_average_deficit(
    mock_get_db, mock_daily, mock_has_entries, mock_exp_range, mock_fat,
):
    """Clearing food (intake=0) raises average deficit instead of hiding behind target."""
    mock_get_db.return_value = MagicMock()
    mock_fat.return_value = (16.0, "snapshot")
    fat_kg = 16.0
    target_deficit_kcal = 35.0 * fat_kg
    logged_intake = 2500.0 - target_deficit_kcal

    intakes = iter([logged_intake] * 6 + [0.0])
    entries = iter([True] * 6 + [False])

    mock_daily.side_effect = lambda conn, day, phase: {"calories": next(intakes)}
    mock_has_entries.side_effect = lambda conn, day, phase: next(entries)
    mock_exp_range.side_effect = lambda df, dt, ph, **kw: _exp_range(df, dt, 2500.0)

    end = date.today()
    start = end - timedelta(days=6)
    result = nbs.get_week_energy_balance("cut", date_from=start, date_to=end)

    assert result["ok"] is True
    assert result["days_missing"] == 1
    assert result["average_real_deficit_kcal"] > target_deficit_kcal
    assert result["average_real_deficit_per_kg_fat"] > 35.0


@patch("backend.services.nutrition_balance_service._resolve_fat_kg")
@patch("backend.services.nutrition_balance_service.analytics_service.get_daily_expenditure_range")
@patch("backend.services.nutrition_balance_service._day_has_food_entries")
@patch("backend.services.food_service._daily_totals_for_day")
@patch("backend.database.get_db")
def test_missing_food_days_reported(
    mock_get_db, mock_daily, mock_has_entries, mock_exp_range, mock_fat,
):
    """Case D: days without food entries appear in days_missing."""
    mock_get_db.return_value = MagicMock()
    mock_fat.return_value = (15.0, "snapshot")
    mock_has_entries.return_value = False
    mock_daily.return_value = {"calories": 0.0}
    mock_exp_range.side_effect = lambda df, dt, ph, **kw: _exp_range(df, dt, 2400.0)

    end = date.today()
    start = end - timedelta(days=2)
    result = nbs.get_week_energy_balance("cut", date_from=start, date_to=end)

    assert result["ok"] is True
    assert result["days_missing"] == 3
    assert all(not d["is_complete"] for d in result["days"])
    assert result["average_real_deficit_kcal"] == pytest.approx(2400.0, rel=0.01)
