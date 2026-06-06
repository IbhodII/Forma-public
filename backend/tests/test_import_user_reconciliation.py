# -*- coding: utf-8 -*-
"""Tests for import user identity reconciliation after DB replace/restore."""
from __future__ import annotations

import shutil
import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services.auth_user_service import ensure_auth_schema, get_user_by_id
from backend.services.import_user_reconciliation import (
    detect_import_user_id,
    ensure_target_user_row,
    reassign_user_ids_to_target,
    reconcile_after_db_import,
    reconcile_user_profile,
)
from database.migrations import ensure_db_schema


@pytest.fixture()
def reconcile_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    workouts = tmp / "workouts.db"
    shared = tmp / "shared.db"
    sqlite3.connect(workouts).close()
    sqlite3.connect(shared).close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)

    from database.connection import open_db
    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_auth_schema()
    ensure_db_schema()
    fixture_bak = tmp / "workouts_fixture_bak.db"
    shutil.copy2(tmp / "workouts.db", fixture_bak)
    yield tmp
    from database.connection import WORKOUTS_DB_PATH

    shutil.copy2(fixture_bak, WORKOUTS_DB_PATH)
    for suffix in ("-wal", "-shm"):
        wal = WORKOUTS_DB_PATH.with_name(WORKOUTS_DB_PATH.name + suffix)
        if wal.exists():
            wal.unlink(missing_ok=True)


def _prepare_import_db(
    path: Path,
    *,
    user_id: int = 5,
    cloud_provider: str | None = "yandex",
    cloud_user_id: str | None = "backup-yandex-uid",
    with_workout: bool = True,
) -> None:
    """Clone migrated workouts.db and set a single foreign user + optional workout."""
    from database.connection import WORKOUTS_DB_PATH

    shutil.copy2(WORKOUTS_DB_PATH, path)
    conn = sqlite3.connect(path)
    try:
        conn.execute("DELETE FROM users")
        conn.execute(
            """
            INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
            VALUES (?, 'backup_user', ?, ?, 'backup@example.com')
            """,
            (user_id, cloud_provider, cloud_user_id),
        )
        conn.execute("DELETE FROM user_profile")
        conn.execute(
            """
            INSERT INTO user_profile (id, user_id, date_of_birth, height_cm, updated_at)
            VALUES (?, ?, '1990-01-01', 180.0, '2024-01-01T00:00:00+00:00')
            """,
            (user_id, user_id),
        )
        if with_workout:
            conn.execute("DELETE FROM strength_workouts")
            conn.execute(
                """
                INSERT INTO strength_workouts (
                    user_id, date, workout_title, exercise, set_number, weight, reps
                ) VALUES (?, '2024-06-01', 'Leg', 'Squat', 1, 50.0, 10)
                """,
                (user_id,),
            )
        conn.commit()
    finally:
        conn.close()


def _insert_live_user(
    user_id: int = 1,
    *,
    cloud_provider: str = "yandex",
    cloud_user_id: str = "dev-yandex-uid",
) -> None:
    from database.connection import open_db

    conn = open_db(attach=False)
    try:
        conn.execute(
            """
            INSERT OR REPLACE INTO users (id, username, cloud_provider, cloud_user_id, display_email)
            VALUES (?, 'dev', ?, ?, 'dev@example.com')
            """,
            (user_id, cloud_provider, cloud_user_id),
        )
        conn.execute(
            """
            INSERT OR REPLACE INTO user_profile (id, user_id, updated_at)
            VALUES (?, ?, '2024-01-01T00:00:00+00:00')
            """,
            (user_id, user_id),
        )
        conn.commit()
    finally:
        conn.close()


def _count_workouts_for(user_id: int) -> int:
    from database.connection import open_db

    conn = open_db(attach=False)
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return int(row[0]) if row else 0
    finally:
        conn.close()


def test_detect_import_user_id_from_workouts(reconcile_env):
    imp = reconcile_env / "import.db"
    _prepare_import_db(imp, user_id=5)
    assert detect_import_user_id(imp) == 5


