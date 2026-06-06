# -*- coding: utf-8 -*-
"""@deprecated Prefer `backend.database` package. Thin re-export for legacy imports."""
from __future__ import annotations

from database.connection import WORKOUTS_DB_PATH

from backend.database.db_utils import (
    DEFAULT_USER_ID,
    get_current_user_id,
    get_db,
    get_shared_db,
    get_user_db,
    is_shared_table,
    shared_table,
)

DB_PATH = WORKOUTS_DB_PATH

__all__ = [
    "DB_PATH",
    "DEFAULT_USER_ID",
    "get_current_user_id",
    "get_db",
    "get_shared_db",
    "get_user_db",
    "is_shared_table",
    "shared_table",
]
