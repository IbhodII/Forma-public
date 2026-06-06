# -*- coding: utf-8 -*-
"""Health Connect sync audit and skip reasons."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services.health_connect_audit import (
    SKIP_DUPLICATE,
    SKIP_PROTECTED_EXISTING,
    SKIP_UNSUPPORTED_TYPE,
    aggregate_batch_audit,
)
from backend.services.health_connect_sync_service import (
    sync_health_connect_batch,
    sync_health_connect_payload,
)
from utils.constants import CARDIO_ARCHIVE_TYPE, CARDIO_SOURCE_FIT


@pytest.fixture
def hc_db(tmp_path, monkeypatch):
    db_file = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE steps_history (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            source TEXT,
            updated_at TEXT,
            PRIMARY KEY (user_id, date)
        );
        CREATE TABLE daily_bracelet_calories (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            total_calories INTEGER,
            source TEXT,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, date)
        );
        CREATE TABLE daily_weight (
            date TEXT PRIMARY KEY,
            weight_kg REAL,
            source TEXT
        );
        CREATE TABLE sleep_data (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT,
            start_time TEXT,
            end_time TEXT,
            duration_seconds INTEGER,
            light_seconds INTEGER,
            deep_seconds INTEGER,
            rem_seconds INTEGER,
            source TEXT,
            external_id TEXT
        );
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT,
            type TEXT,
            distance_km REAL,
            duration_sec INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            calories INTEGER,
            calories_chest INTEGER,
            calories_watch INTEGER,
            data_source TEXT,
            user_id INTEGER
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            workout_id INTEGER,
            elapsed_sec INTEGER,
            heart_rate INTEGER,
            source_type TEXT
        );
        CREATE TABLE health_connect_sync_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            synced_at TEXT DEFAULT CURRENT_TIMESTAMP,
            days_count INTEGER,
            saved_days INTEGER,
            errors_count INTEGER,
            payload_preview TEXT,
            audit_json TEXT,
            mobile_audit_json TEXT,
            device_label TEXT
        );
        CREATE TABLE passive_heart_rate_samples (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            recorded_at TEXT NOT NULL,
            bpm INTEGER NOT NULL,
            source TEXT NOT NULL DEFAULT 'health_connect',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, recorded_at)
        );
        """
    )
    conn.commit()
    conn.close()

    def get_db():
        c = sqlite3.connect(db_file)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.services.health_connect_sync_service.get_db", get_db)
    monkeypatch.setattr("backend.services.health_connect_debug_service.get_db", get_db)
    monkeypatch.setattr("backend.database.get_db", get_db)
    monkeypatch.setattr("backend.services.passive_hr_service.get_db", get_db)
    monkeypatch.setattr(
        "backend.services.health_connect_sync_service.get_current_user_id",
        lambda: 1,
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service.get_current_user_id",
        lambda: 1,
    )
    monkeypatch.setattr(
        "backend.services.analytics_service.save_daily_bracelet_calories",
        lambda day, kcal, source="health_connect": None,
    )
    monkeypatch.setattr("database.db_utils.save_daily_weight", lambda *a, **k: None)
    return db_file


def test_strength_workout_skipped(hc_db):
    out = sync_health_connect_payload(
        {
            "date": "2026-05-26",
            "workouts": [
                {
                    "exercise_type": 70,
                    "start_time": "2026-05-26T10:00:00+00:00",
                    "end_time": "2026-05-26T11:00:00+00:00",
                }
            ],
        }
    )
    assert out["skipped"]
    assert out["skipped"][0]["reason"] == SKIP_UNSUPPORTED_TYPE
    assert "workout_ids" not in (out.get("saved") or {})


def test_protected_fit_cardio_skipped(hc_db):
    conn = sqlite3.connect(hc_db)
    conn.execute(
        """
        INSERT INTO cardio_workouts (date, type, data_source, user_id)
        VALUES (?, ?, ?, ?)
        """,
        ("2026-05-26", CARDIO_ARCHIVE_TYPE, CARDIO_SOURCE_FIT, 1),
    )
    conn.commit()
    conn.close()

    out = sync_health_connect_payload(
        {
            "date": "2026-05-26",
            "workouts": [
                {
                    "exercise_type": 56,
                    "start_time": "2026-05-26T08:00:00+00:00",
                    "end_time": "2026-05-26T09:00:00+00:00",
                }
            ],
        }
    )
    reasons = [s["reason"] for s in out.get("skipped") or []]
    assert SKIP_PROTECTED_EXISTING in reasons


def test_sleep_duplicate_skipped(hc_db):
    conn = sqlite3.connect(hc_db)
    conn.execute(
        """
        INSERT INTO sleep_data (user_id, date, start_time, end_time, duration_seconds,
            light_seconds, deep_seconds, rem_seconds, source, external_id)
        VALUES (1, '2026-05-26', 'a', 'b', 3600, 0, 0, 0, 'health_connect', 'ext-1')
        """,
    )
    conn.commit()
    conn.close()

    out = sync_health_connect_payload(
        {
            "date": "2026-05-26",
            "sleep": {
                "start_time": "2026-05-26T22:00:00+00:00",
                "end_time": "2026-05-27T06:00:00+00:00",
                "external_id": "ext-1",
            },
        }
    )
    reasons = [s["reason"] for s in out.get("skipped") or []]
    assert SKIP_DUPLICATE in reasons


def test_day_passive_hr_saved(hc_db):
    out = sync_health_connect_payload(
        {
            "date": "2026-05-26",
            "heart_rate_samples": [
                {"time": "2026-05-26T10:00:00.000Z", "bpm": 72},
                {"time": "2026-05-26T10:01:00.000Z", "bpm": 74},
            ],
        }
    )
    saved = out.get("saved") or {}
    hr = saved.get("heart_rate_samples") or {}
    assert int(hr.get("inserted") or 0) == 2
    assert not any(s.get("field") == "heart_rate_samples" for s in out.get("skipped") or [])

    conn = sqlite3.connect(hc_db)
    count = conn.execute("SELECT COUNT(*) FROM passive_heart_rate_samples").fetchone()[0]
    conn.close()
    assert count == 2


def test_batch_returns_audit_totals(hc_db):
    out = sync_health_connect_batch(
        [{"date": "2026-05-26", "steps": 5000}],
        mobile_audit={"permissions": {"Steps": True}},
        device_label="Android test",
    )
    assert "audit" in out
    assert out["audit"]["received_totals"]["days"] == 1
    assert out["audit"]["received_totals"]["steps_days"] == 1
    assert out["ok"] is True
    assert out["received_days"] == 1
    assert "saved" in out
    assert "skipped" in out
    assert "warnings" in out
    assert out.get("sync_log_id") is not None


def test_batch_response_summary_fields(hc_db):
    out = sync_health_connect_batch(
        [{"date": "2026-05-27", "steps": 9000}],
        device_label="pytest",
    )
    assert out["received_days"] == 1
    assert isinstance(out["saved"], dict)
    assert isinstance(out["skipped"], dict)
    assert isinstance(out["warnings"], list)
    assert out["sync_log_id"] == 1


def test_aggregate_empty_batch_warning():
    audit = aggregate_batch_audit([{"date": "2026-05-26"}], [{"date": "2026-05-26", "saved": {}, "skipped": []}], [])
    assert "backend_accepted_but_saved_0" in audit["warnings"]
