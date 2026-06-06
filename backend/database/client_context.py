# -*- coding: utf-8 -*-
"""Режим клиента из заголовка X-Forma-Client."""
from __future__ import annotations

from contextvars import ContextVar

VALID_CLIENT_MODES = frozenset({"admin_browser", "desktop_app", "mobile_app"})

_current_client_mode: ContextVar[str | None] = ContextVar("forma_client_mode", default=None)


def set_request_client_mode(mode: str | None) -> None:
    if mode and mode in VALID_CLIENT_MODES:
        _current_client_mode.set(mode)
    else:
        _current_client_mode.set(None)


def get_request_client_mode() -> str | None:
    return _current_client_mode.get()


def clear_request_client_mode() -> None:
    _current_client_mode.set(None)


def is_admin_browser_client() -> bool:
    return get_request_client_mode() == "admin_browser"


def client_allows_sync_debug(*, query_debug: bool = False) -> bool:
    if is_admin_browser_client():
        return True
    return bool(query_debug)
