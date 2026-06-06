# -*- coding: utf-8 -*-
"""In-memory TTL cache for expensive read-only dashboard summaries."""
from __future__ import annotations

import time
from typing import Any, Callable, TypeVar

from backend.database.db_utils import get_current_user_id

T = TypeVar("T")

_SUMMARY_TTL_SEC = 45.0
_summary_cache: dict[tuple[int, str, str], tuple[float, dict[str, Any]]] = {}


def get_dashboard_summary_cached(
    phase: str,
    builder: Callable[[], dict[str, Any]],
) -> dict[str, Any]:
    uid = get_current_user_id()
    today = time.strftime("%Y-%m-%d")
    key = (uid, today, str(phase))
    now = time.monotonic()
    hit = _summary_cache.get(key)
    if hit and (now - hit[0]) < _SUMMARY_TTL_SEC:
        return hit[1]
    payload = builder()
    _summary_cache[key] = (now, payload)
    return payload


def invalidate_dashboard_summary(user_id: int | None = None) -> None:
    if user_id is None:
        _summary_cache.clear()
        return
    keys = [k for k in _summary_cache if k[0] == int(user_id)]
    for k in keys:
        _summary_cache.pop(k, None)
