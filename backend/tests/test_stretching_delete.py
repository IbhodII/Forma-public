# -*- coding: utf-8 -*-
"""Regression tests for deleting stretching presets and log entries."""
from __future__ import annotations

import sqlite3

from backend.services import stretching_service


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def _create_stretching_db(db_path, *, sync_columns: bool) -> None:
    conn = _connect(db_path)
    try:
        extra_cols = (
            ", updated_at TEXT, deleted_at TEXT, sync_status TEXT, device_id TEXT"
            if sync_columns
            else ""
        )
        conn.executescript(
            f"""
            CREATE TABLE stretching_presets (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                user_id INTEGER DEFAULT 1,
                is_active INTEGER DEFAULT 1
            );
            CREATE TABLE stretching_preset_exercises (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                preset_id INTEGER NOT NULL,
                exercise_id INTEGER NOT NULL,
                hold_seconds INTEGER DEFAULT 30,
                reps INTEGER DEFAULT 1,
                notes TEXT,
                exercise_order INTEGER DEFAULT 0
            );
            CREATE TABLE stretching_log (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL DEFAULT 1,
                date TEXT NOT NULL,
                preset_id INTEGER,
                duration_minutes INTEGER DEFAULT 0,
                notes TEXT
                {extra_cols}
            );
            """
        )
        conn.execute("INSERT INTO stretching_presets (id, name, user_id) VALUES (1, 'Morning', 1)")
        conn.execute(
            "INSERT INTO stretching_log (id, user_id, date, preset_id, duration_minutes, notes) "
            "VALUES (10, 1, '2026-06-03', 1, 15, 'ok')"
        )
        conn.commit()
    finally:
        conn.close()


def test_delete_stretching_log_hard_deletes_on_legacy_schema(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    _create_stretching_db(db_path, sync_columns=False)

    monkeypatch.setattr(stretching_service, "get_db", lambda: _connect(db_path))
    monkeypatch.setattr(stretching_service, "get_current_user_id", lambda: 1)

    assert len(stretching_service.list_log(date_from="2026-06-03", date_to="2026-06-03")) == 1

    stretching_service.delete_log_entry(10)

    assert stretching_service.list_log(date_from="2026-06-03", date_to="2026-06-03") == []
    assert stretching_service.get_activity_calendar(days=7) == []


def test_delete_stretching_log_hides_soft_deleted_rows(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    _create_stretching_db(db_path, sync_columns=True)

    monkeypatch.setattr(stretching_service, "get_db", lambda: _connect(db_path))
    monkeypatch.setattr(stretching_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        "backend.services.forma_sync.sync_meta.get_or_create_device_id",
        lambda: "test-device",
    )

    stretching_service.delete_log_entry(10)

    assert stretching_service.list_log(date_from="2026-06-03", date_to="2026-06-03") == []
    assert stretching_service.get_activity_calendar(days=7) == []

    conn = _connect(db_path)
    try:
        row = conn.execute("SELECT deleted_at, sync_status FROM stretching_log WHERE id = 10").fetchone()
    finally:
        conn.close()
    assert row["deleted_at"]
    assert row["sync_status"] == "pending"


def test_delete_stretching_preset_removes_links_without_touching_history(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    _create_stretching_db(db_path, sync_columns=False)
    conn = _connect(db_path)
    try:
        conn.execute("INSERT INTO stretching_presets (id, name, user_id) VALUES (2, 'Custom', 1)")
        conn.execute(
            "INSERT INTO stretching_preset_exercises (preset_id, exercise_id, hold_seconds) "
            "VALUES (2, 100, 45)"
        )
        conn.execute(
            "INSERT INTO stretching_log (id, user_id, date, preset_id, duration_minutes, notes) "
            "VALUES (11, 1, '2026-06-02', 1, 10, 'history')"
        )
        conn.commit()
    finally:
        conn.close()

    monkeypatch.setattr(stretching_service, "get_db", lambda: _connect(db_path))
    monkeypatch.setattr(stretching_service, "get_current_user_id", lambda: 1)

    stretching_service.delete_preset(2)

    conn = _connect(db_path)
    try:
        preset = conn.execute("SELECT id FROM stretching_presets WHERE id = 2").fetchone()
        links = conn.execute(
            "SELECT COUNT(*) FROM stretching_preset_exercises WHERE preset_id = 2"
        ).fetchone()[0]
        history_count = conn.execute("SELECT COUNT(*) FROM stretching_log").fetchone()[0]
    finally:
        conn.close()

    assert preset is None
    assert int(links) == 0
    assert int(history_count) == 2
