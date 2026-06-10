"""Zone-time distribution empty-state and response shape."""
from __future__ import annotations

from backend.schemas.models import ZoneTimeResponse
from backend.services.cardio_service import _zone_time_empty


def test_zone_time_empty_response_validates():
    data = _zone_time_empty(30, 190, None)
    resp = ZoneTimeResponse(**data)
    assert resp.days == 30
    assert resp.workouts_with_hr == 0
    assert len(resp.zones) == 5
    assert len(resp.items) == 5