def test_reassign_steps_history_collision(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH

    conn = sqlite3.connect(WORKOUTS_DB_PATH)
    try:
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
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (1, '2026-08-01', 100, 'live')"
        )
        conn.execute(
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (5, '2026-08-01', 9000, 'import')"
        )
        conn.commit()
    finally:
        conn.close()

    remap = reassign_user_ids_to_target(1)
    assert "reassign_natural_key" in remap
    assert "steps_history" in remap["reassign_natural_key"]

    conn = sqlite3.connect(WORKOUTS_DB_PATH)
    try:
        steps = conn.execute(
            "SELECT steps FROM steps_history WHERE user_id = 1 AND date = '2026-08-01'"
        ).fetchone()[0]
        count = conn.execute(
            "SELECT COUNT(*) FROM steps_history WHERE user_id = 1 AND date = '2026-08-01'"
        ).fetchone()[0]
    finally:
        conn.close()
    assert count == 1
    assert steps == 9000


def test_reassign_hr_meta_collision_uses_upsert_not_update(reconcile_env):
    """target already has (date, title); foreign user has same key — no UNIQUE on remap."""
    from database.connection import WORKOUTS_DB_PATH

    conn = sqlite3.connect(WORKOUTS_DB_PATH)
    try:
        conn.execute(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, hr_workout_id,
                mapping_status, updated_at
            ) VALUES (1, '2026-05-10', 'Push', 100, 'auto', '2026-05-10')
            """
        )
        conn.execute(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, hr_workout_id,
                mapping_status, verified_at, updated_at
            ) VALUES (5, '2026-05-10', 'Push', 200, 'verified', '2026-05-11', '2026-05-12')
            """
        )
        conn.commit()
    finally:
        conn.close()

    remap = reassign_user_ids_to_target(1)
    assert "reassign_natural_key" in remap
    hr = remap["reassign_natural_key"]["strength_hr_session_meta"]
    assert hr["imported"] + hr["updated"] >= 1

    conn = sqlite3.connect(WORKOUTS_DB_PATH)
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = 1"
        ).fetchone()[0]
        row = conn.execute(
            """
            SELECT hr_workout_id, mapping_status, verified_at
            FROM strength_hr_session_meta
            WHERE user_id = 1 AND workout_date = '2026-05-10' AND workout_title = 'Push'
            """
        ).fetchone()
        foreign_left = conn.execute(
            "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = 5"
        ).fetchone()[0]
    finally:
        conn.close()

    assert count == 1
    assert foreign_left == 0
    assert row is not None
    assert row[0] == 200
    assert row[1] == "verified"
    assert row[2] == "2026-05-11"


