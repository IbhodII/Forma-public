# -*- coding: utf-8 -*-
"""Tests for workout visibility diagnostics after DB import."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from backend.database.request_context import set_current_user_id
from backend.services.database_import_tasks import _reassign_user_ids_to_target
from backend.services.workout_visibility_diagnostics import (
    build_workout_visibility_report,
    workouts_page_default_date_range,
)
from database.migrations import ensure_db_schema


@pytest.fixture()
def vis_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    workouts = tmp / "workouts.db"
    shared = tmp / "shared.db"
    sqlite3.connect(workouts).close()
    sqlite3.connect(shared).close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)

    from database.connection import open_db
    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_db_schema()
    set_current_user_id(1)
    yield tmp


def _insert_strength(
    user_id: int,
    date: str,
    title: str = "Leg day",
    exercise: str = "Squat",
) -> None:
    from database.connection import open_db

    conn = open_db(attach=True)
    try:
        conn.execute(
            """
            INSERT INTO strength_workouts (
                user_id, date, workout_title, exercise, set_number, weight, reps
            )
            VALUES (?, ?, ?, ?, 1, 50.0, 10)
            """,
            (user_id, date, title, exercise),
        )
        conn.commit()
    finally:
        conn.close()


def test_user_id_mismatch_detected(vis_env):
    _insert_strength(5, "2024-06-01")
    report = build_workout_visibility_report(1, include_ui_scenarios=False)
    assert report["rows_for_current_user"] == 0
    assert 5 in report["import_detected_user_ids"]
    assert any("user_id" in c for c in report["likely_causes"])


def test_period_filter_hides_old_sessions(vis_env):
    _insert_strength(1, "2019-01-15")
    report = build_workout_visibility_report(1, include_ui_scenarios=False)
    assert report["rows_for_current_user"] == 1
    assert report["ui_visible_sessions_all_time"] >= 1
    assert report["ui_visible_sessions"] == 0
    assert any("период" in c for c in report["likely_causes"])


def test_reassign_user_ids_after_replace(vis_env):
    _insert_strength(5, "2024-06-01")
    remap = _reassign_user_ids_to_target(1)
    assert remap["rows_updated"] >= 1
    assert remap["to"] == 1
    assert 5 in remap["from"]

    report = build_workout_visibility_report(1, include_ui_scenarios=False)
    assert report["rows_for_current_user"] >= 1
    assert report["sessions_for_current_user"] >= 1


def test_default_date_range_matches_ui_helper():
    df, dt = workouts_page_default_date_range()
    assert df < dt
