# -*- coding: utf-8 -*-
"""Large SQLite database import (replace path, WAL, rollback)."""
from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services import database_import_tasks as dit
from backend.services.db_import_safety import backup_current_db_files, restore_db_files


def _seed_workouts_db(path: Path, user_id: int, row_count: int) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            workout_title TEXT,
            exercise TEXT,
            set_number INTEGER,
            weight REAL,
            reps INTEGER
        )
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO users (id, username) VALUES (?, 'imported')",
        (user_id,),
    )
    conn.executemany(
        """
        INSERT INTO strength_workouts (
            user_id, date, workout_title, exercise, set_number, weight, reps
        ) VALUES (?, '2024-01-01', 'W', 'Ex', 1, 50.0, 8)
        """,
        [(user_id,) for _ in range(row_count)],
    )
    conn.commit()
    conn.close()


def _touch_shared(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS _marker (v TEXT)")
    conn.execute("INSERT INTO _marker VALUES ('ok')")
    conn.commit()
    conn.close()


@pytest.fixture()
def large_import_env(monkeypatch, tmp_path):
    data = tmp_path / "data"
    data.mkdir()
    workouts = data / "workouts.db"
    shared = data / "shared.db"
    _seed_workouts_db(workouts, user_id=1, row_count=10)
    _touch_shared(shared)

    monkeypatch.setenv("FORMA_DATA_DIR", str(data))
    monkeypatch.setattr("database.connection.DATA_ROOT", data)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)
    monkeypatch.setattr("backend.services.database_import_tasks.DATA_ROOT", data)
    monkeypatch.setattr("backend.services.database_import_tasks.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("backend.services.database_import_tasks.SHARED_DB_PATH", shared)
    import database.connection as db_conn

    monkeypatch.setattr(db_conn, "DATA_ROOT", data)
    yield data


def _stage_large_replace(data: Path, user_id: int, rows: int) -> tuple[str, dict]:
    job_id = str(uuid.uuid4())
    job_dir = data / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    w = staging / "workouts.db"
    s = staging / "shared.db"
    _seed_workouts_db(w, user_id=user_id, row_count=rows)
    _touch_shared(s)
    manifest = {
        "jobId": job_id,
        "mode": "replace",
        "workoutsPath": "staging/workouts.db",
        "sharedPath": "staging/shared.db",
    }
    (job_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return job_id, dit.load_job_manifest(job_id)


def test_large_replace_import_row_counts(large_import_env):
    from backend.services.database_post_verify import PostDbVerifyReport

    job_id, manifest = _stage_large_replace(large_import_env, user_id=1, rows=1500)
    with dit._lock:
        dit._tasks[job_id] = dit.DatabaseImportTaskState(
            task_id=job_id, user_id=1, mode="replace", status="running"
        )
    with patch.object(dit, "_finalize_post_import", return_value={"integrity": "ok", "tables": 2}):
        with patch(
            "backend.services.database_post_verify.assert_post_db_verification",
            return_value=PostDbVerifyReport(ok=True),
        ):
            with patch.object(
                dit,
                "reconcile_after_db_import",
                return_value={"user_id_remap": None},
            ):
                with patch("database.migrations.ensure_db_schema"):
                    dit._worker(job_id, 1, "replace", manifest)

    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = 1"
        ).fetchone()[0]
    finally:
        conn.close()
    assert count == 1500


def test_repeated_replace_stable_counts(large_import_env):
    from backend.services.database_post_verify import PostDbVerifyReport

    job_id, manifest = _stage_large_replace(large_import_env, user_id=1, rows=800)
    with dit._lock:
        dit._tasks[job_id] = dit.DatabaseImportTaskState(
            task_id=job_id, user_id=1, mode="replace", status="running"
        )
    for _ in range(2):
        with (
            patch.object(dit, "_finalize_post_import", return_value={"integrity": "ok"}),
            patch(
                "backend.services.database_post_verify.assert_post_db_verification",
                return_value=PostDbVerifyReport(ok=True),
            ),
            patch.object(
                dit,
                "reconcile_after_db_import",
                return_value={"user_id_remap": None},
            ),
            patch("database.migrations.ensure_db_schema"),
        ):
            dit._worker(job_id, 1, "replace", manifest)

    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    count = conn.execute("SELECT COUNT(*) FROM strength_workouts").fetchone()[0]
    conn.close()
    assert count == 800


def test_wal_backup_restore_roundtrip(large_import_env):
    workouts = dit.WORKOUTS_DB_PATH
    conn = sqlite3.connect(workouts)
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute(
        "CREATE TABLE IF NOT EXISTS wal_probe (id INTEGER PRIMARY KEY, v TEXT)"
    )
    conn.execute("INSERT INTO wal_probe (v) VALUES ('before')")
    conn.commit()
    conn.close()
    wal = Path(str(workouts) + "-wal")
    assert wal.exists() or workouts.exists()

    w_bak, s_bak = backup_current_db_files(1)
    conn = sqlite3.connect(workouts)
    conn.execute("DELETE FROM wal_probe")
    conn.execute("INSERT INTO wal_probe (v) VALUES ('mutated')")
    conn.commit()
    conn.close()

    restore_db_files(w_bak, s_bak)
    conn = sqlite3.connect(workouts)
    row = conn.execute("SELECT v FROM wal_probe LIMIT 1").fetchone()
    conn.close()
    assert row is not None and row[0] == "before"


def test_interrupted_import_restores_live_db(large_import_env):
    job_id, manifest = _stage_large_replace(large_import_env, user_id=9, rows=50)
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    conn.execute(
        "CREATE TABLE IF NOT EXISTS live_marker (v TEXT)"
    )
    conn.execute("INSERT INTO live_marker VALUES ('live')")
    conn.commit()
    conn.close()

    with dit._lock:
        dit._tasks[job_id] = dit.DatabaseImportTaskState(
            task_id=job_id, user_id=1, mode="replace", status="running"
        )
    done = threading.Event()

    def run() -> None:
        dit._worker(job_id, 1, "replace", manifest)
        done.set()

    with patch("database.migrations.ensure_db_schema", side_effect=RuntimeError("migrate fail")):
        with patch.object(
            dit,
            "reconcile_after_db_import",
            return_value={"user_id_remap": None},
        ):
            thread = threading.Thread(target=run)
            thread.start()
            assert done.wait(timeout=30)

    task = dit.get_database_import_task(job_id)
    assert task is not None and task.status == "failed"
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    row = conn.execute("SELECT v FROM live_marker LIMIT 1").fetchone()
    conn.close()
    assert row is not None and row[0] == "live"


def test_merge_worker_invokes_reconcile(large_import_env):
    job_id = str(uuid.uuid4())
    job_dir = large_import_env / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    _seed_workouts_db(staging / "workouts.db", user_id=5, row_count=3)
    _touch_shared(staging / "shared.db")
    (job_dir / "manifest.json").write_text(
        json.dumps(
            {
                "jobId": job_id,
                "mode": "merge",
                "workoutsPath": "staging/workouts.db",
                "sharedPath": "staging/shared.db",
            }
        ),
        encoding="utf-8",
    )
    manifest = dit.load_job_manifest(job_id)
    from backend.services.database_post_verify import PostDbVerifyReport

    with dit._lock:
        dit._tasks[job_id] = dit.DatabaseImportTaskState(
            task_id=job_id, user_id=1, mode="merge", status="running"
        )
    with patch.object(
        dit,
        "reconcile_after_db_import",
        return_value={"user_id_remap": None},
    ) as reconcile:
        with patch.object(dit, "_finalize_post_import", return_value={"integrity": "ok"}):
            with patch(
                "backend.services.database_post_verify.assert_post_db_verification",
                return_value=PostDbVerifyReport(ok=True),
            ):
                with patch("database.migrations.ensure_db_schema"):
                    dit._worker(job_id, 1, "merge", manifest)
    reconcile.assert_called_once()
