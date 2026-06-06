# -*- coding: utf-8 -*-
"""Контекст текущего пользователя для запроса (X-User-ID)."""
from __future__ import annotations

from contextvars import ContextVar

_current_user_id: ContextVar[int | None] = ContextVar("mhd_current_user_id", default=None)


def set_current_user_id(user_id: int | None) -> None:
    _current_user_id.set(int(user_id) if user_id is not None else None)


def get_request_user_id() -> int | None:
    return _current_user_id.get()


def clear_current_user_id() -> None:
    _current_user_id.set(None)
