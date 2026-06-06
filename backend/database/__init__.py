# -*- coding: utf-8 -*-
"""Доступ к БД (workouts.db + ATTACH shared.db)."""
from database.connection import WORKOUTS_DB_PATH as DB_PATH
from backend.database.active_db import get_active_database_context
from backend.database.app_meta import meta_get, meta_set
from backend.database.db_utils import (
    DEFAULT_USER_ID,
    database_paths,
    get_current_user_id,
    get_db,
    get_shared_db,
    get_user_db,
    is_shared_table,
    shared_table,
)

__all__ = [
    "DB_PATH",
    "DEFAULT_USER_ID",
    "database_paths",
    "get_active_database_context",
    "get_current_user_id",
    "get_db",
    "get_shared_db",
    "get_user_db",
    "is_shared_table",
    "meta_get",
    "meta_set",
    "shared_table",
]
