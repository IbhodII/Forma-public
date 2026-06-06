# -*- coding: utf-8 -*-
"""Exercise sets must not leak between user_id scopes."""
from __future__ import annotations

import sqlite3

import pytest

from database.migrations import EXERCISE_SET_DEFAULT_FROM, _insert_exercise_set


@pytest.fixture
def scoped_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            UNIQUE(user_id, workout_type, effective_from)
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    _insert_exercise_set(
        conn,
        "TypeA",
        EXERCISE_SET_DEFAULT_FROM,
        ["Жим A"],
        is_default=1,
        user_id=1,
    )
    _insert_exercise_set(
        conn,
        "TypeB",
        EXERCISE_SET_DEFAULT_FROM,
        ["Жим B"],
        is_default=1,
        user_id=2,
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)
    yield db_path


def test_get_all_sets_filters_by_current_user(scoped_db, monkeypatch):
    from database import db_utils

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    assert len(db_utils.get_all_sets("TypeA")) == 1
    assert db_utils.get_all_sets("TypeB") == []

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 2)
    assert db_utils.get_all_sets("TypeA") == []
    assert len(db_utils.get_all_sets("TypeB")) == 1


def test_migration_v068_rebuilds_per_user_unique(tmp_path):
    from database.migrations import _migration_v068_exercise_sets_user_scope

    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            workout_title TEXT, exercise TEXT, date TEXT, user_id INTEGER
        );
        INSERT INTO strength_workouts VALUES ('Legs', 'Squat', '2026-01-01', 2);
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL DEFAULT 1,
            UNIQUE(workout_type, effective_from)
        );
        INSERT INTO exercise_sets (workout_type, effective_from, user_id)
        VALUES ('Legs', '1900-01-01', 1);
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER, exercise_order INTEGER, exercise_name TEXT, user_id INTEGER
        );
        """
    )
    _migration_v068_exercise_sets_user_scope(conn)
    conn.commit()
    row = conn.execute("SELECT user_id FROM exercise_sets WHERE workout_type = 'Legs'").fetchone()
    assert int(row[0]) == 2
    ddl = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='exercise_sets'"
    ).fetchone()[0]
    assert "UNIQUE(user_id, workout_type, effective_from)" in ddl.replace("\n", " ")
    conn.close()
