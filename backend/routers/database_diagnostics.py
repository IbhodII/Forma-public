# -*- coding: utf-8 -*-
"""Manual DB diagnostics (desktop / admin)."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from backend.database.db_utils import get_current_user_id
from backend.services.database_diagnostics_service import build_database_overview
from backend.services.workout_visibility_diagnostics import build_workout_visibility_report

router = APIRouter(prefix="/database/diagnostics", tags=["database-diagnostics"])


@router.get("/overview")
async def database_overview() -> dict:
    """Active DB paths, current profile, row counts, workout visibility."""
    return build_database_overview()


@router.get("/workout-visibility")
async def workout_visibility(
    date_from: str | None = Query(None),
    date_to: str | None = Query(None),
    workout_title: str | None = Query(None),
) -> dict[str, Any]:
    """Compare strength_workouts counts vs Workouts UI list filters."""
    uid = get_current_user_id()
    return build_workout_visibility_report(
        uid,
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        include_ui_scenarios=True,
    )
