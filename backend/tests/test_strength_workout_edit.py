# -*- coding: utf-8 -*-
"""Сохранение пульса при редактировании силовой тренировки."""
from __future__ import annotations

import sqlite3

import pytest

from backend.database import db_utils
from backend.services import cardio_service, strength_service
from backend.services.strength_service import HR_SOURCE_STRENGTH


@pytest.fixture
def strength_edit_db(tmp_path, monkeypatch):
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
            calories_hr INTEGER,
            calories_watch INTEGER,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            is_circuit INTEGER NOT NULL DEFAULT 0,
            duration_sec INTEGER,
            is_bodyweight INTEGER NOT NULL DEFAULT 0,
            notes TEXT,
            epley_1rm REAL,
            preset_id INTEGER,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            distance_m REAL,
            source_type TEXT DEFAULT 'cardio'
        );
        CREATE TABLE forma_sync_touch (
            entity_type TEXT NOT NULL,
            entity_key TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            PRIMARY KEY (entity_type, entity_key)
        );
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(strength_service, "get_db", _get_db)
    monkeypatch.setattr(cardio_service, "get_db", _get_db)
    monkeypatch.setattr(db_utils, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(strength_service, "get_current_user_id", lambda: 1)

    from backend.services import exercise_catalog_service, preset_service

    monkeypatch.setattr(exercise_catalog_service, "ensure_exercises", lambda names: None)
    monkeypatch.setattr(preset_service, "get_preset_id_by_name", lambda name: None)
    monkeypatch.setattr(
        "backend.services.forma_sync.change_tracker.touch_strength_session",
        lambda conn, date_str, workout_title: None,
    )
    return db_path


def _seed_session_with_hr(
    conn: sqlite3.Connection,
    *,
    date: str = "2026-05-27",
    title: str = "Back",
) -> tuple[int, int]:
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            order_index, is_warmup, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
        """,
        (date, title, "Deadlift", 100.0, 5, 1, 1),
    )
    anchor_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            order_index, is_warmup, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
        """,
        (date, title, "Row", 80.0, 8, 1, 2),
    )
    hr_count = 0
    for sec in range(120):
        hr = 100 + (sec % 40)
        conn.execute(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, source_type
            ) VALUES (?, ?, ?, ?)
            """,
            (anchor_id, sec, hr, HR_SOURCE_STRENGTH),
        )
        hr_count += 1
    conn.commit()
    return anchor_id, hr_count


def test_edit_workout_preserves_hr_when_adding_warmup(strength_edit_db):
    conn = strength_service.get_db()
    try:
        old_anchor, hr_count = _seed_session_with_hr(conn)
    finally:
        conn.close()

    inserted, new_anchor = strength_service.create_workout(
        {
            "date": "2026-05-27",
            "workout_title": "Back",
            "edit_session_date": "2026-05-27",
            "edit_session_title": "Back",
            "sets": [
                {
                    "exercise": "Deadlift",
                    "weight": 60,
                    "reps": 8,
                    "is_warmup": True,
                },
                {"exercise": "Deadlift", "weight": 100, "reps": 5},
                {"exercise": "Row", "weight": 80, "reps": 8},
            ],
        }
    )

    assert inserted == 3
    assert new_anchor != old_anchor

    detail = strength_service.get_session_detail("2026-05-27", "Back")
    assert detail["has_hr"] is True
    assert detail["hr_workout_id"] == new_anchor

    hr_rows = strength_service.get_strength_heart_rate_data(new_anchor)
    assert len(hr_rows) == hr_count


def test_edit_workout_preserves_hr_when_title_changes(strength_edit_db):
    conn = strength_service.get_db()
    try:
        _seed_session_with_hr(conn, title="Old title")
    finally:
        conn.close()

    _, new_anchor = strength_service.create_workout(
        {
            "date": "2026-05-27",
            "workout_title": "New title",
            "edit_session_date": "2026-05-27",
            "edit_session_title": "Old title",
            "sets": [
                {"exercise": "Deadlift", "weight": 100, "reps": 5},
                {"exercise": "Row", "weight": 80, "reps": 8},
            ],
        }
    )

    old_detail = strength_service.get_session_detail("2026-05-27", "Old title")
    assert old_detail["has_hr"] is False

    new_detail = strength_service.get_session_detail("2026-05-27", "New title")
    assert new_detail["has_hr"] is True
    assert new_detail["hr_workout_id"] == new_anchor
    assert len(strength_service.get_strength_heart_rate_data(new_anchor)) == 120


def test_strength_block_metadata_roundtrip(strength_edit_db):
    conn = strength_service.get_db()
    try:
        for col, typ in {
            "block_uid": "TEXT",
            "block_type": "TEXT",
            "block_order": "INTEGER",
            "block_rounds": "INTEGER",
            "block_exercise_order": "INTEGER",
            "round_index": "INTEGER",
            "block_title": "TEXT",
        }.items():
            conn.execute(f"ALTER TABLE strength_workouts ADD COLUMN {col} {typ}")
        conn.commit()
    finally:
        conn.close()

    inserted, _ = strength_service.create_workout(
        {
            "date": "2026-05-28",
            "workout_title": "Superset day",
            "sets": [
                {
                    "exercise": "Pull-up",
                    "weight": 0,
                    "reps": 8,
                    "block_uid": "block-a",
                    "block_type": "superset",
                    "block_order": 0,
                    "block_rounds": 2,
                    "block_exercise_order": 0,
                    "round_index": 1,
                    "block_title": "Тяга + отжимания",
                },
                {
                    "exercise": "Push-up",
                    "weight": 0,
                    "reps": 12,
                    "block_uid": "block-a",
                    "block_type": "superset",
                    "block_order": 0,
                    "block_rounds": 2,
                    "block_exercise_order": 1,
                    "round_index": 1,
                    "block_title": "Тяга + отжимания",
                },
                {
                    "exercise": "Pull-up",
                    "weight": 0,
                    "reps": 8,
                    "block_uid": "block-a",
                    "block_type": "superset",
                    "block_order": 0,
                    "block_rounds": 2,
                    "block_exercise_order": 0,
                    "round_index": 2,
                    "block_title": "Тяга + отжимания",
                },
                {
                    "exercise": "Push-up",
                    "weight": 0,
                    "reps": 12,
                    "block_uid": "block-a",
                    "block_type": "superset",
                    "block_order": 0,
                    "block_rounds": 2,
                    "block_exercise_order": 1,
                    "round_index": 2,
                    "block_title": "Тяга + отжимания",
                },
            ],
        }
    )

    assert inserted == 4
    detail = strength_service.get_session_detail("2026-05-28", "Superset day")
    assert detail["uses_ordered_sets"] is True
    assert [s["exercise"] for s in detail["ordered_sets"]] == [
        "Pull-up",
        "Push-up",
        "Pull-up",
        "Push-up",
    ]
    assert {s["block_uid"] for s in detail["ordered_sets"]} == {"block-a"}
    assert {s["block_type"] for s in detail["ordered_sets"]} == {"superset"}
    assert [s["round_index"] for s in detail["ordered_sets"]] == [1, 1, 2, 2]
    assert [s["block_exercise_order"] for s in detail["ordered_sets"]] == [0, 1, 0, 1]
