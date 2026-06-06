# -*- coding: utf-8 -*-
"""POST /analytics/daily-bracelet-calories regression."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import analytics_service


@pytest.fixture
def bracelet_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE daily_bracelet_calories (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            total_calories INTEGER NOT NULL,
            source TEXT DEFAULT 'manual',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, date)
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(analytics_service, "get_db", _get_db)
    monkeypatch.setattr(analytics_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        "backend.services.forma_sync.sync_meta.get_or_create_device_id",
        lambda: "test-device",
    )
    yield db_path


def test_save_daily_bracelet_calories_without_sync_columns(bracelet_db):
    row = analytics_service.save_daily_bracelet_calories("2026-06-03", 2450, source="manual")
    assert row["date"] == "2026-06-03"
    assert row["total_calories"] == 2450

    row2 = analytics_service.save_daily_bracelet_calories("2026-06-03", 2500, source="manual")
    assert row2["total_calories"] == 2500

    conn = analytics_service.get_db()
    try:
        count = conn.execute("SELECT COUNT(*) FROM daily_bracelet_calories").fetchone()[0]
    finally:
        conn.close()
    assert int(count) == 1
