# -*- coding: utf-8 -*-
"""Синхронизация Health Connect → БД."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services.health_connect_sync_service import (
    _map_exercise_type,
    sync_health_connect_batch,
    upsert_steps_for_day,
)


def test_map_exercise_types():
    assert _map_exercise_type(56)[0] == "cardio"
    assert _map_exercise_type(8)[1] == "вело"
    assert _map_exercise_type(70)[0] == "skip"


def test_sync_batch(monkeypatch):
    monkeypatch.setattr(
        "backend.services.health_connect_sync_service.sync_health_connect_payload",
        lambda item: {"date": item["date"]},
    )
    out = sync_health_connect_batch([{"date": "2026-05-26"}, {"date": "2026-05-27"}])
    assert out["saved_days"] == 2
    assert out["status"] == "ok"


def test_upsert_steps_for_day(tmp_path, monkeypatch):
    db_file = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_file)
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT,
            updated_at TEXT,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.commit()
    conn.close()

    def get_db():
        c = sqlite3.connect(db_file)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(
        "backend.services.health_connect_sync_service.get_db",
        get_db,
    )
    monkeypatch.setattr(
        "backend.services.health_connect_sync_service.get_current_user_id",
        lambda: 1,
    )
    upsert_steps_for_day("2026-05-27", 9000)
    c = sqlite3.connect(db_file)
    row = c.execute(
        "SELECT steps, source FROM steps_history WHERE user_id = 1 AND date = ?",
        ("2026-05-27",),
    ).fetchone()
    c.close()
    assert row[0] == 9000
    assert row[1] == "health_connect"


def test_health_connect_debug_route_registered():
    from pathlib import Path

    sync_src = Path(__file__).resolve().parents[1] / "routers" / "sync.py"
    content = sync_src.read_text(encoding="utf-8")
    assert '"/health-connect/debug"' in content
    assert "build_health_connect_debug" in content


def test_build_health_connect_debug_payload(monkeypatch):
    from backend.services.health_connect_debug_service import build_health_connect_debug

    monkeypatch.setattr(
        "backend.services.health_connect_debug_service._fetch_recent_sync_logs",
        lambda limit=5: ([], True),
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service._fetch_db_stats",
        lambda: ({"steps": 12}, {"steps": {"min": "2026-05-01", "max": "2026-05-28"}}),
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service.get_field_catalog",
        lambda: [{"key": "steps", "label": "Шаги"}],
    )
    monkeypatch.setattr(
        "backend.services.health_connect_debug_service.get_exercise_type_map",
        lambda: [],
    )

    data = build_health_connect_debug()
    assert data["status"] == "ok"
    assert data["field_catalog"]
    assert data["counts_by_type"]["steps"] == 12
    assert data["sync_endpoint"] == "POST /api/sync/health-connect"
    assert data["warnings"] == []
