# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3

from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync.manifest import FormaSyncManifest

ACTIVE_NOT_DELETED = "(deleted_at IS NULL OR deleted_at = '')"


def local_has_syncable_data(conn: sqlite3.Connection, user_id: int | None = None) -> bool:
    uid = user_id if user_id is not None else get_current_user_id()
    tables_with_user = (
        "food_entries",
        "stretching_log",
        "cardio_workouts",
        "workout_presets",
    )
    for table in tables_with_user:
        try:
            row = conn.execute(
                f"SELECT 1 FROM {table} WHERE user_id = ? AND {ACTIVE_NOT_DELETED} LIMIT 1",
                (uid,),
            ).fetchone()
            if row:
                return True
        except sqlite3.OperationalError:
            continue
    for table in ("body_metrics", "daily_bracelet_calories"):
        try:
            row = conn.execute(
                f"SELECT 1 FROM {table} WHERE user_id = ? AND {ACTIVE_NOT_DELETED} LIMIT 1",
                (uid,),
            ).fetchone()
            if row:
                return True
        except sqlite3.OperationalError:
            continue
    try:
        row = conn.execute(
            f"""SELECT 1 FROM strength_workouts
                WHERE user_id = ? AND {ACTIVE_NOT_DELETED} LIMIT 1""",
            (uid,),
        ).fetchone()
        if row:
            return True
    except sqlite3.OperationalError:
        pass
    try:
        row = conn.execute("SELECT 1 FROM forma_sync_touch LIMIT 1").fetchone()
        if row:
            return True
    except sqlite3.OperationalError:
        pass
    return False


def needs_baseline_upload(
    remote_manifest: FormaSyncManifest | None,
    local_revision: int,
    last_upload_at: str | None,
    has_local_data: bool,
) -> bool:
    if remote_manifest is not None:
        return False
    if not has_local_data:
        return False
    if local_revision > 0:
        return False
    if last_upload_at:
        return False
    return True
