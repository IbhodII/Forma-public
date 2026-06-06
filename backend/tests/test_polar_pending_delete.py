# -*- coding: utf-8 -*-
"""Удаление записей из polar_pending_workouts."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import polar_attach_service
from backend.database import db_utils


@pytest.fixture
def polar_pending_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE polar_pending_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            polar_transaction_id TEXT NOT NULL UNIQUE,
            date TEXT,
            type TEXT,
            duration_sec INTEGER,
            distance_km REAL,
            calories INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            raw_data TEXT,
            imported INTEGER NOT NULL DEFAULT 0,
            local_user_id INTEGER NOT NULL DEFAULT 1
        );
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(polar_attach_service, "get_db", _get_db)
    monkeypatch.setattr(db_utils, "get_current_user_id", lambda: 1)
    return db_path


def _insert(conn: sqlite3.Connection, tid: str, *, imported: int = 0) -> None:
    conn.execute(
        """
        INSERT INTO polar_pending_workouts (
            polar_transaction_id, date, type, imported, local_user_id, raw_data
        ) VALUES (?, '2026-05-27', 'силовая', ?, 1, '{}')
        """,
        (tid, imported),
    )
    conn.commit()


def test_delete_api_sync_pending(polar_pending_db):
    conn = polar_attach_service.get_db()
    try:
        _insert(conn, "332767381")
    finally:
        conn.close()

    polar_attach_service.delete_pending_workout("332767381")

    conn2 = polar_attach_service.get_db()
    try:
        row = conn2.execute(
            "SELECT 1 FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            ("332767381",),
        ).fetchone()
    finally:
        conn2.close()
    assert row is None


def test_delete_manual_upload_pending(polar_pending_db):
    conn = polar_attach_service.get_db()
    try:
        _insert(conn, "upload:abc123")
    finally:
        conn.close()

    polar_attach_service.delete_manual_pending_workout("upload:abc123")

    conn2 = polar_attach_service.get_db()
    try:
        row = conn2.execute(
            "SELECT 1 FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            ("upload:abc123",),
        ).fetchone()
    finally:
        conn2.close()
    assert row is None


def test_delete_imported_fails(polar_pending_db):
    conn = polar_attach_service.get_db()
    try:
        _insert(conn, "332767381", imported=1)
    finally:
        conn.close()

    with pytest.raises(ValueError, match="не найдена"):
        polar_attach_service.delete_pending_workout("332767381")
