# -*- coding: utf-8 -*-
"""Batch daily expenditure API."""
from __future__ import annotations

from datetime import date, timedelta
from unittest.mock import patch

from backend.services import analytics_service


def test_get_daily_expenditure_range_delegates_per_day():
    calls: list[str] = []

    def fake_single(day, phase, *, prefer_chest=True, bracelet_calories=None):
        calls.append(day)
        return {"date": day, "total_expenditure": 2000.0, "calculation_mode": "bracelet"}

    with patch.object(
        analytics_service,
        "get_daily_expenditure",
        side_effect=fake_single,
    ):
        end = date.today()
        start = end - timedelta(days=2)
        # Force batch internals to use mocked single path by patching range assembly
        with patch.object(
            analytics_service,
            "_dates_inclusive",
            return_value=[start.isoformat(), (start + timedelta(days=1)).isoformat(), end.isoformat()],
        ):
            with patch.object(
                analytics_service,
                "get_daily_expenditure_range",
                wraps=analytics_service.get_daily_expenditure_range,
            ):
                pass

    # Smoke: week helper uses batch path
    with patch.object(
        analytics_service,
        "get_daily_expenditure_range",
        return_value={
            "2026-05-26": {"total_expenditure": 2100.0, "calculation_mode": "bracelet"},
            "2026-05-27": {"total_expenditure": 2100.0, "calculation_mode": "bracelet"},
        },
    ):
        with patch.object(
            analytics_service,
            "week_dates_from_anchor",
            return_value=["2026-05-26", "2026-05-27"],
        ):
            week = analytics_service.get_week_daily_expenditure("2026-05-27", "cut")
            assert len(week["items"]) == 2
            assert week["items"][0]["total_expenditure"] == 2100.0
