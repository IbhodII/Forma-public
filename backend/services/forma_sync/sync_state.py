# -*- coding: utf-8 -*-
from __future__ import annotations

import threading
from contextlib import contextmanager
from typing import Generator

_lock = threading.Lock()
_in_flight = False


def is_sync_in_flight() -> bool:
    with _lock:
        return _in_flight


@contextmanager
def sync_lock() -> Generator[None, None, None]:
    global _in_flight
    with _lock:
        if _in_flight:
            raise RuntimeError("Синхронизация уже выполняется")
        _in_flight = True
    try:
        yield
    finally:
        with _lock:
            _in_flight = False
