# -*- coding: utf-8 -*-
"""User scope: cardio TRIMP/CTL and steps must not leak across accounts."""
from __future__ import annotations

import sqlite3

import pytest

from backend.database import db_utils
from backend.services import cardio_service, steps_service


@pytest.fixture
def scope_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            type TEXT,
            trimp REAL,
            duration_sec INTEGER
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            source_type TEXT DEFAULT 'cardio'
        );
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'manual',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        );
        CREATE TABLE health_connect_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            synced_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            days_count INTEGER NOT NULL DEFAULT 0,
            saved_days INTEGER NOT NULL DEFAULT 0,
            errors_count INTEGER NOT NULL DEFAULT 0,
            payload_preview TEXT
        );
        """
    )
    conn.execute(
        """
        INSERT INTO cardio_workouts (user_id, date, type, trimp)
        VALUES (1, '2026-05-01', 'Run', 42.5)
        """
    )
    conn.execute(
        """
        INSERT INTO steps_history (user_id, date, steps, source)
        VALUES (1, '2026-05-01', 10000, 'health_connect')
        """
    )
    conn.execute(
        """
        INSERT INTO health_connect_sync_log (user_id, days_count, saved_days)
        VALUES (1, 7, 7)
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(db_utils, "get_db", _get_db)
    monkeypatch.setattr(cardio_service, "get_db", _get_db)
    monkeypatch.setattr(steps_service, "get_db", _get_db)
    yield db_path


def _as_user(monkeypatch, user_id: int) -> None:
    monkeypatch.setattr(db_utils, "get_current_user_id", lambda: user_id)
    monkeypatch.setattr(cardio_service, "get_current_user_id", lambda: user_id)
    monkeypatch.setattr(steps_service, "get_current_user_id", lambda: user_id)


def test_cardio_trimp_scoped_to_current_user(scope_db, monkeypatch):
    _as_user(monkeypatch, 1)
    last = cardio_service.get_last_workout_trimp()
    assert last is not None
    assert last["trimp"] == 42.5

    daily = cardio_service.get_daily_trimp("2026-05-01", "2026-05-31")
    assert len(daily) == 1
    assert daily[0]["trimp"] == 42.5

    _as_user(monkeypatch, 2)
    assert cardio_service.get_last_workout_trimp() is None
    assert cardio_service.get_daily_trimp("2026-05-01", "2026-05-31") == []


def test_steps_history_scoped_to_current_user(scope_db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.hc_analytics_service.filter_steps_items",
        lambda items, user_id=None: items,
    )
    _as_user(monkeypatch, 1)
    hist = steps_service.get_steps_history()
    assert hist["summary"]["count"] == 1
    assert hist["items"][0]["steps"] == 10000

    _as_user(monkeypatch, 2)
    hist2 = steps_service.get_steps_history()
    assert hist2["summary"]["count"] == 0
    assert hist2["items"] == []
