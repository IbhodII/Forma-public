# -*- coding: utf-8 -*-
"""Извлечение среднего/макс. пульса из ответов Polar AccessLink (разные варианты полей)."""
from __future__ import annotations

from typing import Any


def _pick(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if key in data and data[key] is not None:
            return data[key]
    return None


def _to_int_hr(value: Any) -> int | None:
    if value is None:
        return None
    try:
        n = float(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return int(round(n))


def polar_heart_rate_block(data: dict[str, Any]) -> dict[str, Any]:
    hr = _pick(data, "heart-rate", "heart_rate", "heartRate")
    return hr if isinstance(hr, dict) else {}


def polar_avg_max_hr_from_data(
    data: dict[str, Any],
    *,
    pending_avg: Any = None,
    pending_max: Any = None,
) -> tuple[int | None, int | None]:
    """
    Сводка пульса из JSON упражнения Polar + колонок polar_pending_workouts.
  """
    avg_hr = _to_int_hr(pending_avg)
    max_hr = _to_int_hr(pending_max)

    hr_block = polar_heart_rate_block(data)
    if avg_hr is None:
        avg_hr = _to_int_hr(
            _pick(
                hr_block,
                "average",
                "avg",
                "mean",
                "value",
                "average-heart-rate",
                "average_heart_rate",
            )
        )
    if max_hr is None:
        max_hr = _to_int_hr(
            _pick(
                hr_block,
                "maximum",
                "max",
                "value",
                "maximum-heart-rate",
                "maximum_heart_rate",
            )
        )

    if avg_hr is None:
        avg_hr = _to_int_hr(
            _pick(
                data,
                "average-heart-rate",
                "average_heart_rate",
                "avg-heart-rate",
                "avg_heart_rate",
                "averageHeartRate",
                "heart-rate-average",
                "heart_rate_average",
            )
        )
    if max_hr is None:
        max_hr = _to_int_hr(
            _pick(
                data,
                "maximum-heart-rate",
                "maximum_heart_rate",
                "max-heart-rate",
                "max_heart_rate",
                "maximumHeartRate",
                "heart-rate-maximum",
                "heart_rate_maximum",
            )
        )

    return avg_hr, max_hr