def test_reassign_maps_data_to_target(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH

    imp = reconcile_env / "reassign.db"
    _prepare_import_db(imp, user_id=5)
    shutil.copy2(imp, WORKOUTS_DB_PATH)
    remap = reassign_user_ids_to_target(1)
    assert remap["rows_updated"] >= 1
    assert _count_workouts_for(1) == 1
    assert _count_workouts_for(5) == 0


def test_ensure_target_user_from_snapshot(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH

    pre = {
        "id": 1,
        "username": "dev",
        "cloud_provider": "yandex",
        "cloud_user_id": "dev-yandex-uid",
        "display_email": "dev@example.com",
    }
    only5 = reconcile_env / "only5.db"
    _prepare_import_db(only5, user_id=5, cloud_user_id="other-uid")
    shutil.copy2(only5, WORKOUTS_DB_PATH)

    report = ensure_target_user_row(1, pre)
    assert report["action"] in (
        "restored_from_snapshot",
        "updated_from_snapshot",
        "exists",
    )
    user = get_user_by_id(1)
    assert user is not None
    assert user["cloud_user_id"] == "dev-yandex-uid"


def test_reconcile_after_import_different_cloud_id(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH
    import shutil

    pre = {
        "id": 1,
        "username": "dev",
        "cloud_provider": "yandex",
        "cloud_user_id": "dev-yandex-uid",
        "display_email": "dev@example.com",
    }
    _insert_live_user(1)

    imp = reconcile_env / "backup.db"
    _prepare_import_db(
        imp,
        user_id=5,
        cloud_provider="yandex",
        cloud_user_id="other-yandex-uid",
    )
    shutil.copy2(imp, WORKOUTS_DB_PATH)

    report = reconcile_after_db_import(1, WORKOUTS_DB_PATH, pre)
    assert get_user_by_id(1) is not None
    assert get_user_by_id(1)["cloud_user_id"] == "dev-yandex-uid"
    assert _count_workouts_for(1) == 1
    assert report["session_user_id"] == 1


def test_reconcile_legacy_without_cloud_user_id(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH
    import shutil

    imp = reconcile_env / "legacy.db"
    _prepare_import_db(
        imp,
        user_id=1,
        cloud_provider=None,
        cloud_user_id=None,
    )
    shutil.copy2(imp, WORKOUTS_DB_PATH)

    report = reconcile_after_db_import(1, WORKOUTS_DB_PATH, None)
    assert get_user_by_id(1) is not None
    assert report["session_user_id"] == 1


def test_reconcile_user_profile_copies_fields(reconcile_env):
    from database.connection import open_db

    profile_row = {
        "id": 5,
        "user_id": 5,
        "date_of_birth": "1985-05-05",
        "height_cm": 175.0,
        "updated_at": "2024-02-02T00:00:00+00:00",
    }
    report = reconcile_user_profile(1, 5, profile_row=profile_row)
    assert report["action"] in ("inserted", "updated")

    conn = open_db(attach=False)
    try:
        row = conn.execute(
            "SELECT date_of_birth, height_cm FROM user_profile WHERE id = 1"
        ).fetchone()
        assert row is not None
        assert row[0] == "1985-05-05"
        assert float(row[1]) == 175.0
    finally:
        conn.close()


def test_db_import_safety_restore_after_replace(reconcile_env):
    """Pre-backup + atomic replace + restore must return live DB unchanged."""
    from database.connection import WORKOUTS_DB_PATH
    from backend.services.db_import_safety import (
        atomic_replace_file,
        backup_current_db_files,
        restore_db_files,
    )

    _insert_live_user(1)
    conn = sqlite3.connect(WORKOUTS_DB_PATH)
    conn.execute(
        "INSERT INTO strength_workouts (user_id, date, workout_title, exercise, set_number, weight, reps) "
        "VALUES (1, '2024-01-01', 'A', 'B', 1, 10.0, 5)"
    )
    conn.commit()
    conn.close()
    workouts_before = _count_workouts_for(1)

    imp = reconcile_env / "cloud_dl.db"
    _prepare_import_db(imp, user_id=5)

    workout_bak, shared_bak = backup_current_db_files(1, suffix="pre-cloud-restore")
    atomic_replace_file(imp, WORKOUTS_DB_PATH)
    assert _count_workouts_for(1) == 0
    restore_db_files(workout_bak, shared_bak)

    assert _count_workouts_for(1) == workouts_before
    assert get_user_by_id(1) is not None


def test_profile_api_not_401_after_reconcile(reconcile_env):
    from database.connection import WORKOUTS_DB_PATH
    import shutil

    pre = {
        "id": 1,
        "username": "dev",
        "cloud_provider": "local",
        "cloud_user_id": "desktop",
        "display_email": None,
    }
    _insert_live_user(1, cloud_provider="local", cloud_user_id="desktop")

    imp = reconcile_env / "imp.db"
    _prepare_import_db(imp, user_id=9)
    shutil.copy2(imp, WORKOUTS_DB_PATH)
    reconcile_after_db_import(1, WORKOUTS_DB_PATH, pre)

    from backend.database.request_context import set_current_user_id
    from backend.services.user_service import get_profile

    set_current_user_id(1)
    profile = get_profile()
    assert profile is not None
    assert get_user_by_id(1) is not None
