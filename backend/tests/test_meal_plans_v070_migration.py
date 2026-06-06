# -*- coding: utf-8 -*-
"""v070: meal plan tables copied shared → workouts with preserved ids."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from database.connection import SHARED_DB_PATH, WORKOUTS_DB_PATH, open_db
from database.meal_plans_storage import META_MEAL_PLANS_IN_WORKOUTS, meal_plans_in_workouts, mq
from database.migrations import ensure_db_schema


@pytest.fixture()
def meal_migration_env(monkeypatch):
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

    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()
    ensure_db_schema()

    conn = open_db(attach=True)
    try:
        assert meal_plans_in_workouts(conn)
        conn.execute(
            """
            INSERT INTO main.meal_templates (id, user_id, name, meal_type, phase)
            VALUES (42, 1, 'TestTpl', 'lunch', 'cut')
            """
        )
        conn.execute(
            """
            INSERT INTO main.daily_meal_plans (id, user_id, name, phase, is_custom)
            VALUES (7, 1, 'TestPlan', 'cut', 1)
            """
        )
        conn.execute(
            """
            INSERT INTO shared.meal_templates (id, user_id, name, meal_type, phase)
            VALUES (42, 1, 'TestTpl', 'lunch', 'cut')
            """
        )
        conn.execute(
            """
            INSERT INTO shared.daily_meal_plans (id, user_id, name, phase, is_custom)
            VALUES (7, 1, 'TestPlan', 'cut', 1)
            """
        )
        conn.commit()
    finally:
        conn.close()

    yield tmp


def test_v070_copies_meal_tables_preserves_ids(meal_migration_env):
    conn = open_db(attach=True)
    try:
        assert meal_plans_in_workouts(conn) is True
        tpl = conn.execute("SELECT id, name FROM main.meal_templates WHERE id = 42").fetchone()
        assert tpl is not None
        assert tpl["name"] == "TestTpl"
        plan = conn.execute("SELECT id, name FROM main.daily_meal_plans WHERE id = 7").fetchone()
        assert plan is not None
        assert plan["name"] == "TestPlan"
        # dual-read: legacy shared row still present
        shared_tpl = conn.execute(
            "SELECT id FROM shared.meal_templates WHERE id = 42"
        ).fetchone()
        assert shared_tpl is not None
        assert mq(conn, "meal_templates") == "main.meal_templates"
    finally:
        conn.close()


def test_food_products_remain_in_shared(meal_migration_env):
    conn = open_db(attach=True)
    try:
        row = conn.execute(
            "SELECT name FROM shared.sqlite_master WHERE type='table' AND name='food_products'"
        ).fetchone()
        assert row is not None
        meta = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            (META_MEAL_PLANS_IN_WORKOUTS,),
        ).fetchone()
        assert meta is not None and str(meta[0]) == "1"
    finally:
        conn.close()


def test_meal_plans_zip_roundtrip_ids(meal_migration_env, monkeypatch):
    """ZIP export/import keeps meal plan ids after v070."""
    from backend.services.database_export_service import build_database_zip
    from database.connection import DATA_ROOT

    out = meal_migration_env / "roundtrip.zip"
    build_database_zip(out, user_id=1)

    import zipfile
    import shutil

    staging = meal_migration_env / "staging"
    staging.mkdir()
    with zipfile.ZipFile(out, "r") as zf:
        zf.extractall(staging)

    new_workouts = meal_migration_env / "workouts2.db"
    new_shared = meal_migration_env / "shared2.db"
    shutil.copy2(staging / "workouts.db", new_workouts)
    shutil.copy2(staging / "shared.db", new_shared)

    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", new_workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", new_shared)
    monkeypatch.setattr("backend.database.DB_PATH", new_workouts)

    conn = open_db(attach=True)
    try:
        tpl = conn.execute("SELECT id FROM main.meal_templates WHERE id = 42").fetchone()
        assert tpl is not None
    finally:
        conn.close()
