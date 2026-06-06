# -*- coding: utf-8 -*-
"""Prefill наследует круговой режим и порядок шагов из последней сессии."""
from __future__ import annotations

import sqlite3

import pytest

from database.migrations import EXERCISE_SET_DEFAULT_FROM, _insert_exercise_set


@pytest.fixture
def circuit_prefill_db(tmp_path, monkeypatch):
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
            order_index INTEGER DEFAULT 0,
            is_warmup INTEGER DEFAULT 0,
            is_circuit INTEGER DEFAULT 0,
            duration_sec INTEGER,
            is_bodyweight INTEGER DEFAULT 0,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            user_id INTEGER NOT NULL,
            block_uid TEXT,
            block_type TEXT,
            block_order INTEGER,
            block_rounds INTEGER,
            block_exercise_order INTEGER,
            block_title TEXT,
            target_reps INTEGER,
            target_weight REAL,
            target_duration_sec INTEGER,
            is_bodyweight INTEGER DEFAULT 0,
            is_warmup INTEGER DEFAULT 0
        );
        """
    )
    conn.execute(
        """
        INSERT INTO strength_workouts
        (date, workout_title, exercise, weight, reps, set_number, order_index,
         is_warmup, is_circuit, user_id)
        VALUES
        ('2026-05-01', 'Круг', 'Жим', 60, 8, 1, 1, 0, 1, 1),
        ('2026-05-01', 'Круг', 'Тяга', 50, 10, 2, 2, 0, 1, 1),
        ('2026-05-01', 'Круг', 'Жим', 60, 8, 3, 3, 0, 1, 1)
        """
    )
    _insert_exercise_set(
        conn,
        "Круг",
        EXERCISE_SET_DEFAULT_FROM,
        ["Жим", "Тяга"],
        is_default=1,
        user_id=1,
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)

    def _open():
        return sqlite3.connect(db_path)

    monkeypatch.setattr("backend.database.get_db", _open)
    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.exercise_catalog_service.get_current_user_id", lambda: 1)
    yield db_path


def test_prefill_inherits_circuit_mode_and_steps(circuit_prefill_db):
    from backend.services import exercise_service

    data = exercise_service.get_workout_form_prefill("Круг", "2026-06-01")
    assert data["is_circuit"] is True
    assert len(data["circuit_steps"]) == 3
    assert [s["exercise"] for s in data["circuit_steps"]] == ["Жим", "Тяга", "Жим"]


def test_exercise_set_template_preserves_superset_blocks(circuit_prefill_db, monkeypatch):
    from backend.services import exercise_catalog_service, exercise_service

    monkeypatch.setattr(exercise_catalog_service, "ensure_exercises", lambda names: None)

    editor = exercise_service.get_editor_state("Круг", "2026-06-01")
    set_id = int(editor["active_set_id"])
    exercise_service.update_set_from_editor(
        set_id,
        ["Жим", "Тяга"],
        active_blocks=[
            {
                "id": "superset-a",
                "type": "superset",
                "title": "Жим + тяга",
                "rounds": 4,
                "exercises": [
                    {"exercise": "Жим", "reps": 8, "weight": 60, "is_warmup": False},
                    {"exercise": "Тяга", "reps": 10, "weight": 50, "is_warmup": False},
                ],
            }
        ],
    )

    detail = exercise_service.get_set_detail(set_id)
    assert detail["blocks"][0]["type"] == "superset"
    assert detail["blocks"][0]["rounds"] == 4
    assert [e["exercise"] for e in detail["blocks"][0]["exercises"]] == ["Жим", "Тяга"]

    prefill = exercise_service.get_workout_form_prefill("Круг", "2026-06-01")
    assert prefill["blocks"][0]["id"] == "superset-a"
    assert prefill["blocks"][0]["type"] == "superset"
    assert prefill["blocks"][0]["rounds"] == 4


def test_prefill_normal_mode_without_circuit_history(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            date TEXT, workout_title TEXT, exercise TEXT, user_id INTEGER,
            set_number INTEGER DEFAULT 1, order_index INTEGER DEFAULT 0,
            is_circuit INTEGER DEFAULT 0, reps INTEGER, weight REAL,
            is_warmup INTEGER DEFAULT 0
        );
        INSERT INTO strength_workouts VALUES
            ('2026-05-01', 'Сила', 'Присед', 1, 1, 0, 0, 5, 100, 0),
            ('2026-05-01', 'Сила', 'Жим', 1, 2, 0, 0, 5, 80, 0);
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            user_id INTEGER NOT NULL
        );
        """
    )
    _insert_exercise_set(
        conn,
        "Сила",
        EXERCISE_SET_DEFAULT_FROM,
        ["Жим", "Присед"],
        is_default=1,
        user_id=1,
    )
    conn.commit()
    conn.close()
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)
    monkeypatch.setattr("backend.database.get_db", lambda: sqlite3.connect(db_path))
    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)

    from backend.services import exercise_service

    data = exercise_service.get_workout_form_prefill("Сила", "2026-06-01")
    assert data["is_circuit"] is False
    assert not data.get("circuit_steps")
    assert [e["exercise"] for e in data["exercises"]] == ["Присед", "Жим"]
