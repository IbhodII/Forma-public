# -*- coding: utf-8 -*-
import sqlite3

import pytest

from backend.services import steps_service


@pytest.fixture
def steps_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(steps_service, "get_db", _get_db)
    return db_path


def test_normalize_month_date():
    assert steps_service.normalize_month_date("2026-04-15") == "2026-04-01"
    assert steps_service.normalize_month_date("2026-04-01") == "2026-04-01"


def test_upsert_steps_month_creates_and_updates(steps_db):
    item, status = steps_service.upsert_steps_month(
        "2026-04-20",
        300_000,
        distance_km=240.0,
        source="manual",
    )
    assert status == "created"
    assert item["date"] == "2026-04-01"
    assert item["steps"] == 300_000
    assert item["distance_km"] == 240.0
    assert item["step_length_m"] == pytest.approx(0.8, rel=1e-3)

    item2, status2 = steps_service.upsert_steps_month(
        "2026-04-01",
        310_000,
        distance_km=248.0,
    )
    assert status2 == "updated"
    assert item2["steps"] == 310_000
    assert item2["distance_km"] == 248.0
