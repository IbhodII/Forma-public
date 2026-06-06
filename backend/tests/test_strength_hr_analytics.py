# -*- coding: utf-8 -*-
"""Tests for HR analytics + verified mappings."""
from __future__ import annotations

import sqlite3

import pytest

from backend.database import db_utils
from backend.services import (
    strength_hr_analysis_service,
    strength_hr_analytics_service,
    strength_hr_block_override_service,
    strength_hr_mapping_service,
    strength_service,
)
from backend.services.strength_service import HR_SOURCE_STRENGTH


@pytest.fixture
def hr_analytics_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            workout_title TEXT,
            exercise TEXT,
            weight REAL,
            reps INTEGER,
            set_number INTEGER,
            order_index INTEGER NOT NULL DEFAULT 0,
            avg_hr INTEGER,
            calories_chest INTEGER,
            calories_watch INTEGER,
            calories_hr INTEGER,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            is_circuit INTEGER NOT NULL DEFAULT 0,
            is_bodyweight INTEGER NOT NULL DEFAULT 0,
            duration_sec INTEGER,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            source_type TEXT DEFAULT 'strength'
        );
        CREATE TABLE strength_hr_block_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'set',
            assigned_order_index INTEGER,
            label TEXT,
            notes TEXT,
            source_auto_block_index INTEGER,
            original_start_sec INTEGER,
            original_end_sec INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE strength_hr_session_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            hr_workout_id INTEGER,
            mapping_status TEXT NOT NULL DEFAULT 'auto',
            verified_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE strength_hr_block_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'set',
            assigned_order_index INTEGER,
            exercise TEXT,
            set_number INTEGER,
            verified INTEGER NOT NULL DEFAULT 0,
            confidence TEXT,
            label TEXT,
            notes TEXT,
            source_auto_block_index INTEGER,
            original_start_sec INTEGER,
            original_end_sec INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """
    )
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            order_index, duration_sec, user_id
        ) VALUES ('2026-05-28', 'Push', 'Bench', 80, 8, 1, 1, 120, 1)
        """
    )
    wid = int(conn.execute("SELECT id FROM strength_workouts").fetchone()[0])
    for sec in range(120):
        hr = 100 + (sec % 40)
        conn.execute(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, source_type
            ) VALUES (?, ?, ?, ?)
            """,
            (wid, sec, hr, HR_SOURCE_STRENGTH),
        )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    for mod in (
        strength_service,
        strength_hr_block_override_service,
        strength_hr_mapping_service,
        strength_hr_analysis_service,
    ):
        monkeypatch.setattr(mod, "get_db", _get_db)
    import backend.database as backend_db

    monkeypatch.setattr(backend_db, "get_db", _get_db)
    monkeypatch.setattr(db_utils, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(strength_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        strength_hr_analysis_service,
        "get_effective_max_heart_rate",
        lambda: 190,
    )
    return db_path


def test_verify_auto_mapping_persists(hr_analytics_db):
    strength_hr_mapping_service.verify_auto_mapping("2026-05-28", "Push")
    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["mapping_status"] == "verified"
    assert result["has_verified_mapping"] is True
    assert result["overrides_applied"] is True
    assert len(result["detected_blocks"]) >= 1


def test_manual_put_and_delete_mapping(hr_analytics_db):
    blocks = [
        {"start_sec": 0, "end_sec": 100, "kind": "set", "assigned_order_index": 1},
    ]
    strength_hr_mapping_service.save_mappings(
        "2026-05-28", "Push", blocks, mapping_status="manual"
    )
    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["mapping_status"] == "manual"
    assert result["has_manual_mapping"] is True

    strength_hr_mapping_service.delete_mappings("2026-05-28", "Push")
    reset = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert reset["mapping_status"] == "auto"
    assert reset["overrides_applied"] is False


def test_sessions_list_includes_mapping_fields(hr_analytics_db):
    strength_hr_mapping_service.verify_auto_mapping("2026-05-28", "Push")
    data = strength_hr_analytics_service.list_hr_sessions()
    assert data["total"] >= 1
    row = data["items"][0]
    assert row["mapping_status"] == "verified"
    assert row["has_verified_mapping"] is True
    assert row["detected_blocks_count"] >= 1


def test_verified_only_filter(hr_analytics_db):
    auto_only = strength_hr_analytics_service.list_hr_sessions(verified_only=True)
    assert auto_only["total"] == 0

    strength_hr_mapping_service.verify_auto_mapping("2026-05-28", "Push")
    verified = strength_hr_analytics_service.list_hr_sessions(verified_only=True)
    assert verified["total"] == 1


def test_exercise_aggregates_after_verify(hr_analytics_db):
    strength_hr_mapping_service.verify_auto_mapping("2026-05-28", "Push")
    items = strength_hr_analytics_service.list_exercise_aggregates()
    assert any(row["exercise"] == "Bench" for row in items)


def test_legacy_override_sync_uses_mappings(hr_analytics_db):
    blocks = [
        {"start_sec": 0, "end_sec": 100, "kind": "set", "assigned_order_index": 1},
    ]
    strength_hr_mapping_service.sync_legacy_override("2026-05-28", "Push", blocks)
    mappings = strength_hr_mapping_service.get_mappings("2026-05-28", "Push")
    assert len(mappings) == 1
    legacy = strength_hr_block_override_service.get_overrides("2026-05-28", "Push")
    assert len(legacy) == 1
    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["mapping_status"] == "manual"


def test_overview_matches_sessions_list(hr_analytics_db):
    strength_hr_mapping_service.verify_auto_mapping("2026-05-28", "Push")
    sessions = strength_hr_analytics_service.list_hr_sessions()
    overview = strength_hr_analytics_service.build_hr_analytics_overview()
    assert overview["sessions_total"] == sessions["total"]
    assert len(overview["sessions"]) == len(sessions["items"])
    assert overview["sessions"][0]["mapping_status"] == "verified"
    assert any(row["exercise"] == "Bench" for row in overview["exercises"])
    assert len(overview["trends"]) >= 1
    assert overview["truncated"] is False


def test_overview_truncated_flag(monkeypatch, hr_analytics_db):
    orig = strength_hr_analytics_service._collect_hr_session_rows

    def capped_collect(**kwargs):
        rows, _trunc = orig(**kwargs)
        return rows, True

    monkeypatch.setattr(
        strength_hr_analytics_service,
        "_collect_hr_session_rows",
        capped_collect,
    )
    overview = strength_hr_analytics_service.build_hr_analytics_overview()
    assert overview["truncated"] is True
    assert overview["sessions_total"] >= 1
