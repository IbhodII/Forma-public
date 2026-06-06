# -*- coding: utf-8 -*-
"""Empty DB: analytics_query skips TRIMP refresh and returns fast."""
from __future__ import annotations

import sqlite3
import time
from unittest.mock import patch

import pytest

from backend.services import analytics_query, cardio_service, strength_hr_analytics_service


@pytest.fixture
def empty_cardio_db(tmp_path, monkeypatch):
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
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.database.get_db", _get_db)
    monkeypatch.setattr("backend.services.cardio_service.get_db", _get_db)
    monkeypatch.setattr("backend.services.analytics_query.get_db", _get_db)
    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.analytics_query.get_current_user_id", lambda: 1)

    def _insert_workout(date: str, trimp: float | None = None) -> None:
        c = sqlite3.connect(db_path)
        c.execute(
            "INSERT INTO cardio_workouts (user_id, date, type, trimp) VALUES (1, ?, 'Run', ?)",
            (date, trimp),
        )
        c.commit()
        c.close()

    yield db_path, _insert_workout


def test_empty_db_ctl_series_fast_no_refresh(empty_cardio_db):
    _db_path, _insert = empty_cardio_db
    with patch.object(
        cardio_service,
        "refresh_missing_trimp",
        side_effect=AssertionError("refresh_missing_trimp must not run on empty DB"),
    ):
        t0 = time.perf_counter()
        rows = analytics_query.get_ctl_atl_tsb_series(90)
        elapsed_ms = (time.perf_counter() - t0) * 1000
    assert rows == []
    assert elapsed_ms < 50


def test_count_missing_trimp_zero_skips_refresh(empty_cardio_db):
    _db_path, _insert = empty_cardio_db
    assert cardio_service.count_missing_trimp(1) == 0
    with patch.object(cardio_service, "refresh_missing_trimp") as mock_refresh:
        assert cardio_service._refresh_missing_trimp_if_needed() == 0
        mock_refresh.assert_not_called()


def test_cardio_without_trimp_still_returns_ctl_series(empty_cardio_db):
    _db_path, insert = empty_cardio_db
    insert("2026-05-15", None)
    with patch.object(
        cardio_service,
        "refresh_missing_trimp",
        side_effect=AssertionError("refresh must not run when refresh=False"),
    ):
        payload = analytics_query.get_ctl_atl_tsb_payload(90, refresh_trimp=False)
    items = payload["items"]
    current = payload["current"]
    assert len(items) == 90
    assert current.get("ctl") is not None
    assert current.get("atl") is not None
    assert current.get("tsb") is not None


def test_strength_hr_overview_empty_without_hr_table(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            workout_title TEXT
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(strength_hr_analytics_service, "get_db", _get_db)
    monkeypatch.setattr(strength_hr_analytics_service, "get_current_user_id", lambda: 1)

    overview = strength_hr_analytics_service.build_hr_analytics_overview()

    assert overview["sessions"] == []
    assert overview["exercises"] == []
    assert overview["trends"] == []


def test_strength_hr_overview_legacy_hr_without_source_type(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            workout_title TEXT
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL
        );
        INSERT INTO strength_workouts (id, user_id, date, workout_title)
        VALUES (1, 1, '2026-06-01', 'Push');
        INSERT INTO workout_heart_rate (cardio_workout_id, elapsed_sec, heart_rate)
        VALUES (1, 0, 100), (1, 1, 120);
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(strength_hr_analytics_service, "get_db", _get_db)
    monkeypatch.setattr(strength_hr_analytics_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(strength_hr_analytics_service, "get_session_meta", lambda *_args: None)

    overview = strength_hr_analytics_service.build_hr_analytics_overview()

    assert overview["sessions_total"] == 1
    assert overview["sessions"][0]["workout_title"] == "Push"
    assert overview["sessions"][0]["detected_blocks_count"] == 0
    assert overview["sessions"][0]["high_intensity_blocks"] == 0
