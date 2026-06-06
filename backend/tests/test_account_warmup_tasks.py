# -*- coding: utf-8 -*-
"""Tests for background account warmup task state and heartbeat."""
from __future__ import annotations

import tempfile
import threading
import time
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services import account_warmup_tasks as tasks


@pytest.fixture()
def warmup_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    tasks._tasks.clear()
    tasks._running_by_user.clear()
    tasks._cancel_events.clear()
    yield tmp


def test_start_returns_immediately(warmup_env):
    with patch.object(tasks, "_worker", lambda *_a, **_k: None):
        task = tasks.start_account_warmup(1, mode="light")
    assert task.status == "running"
    assert task.task_id


def test_to_dict_includes_heartbeat_and_section(warmup_env):
    task = tasks.AccountWarmupTaskState(
        task_id="abc",
        user_id=1,
        mode="full",
        include_vacuum=False,
        status="running",
        stage="workouts_list",
        processed_units=10,
        total_units=100,
        last_heartbeat_at="2026-06-02T12:00:00+00:00",
    )
    data = task.to_dict()
    assert data["job_id"] == "abc"
    assert data["processed"] == 10
    assert data["total"] == 100
    assert data["lastHeartbeatAt"] == "2026-06-02T12:00:00+00:00"
    assert data["currentSection"]


def test_heartbeat_updates_while_running(warmup_env):
    done = threading.Event()

    def slow_worker(task_id: str, user_id: int, mode, include_vacuum, *, resume=True):
        time.sleep(0.1)
        tasks._touch_heartbeat(task_id)
        done.set()

    with patch.object(tasks, "_worker", slow_worker):
        task = tasks.start_account_warmup(1, mode="light")
    assert done.wait(timeout=5)
    stored = tasks.get_account_warmup_task(task.task_id)
    assert stored is not None
    assert stored.last_heartbeat_at is not None


def test_cancel_sets_event(warmup_env):
    with patch.object(tasks, "_worker", lambda *_a, **_k: time.sleep(2)):
        task = tasks.start_account_warmup(1, mode="light")
    cancelled = tasks.cancel_account_warmup(1)
    assert cancelled is not None
    assert tasks._cancel_events[task.task_id].is_set()


def test_stale_checkpoint_status_and_cancel(warmup_env, monkeypatch):
    from backend.services.account_warmup_checkpoint_store import (
        WarmupCheckpoint,
        save_checkpoint,
    )

    stale_id = "d6f3662b-2aaa-434f-8177-39e685be3a46"
    save_checkpoint(
        WarmupCheckpoint(
            user_id=1,
            status="running",
            mode="full",
            task_id=stale_id,
            processed_units=10,
            total_units=100,
        )
    )
    tasks.reconcile_stale_warmup_checkpoint(1)
    resolved = tasks.get_account_warmup_task_for_user(1, stale_id)
    assert resolved is not None
    assert resolved.status == "cancelled"

    save_checkpoint(
        WarmupCheckpoint(
            user_id=1,
            status="running",
            mode="light",
            task_id=stale_id,
        )
    )
    cancelled = tasks.cancel_account_warmup(1)
    assert cancelled is not None
    assert cancelled.status == "cancelled"
