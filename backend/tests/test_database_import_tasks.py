# -*- coding: utf-8 -*-
"""Tests for desktop SQLite database import (staged jobs, replace/merge, manifest safety)."""
from __future__ import annotations

import json
import sqlite3
import tempfile
import threading
import uuid
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services import database_import_tasks as dit
def _touch_sqlite(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE IF NOT EXISTS _import_test (id INTEGER PRIMARY KEY, v TEXT)")
    conn.execute("INSERT INTO _import_test (v) VALUES ('ok')")
    conn.commit()
    conn.close()


def _read_marker(path: Path) -> str:
    conn = sqlite3.connect(path)
    try:
        row = conn.execute("SELECT v FROM _import_test LIMIT 1").fetchone()
        return str(row[0]) if row else ""
    except sqlite3.Error:
        return ""
    finally:
        conn.close()


@pytest.fixture()
def import_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    workouts = tmp / "workouts.db"
    shared = tmp / "shared.db"
    _touch_sqlite(workouts)
    _touch_sqlite(shared)
    conn = sqlite3.connect(workouts)
    conn.execute("UPDATE _import_test SET v = 'live-workouts'")
    conn.commit()
    conn.close()
    conn = sqlite3.connect(shared)
    conn.execute("UPDATE _import_test SET v = 'live-shared'")
    conn.commit()
    conn.close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)
    monkeypatch.setattr("backend.services.database_import_tasks.DATA_ROOT", tmp)
    monkeypatch.setattr("backend.services.database_import_tasks.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("backend.services.database_import_tasks.SHARED_DB_PATH", shared)
    yield tmp


def _write_manifest(job_dir: Path, workouts_rel: str, shared_rel: str, mode: str = "replace") -> None:
    job_dir.mkdir(parents=True, exist_ok=True)
    manifest = {
        "jobId": job_dir.name,
        "mode": mode,
        "workoutsPath": workouts_rel,
        "sharedPath": shared_rel,
    }
    (job_dir / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")


def _stage_replace_job(import_env: Path, marker: str) -> str:
    job_id = str(uuid.uuid4())
    job_dir = import_env / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    w = staging / "workouts.db"
    s = staging / "shared.db"
    _touch_sqlite(w)
    _touch_sqlite(s)
    conn = sqlite3.connect(w)
    conn.execute("UPDATE _import_test SET v = ?", (marker,))
    conn.commit()
    conn.close()
    conn = sqlite3.connect(s)
    conn.execute("UPDATE _import_test SET v = ?", (f"{marker}-shared",))
    conn.commit()
    conn.close()
    _write_manifest(job_dir, "staging/workouts.db", "staging/shared.db", "replace")
    return job_id


def test_resolve_staged_path_rejects_traversal(import_env):
    job_dir = import_env / "import-jobs" / str(uuid.uuid4())
    job_dir.mkdir(parents=True)
    with pytest.raises(ValueError):
        dit._resolve_staged_path(job_dir, "../../etc/passwd")


def test_load_job_manifest_rejects_invalid_job_id(import_env):
    with pytest.raises(ValueError, match="job_id"):
        dit.load_job_manifest("not-a-uuid")


def test_replace_swaps_active_databases(import_env):
    job_id = _stage_replace_job(import_env, "imported")
    manifest = dit.load_job_manifest(job_id)

    dit._replace_activate(manifest["workouts_path"], manifest["shared_path"])

    assert _read_marker(dit.WORKOUTS_DB_PATH) == "imported"
    assert _read_marker(dit.SHARED_DB_PATH) == "imported-shared"


def test_replace_failure_restores_backup(import_env):
    job_id = _stage_replace_job(import_env, "imported")
    manifest = dit.load_job_manifest(job_id)
    with dit._lock:
        dit._tasks[job_id] = dit.DatabaseImportTaskState(
            task_id=job_id,
            user_id=1,
            mode="replace",
            status="running",
        )
    done = threading.Event()

    def run_worker() -> None:
        dit._worker(job_id, 1, "replace", manifest)
        done.set()

    with patch.object(dit, "_finalize_post_import", side_effect=RuntimeError("boom")):
        with patch("database.migrations.ensure_db_schema"):
            with patch(
                "backend.services.import_user_reconciliation.reconcile_after_db_import",
                return_value={"user_id_remap": None},
            ):
                thread = threading.Thread(target=run_worker)
                thread.start()
                assert done.wait(timeout=30)

    task = dit.get_database_import_task(job_id)
    assert task is not None
    assert task.status == "failed"
    assert _read_marker(dit.WORKOUTS_DB_PATH) == "live-workouts"
    assert _read_marker(dit.SHARED_DB_PATH) == "live-shared"


def _ensure_strength_workouts_table(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT, exercise TEXT, weight REAL, reps INTEGER, set_number INTEGER,
            order_index INTEGER, notes TEXT, workout_title TEXT, user_id INTEGER,
            sync_status TEXT, updated_at TEXT
        )
        """
    )
    conn.commit()
    conn.close()


def test_merge_strength_workouts_user_remap(import_env):
    _ensure_strength_workouts_table(dit.WORKOUTS_DB_PATH)

    job_id = str(uuid.uuid4())
    job_dir = import_env / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    staging_w = staging / "workouts.db"
    staging_s = staging / "shared.db"
    _touch_sqlite(staging_s)

    _ensure_strength_workouts_table(staging_w)
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, exercise, weight, reps, set_number, order_index, notes,
            workout_title, user_id, sync_status, updated_at
        ) VALUES ('2026-02-01', 'Bench', 80, 8, 1, 0, '', 'Push', 99, 'synced', '2026-02-01')
        """
    )
    conn.commit()
    conn.close()
    _write_manifest(job_dir, "staging/workouts.db", "staging/shared.db", "merge")

    with patch.object(dit, "_finalize_post_import", return_value={"integrity": "ok", "tables": 1}):
        dit._merge_from_staging(
            staging_w,
            staging_s,
            target_user_id=2,
            on_progress=lambda *_a: None,
        )

    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    rows = conn.execute(
        "SELECT exercise, user_id FROM strength_workouts ORDER BY date"
    ).fetchall()
    conn.close()
    assert rows == [("Bench", 2)]


def _ensure_strength_hr_session_meta_table(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS strength_hr_session_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            hr_workout_id INTEGER,
            mapping_status TEXT NOT NULL DEFAULT 'auto',
            verified_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_hr_session_meta_user_session
        ON strength_hr_session_meta(user_id, workout_date, workout_title)
        """
    )
    conn.commit()
    conn.close()


def test_merge_strength_hr_session_meta_no_unique_failure(import_env):
    _ensure_strength_hr_session_meta_table(dit.WORKOUTS_DB_PATH)
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    conn.execute(
        """
        INSERT INTO strength_hr_session_meta (
            user_id, workout_date, workout_title, mapping_status, updated_at
        ) VALUES (2, '2026-04-01', 'Legs', 'auto', '2026-04-01')
        """
    )
    conn.commit()
    conn.close()

    job_id = str(uuid.uuid4())
    job_dir = import_env / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    staging_w = staging / "workouts.db"
    staging_s = staging / "shared.db"
    _touch_sqlite(staging_s)
    _ensure_strength_hr_session_meta_table(staging_w)

    conn = sqlite3.connect(staging_w)
    conn.execute("DROP INDEX IF EXISTS idx_hr_session_meta_user_session")
    conn.executemany(
        """
        INSERT INTO strength_hr_session_meta (
            user_id, workout_date, workout_title, hr_workout_id,
            mapping_status, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
            (99, "2026-04-01", "Legs", 1, "auto", "2026-04-01"),
            (99, "2026-04-01", "Legs", 2, "verified", "2026-04-02"),
            (99, "2026-04-02", "Push", 3, "manual", "2026-04-02"),
        ],
    )
    conn.commit()
    conn.close()
    _write_manifest(job_dir, "staging/workouts.db", "staging/shared.db", "merge")

    stats = dit._merge_from_staging(
        staging_w,
        staging_s,
        target_user_id=2,
        on_progress=lambda *_a: None,
    )

    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    count = conn.execute(
        "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = 2"
    ).fetchone()[0]
    hr = conn.execute(
        """
        SELECT hr_workout_id, mapping_status FROM strength_hr_session_meta
        WHERE user_id = 2 AND workout_date = '2026-04-01'
        """
    ).fetchone()
    conn.close()

    detail = stats.get("strength_hr_session_meta_detail", {})
    assert count == 2
    assert hr == (2, "verified")
    assert detail.get("imported", 0) + detail.get("updated", 0) >= 1


def test_merge_steps_history_no_unique_failure(import_env):
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.execute(
        "INSERT INTO steps_history (user_id, date, steps, source) VALUES (2, '2026-05-01', 100, 'live')"
    )
    conn.commit()
    conn.close()

    staging_w = import_env / "staging_steps.db"
    staging_s = import_env / "shared_steps.db"
    _touch_sqlite(staging_s)
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.execute(
        "INSERT INTO steps_history (user_id, date, steps, source) VALUES (99, '2026-05-01', 5000, 'import')"
    )
    conn.commit()
    conn.close()

    stats = dit._merge_from_staging(
        staging_w,
        staging_s,
        target_user_id=2,
        on_progress=lambda *_a: None,
    )
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    row = conn.execute(
        "SELECT steps FROM steps_history WHERE user_id = 2 AND date = '2026-05-01'"
    ).fetchone()
    conn.close()

    assert row[0] == 5000
    assert stats.get("steps_history_detail", {}).get("imported", 0) >= 0


def test_merge_strength_hr_session_meta_idempotent_second_run(import_env):
    _ensure_strength_hr_session_meta_table(dit.WORKOUTS_DB_PATH)
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    conn.execute(
        """
        INSERT INTO strength_hr_session_meta (
            user_id, workout_date, workout_title, mapping_status
        ) VALUES (2, '2026-04-01', 'Legs', 'auto')
        """
    )
    conn.commit()
    conn.close()

    staging_w = import_env / "staging_repeat.db"
    staging_s = import_env / "shared_repeat.db"
    _touch_sqlite(staging_s)
    _ensure_strength_hr_session_meta_table(staging_w)
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        INSERT INTO strength_hr_session_meta (
            user_id, workout_date, workout_title, hr_workout_id, mapping_status
        ) VALUES (99, '2026-04-01', 'Legs', 9, 'verified')
        """
    )
    conn.commit()
    conn.close()

    on_progress = lambda *_a: None
    stats1 = dit._merge_from_staging(staging_w, staging_s, target_user_id=2, on_progress=on_progress)
    stats2 = dit._merge_from_staging(staging_w, staging_s, target_user_id=2, on_progress=on_progress)

    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    count = conn.execute(
        "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = 2"
    ).fetchone()[0]
    conn.close()

    assert count == 1
    assert stats1.get("strength_hr_session_meta_detail")
    assert stats2.get("strength_hr_session_meta_detail")


def test_start_database_import_returns_quickly(import_env):
    job_id = _stage_replace_job(import_env, "quick")
    with patch.object(dit, "_worker", lambda *_a, **_k: None):
        task = dit.start_database_import(job_id, 1, mode="replace")
    assert task.task_id == job_id
    assert task.status == "pending"


def _bootstrap_staging_with_foreign_user(staging_w: Path, user_id: int = 2) -> None:
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT,
            display_email TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT OR REPLACE INTO users (id, username, cloud_provider, cloud_user_id)
        VALUES (?, 'foreign', 'yandex', 'foreign-uid')
        """,
        (user_id,),
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profile (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            updated_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        "INSERT OR REPLACE INTO user_profile (id, user_id, updated_at) VALUES (?, ?, '2024-01-01')",
        (user_id, user_id),
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
        """
        INSERT INTO strength_workouts (
            user_id, date, workout_title, exercise, set_number, weight, reps
        ) VALUES (?, '2024-06-01', 'Leg', 'Squat', 1, 50.0, 10)
        """,
        (user_id,),
    )
    conn.commit()
    conn.close()


def test_replace_import_keeps_session_user(import_env):
    from backend.services.auth_user_service import ensure_auth_schema, get_user_by_id
    from database.connection import open_db
    from database.migrations import ensure_db_schema
    from database.shared_schema import ensure_shared_schema
    import shutil

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_db_schema()
    ensure_auth_schema()
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    conn.execute(
        """
        INSERT OR REPLACE INTO users (id, username, cloud_provider, cloud_user_id)
        VALUES (1, 'dev', 'local', 'desktop')
        """
    )
    conn.commit()
    conn.close()

    job_id = str(uuid.uuid4())
    job_dir = import_env / "import-jobs" / job_id
    staging = job_dir / "staging"
    staging.mkdir(parents=True)
    staging_w = staging / "workouts.db"
    staging_s = staging / "shared.db"
    shutil.copy2(dit.WORKOUTS_DB_PATH, staging_w)
    shutil.copy2(dit.SHARED_DB_PATH, staging_s)

    conn = sqlite3.connect(staging_w)
    conn.execute("DELETE FROM users")
    conn.execute(
        """
        INSERT INTO users (id, username, cloud_provider, cloud_user_id)
        VALUES (2, 'foreign', 'yandex', 'foreign-uid')
        """
    )
    if conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='strength_workouts'"
    ).fetchone():
        conn.execute("DELETE FROM strength_workouts")
        conn.execute(
            """
            INSERT INTO strength_workouts (
                user_id, date, workout_title, exercise, set_number, weight, reps
            ) VALUES (2, '2024-06-01', 'Leg', 'Squat', 1, 50.0, 10)
            """
        )
    conn.commit()
    conn.close()
    _write_manifest(job_dir, "staging/workouts.db", "staging/shared.db", "replace")

    from backend.services.database_post_verify import PostDbVerifyReport

    with patch.object(dit, "_finalize_post_import", return_value={"integrity": "ok", "tables": 1}):
        with patch(
            "backend.services.database_post_verify.assert_post_db_verification",
            return_value=PostDbVerifyReport(ok=True),
        ):
            dit._worker(job_id, 1, "replace", dit.load_job_manifest(job_id))

    assert get_user_by_id(1) is not None
    conn = sqlite3.connect(dit.WORKOUTS_DB_PATH)
    count = conn.execute(
        "SELECT COUNT(*) FROM strength_workouts WHERE user_id = 1"
    ).fetchone()[0]
    conn.close()
    assert count == 1


def test_stale_import_lock_does_not_block_api(import_env):
    """Orphan .db-import.lock after crashed import must not block forever."""
    lock = dit.import_lock_path()
    lock.write_text(
        json.dumps(
            {
                "task_id": "dead-task",
                "pid": 99_999_999,
                "started_at": "2026-06-03T12:00:00+00:00",
            }
        ),
        encoding="utf-8",
    )
    assert dit.is_database_import_in_progress() is False
    assert not lock.is_file()


def test_process_pid_alive_current_and_dead():
    import os

    assert dit._process_pid_alive(os.getpid()) is True
    assert dit._process_pid_alive(99_999_999) is False
