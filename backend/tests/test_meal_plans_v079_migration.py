# -*- coding: utf-8 -*-
"""v079: reconcile shared meal tables into main and purge shared.db copies."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from database.connection import open_db
from database.meal_plans_storage import (
    MEAL_PLAN_TABLES,
    META_SHARED_MEAL_PLANS_PURGED,
    meal_plans_in_workouts,
    shared_meal_plans_purged,
)
from database.migrations import ensure_db_schema


@pytest.fixture()
def meal_v079_env(monkeypatch):
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
        assert shared_meal_plans_purged(conn)
        conn.execute(
            """
            INSERT INTO main.meal_templates (id, user_id, name, meal_type, phase)
            VALUES (1, 1, 'MainTpl', 'breakfast1', 'cut')
            """
        )
        conn.execute(
            """
            INSERT INTO main.daily_meal_plans (id, user_id, name, phase, is_custom)
            VALUES (2, 1, 'MainPlan', 'cut', 1)
            """
        )
        conn.commit()
    finally:
        conn.close()

    yield tmp


def test_v079_purges_shared_meal_tables(meal_v079_env):
    conn = open_db(attach=True)
    try:
        for table in MEAL_PLAN_TABLES:
            row = conn.execute(
                f"""
                SELECT name FROM shared.sqlite_master
                WHERE type='table' AND name = ?
                """,
                (table,),
            ).fetchone()
            assert row is None, f"shared.{table} should be dropped after v079"
        meta = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            (META_SHARED_MEAL_PLANS_PURGED,),
        ).fetchone()
        assert meta is not None and str(meta[0]) == "1"
        tpl = conn.execute("SELECT name FROM main.meal_templates WHERE id = 1").fetchone()
        assert tpl is not None and tpl[0] == "MainTpl"
    finally:
        conn.close()


def test_v079_reconciles_shared_only_rows(monkeypatch):
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
        bootstrap.execute(
            """
            INSERT INTO shared.meal_templates (id, name, meal_type, phase)
            VALUES (99, 'SharedOnlyTpl', 'lunch', 'cut')
            """
        )
        bootstrap.execute(
            """
            INSERT INTO shared.daily_meal_plans (id, name, phase)
            VALUES (88, 'SharedOnlyPlan', 'cut')
            """
        )
        bootstrap.commit()
    finally:
        bootstrap.close()

    ensure_db_schema()

    conn = open_db(attach=True)
    try:
        tpl = conn.execute(
            "SELECT name FROM main.meal_templates WHERE id = 99"
        ).fetchone()
        assert tpl is not None and tpl[0] == "SharedOnlyTpl"
        plan = conn.execute(
            "SELECT name FROM main.daily_meal_plans WHERE id = 88"
        ).fetchone()
        assert plan is not None and plan[0] == "SharedOnlyPlan"
        shared_row = conn.execute(
            "SELECT name FROM shared.sqlite_master WHERE type='table' AND name='meal_templates'"
        ).fetchone()
        assert shared_row is None
    finally:
        conn.close()


def test_v079_handles_legacy_shared_schema_with_extended_main(monkeypatch):
    """v070 already ran; main has extra columns; shared keeps legacy DDL."""
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

    from database.meal_plans_storage import META_MEAL_PLANS_IN_WORKOUTS
    from database.migrations import _migration_v079_finalize_meal_plans_in_workouts

    conn = open_db(attach=True)
    try:
        conn.execute(
            """
            CREATE TABLE app_meta (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
            """
        )
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES (?, '1')",
            (META_MEAL_PLANS_IN_WORKOUTS,),
        )
        conn.execute(
            """
            CREATE TABLE meal_templates (
                id INTEGER PRIMARY KEY,
                user_id INTEGER NOT NULL DEFAULT 1,
                name TEXT NOT NULL,
                meal_type TEXT NOT NULL,
                phase TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                source TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO meal_templates (id, user_id, name, meal_type, phase)
            VALUES (1, 1, 'ExistingMainTpl', 'breakfast1', 'cut')
            """
        )
        conn.commit()
    finally:
        conn.close()

    sc = sqlite3.connect(shared)
    try:
        sc.execute(
            """
            CREATE TABLE meal_templates (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                meal_type TEXT NOT NULL,
                phase TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        sc.execute(
            """
            INSERT INTO meal_templates (id, name, meal_type, phase)
            VALUES (99, 'LegacySharedTpl', 'lunch', 'cut')
            """
        )
        sc.commit()
    finally:
        sc.close()

    conn = open_db(attach=True)
    try:
        _migration_v079_finalize_meal_plans_in_workouts(conn)
        tpl = conn.execute(
            "SELECT name FROM main.meal_templates WHERE id = 99"
        ).fetchone()
        assert tpl is not None and tpl[0] == "LegacySharedTpl"
        kept = conn.execute(
            "SELECT name FROM main.meal_templates WHERE id = 1"
        ).fetchone()
        assert kept is not None and kept[0] == "ExistingMainTpl"
    finally:
        conn.close()


def test_clean_install_sanitized_shared_has_main_meal_tables(monkeypatch):
    """Sanitized shared.db (reference only) still yields main meal tables after migrations."""
    tmp = Path(tempfile.mkdtemp())
    workouts = tmp / "workouts.db"
    shared = tmp / "shared.db"
    sqlite3.connect(workouts).close()

    sc = sqlite3.connect(shared)
    try:
        sc.execute(
            """
            CREATE TABLE food_products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL UNIQUE
            )
            """
        )
        sc.commit()
    finally:
        sc.close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared)
    monkeypatch.setattr("backend.database.DB_PATH", workouts)

    ensure_db_schema()

    conn = open_db(attach=True)
    try:
        assert meal_plans_in_workouts(conn)
        assert shared_meal_plans_purged(conn)
        for table in MEAL_PLAN_TABLES:
            row = conn.execute(
                "SELECT name FROM main.sqlite_master WHERE type='table' AND name = ?",
                (table,),
            ).fetchone()
            assert row is not None, f"missing main.{table}"
        from backend.services.food_service import list_meal_plans, list_templates

        assert list_templates() == []
        assert list_meal_plans() == []
    finally:
        conn.close()
