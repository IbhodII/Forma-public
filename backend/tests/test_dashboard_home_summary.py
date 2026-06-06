# -*- coding: utf-8 -*-
"""Dashboard home summary: fast path without 10k body scan."""
from __future__ import annotations

import sqlite3
import time
from datetime import date, timedelta
from unittest.mock import patch

import pytest

from backend.services import body_service, food_service
from backend.services.dashboard_home_service import (
    _build_dashboard_home_summary_sync,
    build_dashboard_home_extensions,
)


@pytest.fixture
def metrics_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE body_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            weight_kg REAL,
            body_fat_percent REAL,
            muscle_mass_kg REAL,
            waist_cm REAL,
            hips_cm REAL
        );
        CREATE UNIQUE INDEX idx_body_metrics_user_date ON body_metrics(user_id, date);
        CREATE TABLE daily_weight (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            weight_kg REAL NOT NULL,
            body_fat_percent REAL,
            source TEXT,
            PRIMARY KEY (user_id, date)
        );
        """
    )
    base = date(2018, 1, 1)
    for i in range(200):
        d = (base + timedelta(days=i)).isoformat()
        conn.execute(
            """
            INSERT INTO body_metrics (user_id, date, weight_kg, waist_cm)
            VALUES (1, ?, 80.0, 80.0)
            """,
            (d,),
        )
    latest = (base + timedelta(days=199)).isoformat()
    conn.execute(
        "INSERT INTO daily_weight (user_id, date, weight_kg, source) VALUES (1, ?, 75.5, 'manual')",
        (latest,),
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.database.get_db", _get_db)
    monkeypatch.setattr("backend.services.body_service.get_db", _get_db)
    monkeypatch.setattr("backend.database.daily_weight_store.get_db", _get_db)
    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.body_service.get_current_user_id", lambda: 1)
    yield


def test_metrics_summary_uses_sql_not_full_scan(metrics_db):
    with patch.object(body_service, "get_metrics", side_effect=AssertionError("no full scan")):
        summary = body_service.get_metrics_summary()
    assert "weight_kg" in summary["metrics"]
    assert summary["metrics"]["weight_kg"]["value"] == 75.5


def test_dashboard_extensions_ctl_only():
    with patch(
        "backend.services.dashboard_home_service._ctl_block",
        return_value={"items": [{"date": "2026-06-01", "ctl": 1.0, "atl": 1.0, "tsb": 0.0, "trimp": 0.0}], "current": {"ctl": 1.0, "atl": 1.0, "tsb": 0.0}},
    ):
        ext = build_dashboard_home_extensions(["ctl"])
    assert ext["ctl"]["current"]["ctl"] == 1.0


def test_get_day_log_lite_matches_food_day_schema():
    from backend.schemas.models import FoodDayResponse

    payload = food_service._food_day_log_schema_defaults("cut")
    payload.update(
        {
            "date": "2026-06-03",
            "phase": "cut",
            "entries": [],
            "by_meal": {},
            "daily_totals": {
                "protein": 0.0,
                "fat": 0.0,
                "carbs": 0.0,
                "calories": 0.0,
                "fiber": 0.0,
            },
        }
    )
    FoodDayResponse.model_validate(payload)


def test_summary_sync_build_mocked_heavy(metrics_db, monkeypatch):
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.strength_service.get_sessions",
        lambda *a, **k: ([], 0),
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.get_steps_history",
        lambda *a, **k: {"items": [], "summary": {}},
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.get_sleep_summary",
        lambda *a, **k: {"has_data": False},
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.food_service.get_day_log_lite",
        lambda *a, **k: {"date": "2026-06-01", "daily_totals": {}},
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.get_connection_status",
        lambda: {},
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.yandex_status_sync",
        lambda: {"connected": False},
    )
    monkeypatch.setattr(
        "backend.services.dashboard_home_service.build_hc_status_snapshot",
        lambda **k: {"stale": True},
    )
    t0 = time.perf_counter()
    payload = _build_dashboard_home_summary_sync(phase="cut")
    elapsed_ms = (time.perf_counter() - t0) * 1000
    assert "body" in payload
    assert "food" in payload
    assert elapsed_ms < 500
