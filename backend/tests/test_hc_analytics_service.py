# -*- coding: utf-8 -*-
"""Tests for Health Connect analytics gating service."""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from backend.services import hc_analytics_service as hc


@pytest.fixture()
def hc_db(tmp_path, monkeypatch):
    db_path = tmp_path / "hc_analytics.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY,
            hc_analytics_prefs TEXT
        )
        """
    )
    conn.execute("INSERT INTO user_profile (id) VALUES (1)")
    conn.execute(
        """
        CREATE TABLE health_connect_sync_log (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 1,
            synced_at TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO health_connect_sync_log (user_id, synced_at) VALUES (1, ?)",
        (date.today().isoformat(),),
    )
    conn.execute(
        """
        CREATE TABLE steps_history (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            steps INTEGER,
            source TEXT,
            PRIMARY KEY (user_id, date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE daily_bracelet_calories (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            total_calories INTEGER,
            source TEXT,
            PRIMARY KEY (user_id, date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            date TEXT,
            type TEXT,
            start_time TEXT,
            calories_watch INTEGER,
            calories_chest INTEGER
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(hc, "get_db", _get_db)
    monkeypatch.setattr("backend.database.get_db", _get_db)
    monkeypatch.setattr("backend.services.analytics_service.get_db", _get_db)
    monkeypatch.setattr("backend.services.sleep_service.get_db", _get_db)
    monkeypatch.setattr(hc, "get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.analytics_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.sleep_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr(hc, "invalidate", lambda _key: None)
    monkeypatch.setattr(hc, "get_cached", lambda _key, _ttl, fn: fn())
    return db_path


def test_default_prefs_all_false(hc_db):
    prefs = hc.get_hc_analytics_prefs(1)
    assert prefs == hc.DEFAULT_HC_ANALYTICS_PREFS


def test_save_and_merge_prefs(hc_db):
    saved = hc.save_hc_analytics_prefs({"steps": True, "sleep": True}, 1)
    assert saved["steps"] is True
    assert saved["sleep"] is True
    assert saved["heart_rate"] is False
    assert saved[hc.HC_MASTER_PREF_KEY] is False
    loaded = hc.get_hc_analytics_prefs(1)
    assert loaded["steps"] is True


def test_master_toggle_gates_is_hc_enabled(hc_db):
    hc.save_hc_analytics_prefs({"steps": True}, 1)
    assert hc.is_hc_enabled("steps", 1) is False
    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: True}, 1)
    assert hc.is_hc_enabled("steps", 1) is True
    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: False}, 1)
    assert hc.is_hc_enabled("steps", 1) is False


def test_bracelet_disabled_when_toggle_off(hc_db):
    conn = hc.get_db()
    conn.execute(
        "INSERT INTO daily_bracelet_calories (user_id, date, total_calories, source) VALUES (?, ?, ?, ?)",
        (1, date.today().isoformat(), 2200, hc.HC_SOURCE),
    )
    conn.commit()
    conn.close()

    from backend.services import analytics_service

    with patch.object(
        analytics_service,
        "_workout_calorie_totals_for_day",
        return_value=(0, 0, 0, []),
    ):
        corrected = analytics_service.get_corrected_daily_expenditure(date.today().isoformat())
    assert corrected["bracelet_total"] is None
    assert corrected["needs_bracelet_input"] is True


def test_bracelet_used_when_toggle_on(hc_db):
    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: True, "total_calories": True}, 1)
    conn = hc.get_db()
    conn.execute(
        "INSERT INTO daily_bracelet_calories (user_id, date, total_calories, source) VALUES (?, ?, ?, ?)",
        (1, date.today().isoformat(), 2200, hc.HC_SOURCE),
    )
    conn.commit()
    conn.close()

    from backend.services import analytics_service

    with patch.object(
        analytics_service,
        "_workout_calorie_totals_for_day",
        return_value=(0, 0, 0, []),
    ), patch(
        "backend.services.calibration_service.get_bracelet_calibration_factor",
        return_value=1.0,
    ):
        corrected = analytics_service.get_corrected_daily_expenditure(date.today().isoformat())
    assert corrected["bracelet_total"] == 2200
    assert corrected["hc_analytics_enabled"] is True


def test_steps_freshness_stale_when_zero(hc_db):
    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: True, "steps": True}, 1)
    conn = hc.get_db()
    conn.execute(
        "INSERT INTO steps_history (user_id, date, steps, source) VALUES (?, ?, ?, ?)",
        (1, date.today().isoformat(), 0, hc.HC_SOURCE),
    )
    conn.commit()
    conn.close()

    status = hc.check_freshness("steps", 1)
    assert status["enabled"] is True
    assert status["fresh"] is False


def test_compute_analytics_connected(hc_db):
    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: True, "steps": True}, 1)
    connected = hc.compute_analytics_connected(
        {"has_data": True, "stale": False},
        {"has_data": False},
        {"sample_count": 0},
        user_id=1,
    )
    assert connected is True


def test_sleep_gate_hides_hc_when_toggle_off(hc_db, monkeypatch):
    conn = hc.get_db()
    conn.execute(
        """
        CREATE TABLE sleep_data (
            date TEXT,
            start_time TEXT,
            end_time TEXT,
            duration_seconds INTEGER,
            source TEXT,
            user_id INTEGER
        )
        """
    )
    conn.execute(
        """
        INSERT INTO sleep_data (date, start_time, end_time, duration_seconds, source, user_id)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (
            date.today().isoformat(),
            "2026-05-30T23:00:00",
            "2026-05-31T07:00:00",
            28800,
            hc.HC_SOURCE,
            1,
        ),
    )
    conn.commit()
    conn.close()

    def _always_fresh(metric, user_id=None):
        return {
            "metric": metric,
            "enabled": hc.is_hc_enabled(metric, user_id or 1),
            "fresh": True,
            "stale_warning": None,
            "source": hc.HC_SOURCE,
        }

    monkeypatch.setattr(
        "backend.services.hc_analytics_service.check_freshness",
        _always_fresh,
    )

    from backend.services import sleep_service

    summary = sleep_service.get_sleep_summary(7)
    assert summary["has_data"] is False

    hc.save_hc_analytics_prefs({hc.HC_MASTER_PREF_KEY: True, "sleep": True}, 1)
    hc.invalidate(f"hc_analytics_prefs:1")
    assert hc.is_hc_enabled("sleep", 1) is True
    summary_on = sleep_service.get_sleep_summary(7)
    assert summary_on["has_data"] is True
    assert summary_on.get("hc_analytics_enabled") is True
