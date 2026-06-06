# -*- coding: utf-8 -*-
"""Сборка ответа GET heart-rate с диагностическими полями."""
from __future__ import annotations

from typing import Any

from backend.schemas.models import HeartRatePoint, HeartRateResponse

HR_EMPTY_MESSAGE = "HR samples not found"


def build_heart_rate_response(
    workout_id: int,
    raw: list[dict[str, Any]],
) -> HeartRateResponse:
    points = [
        HeartRatePoint(
            seconds=int(p["seconds"]),
            heart_rate=int(p["heart_rate"]),
            elapsed_sec=int(p["seconds"]),
            distance_m=p.get("distance_m"),
            source_type=p.get("source_type"),
        )
        for p in raw
    ]
    count = len(points)
    if count == 0:
        return HeartRateResponse(
            workout_id=int(workout_id),
            points=[],
            count=0,
            message=HR_EMPTY_MESSAGE,
        )
    secs = [p.seconds for p in points]
    return HeartRateResponse(
        workout_id=int(workout_id),
        points=points,
        count=count,
        min_elapsed_sec=min(secs),
        max_elapsed_sec=max(secs),
    )
