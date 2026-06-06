# -*- coding: utf-8 -*-
"""Polar attach to strength: overwrite avg_hr / calories_chest from Polar."""
from __future__ import annotations

import json
import sqlite3

import pytest

from backend.services import polar_attach_service


@pytest.fixture
def polar_strength_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
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
            user_id INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE polar_pending_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            polar_transaction_id TEXT NOT NULL UNIQUE,
            date TEXT,
            type TEXT,
            duration_sec INTEGER,
            distance_km REAL,
            calories INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            raw_data TEXT,
            imported INTEGER NOT NULL DEFAULT 0,
            local_user_id INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            distance_m REAL,
            source_type TEXT DEFAULT 'cardio'
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(polar_attach_service, "get_db", _get_db)
    monkeypatch.setattr(polar_attach_service, "get_current_user_id", lambda: 1)
    return db_path


def _insert_strength_session(conn: sqlite3.Connection) -> int:
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            avg_hr, calories_chest, calories_watch, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("2026-05-28", "Push", "Bench", 80.0, 8, 1, 120, 500, 300, 1),
    )
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            avg_hr, calories_chest, calories_watch, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("2026-05-28", "Push", "Bench", 80.0, 6, 2, 120, 500, 300, 1),
    )
    conn.commit()
    row = conn.execute("SELECT id FROM strength_workouts ORDER BY id ASC LIMIT 1").fetchone()
    return int(row["id"])


def _insert_polar_pending(conn: sqlite3.Connection) -> str:
    tid = "polar-test-tx-1"
    raw = json.dumps({"heart-rate": {"average": 145, "maximum": 170}})
    conn.execute(
        """
        INSERT INTO polar_pending_workouts (
            polar_transaction_id, date, type, calories, avg_hr, max_hr,
            raw_data, imported, local_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
        """,
        (tid, "2026-05-28", "силовая", 650, 145, 170, raw),
    )
    conn.commit()
    return tid


def test_update_strength_session_overwrites_existing_metrics(polar_strength_db):
    conn = polar_attach_service.get_db()
    try:
        anchor_id = _insert_strength_session(conn)
        _insert_polar_pending(conn)
        pending = conn.execute(
            "SELECT * FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            ("polar-test-tx-1",),
        ).fetchone()
        data = json.loads(pending["raw_data"])
        updated = polar_attach_service._update_strength_session_from_polar(
            conn,
            anchor_id,
            pending,
            data,
            [],
        )
        conn.commit()
        assert updated is True
        rows = conn.execute(
            """
            SELECT avg_hr, calories_chest, calories_watch
            FROM strength_workouts
            WHERE date = ? AND workout_title = ?
            """,
            ("2026-05-28", "Push"),
        ).fetchall()
        assert len(rows) == 2
        for row in rows:
            assert row["avg_hr"] == 145
            assert row["calories_chest"] == 650
            assert row["calories_watch"] == 300
    finally:
        conn.close()


def test_attach_polar_to_strength_returns_workout(polar_strength_db, monkeypatch):
    conn = polar_attach_service.get_db()
    try:
        anchor_id = _insert_strength_session(conn)
        tid = _insert_polar_pending(conn)
    finally:
        conn.close()

    fake_detail = {
        "date": "2026-05-28",
        "workout_title": "Push",
        "exercises": [],
        "avg_hr": 145,
        "calories_chest": 650,
        "calories_watch": 300,
        "has_hr": False,
        "hr_workout_id": anchor_id,
        "anchor_row_id": anchor_id,
        "duration_sec": None,
        "ordered_sets": [],
        "uses_ordered_sets": False,
        "is_circuit": False,
    }
    monkeypatch.setattr(
        "backend.services.strength_service.get_session_detail",
        lambda _date, _title: fake_detail,
    )
    monkeypatch.setattr(
        polar_attach_service,
        "_hydrate_polar_raw_data",
        lambda _conn, _pending, data: data,
    )
    monkeypatch.setattr(
        polar_attach_service,
        "insert_hr_samples_if_empty",
        lambda *args, **kwargs: False,
    )

    result = polar_attach_service.attach_polar_to_strength(anchor_id, tid)

    assert result["fields_updated"] is True
    assert result["workout"]["avg_hr"] == 145
    assert result["workout"]["calories_chest"] == 650

    conn = polar_attach_service.get_db()
    try:
        row = conn.execute(
            "SELECT avg_hr, calories_chest, calories_watch FROM strength_workouts WHERE id = ?",
            (anchor_id,),
        ).fetchone()
        assert row["avg_hr"] == 145
        assert row["calories_chest"] == 650
        assert row["calories_watch"] == 300
        pending = conn.execute(
            "SELECT imported FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            (tid,),
        ).fetchone()
        assert pending["imported"] == 1
    finally:
        conn.close()
