# -*- coding: utf-8 -*-
"""Ownership isolation for cardio tab settings and exercise catalog."""
from __future__ import annotations

import sqlite3

import pytest

from database.migrations import DEFAULT_USER_ID, _migration_v069_cardio_type_settings_user_scope


@pytest.fixture
def cardio_settings_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE cardio_type_settings (
            type TEXT PRIMARY KEY,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO cardio_type_settings (type, is_active, sort_order, user_id)
        VALUES ('бег', 0, 2, 1);
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT,
            user_id INTEGER,
            deleted_at TEXT
        );
        INSERT INTO cardio_workouts (date, type, user_id) VALUES
            ('2026-01-01', 'бег', 1),
            ('2026-01-02', 'бег', 2);
        CREATE TABLE workout_source_links (
            user_id INTEGER NOT NULL,
            canonical_workout_id INTEGER NOT NULL,
            linked_workout_id INTEGER NOT NULL,
            link_reason TEXT,
            confidence TEXT,
            created_at TEXT,
            UNIQUE(canonical_workout_id, linked_workout_id)
        );
        """
    )
    _migration_v069_cardio_type_settings_user_scope(conn)
    conn.execute(
        "UPDATE cardio_type_settings SET is_active = 0 WHERE user_id = 1 AND type = 'бег'"
    )
    conn.commit()
    conn.close()

    def _open():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.database.get_db", _open)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)
    yield db_path


def test_cardio_tab_settings_isolated_per_user(cardio_settings_db, monkeypatch):
    from backend.services import cardio_type_service

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    tabs_u1 = cardio_type_service.list_tab_settings()
    assert len(tabs_u1) == 3
    assert next(t for t in tabs_u1 if t["type"] == "бег")["is_active"] == 0

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 2)
    tabs_u2 = cardio_type_service.list_tab_settings()
    assert len(tabs_u2) == 3
    assert next(t for t in tabs_u2 if t["type"] == "бег")["is_active"] == 1

    cardio_type_service.archive_tab_type("бег")
    tabs_u2_after = cardio_type_service.list_tab_settings()
    assert next(t for t in tabs_u2_after if t["type"] == "бег")["is_active"] == 0

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    tabs_u1_again = cardio_type_service.list_tab_settings()
    assert next(t for t in tabs_u1_again if t["type"] == "бег")["is_active"] == 0


def test_cardio_workout_count_scoped_to_user(cardio_settings_db, monkeypatch):
    from backend.services import cardio_type_service

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    run_u1 = next(t for t in cardio_type_service.list_tab_settings() if t["type"] == "бег")
    assert run_u1["workout_count"] == 1
    assert next(t for t in cardio_type_service.list_tab_settings() if t["type"] == "бассейн")["workout_count"] == 0
    assert next(t for t in cardio_type_service.list_tab_settings() if t["type"] == "вело")["workout_count"] == 0

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 2)
    run_u2 = next(t for t in cardio_type_service.list_tab_settings() if t["type"] == "бег")
    assert run_u2["workout_count"] == 1


def test_cardio_workout_count_excludes_linked_and_deleted(cardio_settings_db, monkeypatch):
    from backend.services import cardio_service, cardio_type_service

    db_path = cardio_settings_db
    conn = sqlite3.connect(db_path)
    conn.execute(
        "INSERT INTO cardio_workouts (date, type, user_id, deleted_at) VALUES ('2026-02-01', 'бег', 1, '2026-02-02')"
    )
    conn.execute(
        "INSERT INTO cardio_workouts (date, type, user_id) VALUES ('2026-03-01', 'бег', 1)"
    )
    dup_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    conn.execute(
        """
        INSERT INTO workout_source_links
            (user_id, canonical_workout_id, linked_workout_id, link_reason, confidence, created_at)
        VALUES (1, 1, ?, 'duplicate', 'high', '2026-03-01')
        """,
        (dup_id,),
    )
    conn.commit()
    conn.close()

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.database.user_scope.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_type_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.cardio_service.get_current_user_id", lambda: 1)
    assert cardio_service.count_visible_workouts(workout_type="бег") == 1
    run = next(t for t in cardio_type_service.list_tab_settings() if t["type"] == "бег")
    assert run["workout_count"] == 1


@pytest.fixture
def exercise_catalog_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE strength_workouts (
            exercise TEXT, user_id INTEGER
        );
        INSERT INTO strength_workouts VALUES ('Жим A', 1), ('Жим B', 2);
        CREATE TABLE preset_exercises (
            exercise_name TEXT, user_id INTEGER
        );
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY, user_id INTEGER
        );
        CREATE TABLE exercise_set_items (
            set_id INTEGER, exercise_name TEXT
        );
        """
    )
    conn.close()
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)

    def _open():
        return sqlite3.connect(db_path)

    monkeypatch.setattr("backend.database.get_db", _open)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)
    yield db_path


def test_exercise_catalog_lists_only_current_user(exercise_catalog_db, monkeypatch):
    from backend.services import exercise_catalog_service

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr("backend.services.exercise_catalog_service.get_current_user_id", lambda: 1)
    assert exercise_catalog_service.list_all_exercise_names() == ["Жим A"]

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 2)
    monkeypatch.setattr("backend.services.exercise_catalog_service.get_current_user_id", lambda: 2)
    assert exercise_catalog_service.list_all_exercise_names() == ["Жим B"]


def test_migration_v069_rebuilds_composite_pk(tmp_path):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE cardio_type_settings (
            type TEXT PRIMARY KEY,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT
        );
        INSERT INTO cardio_type_settings (type, sort_order) VALUES ('бег', 2);
        """
    )
    _migration_v069_cardio_type_settings_user_scope(conn)
    conn.commit()
    ddl = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='cardio_type_settings'"
    ).fetchone()[0]
    assert "PRIMARY KEY (user_id, type)" in ddl.replace("\n", " ")
    row = conn.execute(
        "SELECT user_id FROM cardio_type_settings WHERE type = 'бег'"
    ).fetchone()
    assert int(row[0]) == DEFAULT_USER_ID
    conn.close()
