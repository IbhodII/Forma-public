# -*- coding: utf-8 -*-
"""Heart rate API response builder."""
from __future__ import annotations

from backend.services.hr_response_service import HR_EMPTY_MESSAGE, build_heart_rate_response


def test_empty_hr_response():
    resp = build_heart_rate_response(42, [])
    assert resp.workout_id == 42
    assert resp.count == 0
    assert resp.points == []
    assert resp.message == HR_EMPTY_MESSAGE
    assert resp.min_elapsed_sec is None
    assert resp.max_elapsed_sec is None


def test_hr_response_with_points():
    raw = [
        {"seconds": 10, "heart_rate": 120},
        {"seconds": 20, "heart_rate": 130, "source_type": "strength"},
    ]
    resp = build_heart_rate_response(7, raw)
    assert resp.count == 2
    assert resp.message is None
    assert resp.min_elapsed_sec == 10
    assert resp.max_elapsed_sec == 20
    assert resp.points[1].source_type == "strength"
