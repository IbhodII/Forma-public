# -*- coding: utf-8 -*-
"""Dashboard / perf helpers (no heavy cloud/oauth imports)."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services.cardio_service import batch_hr_stats_for_workouts
from database.migrations import _migration_v060_perf_indexes


def test_batch_hr_stats_for_workouts_groups_by_id():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY,
            cardio_workout_id INTEGER,
            heart_rate INTEGER,
            elapsed_sec INTEGER,
            source_type TEXT
        )
        """
    )
    conn.executemany(
        """
        INSERT INTO workout_heart_rate (cardio_workout_id, heart_rate, elapsed_sec, source_type)
        VALUES (?, ?, ?, 'cardio')
        """,
        [(1, 120, 0), (1, 140, 60), (2, 100, 0)],
    )
    stats = batch_hr_stats_for_workouts(conn, [1, 2, 99])
    assert 1 in stats and stats[1]["avg_hr"] == 130
    assert 2 in stats and stats[2]["avg_hr"] == 100
    assert 99 not in stats
    conn.close()


def test_migration_v060_creates_indexes():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        "CREATE TABLE food_entries (user_id INTEGER, date TEXT, phase TEXT)"
    )
    conn.execute(
        "CREATE TABLE cardio_workouts (user_id INTEGER, date TEXT, type TEXT, data_source TEXT)"
    )
    conn.execute(
        """
        CREATE TABLE health_connect_sync_log (
            id INTEGER PRIMARY KEY,
            synced_at TEXT
        )
        """
    )
    _migration_v060_perf_indexes(conn)
    names = {
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='index'"
        ).fetchall()
    }
    assert "idx_food_entries_user_date" in names
    assert "idx_cardio_user_date_type" in names
    assert "idx_hc_sync_log_synced_at" in names
