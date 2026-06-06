# -*- coding: utf-8 -*-
from datetime import date

from backend.services.nutrition_balance_service import (
    FORECAST_BALANCE_DAYS_BACK,
    rolling_balance_dates_through_yesterday,
)


def test_rolling_balance_may_30_example():
    start, end = rolling_balance_dates_through_yesterday(
        FORECAST_BALANCE_DAYS_BACK,
        on_date=date(2026, 5, 30),
    )
    assert start.isoformat() == "2026-05-15"
    assert end.isoformat() == "2026-05-29"
    assert (end - start).days + 1 == 15


def test_rolling_balance_excludes_today():
    start, end = rolling_balance_dates_through_yesterday(
        FORECAST_BALANCE_DAYS_BACK,
        on_date=date(2026, 5, 30),
    )
    assert end < date(2026, 5, 30)
    assert start <= end
