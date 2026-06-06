# -*- coding: utf-8 -*-
"""Passive heart rate storage service."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services.passive_hr_service import (
    get_daily_stats,
    insert_samples_batch,
    query_samples,
)


@pytest.fixture
def phr_db(tmp_path, monkeypatch):
    db_file = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_file)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
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

    monkeypatch.setattr("backend.services.passive_hr_service.get_db", get_db)
    return db_file


def test_insert_batch_and_dedup(phr_db):
    samples = [
        {"time": "2026-05-31T10:00:00.000Z", "bpm": 72},
        {"time": "2026-05-31T10:01:00.000Z", "bpm": 74},
    ]
    first = insert_samples_batch(1, samples)
    assert first["inserted"] == 2
    second = insert_samples_batch(1, samples)
    assert second["inserted"] == 0
    assert second["duplicates"] == 2


def test_rejects_invalid_bpm(phr_db):
    out = insert_samples_batch(1, [{"time": "2026-05-31T10:00:00.000Z", "bpm": 10}])
    assert out["inserted"] == 0
    assert out["rejected_invalid"] == 1


def test_daily_stats(phr_db):
    insert_samples_batch(
        1,
        [
            {"time": "2026-05-31T08:00:00.000Z", "bpm": 60},
            {"time": "2026-05-31T12:00:00.000Z", "bpm": 80},
            {"time": "2026-05-31T18:00:00.000Z", "bpm": 100},
        ],
    )
    days = get_daily_stats(1, "2026-05-31", "2026-05-31")
    assert len(days) == 1
    row = days[0]
    assert row["sample_count"] == 3
    assert row["min_hr"] == 60
    assert row["max_hr"] == 100
    assert row["avg_hr"] == 80


def test_query_samples_ordered(phr_db):
    insert_samples_batch(
        1,
        [
            {"time": "2026-05-31T10:00:00.000Z", "bpm": 70},
            {"time": "2026-05-31T11:00:00.000Z", "bpm": 75},
        ],
    )
    rows = query_samples(1, "2026-05-31T00:00:00.000Z", "2026-05-31T23:59:59.999Z")
    assert len(rows) == 2
    assert rows[0]["bpm"] == 70
