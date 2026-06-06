# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.repositories.base import count_for_user, table_exists, with_connection


def count_food_entries(user_id: int) -> int:
    with with_connection() as conn:
        if not table_exists(conn, "food_entries"):
            return 0
        return count_for_user(conn, "food_entries", user_id)


def count_food_products() -> int:
    with with_connection() as conn:
        try:
            row = conn.execute("SELECT COUNT(*) FROM shared.food_products").fetchone()
            return int(row[0]) if row else 0
        except Exception:
            return 0
