# -*- coding: utf-8 -*-
"""Mini database export for dev import testing."""
from __future__ import annotations

import json
import sqlite3
import tempfile
import zipfile
from pathlib import Path

import pytest

from backend.services import mini_database_service as mds


def _seed_source_db(workouts: Path, shared: Path, user_id: int = 1) -> None:
    """Minimal schema — enough for mini export unit test without full migrations."""
    conn = sqlite3.connect(workouts)
    conn.executescript(
        """
        CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, cloud_provider TEXT);
        CREATE TABLE user_profile (user_id INTEGER PRIMARY KEY, max_deficit_per_kg_fat REAL);
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, exercise TEXT, weight REAL, reps INTEGER, set_number INTEGER,
            order_index INTEGER, workout_title TEXT, user_id INTEGER,
            deleted_at TEXT, sync_status TEXT
        );
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, type TEXT, user_id INTEGER, duration_sec INTEGER
        );
        CREATE TABLE food_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, phase TEXT, meal_type TEXT, product_id INTEGER,
            grams REAL, user_id INTEGER
        );
        CREATE TABLE daily_weight (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, weight_kg REAL, user_id INTEGER
        );
        CREATE TABLE schema_version (version INTEGER NOT NULL);
        INSERT INTO schema_version (version) VALUES (999);
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO users (id, username, cloud_provider) VALUES (?, 'test', 'local')",
        (user_id,),
    )
    conn.execute(
        """
        INSERT OR REPLACE INTO user_profile (user_id, max_deficit_per_kg_fat)
        VALUES (?, 35)
        """,
        (user_id,),
    )
    for i in range(12):
        conn.execute(
            """
            INSERT INTO strength_workouts (
                date, exercise, weight, reps, set_number, order_index,
                workout_title, user_id, sync_status
            ) VALUES (?, 'Squat', 100, 5, 1, 0, ?, ?, 'synced')
            """,
            (f"2026-01-{10 + i:02d}", f"Legs-{i}", user_id),
        )
    conn.execute(
        """
        INSERT INTO cardio_workouts (date, type, user_id, duration_sec)
        VALUES ('2026-05-01', 'run', ?, 3600)
        """,
        (user_id,),
    )
    conn.execute(
        """
        INSERT INTO food_entries (date, phase, meal_type, product_id, grams, user_id)
        VALUES (date('now', '-2 days'), 'cut', 'breakfast', 1, 100, ?)
        """,
        (user_id,),
    )
    conn.execute(
        """
        INSERT INTO daily_weight (date, weight_kg, user_id)
        VALUES (date('now', '-2 days'), 80.5, ?)
        """,
        (user_id,),
    )
    conn.commit()
    conn.close()

    sconn = sqlite3.connect(shared)
    sconn.executescript(
        """
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY,
            name TEXT,
            calories_per_100g REAL,
            protein_per_100g REAL
        );
        """
    )
    sconn.execute(
        """
        INSERT OR REPLACE INTO food_products (id, name, calories_per_100g, protein_per_100g)
        VALUES (1, 'Test Oats', 350, 12)
        """
    )
    sconn.commit()
    sconn.close()


@pytest.fixture()
def source_dbs(tmp_path, monkeypatch):
    workouts = tmp_path / "workouts.db"
    shared = tmp_path / "shared.db"
    _seed_source_db(workouts, shared)
    monkeypatch.setattr(mds, "WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr(mds, "SHARED_DB_PATH", shared)
    yield workouts, shared


def test_build_mini_database_zip_subset_and_integrity(source_dbs, tmp_path):
    workouts, shared = source_dbs
    zip_path = tmp_path / "mini.zip"
    report = mds.build_mini_database_zip(
        zip_path,
        user_id=1,
        source_workouts=workouts,
        source_shared=shared,
    )

    assert zip_path.is_file()
    assert report.zip_bytes > 0
    assert report.ok
    source_strength = sqlite3.connect(workouts).execute(
        "SELECT COUNT(*) FROM strength_workouts"
    ).fetchone()[0]
    assert report.row_counts.get("strength_workouts", 0) < source_strength
    assert len(report.strength_sessions) <= mds.STRENGTH_SESSION_LIMIT
    assert report.row_counts.get("strength_workouts", 0) > 0
    assert report.row_counts.get("food_entries", 0) > 0

    with zipfile.ZipFile(zip_path) as zf:
        names = set(zf.namelist())
        assert "workouts.db" in names
        assert "shared.db" in names
        manifest = json.loads(zf.read("manifest.json"))
        assert manifest.get("kind") == "forma_mini_db_v1"

    extract = tmp_path / "extract"
    extract.mkdir()
    with zipfile.ZipFile(zip_path) as zf:
        zf.extractall(extract)

    verify = mds._verify_mini_databases(extract / "workouts.db", extract / "shared.db", 1)
    assert all(c["ok"] for c in verify)


def test_source_files_unchanged(source_dbs, tmp_path):
    workouts, shared = source_dbs
    w_size = workouts.stat().st_size
    s_size = shared.stat().st_size
    w_rows_before = sqlite3.connect(workouts).execute(
        "SELECT COUNT(*) FROM strength_workouts"
    ).fetchone()[0]

    mds.build_mini_database_zip(tmp_path / "mini2.zip", user_id=1, source_workouts=workouts, source_shared=shared)

    assert workouts.stat().st_size == w_size
    assert shared.stat().st_size == s_size
    w_rows_after = sqlite3.connect(workouts).execute(
        "SELECT COUNT(*) FROM strength_workouts"
    ).fetchone()[0]
    assert w_rows_after == w_rows_before
