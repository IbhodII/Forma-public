# -*- coding: utf-8 -*-
"""Проверки готовности данных для прогноза питания."""
from __future__ import annotations

from datetime import date, timedelta

from backend.core import week_calendar
from backend.services import nutrition_balance_service


def _mock_intake_by_week(monkeypatch, filled_week_starts: set[date], min_days: int = 3):
    """filled_week_starts: week start dates that count as filled."""

    def fake_count(phase: str, start: date, end: date) -> int:
        ws = week_calendar.week_start_for_date(start, week_calendar.WEEKDAY_SAT)
        if ws in filled_week_starts:
            return min_days
        return 0

    monkeypatch.setattr(
        nutrition_balance_service,
        "_count_intake_days_in_range",
        fake_count,
    )


def test_readiness_two_filled_weeks_with_gap(monkeypatch):
    """Two filled weeks separated by an empty week → ok."""
    today = date.today()
    wsd = week_calendar.WEEKDAY_SAT
    w1_start, _ = week_calendar.previous_week_range(on_date=today, start_day=wsd)
    w3_start, _ = week_calendar.previous_week_range(
        on_date=w1_start - timedelta(days=1),
        start_day=wsd,
    )
    w2_start, _ = week_calendar.previous_week_range(
        on_date=w3_start - timedelta(days=1),
        start_day=wsd,
    )

    _mock_intake_by_week(monkeypatch, {w1_start, w2_start})

    result = nutrition_balance_service.get_forecast_readiness(
        "cut",
        week_start_day=wsd,
    )
    assert result["ok"] is True
    assert result["filled_weeks"] == 2
    filled_entries = [w for w in result["weeks"] if w["filled"]]
    assert len(filled_entries) == 2
    assert not any(w["period_start"] == w3_start.isoformat() and w["filled"] for w in result["weeks"])


def test_readiness_ignores_current_incomplete_week(monkeypatch):
    """Previous + older filled weeks suffice even if only 'current' would be sparse."""
    today = date.today()
    wsd = week_calendar.WEEKDAY_SAT
    w_prev_start, _ = week_calendar.previous_week_range(on_date=today, start_day=wsd)
    w_older_start, _ = week_calendar.previous_week_range(
        on_date=w_prev_start - timedelta(days=1),
        start_day=wsd,
    )

    _mock_intake_by_week(monkeypatch, {w_prev_start, w_older_start})

    result = nutrition_balance_service.get_forecast_readiness(
        "cut",
        week_start_day=wsd,
    )
    assert result["ok"] is True
    assert result["filled_weeks"] >= 2


def test_readiness_only_one_filled_week_fails(monkeypatch):
    today = date.today()
    wsd = week_calendar.WEEKDAY_SAT
    w_prev_start, _ = week_calendar.previous_week_range(on_date=today, start_day=wsd)

    _mock_intake_by_week(monkeypatch, {w_prev_start})

    result = nutrition_balance_service.get_forecast_readiness(
        "cut",
        week_start_day=wsd,
    )
    assert result["ok"] is False
    assert result["filled_weeks"] == 1
    assert result["message"] is not None
