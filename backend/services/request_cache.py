# -*- coding: utf-8 -*-
"""In-process TTL cache for read-heavy static-ish API data (Performance Pass v1)."""
from __future__ import annotations

import time
from typing import Any, Callable, TypeVar

T = TypeVar("T")

_store: dict[str, tuple[float, Any]] = {}


def get_cached(key: str, ttl_sec: float, loader: Callable[[], T]) -> T:
    now = time.monotonic()
    hit = _store.get(key)
    if hit is not None and now - hit[0] < ttl_sec:
        return hit[1]  # type: ignore[return-value]
    value = loader()
    _store[key] = (now, value)
    return value


def invalidate(key: str) -> None:
    _store.pop(key, None)


def invalidate_prefix(prefix: str) -> None:
    for k in list(_store.keys()):
        if k.startswith(prefix):
            del _store[k]
