# -*- coding: utf-8 -*-
"""Unified DB diagnostics: paths, profile, domain counts."""
from __future__ import annotations

from typing import Any

from backend.database.active_db import get_active_database_context
from backend.database.db_utils import get_current_user_id
from backend.repositories import analytics_repo, body_repo, food_repo, steps_repo, workouts_repo
from backend.services.workout_visibility_diagnostics import build_workout_visibility_report


def build_database_overview(
    user_id: int | None = None,
    *,
    include_workout_visibility: bool = True,
) -> dict[str, Any]:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    ctx = get_active_database_context(user_id=uid)
    counts = {
        "strength_workouts": workouts_repo.count_strength_workouts(uid),
        "cardio_workouts": workouts_repo.count_cardio_workouts(uid),
        "food_entries": food_repo.count_food_entries(uid),
        "food_products_shared": food_repo.count_food_products(),
        "body_metrics": body_repo.count_body_metrics(uid),
        "daily_weight": body_repo.count_daily_weight(uid),
        "steps_days": steps_repo.count_steps_days(uid),
        "analytics": analytics_repo.analytics_snapshot(uid),
    }
    out: dict[str, Any] = {
        "activeDbPath": ctx["activeDbPath"],
        "currentProfile": ctx["currentProfile"],
        "shared_attached": ctx["shared_attached"],
        "request_user_id": uid,
        "counts": counts,
    }
    if include_workout_visibility:
        out["workout_visibility"] = build_workout_visibility_report(uid)
    return out
