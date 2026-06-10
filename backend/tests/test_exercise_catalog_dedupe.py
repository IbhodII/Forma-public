# -*- coding: utf-8 -*-
"""Каталог и наборы: одно упражнение — одна строка, подходы не дублируют список."""
from __future__ import annotations

import sqlite3

import pytest

from database.migrations import EXERCISE_SET_DEFAULT_FROM, _insert_exercise_set


@pytest.fixture
def catalog_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"
    sqlite3.connect(shared_path).close()
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY,
            exercise TEXT,
            user_id INTEGER NOT NULL,
            set_number INTEGER DEFAULT 1,
            date TEXT,
            workout_title TEXT
        );
        INSERT INTO strength_workouts (exercise, user_id, set_number, date, workout_title)
        VALUES
            ('Жим лежа', 1, 1, '2026-01-01', 'Грудь'),
            ('жим лежа', 1, 2, '2026-01-01', 'Грудь'),
            ('Жим лежа', 1, 3, '2026-01-01', 'Грудь'),
            ('Присед', 2, 1, '2026-01-02', 'Ноги');
        CREATE TABLE preset_exercises (
            exercise_name TEXT,
            user_id INTEGER NOT NULL
        );
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            user_id INTEGER NOT NULL
        );
        CREATE TABLE user_strength_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            exercise_category TEXT NOT NULL DEFAULT 'strength',
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        );
        """
    )
    set_id = _insert_exercise_set(
        conn,
        "Грудь",
        EXERCISE_SET_DEFAULT_FROM,
        ["Жим лежа", "Жим лежа", "Разводка"],
        is_default=1,
        user_id=1,
    )
    assert set_id > 0
    conn.commit()
    conn.close()

    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp_path))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp_path)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)

    from database.connection import open_db
    from database.shared_schema import ensure_shared_schema

    bootstrap = open_db(attach=True)
    try:
        ensure_shared_schema(bootstrap)
        bootstrap.commit()
    finally:
        bootstrap.close()

    def _open():
        c = sqlite3.connect(db_path)
        c.execute(f"ATTACH DATABASE ? AS shared", (str(shared_path),))
        return c

    monkeypatch.setattr("backend.database.get_db", _open)
    yield db_path


def test_catalog_one_row_per_exercise_not_per_set(catalog_db, monkeypatch):
    from backend.services import exercise_catalog_service

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        "backend.services.exercise_catalog_service.get_current_user_id", lambda: 1
    )
    names = exercise_catalog_service.list_all_exercise_names()
    assert names == ["Жим лежа", "Разводка"]


def test_get_set_exercises_dedupes_items(catalog_db, monkeypatch):
    import database.db_utils as db_utils

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("database.db_utils._default_user_id", lambda: 1)
    rows = db_utils.get_all_sets("Грудь")
    assert len(rows) == 1
    exercises = db_utils.get_set_exercises(int(rows[0]["id"]))
    assert exercises == ["Жим лежа", "Разводка"]
