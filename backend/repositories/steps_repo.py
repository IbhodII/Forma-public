# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.repositories.base import count_for_user, table_exists, with_connection


def count_steps_days(user_id: int) -> int:
    """Rows in steps_history (or legacy steps table) for user."""
    with with_connection() as conn:
        for table in ("steps_history", "daily_steps"):
            if table_exists(conn, table):
                cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
                if "user_id" in cols:
                    return count_for_user(conn, table, user_id)
                row = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()
                return int(row[0]) if row else 0
        return 0
