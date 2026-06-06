# -*- coding: utf-8 -*-
"""Active database resolver: paths, profile, attachment state."""
from __future__ import annotations

import os
import sqlite3
from typing import Any

from database.connection import (
    DATA_ROOT,
    SHARED_DB_PATH,
    WORKOUTS_DB_PATH,
    is_shared_attached,
)

from backend.database.db_utils import get_current_user_id, get_db


def get_active_database_context(*, user_id: int | None = None) -> dict[str, Any]:
    """
    Single snapshot of which DB files the API uses and for which user.
    Used by diagnostics and import/warmup reports.
    """
    uid = int(user_id) if user_id is not None else get_current_user_id()
    paths = {
        "workouts": str(WORKOUTS_DB_PATH.resolve()),
        "shared": str(SHARED_DB_PATH.resolve()),
        "data_root": str(DATA_ROOT.resolve()),
        "forma_data_dir": os.environ.get("FORMA_DATA_DIR", "").strip() or None,
    }
    profile = _load_profile_row(uid)
    shared_attached = False
    try:
        conn = get_db()
        try:
            shared_attached = is_shared_attached(conn)
        finally:
            conn.close()
    except Exception:
        shared_attached = False
    return {
        "activeDbPath": paths,
        "currentProfile": profile,
        "shared_attached": shared_attached,
        "request_user_id": uid,
    }


def _load_profile_row(user_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, first_name, last_name, display_name, sex
            FROM user_profile WHERE id = ?
            """,
            (user_id,),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return {"user_id": user_id, "found": False}
    return {
        "user_id": int(row[0]),
        "found": True,
        "first_name": row[1],
        "last_name": row[2],
        "display_name": row[3],
        "sex": row[4],
    }
