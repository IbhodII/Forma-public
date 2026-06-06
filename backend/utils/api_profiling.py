# -*- coding: utf-8 -*-
"""Request profiling: endpoint duration, payload size, SQL time (when enabled)."""
from __future__ import annotations

import json
import logging
import time
from contextvars import ContextVar
from typing import Any

logger = logging.getLogger("health_api.profile")

_profile_sql_ms: ContextVar[float] = ContextVar("profile_sql_ms", default=0.0)
_profile_sql_count: ContextVar[int] = ContextVar("profile_sql_count", default=0)
_profile_enabled: ContextVar[bool] = ContextVar("profile_enabled", default=False)


def reset_sql_profile() -> None:
    _profile_sql_ms.set(0.0)
    _profile_sql_count.set(0)


def add_sql_time(duration_ms: float) -> None:
    if not _profile_enabled.get():
        return
    _profile_sql_ms.set(_profile_sql_ms.get() + duration_ms)
    _profile_sql_count.set(_profile_sql_count.get() + 1)


def wrap_connection(conn: Any) -> Any:
    """Wrap sqlite3 connection execute/fetch for profiling."""
    if not _profile_enabled.get():
        return conn

    class _ProfiledCursor:
        def __init__(self, inner: Any) -> None:
            self._inner = inner

        def execute(self, *args: Any, **kwargs: Any) -> Any:
            t0 = time.perf_counter()
            try:
                return self._inner.execute(*args, **kwargs)
            finally:
                add_sql_time((time.perf_counter() - t0) * 1000.0)

        def executemany(self, *args: Any, **kwargs: Any) -> Any:
            t0 = time.perf_counter()
            try:
                return self._inner.executemany(*args, **kwargs)
            finally:
                add_sql_time((time.perf_counter() - t0) * 1000.0)

        def __iter__(self) -> Any:
            return iter(self._inner)

        def __getattr__(self, name: str) -> Any:
            return getattr(self._inner, name)

    class _ProfiledConnection:
        def __init__(self, inner: Any) -> None:
            self._inner = inner

        def execute(self, *args: Any, **kwargs: Any) -> Any:
            t0 = time.perf_counter()
            try:
                # sqlite3: conn.execute returns an iterable cursor — do not wrap it.
                return self._inner.execute(*args, **kwargs)
            finally:
                add_sql_time((time.perf_counter() - t0) * 1000.0)

        def executemany(self, *args: Any, **kwargs: Any) -> Any:
            t0 = time.perf_counter()
            try:
                return self._inner.executemany(*args, **kwargs)
            finally:
                add_sql_time((time.perf_counter() - t0) * 1000.0)

        def cursor(self, *args: Any, **kwargs: Any) -> Any:
            return _ProfiledCursor(self._inner.cursor(*args, **kwargs))

        def __getattr__(self, name: str) -> Any:
            return getattr(self._inner, name)

        def __enter__(self) -> Any:
            self._inner.__enter__()
            return self

        def __exit__(self, *args: Any) -> Any:
            return self._inner.__exit__(*args)

    return _ProfiledConnection(conn)


def profiled_get_db():
    from backend.database import get_db

    return wrap_connection(get_db())


def _estimate_rows(payload: Any) -> int | None:
    if payload is None:
        return 0
    if isinstance(payload, list):
        return len(payload)
    if isinstance(payload, dict):
        items = payload.get("items")
        if isinstance(items, list):
            return len(items)
        total = 0
        for v in payload.values():
            if isinstance(v, list):
                total += len(v)
        return total if total else None
    return None


def log_request_profile(
    *,
    method: str,
    path: str,
    status_code: int,
    duration_ms: float,
    body: Any = None,
    response_bytes: int | None = None,
) -> None:
    rows = _estimate_rows(body) if isinstance(body, (dict, list)) else None
    sql_ms = _profile_sql_ms.get()
    sql_count = _profile_sql_count.get()
    logger.info(
        "api_profile endpoint=%s %s status=%s duration_ms=%.1f sql_ms=%.1f sql_queries=%s "
        "rows=%s response_bytes=%s",
        method,
        path,
        status_code,
        duration_ms,
        sql_ms,
        sql_count,
        rows if rows is not None else "-",
        response_bytes if response_bytes is not None else "-",
    )


def encode_json_size(payload: Any) -> int:
    try:
        return len(json.dumps(payload, ensure_ascii=False, default=str).encode("utf-8"))
    except (TypeError, ValueError):
        return 0
