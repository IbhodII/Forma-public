# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.repositories.base import count_for_user, table_exists, with_connection


def count_body_metrics(user_id: int) -> int:
    with with_connection() as conn:
        if not table_exists(conn, "body_metrics"):
            return 0
        uf = count_for_user(conn, "body_metrics", user_id)
        return uf


def count_daily_weight(user_id: int) -> int:
    with with_connection() as conn:
        if not table_exists(conn, "daily_weight"):
            return 0
        cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)").fetchall()}
        if "user_id" in cols:
            return count_for_user(conn, "daily_weight", user_id)
        row = conn.execute("SELECT COUNT(*) FROM daily_weight").fetchone()
        return int(row[0]) if row else 0
