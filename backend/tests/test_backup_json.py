# -*- coding: utf-8 -*-
"""Tests for forma_backup_v1 export/import and body_metrics user scoping."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services.auth_user_service import ensure_auth_schema, get_user_by_id
from backend.services.backup_json_service import IMPORT_COMMIT_BATCH, import_full_backup
from database.migrations import ensure_db_schema


@pytest.fixture()
def temp_db(monkeypatch):
    tmp = tempfile.mkdtemp()
    db_path = Path(tmp) / "workouts.db"
    sqlite3.connect(db_path).close()
    monkeypatch.setenv("FORMA_DATA_DIR", tmp)
    shared_path = Path(tmp) / "shared.db"
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared_path)
    monkeypatch.setattr("backend.database.DB_PATH", db_path)
    from database.connection import open_db
    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_db_schema()
    yield db_path


def test_body_metrics_scoped_by_user_id(temp_db, monkeypatch):
    from backend.database.request_context import set_current_user_id
    from backend.services import body_service

    conn = sqlite3.connect(temp_db)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
    conn.close()
    assert "user_id" in cols

    set_current_user_id(1)
    conn = sqlite3.connect(temp_db)
    conn.execute(
        "INSERT INTO body_metrics (user_id, date, weight_kg, updated_at) VALUES (1, '2026-01-01', 80.0, '2026-01-01T00:00:00')"
    )
    conn.commit()
    conn.close()
    set_current_user_id(2)
    items, total = body_service.get_metrics(10, 0)
    assert total == 0
    assert items == []

    set_current_user_id(1)
    items, total = body_service.get_metrics(10, 0)
    assert total == 1
    assert float(items[0]["weight_kg"]) == 80.0


def test_export_import_strength_roundtrip(temp_db, monkeypatch):
    from backend.database.request_context import set_current_user_id
    from backend.services.backup_json_service import export_full_backup, import_full_backup

    set_current_user_id(1)
    conn = sqlite3.connect(temp_db)
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, exercise, weight, reps, set_number, order_index, notes,
            workout_title, user_id, sync_status, updated_at
        ) VALUES ('2026-02-01', 'Bench', 60, 8, 1, 0, '', 'Push', 1, 'synced', '2026-02-01T10:00:00')
        """
    )
    conn.commit()
    conn.close()

    payload = export_full_backup(1)
    assert payload["schema_version"] == "forma_backup_v1"
    assert payload["report"]["exported"].get("strength_workouts", 0) >= 1
    assert len(payload["data"]["strength_sessions"]) >= 1

    set_current_user_id(2)
    report = import_full_backup(payload, mode="merge", target_user_id=2)
    assert report["imported"].get("strength_workouts", 0) >= 1

    conn = sqlite3.connect(temp_db)
    row = conn.execute(
        "SELECT COUNT(*) FROM strength_workouts WHERE user_id = 2 AND workout_title = 'Push'"
    ).fetchone()
    conn.close()
    assert int(row[0]) >= 1


def test_forma_sync_baseline_exports_strength(temp_db, monkeypatch):
    from backend.database.request_context import set_current_user_id
    from backend.services.forma_sync.export_changes import export_baseline_changes

    set_current_user_id(1)
    conn = sqlite3.connect(temp_db)
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, exercise, weight, reps, set_number, order_index, notes,
            workout_title, user_id, sync_status, updated_at
        ) VALUES ('2026-03-01', 'Squat', 100, 5, 1, 0, '', 'Legs', 1, 'pending', '2026-03-01T12:00:00')
        """
    )
    conn.commit()
    conn.close()

    result = export_baseline_changes()
    assert len(result["jsonl"]["strength_workouts"]) >= 1


def test_get_user_by_id_read_only_no_insert(temp_db):
    executed: list[str] = []

    class FakeRow(dict):
        def keys(self):
            return super().keys()

    class FakeConn:
        def execute(self, sql, params=()):
            executed.append(str(sql))
            return type(
                "Cur",
                (),
                {
                    "fetchone": lambda self: FakeRow(
                        id=1,
                        username="admin",
                        cloud_provider="local",
                        cloud_user_id="admin",
                        display_email=None,
                        last_sync=None,
                        created_at="2026-01-01",
                    )
                },
            )()

        def close(self):
            pass

    with patch("backend.services.auth_user_service.open_db", return_value=FakeConn()):
        user = get_user_by_id(1)

    assert user is not None
    assert user["id"] == 1
    assert not any("INSERT" in sql.upper() for sql in executed)
    assert any("SELECT" in sql.upper() for sql in executed)


def test_import_commits_in_batches(temp_db, monkeypatch):
    from backend.database.request_context import set_current_user_id
    from backend.services import backup_json_service

    set_current_user_id(2)
    row_count = IMPORT_COMMIT_BATCH * 2 + 10
    workouts = [
        {
            "date": "2026-04-01",
            "exercise": f"Ex{i}",
            "weight": 50,
            "reps": 8,
            "set_number": 1,
            "order_index": 0,
            "notes": "",
            "workout_title": "Push",
            "user_id": 1,
            "sync_status": "synced",
            "updated_at": "2026-04-01T10:00:00",
        }
        for i in range(row_count)
    ]
    payload = {
        "schema_version": "forma_backup_v1",
        "data": {"strength_workouts": workouts},
    }

    class CommitTracker:
        def __init__(self, conn):
            self._conn = conn
            self.count = 0

        def commit(self):
            self.count += 1
            return self._conn.commit()

        def __getattr__(self, name):
            return getattr(self._conn, name)

    tracker = CommitTracker(None)
    real_open_db = backup_json_service.open_db

    def tracking_open_db(*args, **kwargs):
        conn = real_open_db(*args, **kwargs)
        wrapped = CommitTracker(conn)
        nonlocal tracker
        tracker = wrapped
        return wrapped

    monkeypatch.setattr(backup_json_service, "open_db", tracking_open_db)
    report = import_full_backup(payload, mode="merge", target_user_id=2)

    assert report["imported"].get("strength_workouts", 0) == row_count
    assert tracker.count >= (row_count // IMPORT_COMMIT_BATCH) + 1
