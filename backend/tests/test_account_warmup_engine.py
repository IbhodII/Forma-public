# -*- coding: utf-8 -*-
"""Smoke tests for batched warmup engine progress ticks."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path
from unittest.mock import patch

import pytest

from backend.services.account_warmup_engine import EngineContext, _run_food_products_batched
from backend.services.account_warmup_checkpoint_store import WarmupCursor


@pytest.fixture()
def engine_db(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    db_path = tmp / "workouts.db"
    shared_path = tmp / "shared.db"
    conn = sqlite3.connect(db_path)
    conn.commit()
    conn.close()
    sconn = sqlite3.connect(shared_path)
    sconn.execute(
        """
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY,
            name TEXT
        )
        """
    )
    for i in range(5):
        sconn.execute("INSERT INTO food_products (name) VALUES (?)", (f"p{i}",))
    sconn.commit()
    sconn.close()
    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared_path)
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    yield db_path


def test_food_products_batched_ticks(engine_db):
    ticks: list[int] = []

    def on_batch(processed: int, total: int, stage: str, _label: str) -> None:
        ticks.append(processed)

    ctx = EngineContext(
        user_id=1,
        task_id="test",
        on_batch=on_batch,
        processed_units=0,
        total_units=10,
    )
    cursor = WarmupCursor(stage="food_products")
    _run_food_products_batched(ctx, cursor)
    assert len(ticks) >= 1
    assert ctx.processed_units >= len(ticks)
