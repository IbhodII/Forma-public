# -*- coding: utf-8 -*-
"""Tests for account warmup job."""
from __future__ import annotations

import sqlite3
import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.database.request_context import set_current_user_id
from backend.services.account_warmup_service import WarmupRunSummary, WarmupStageResult, run_account_warmup
from backend.services.account_warmup_tasks import (
    AccountWarmupAlreadyRunningError,
    get_account_warmup_task,
    start_account_warmup,
)
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


def _seed_user2_data(db_path: Path) -> None:
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        INSERT INTO strength_workouts (
            date, exercise, weight, reps, set_number, order_index, notes,
            workout_title, user_id, sync_status, updated_at
        ) VALUES ('2026-02-01', 'Bench', 60, 8, 1, 0, '', 'Push', 2, 'synced', '2026-02-01T10:00:00')
        """
    )
    conn.commit()
    conn.close()


def test_light_warmup_stages_complete(temp_db):
    set_current_user_id(2)
    _seed_user2_data(temp_db)
    summary = run_account_warmup(2, mode="light")
    assert summary.mode == "light"
    assert len(summary.stages) == 3
    assert all(s.status == "done" for s in summary.stages)
    assert summary.stages[0].id == "db_indexes"
    assert summary.stages[1].id == "db_analyze"
    assert summary.stages[2].id == "profile_cache"


def test_full_warmup_includes_compute_stages(temp_db):
    set_current_user_id(2)
    _seed_user2_data(temp_db)

    mock_batched = WarmupRunSummary(mode="full")
    mock_batched.stages.append(
        WarmupStageResult(id="workouts_list", label="Список тренировок", status="done")
    )

    with patch(
        "backend.services.account_warmup_engine.run_batched_full_warmup",
        return_value=mock_batched,
    ):
        summary = run_account_warmup(2, mode="full", task_id="t1")

    stage_ids = [s.id for s in summary.stages]
    assert "db_analyze" in stage_ids
    assert "workouts_list" in stage_ids
    assert stage_ids.index("db_analyze") < stage_ids.index("workouts_list")


def test_warmup_idempotent(temp_db):
    set_current_user_id(2)
    first = run_account_warmup(2, mode="light")
    second = run_account_warmup(2, mode="light")
    assert all(s.status == "done" for s in first.stages)
    assert all(s.status == "done" for s in second.stages)


def test_background_task_progress_and_user_scope(temp_db):
    set_current_user_id(2)
    task = start_account_warmup(2, mode="light")
    deadline = time.monotonic() + 30.0
    final = None
    while time.monotonic() < deadline:
        t = get_account_warmup_task(task.task_id)
        if t and t.status in ("completed", "failed"):
            final = t
            break
        time.sleep(0.05)
    assert final is not None
    assert final.status == "completed"
    assert final.percent == 100
    assert final.current == final.total
    assert len(final.stages) >= 3

    other = get_account_warmup_task(task.task_id)
    assert other is not None
    assert other.user_id == 2


def test_concurrent_warmup_rejected(temp_db):
    set_current_user_id(2)
    blocker = threading.Event()

    def slow_warmup(*_a, **_k):
        blocker.wait(timeout=5)

    with patch("backend.services.account_warmup_tasks.run_account_warmup", side_effect=slow_warmup):
        first = start_account_warmup(2, mode="light")
        with pytest.raises(AccountWarmupAlreadyRunningError) as err:
            start_account_warmup(2, mode="light")
        assert err.value.task_id == first.task_id
    blocker.set()


def test_vacuum_stage_only_when_requested(temp_db):
    set_current_user_id(2)
    light = run_account_warmup(2, mode="light", include_vacuum=False)
    assert "db_vacuum" not in [s.id for s in light.stages]

    with patch("backend.services.account_warmup_service._run_db_vacuum") as vac:
        summary = run_account_warmup(2, mode="light", include_vacuum=True)
        vac.assert_called_once()
    assert "db_vacuum" in [s.id for s in summary.stages]


def test_import_success_enriches_report_with_warmup():
    """Report enrichment after successful import (no DB)."""
    report: dict = {"imported": {"strength_workouts": 1}, "errors": []}

    with patch(
        "backend.services.account_warmup_tasks.start_account_warmup",
        return_value=type("T", (), {"task_id": "warm-1"})(),
    ) as start_w:
        report["warmup_recommended"] = True
        try:
            from backend.services.account_warmup_tasks import start_account_warmup

            light_task = start_account_warmup(2, mode="light")
            report["warmup_task_id"] = light_task.task_id
        except Exception as err:
            report["warmup_auto_error"] = str(err)

    assert report["warmup_recommended"] is True
    assert report["warmup_task_id"] == "warm-1"
    start_w.assert_called_once_with(2, mode="light")
