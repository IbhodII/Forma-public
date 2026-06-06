# -*- coding: utf-8 -*-
"""Empty DB: no hardcoded strength presets; history-only sync is idempotent."""
from __future__ import annotations

import sqlite3

import pytest

from database.migrations import _seed_default_exercise_sets, _seed_workout_presets


@pytest.fixture
def preset_db(tmp_path):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE workout_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER DEFAULT 1,
            name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        CREATE TABLE preset_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            preset_id INTEGER,
            exercise_name TEXT,
            exercise_order INTEGER DEFAULT 0,
            default_sets INTEGER DEFAULT 4,
            default_reps TEXT,
            user_id INTEGER DEFAULT 1
        );
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_title TEXT,
            exercise TEXT,
            date TEXT,
            user_id INTEGER DEFAULT 1
        );
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_type TEXT,
            set_name TEXT,
            effective_from TEXT,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            user_id INTEGER DEFAULT 1
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER,
            exercise_order INTEGER,
            exercise_name TEXT,
            user_id INTEGER DEFAULT 1
        );
        """
    )
    yield conn
    conn.close()


def test_empty_db_no_hardcoded_presets(preset_db):
    _seed_workout_presets(preset_db)
    _seed_default_exercise_sets(preset_db)
    preset_db.commit()
    assert preset_db.execute("SELECT COUNT(*) FROM workout_presets").fetchone()[0] == 0
    assert preset_db.execute("SELECT COUNT(*) FROM exercise_sets").fetchone()[0] == 0


def test_history_only_preset_and_idempotent(preset_db):
    preset_db.executemany(
        "INSERT INTO strength_workouts (workout_title, exercise, date) VALUES (?, ?, ?)",
        [("Custom", "Жим", "2026-01-01"), ("Custom", "Тяга", "2026-01-02")],
    )
    _seed_workout_presets(preset_db)
    _seed_default_exercise_sets(preset_db)
    preset_db.commit()

    names = [r[0] for r in preset_db.execute("SELECT name FROM workout_presets").fetchall()]
    assert names == ["Custom"]

    ex = {
        r[0]
        for r in preset_db.execute("SELECT exercise_name FROM exercise_set_items").fetchall()
    }
    assert ex == {"Жим", "Тяга"}

    _seed_workout_presets(preset_db)
    _seed_default_exercise_sets(preset_db)
    preset_db.commit()
    assert preset_db.execute("SELECT COUNT(*) FROM workout_presets").fetchone()[0] == 1
