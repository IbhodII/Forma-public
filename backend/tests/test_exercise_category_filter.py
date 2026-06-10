# -*- coding: utf-8 -*-
"""Strength vs stretching exercise_category filtering."""
from __future__ import annotations

import json
import sqlite3

import pytest

from database.exercise_category import (
    EXERCISE_CATEGORY_STRENGTH,
    EXERCISE_CATEGORY_STRETCHING,
    run_exercise_category_migration,
)


@pytest.fixture
def category_db(tmp_path, monkeypatch):
    workouts_db = tmp_path / "workouts.db"
    shared_db = tmp_path / "shared.db"

    sc = sqlite3.connect(shared_db)
    sc.executescript(
        """
        CREATE TABLE strength_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            category TEXT,
            exercise_category TEXT NOT NULL DEFAULT 'strength',
            primary_muscles TEXT,
            equipment TEXT,
            is_time_based INTEGER NOT NULL DEFAULT 0
        );
        INSERT INTO strength_exercises (name, category, exercise_category) VALUES
            ('3/4 Sit-Up', 'strength', 'strength'),
            ('Жим лежа', 'strength', 'strength'),
            ('Standing Hamstring Stretch', 'stretching', 'stretching');
        CREATE TABLE stretching_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            original_name TEXT,
            original_description TEXT,
            target_muscle_group TEXT,
            description TEXT,
            images_json TEXT,
            translated INTEGER NOT NULL DEFAULT 0,
            description_translated INTEGER NOT NULL DEFAULT 0,
            exercise_category TEXT NOT NULL DEFAULT 'stretching'
        );
        INSERT INTO stretching_exercises (name, original_name, exercise_category) VALUES
            ('Растяжка задней поверхности бедра', 'Standing Hamstring Stretch', 'stretching');
        """
    )
    sc.commit()
    sc.close()

    wc = sqlite3.connect(workouts_db)
    wc.executescript(
        """
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY,
            exercise TEXT,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        INSERT INTO strength_workouts (exercise, user_id) VALUES ('Жим лежа', 1);
        CREATE TABLE preset_exercises (exercise_name TEXT, user_id INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE exercise_sets (id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY,
            set_id INTEGER,
            exercise_name TEXT,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_exercise_template (exercise TEXT, user_id INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE user_strength_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            exercise_category TEXT NOT NULL DEFAULT 'strength',
            is_archived INTEGER NOT NULL DEFAULT 0,
            created_at TEXT,
            updated_at TEXT
        );
        INSERT INTO user_strength_exercises (user_id, name, exercise_category) VALUES
            (1, 'Присед', 'strength'),
            (1, 'Standing Hamstring Stretch', 'stretching');
        """
    )
    json_path = tmp_path / "exercises.json"
    json_path.write_text(
        json.dumps(
            [
                {"name": "3/4 Sit-Up", "category": "strength"},
                {"name": "Жим лежа", "category": "strength"},
                {"name": "Standing Hamstring Stretch", "category": "stretching"},
            ],
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    wc.execute("ATTACH DATABASE ? AS shared", (str(shared_db),))
    run_exercise_category_migration(
        wc,
        strength_table="shared.strength_exercises",
        stretching_table="shared.stretching_exercises",
        json_path=json_path,
    )
    from database.migrations import _migration_v080_strength_catalog_populate_shared

    wc.execute(
        """
        CREATE TABLE IF NOT EXISTS app_meta (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
        """
    )
    _migration_v080_strength_catalog_populate_shared(wc)
    wc.commit()
    wc.close()

    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", workouts_db)
    monkeypatch.setattr("database.connection.SHARED_DB_PATH", shared_db)
    monkeypatch.setattr("database.db_utils.DB_PATH", workouts_db)

    def _open():
        conn = sqlite3.connect(workouts_db)
        conn.row_factory = sqlite3.Row
        conn.execute("ATTACH DATABASE ? AS shared", (str(shared_db),))
        return conn

    monkeypatch.setattr("backend.database.get_db", _open)
    yield workouts_db, shared_db


def test_migration_removes_unreferenced_english_import(category_db):
  shared_db = category_db[1]
  conn = sqlite3.connect(shared_db)
  try:
      names = {
          row[0]
          for row in conn.execute("SELECT name FROM strength_exercises").fetchall()
      }
  finally:
      conn.close()
  assert "3/4 Sit-Up" not in names
  assert "Жим лежа" in names
  assert "Standing Hamstring Stretch" not in names


def test_strength_catalog_excludes_stretching(category_db, monkeypatch):
    from backend.services import exercise_catalog_service

    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        "backend.services.exercise_catalog_service.get_current_user_id", lambda: 1
    )
    monkeypatch.setattr(
        "backend.services.exercise_catalog_service._ensure_catalog_ready",
        lambda: None,
    )

    names = exercise_catalog_service.list_all_exercise_names()
    assert "Жим лежа" in names
    assert "Присед" in names
    assert "Standing Hamstring Stretch" not in names
    assert "3/4 Sit-Up" not in names
    assert "Растяжка задней поверхности бедра" not in names


def test_stretching_list_excludes_strength(category_db, monkeypatch):
    from backend.services import stretching_service

    rows = stretching_service.list_exercises()
    names = {row["name"] for row in rows}
    assert "Растяжка задней поверхности бедра" in names
    assert "Жим лежа" not in names
