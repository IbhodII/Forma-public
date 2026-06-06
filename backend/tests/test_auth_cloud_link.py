# -*- coding: utf-8 -*-
"""First cloud login reuses local user id=1 when DB already has workouts."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import auth_user_service as auth


@pytest.fixture()
def auth_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT,
            display_email TEXT,
            last_sync TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cloud_provider, cloud_user_id)
        )
        """
    )
    conn.execute(
        """
        INSERT INTO users (id, username, cloud_provider, cloud_user_id)
        VALUES (1, 'admin', 'local', 'admin')
        """
    )
    conn.execute(
        """
        CREATE TABLE strength_workout_dates (
            date TEXT PRIMARY KEY,
            workout_title TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT INTO strength_workout_dates (date, workout_title) VALUES ('2026-01-01', 'Test')"
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(auth, "get_db", _get_db)
    yield db_path


@pytest.fixture()
def auth_db_strength_only(tmp_path, monkeypatch):
    """Legacy data only in strength_workouts (no strength_workout_dates)."""
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT,
            display_email TEXT,
            last_sync TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cloud_provider, cloud_user_id)
        )
        """
    )
    conn.execute(
        """
        INSERT INTO users (id, username, cloud_provider, cloud_user_id)
        VALUES (1, 'admin', 'local', 'admin')
        """
    )
    conn.execute(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            workout_title TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO strength_workouts (user_id, date, workout_title) VALUES (1, '2026-01-01', 'Test')"
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(auth, "get_db", _get_db)
    yield db_path


def test_find_or_create_links_primary_local_user(auth_db):
    user = auth.find_or_create_cloud_user(
        cloud_provider="yandex",
        cloud_user_id="YANDEX-UID-123",
        display_email="test@example.com",
    )
    assert user["id"] == 1
    assert user["cloud_provider"] == "yandex"
    assert user["cloud_user_id"] == "YANDEX-UID-123"


def test_find_or_create_links_when_only_strength_workouts(auth_db_strength_only):
    user = auth.find_or_create_cloud_user(
        cloud_provider="yandex",
        cloud_user_id="YANDEX-UID-456",
    )
    assert user["id"] == 1
    assert user["cloud_provider"] == "yandex"
