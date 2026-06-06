# -*- coding: utf-8 -*-
"""Tests for post-import database verification."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from backend.database.request_context import set_current_user_id
from backend.services.database_post_verify import (
    PostDbVerifyError,
    assert_post_db_verification,
    run_post_db_verification,
)
from database.migrations import ensure_db_schema


@pytest.fixture()
def verify_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    workouts = tmp / "workouts.db"
    shared = tmp / "shared.db"
    sqlite3.connect(workouts).close()
    sqlite3.connect(shared).close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)
    monkeypatch.setattr("backend.database.DB_PATH", workouts)

    from database.connection import open_db
    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_db_schema()
    set_current_user_id(1)
    yield tmp


def test_post_verify_passes_on_fresh_schema(verify_env):
    report = run_post_db_verification(1)
    assert report.ok is True
    assert len(report.checks) >= 9
    ids = {c.id for c in report.checks}
    assert "integrity" in ids
    assert "workouts" in ids
    assert "workouts_visibility" in ids
    assert report.workout_visibility is not None


def test_post_verify_fails_on_corrupt_db(verify_env, monkeypatch):
    from database.connection import WORKOUTS_DB_PATH

    WORKOUTS_DB_PATH.write_bytes(b"not a database")
    report = run_post_db_verification(1)
    assert report.ok is False
    assert any(c.id == "db_opens" and not c.ok for c in report.checks)


def test_assert_raises_post_db_verify_error(verify_env, monkeypatch):
    from database.connection import WORKOUTS_DB_PATH

    WORKOUTS_DB_PATH.write_bytes(b"bad")
    with pytest.raises(PostDbVerifyError) as err:
        assert_post_db_verification(1)
    assert err.value.report.ok is False
