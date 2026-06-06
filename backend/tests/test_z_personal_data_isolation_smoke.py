# -*- coding: utf-8 -*-
"""
Smoke-test изоляции личных данных (сценарии A/B перед сборкой exe).

Имитирует:
  A: набор упражнений + пресет + настройки кардио
  B: данные A не видны; системные типы кардио есть; счётчики = 0
  A снова: данные A на месте
"""
from __future__ import annotations

import sqlite3
from typing import Callable

import pytest

from database.migrations import EXERCISE_SET_DEFAULT_FROM, _migration_v069_cardio_type_settings_user_scope
from utils.constants import CARDIO_ARCHIVE_TYPE, CARDIO_DB_BIKE

USER_A = 1
USER_B = 2
WORKOUT_TYPE_A = "SmokeTypeA"
PRESET_A = "SmokePresetA"
EX_A = "Жим smoke A"


def _patch_user(monkeypatch, user_id: int) -> None:
    uid_fn: Callable[[], int] = lambda: user_id
    targets = (
        "backend.database.db_utils.get_current_user_id",
        "backend.database.user_scope.get_current_user_id",
        "backend.services.exercise_service.get_current_user_id",
        "backend.services.preset_service.get_current_user_id",
        "backend.services.cardio_type_service.get_current_user_id",
        "backend.services.cardio_service.get_current_user_id",
        "backend.services.exercise_catalog_service.get_current_user_id",
    )
    for t in targets:
        try:
            monkeypatch.setattr(t, uid_fn)
        except AttributeError:
            pass


@pytest.fixture
def isolation_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        f"""
        CREATE TABLE exercise_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            workout_type TEXT NOT NULL,
            set_name TEXT,
            effective_from TEXT NOT NULL,
            effective_to TEXT,
            is_default INTEGER DEFAULT 0,
            UNIQUE(user_id, workout_type, effective_from)
        );
        CREATE TABLE exercise_set_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            set_id INTEGER NOT NULL,
            exercise_order INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            created_at TEXT,
            updated_at TEXT,
            sync_status TEXT DEFAULT 'synced',
            UNIQUE(user_id, name)
        );
        CREATE TABLE preset_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            preset_id INTEGER NOT NULL,
            exercise_name TEXT NOT NULL,
            exercise_order INTEGER DEFAULT 0,
            default_sets INTEGER DEFAULT 4,
            default_reps TEXT,
            default_weight REAL,
            notes TEXT,
            is_bodyweight INTEGER DEFAULT 0
        );
        CREATE TABLE preset_sets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            preset_exercise_id INTEGER NOT NULL,
            set_number INTEGER NOT NULL,
            reps INTEGER NOT NULL,
            weight REAL,
            duration_sec INTEGER,
            is_warmup INTEGER DEFAULT 0
        );
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            date TEXT,
            workout_title TEXT,
            exercise TEXT,
            preset_id INTEGER
        );
        CREATE TABLE cardio_type_settings (
            type TEXT PRIMARY KEY,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT,
            user_id INTEGER,
            deleted_at TEXT
        );
        CREATE TABLE workout_source_links (
            user_id INTEGER NOT NULL,
            canonical_workout_id INTEGER NOT NULL,
            linked_workout_id INTEGER NOT NULL,
            link_reason TEXT,
            confidence TEXT,
            created_at TEXT,
            UNIQUE(canonical_workout_id, linked_workout_id)
        );
        CREATE TABLE IF NOT EXISTS all_exercises (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            created_at TEXT
        );
        """
    )
    _migration_v069_cardio_type_settings_user_scope(conn)
    conn.commit()
    conn.close()

    def _open(*, attach: bool = True):
        c = sqlite3.connect(db_path, check_same_thread=False)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.database.get_db", _open)
    monkeypatch.setattr("backend.database.db_utils.open_db", _open)
    monkeypatch.setattr("database.connection.open_db", _open)
    for mod in (
        "cardio_service",
        "cardio_type_service",
        "preset_service",
        "exercise_catalog_service",
    ):
        monkeypatch.setattr(f"backend.services.{mod}.get_db", _open)
    monkeypatch.setattr("database.connection.WORKOUTS_DB_PATH", db_path)
    monkeypatch.setattr("database.db_utils.DB_PATH", db_path)
    monkeypatch.setattr("database.migrations.ensure_db_schema", lambda: None)
    monkeypatch.setattr(
        "backend.services.exercise_catalog_service._ensure_catalog_ready",
        lambda: None,
    )
    monkeypatch.setattr(
        "backend.services.forma_sync.change_tracker.mark_local_change",
        lambda *a, **k: None,
    )
    yield db_path


