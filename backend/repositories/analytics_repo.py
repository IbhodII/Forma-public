# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.repositories.base import table_exists, with_connection


def analytics_snapshot(user_id: int) -> dict[str, int | bool]:
    """Lightweight checks used by diagnostics (not full analytics compute)."""
    out: dict[str, int | bool] = {
        "passive_hr_samples": 0,
        "has_strength_for_user": False,
    }
    with with_connection() as conn:
        if table_exists(conn, "passive_heart_rate_samples"):
            cols = {
                r[1] for r in conn.execute("PRAGMA table_info(passive_heart_rate_samples)").fetchall()
            }
            if "user_id" in cols:
                row = conn.execute(
                    "SELECT COUNT(*) FROM passive_heart_rate_samples WHERE user_id = ?",
                    (user_id,),
                ).fetchone()
            else:
                row = conn.execute("SELECT COUNT(*) FROM passive_heart_rate_samples").fetchone()
            out["passive_hr_samples"] = int(row[0]) if row else 0
        if table_exists(conn, "strength_workouts"):
            row = conn.execute(
                "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ? LIMIT 1",
                (user_id,),
            ).fetchone()
            out["has_strength_for_user"] = bool(row and int(row[0]) > 0)
    return out
