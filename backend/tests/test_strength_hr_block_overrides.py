# -*- coding: utf-8 -*-
"""Tests for persisted HR block overrides."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import strength_hr_analysis_service, strength_hr_block_override_service, strength_service
from backend.services.strength_hr_block_override_service import BlockOverrideValidationError
from backend.services.strength_service import HR_SOURCE_STRENGTH
from backend.database import db_utils


@pytest.fixture
def overrides_db(tmp_path, monkeypatch):
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
        CREATE UNIQUE INDEX idx_hr_block_overrides_session_block
        ON strength_hr_block_overrides(user_id, workout_date, workout_title, block_index);
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

    monkeypatch.setattr(strength_service, "get_db", _get_db)
    monkeypatch.setattr(strength_hr_block_override_service, "get_db", _get_db)
    monkeypatch.setattr(strength_hr_analysis_service, "get_db", _get_db)
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


def test_validate_rejects_overlap():
    blocks = [
        {"start_sec": 0, "end_sec": 60, "kind": "set"},
        {"start_sec": 50, "end_sec": 100, "kind": "set"},
    ]
    with pytest.raises(BlockOverrideValidationError):
        strength_hr_block_override_service.validate_override_blocks(blocks)


def test_validate_rejects_short_block():
    blocks = [{"start_sec": 0, "end_sec": 5, "kind": "set"}]
    with pytest.raises(BlockOverrideValidationError):
        strength_hr_block_override_service.validate_override_blocks(blocks)


def test_crud_roundtrip(overrides_db):
    blocks = [
        {
            "start_sec": 0,
            "end_sec": 55,
            "kind": "set",
            "assigned_order_index": 1,
        },
        {
            "start_sec": 55,
            "end_sec": 110,
            "kind": "rest",
            "assigned_order_index": None,
        },
    ]
    strength_hr_block_override_service.save_overrides("2026-05-28", "Push", blocks)
    saved = strength_hr_block_override_service.get_overrides("2026-05-28", "Push")
    assert len(saved) == 2
    assert saved[0]["start_sec"] == 0
    assert saved[1]["kind"] == "rest"

    strength_hr_block_override_service.delete_overrides("2026-05-28", "Push")
    assert strength_hr_block_override_service.get_overrides("2026-05-28", "Push") == []


def test_crud_roundtrip_training_signal(overrides_db):
    blocks = [
        {
            "start_sec": 0,
            "end_sec": 55,
            "kind": "set",
            "assigned_order_index": 1,
            "source_auto_block_index": 1,
            "original_start_sec": 5,
            "original_end_sec": 50,
        },
    ]
    strength_hr_block_override_service.save_overrides("2026-05-28", "Push", blocks)
    saved = strength_hr_block_override_service.get_overrides("2026-05-28", "Push")
    assert saved[0]["source_auto_block_index"] == 1
    assert saved[0]["original_start_sec"] == 5
    assert saved[0]["original_end_sec"] == 50


def test_hr_analysis_applies_overrides(overrides_db):
    strength_hr_block_override_service.save_overrides(
        "2026-05-28",
        "Push",
        [{"start_sec": 0, "end_sec": 100, "kind": "set", "assigned_order_index": 1}],
    )
    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["overrides_applied"] is True
    assert len(result["detected_blocks"]) == 1
    assert result["auto_detected_blocks"] is not None
    assert result["manual_blocks"] is not None
    assert result["detected_blocks"][0]["start_sec"] == 0

    strength_hr_block_override_service.delete_overrides("2026-05-28", "Push")
    reset = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert reset["overrides_applied"] is False