def test_smoke_account_isolation_ab_cycle(isolation_db, monkeypatch):
    from database import db_utils
    from database.db_utils import save_exercise_set
    from backend.services import (
        cardio_service,
        cardio_type_service,
        exercise_catalog_service,
        preset_service,
    )

    # --- Account A: exercise set + presets (без полного ensure_db_schema) ---
    _patch_user(monkeypatch, USER_A)
    set_id = save_exercise_set(
        WORKOUT_TYPE_A,
        EXERCISE_SET_DEFAULT_FROM,
        [EX_A],
        set_name="Smoke set A",
    )
    preset_workout = preset_service.ensure_preset_for_workout_type(
        WORKOUT_TYPE_A,
        [EX_A],
        is_active=True,
        sync_exercises=True,
    )
    preset_id = int(preset_workout["id"]) if preset_workout else None
    assert set_id > 0
    assert preset_id is not None

    preset_b = preset_service.create_preset(
        PRESET_A,
        [{"exercise_name": EX_A, "default_sets": 3}],
    )
    assert preset_b["name"] == PRESET_A

    tabs_a = cardio_type_service.list_tab_settings()
    types_a = {t["type"] for t in tabs_a}
    assert types_a == {"бассейн", CARDIO_DB_BIKE, CARDIO_ARCHIVE_TYPE}
    for t in tabs_a:
        assert t["workout_count"] == cardio_service.count_visible_workouts(
            workout_type=t["type"]
        )
        assert t["workout_count"] == 0, f"no cardio rows yet: {t}"

    conn_a = sqlite3.connect(isolation_db)
    conn_a.execute(
        "INSERT INTO cardio_workouts (date, type, user_id) VALUES ('2026-06-01', ?, ?)",
        (CARDIO_DB_BIKE, USER_A),
    )
    conn_a.commit()
    conn_a.close()
    bike_a = next(
        t for t in cardio_type_service.list_tab_settings() if t["type"] == CARDIO_DB_BIKE
    )
    assert bike_a["workout_count"] == 1
    assert cardio_service.count_visible_workouts(workout_type="бег") == 0
    assert cardio_service.count_visible_workouts(workout_type="бассейн") == 0

    names_a = exercise_catalog_service.list_all_exercise_names()
    assert EX_A in names_a
    presets_a = preset_service.list_presets()
    assert any(p["name"] == WORKOUT_TYPE_A for p in presets_a)
    assert any(p["name"] == PRESET_A for p in presets_a)
    assert len(db_utils.get_all_sets(WORKOUT_TYPE_A)) >= 1

    # --- Account B ---
    _patch_user(monkeypatch, USER_B)
    assert db_utils.get_all_sets(WORKOUT_TYPE_A) == []
    assert preset_service.get_preset_by_name(WORKOUT_TYPE_A) is None
    assert preset_service.get_preset_by_name(PRESET_A) is None
    assert exercise_catalog_service.list_all_exercise_names() == []

    tabs_b = cardio_type_service.list_tab_settings()
    assert len(tabs_b) == 3
    assert {t["type"] for t in tabs_b} == {"бассейн", CARDIO_DB_BIKE, CARDIO_ARCHIVE_TYPE}
    for t in tabs_b:
        assert t["workout_count"] == 0
    assert cardio_service.count_visible_workouts(workout_type=CARDIO_DB_BIKE) == 0
    assert cardio_service.count_visible_workouts(workout_type="бег") == 0
    assert cardio_service.count_visible_workouts(workout_type="бассейн") == 0

    # B archives run tab — must not affect A
    cardio_type_service.archive_tab_type(CARDIO_ARCHIVE_TYPE)
    run_b = next(t for t in cardio_type_service.list_tab_settings() if t["type"] == CARDIO_ARCHIVE_TYPE)
    assert run_b["is_active"] == 0

    # --- Account A again ---
    _patch_user(monkeypatch, USER_A)
    assert len(db_utils.get_all_sets(WORKOUT_TYPE_A)) >= 1
    assert preset_service.get_preset_by_name(PRESET_A) is not None
    assert preset_service.get_preset_by_name(WORKOUT_TYPE_A) is not None
    assert EX_A in exercise_catalog_service.list_all_exercise_names()

    run_a = next(
        t for t in cardio_type_service.list_tab_settings() if t["type"] == CARDIO_ARCHIVE_TYPE
    )
    assert run_a["is_active"] == 1, "B must not change A cardio tab settings"
    assert cardio_service.count_visible_workouts(workout_type=CARDIO_DB_BIKE) == 1
