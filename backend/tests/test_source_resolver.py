# -*- coding: utf-8 -*-
"""Unified source resolver v1."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import source_resolver_service
from backend.services.source_taxonomy import (
    METRIC_CALORIES,
    METRIC_HR,
    SOURCE_FIT_IMPORT,
    SOURCE_HEALTH_CONNECT,
    SOURCE_MANUAL,
    SOURCE_POLAR,
)
from backend.services.source_resolver_service import find_duplicate_candidates


SOURCE_SCHEMA = """
CREATE TABLE user_profile (
    id INTEGER PRIMARY KEY,
    source_priority_prefs TEXT
);
INSERT INTO user_profile (id) VALUES (1);

CREATE TABLE cardio_workouts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT,
    distance_km REAL,
    duration_sec INTEGER,
    avg_hr INTEGER,
    max_hr INTEGER,
    calories INTEGER,
    calories_chest INTEGER,
    calories_watch INTEGER,
    data_source TEXT,
    start_time TEXT,
    user_id INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE workout_source_contributions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    cardio_workout_id INTEGER NOT NULL,
    metric TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_provider TEXT,
    origin TEXT NOT NULL DEFAULT 'imported',
    confidence TEXT,
    external_ref TEXT NOT NULL DEFAULT '',
    value_snapshot_json TEXT,
    is_effective INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    UNIQUE(cardio_workout_id, metric, source_type, external_ref)
);

CREATE TABLE workout_source_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    canonical_workout_id INTEGER NOT NULL,
    linked_workout_id INTEGER NOT NULL,
    link_reason TEXT NOT NULL,
    confidence TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(canonical_workout_id, linked_workout_id)
);

CREATE TABLE workout_heart_rate (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_workout_id INTEGER NOT NULL,
    elapsed_sec INTEGER NOT NULL,
    heart_rate INTEGER NOT NULL
);

CREATE TABLE gps_tracks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_workout_id INTEGER NOT NULL,
    source TEXT
);

CREATE TABLE workout_sensors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cardio_workout_id INTEGER NOT NULL
);
"""


@pytest.fixture
def source_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(SOURCE_SCHEMA)
    conn.commit()
    conn.close()

    def get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr("backend.services.source_resolver_service.get_db", get_db)
    monkeypatch.setattr("backend.database.db_utils.get_current_user_id", lambda: 1)
    return db_path


def _insert_workout(conn, **kwargs):
    defaults = {
        "date": "2026-05-20",
        "type": "вело",
        "distance_km": 30.0,
        "duration_sec": 3600,
        "avg_hr": 140,
        "data_source": "manual",
        "user_id": 1,
    }
    defaults.update(kwargs)
    cols = ", ".join(defaults.keys())
    placeholders = ", ".join("?" * len(defaults))
    cur = conn.execute(
        f"INSERT INTO cardio_workouts ({cols}) VALUES ({placeholders})",
        tuple(defaults.values()),
    )
    conn.commit()
    return int(cur.lastrowid)


def test_register_contribution_picks_polar_over_hc(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(conn, data_source="manual")
    conn.close()

    source_resolver_service.register_contribution(
        wid,
        METRIC_HR,
        source_type=SOURCE_HEALTH_CONNECT,
        source_provider="health_connect",
        origin="synced",
        value_snapshot={"avg_hr": 130},
    )
    source_resolver_service.register_contribution(
        wid,
        METRIC_HR,
        source_type=SOURCE_POLAR,
        source_provider="polar_flow",
        origin="synced",
        value_snapshot={"avg_hr": 145},
    )

    view = source_resolver_service.resolve_workout_view(wid)
    hr = next(m for m in view["metrics"] if m["metric"] == METRIC_HR)
    assert hr["effective_source"] == SOURCE_POLAR
    assert SOURCE_HEALTH_CONNECT in hr["fallback_sources"]


def test_should_block_hc_for_manual_workout(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(conn, data_source="manual")
    conn.close()

    blocked, existing_id, reason = source_resolver_service.should_block_hc_write(
        "2026-05-20",
        "вело",
    )
    assert blocked is True
    assert existing_id == wid
    assert "protected" in (reason or "")


def test_detect_calories_conflict(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(conn, data_source="manual")
    conn.close()

    source_resolver_service.register_contribution(
        wid,
        METRIC_CALORIES,
        source_type=SOURCE_POLAR,
        value_snapshot={"calories": 420},
    )
    source_resolver_service.register_contribution(
        wid,
        METRIC_CALORIES,
        source_type=SOURCE_HEALTH_CONNECT,
        value_snapshot={"calories": 380},
    )

    conflicts = source_resolver_service.detect_conflicts(wid)
    assert len(conflicts) == 1
    assert conflicts[0]["metric"] == METRIC_CALORIES


def test_link_workouts_hides_duplicate(source_db):
    conn = sqlite3.connect(source_db)
    canonical = _insert_workout(conn, data_source="polar_historical")
    linked = _insert_workout(conn, data_source="fit_coospo", distance_km=29.8)
    conn.close()

    source_resolver_service.link_workouts(canonical, linked, "same_start_time")
    assert source_resolver_service.is_linked_duplicate(linked) is True
    assert source_resolver_service.is_linked_duplicate(canonical) is False


def test_find_duplicate_by_start_time(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(
        conn,
        start_time="2026-05-20T08:00:00",
        duration_sec=3600,
        data_source="fit_coospo",
    )
    conn.close()

    matches = find_duplicate_candidates(
        date="2026-05-20",
        workout_type="вело",
        start_time="2026-05-20T08:00:00",
        duration_sec=3600,
    )
    assert len(matches) == 1
    assert matches[0]["workout_id"] == wid
    assert matches[0]["confidence"] == "high"


def test_priority_prefs_override(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(conn)
    conn.execute(
        """
        UPDATE user_profile SET source_priority_prefs = ?
        WHERE id = 1
        """,
        (
            '{"hr":["health_connect","polar","fit_import","watch"],'
            '"workout_calories":["polar","fit_import","health_connect"],'
            '"steps":["health_connect","phone"],'
            '"weight":["manual","health_connect"],'
            '"gps":["fit_import","polar"],'
            '"metadata":["manual","imported"]}',
        ),
    )
    conn.commit()
    conn.close()

    source_resolver_service.register_contribution(
        wid,
        METRIC_HR,
        source_type=SOURCE_POLAR,
        value_snapshot={"avg_hr": 150},
    )
    source_resolver_service.register_contribution(
        wid,
        METRIC_HR,
        source_type=SOURCE_HEALTH_CONNECT,
        value_snapshot={"avg_hr": 130},
    )

    view = source_resolver_service.resolve_workout_view(wid)
    hr = next(m for m in view["metrics"] if m["metric"] == METRIC_HR)
    assert hr["effective_source"] == SOURCE_HEALTH_CONNECT


def test_workout_calories_pref_key_maps_to_calories_metric(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(conn, calories_chest=450)
    conn.execute(
        """
        UPDATE user_profile SET source_priority_prefs = ?
        WHERE id = 1
        """,
        (
            '{"hr":["polar","fit_import","health_connect","watch"],'
            '"workout_calories":["health_connect","polar","fit_import"],'
            '"steps":["health_connect","phone"],'
            '"weight":["manual","health_connect"],'
            '"gps":["fit_import","polar"],'
            '"metadata":["manual","imported"]}',
        ),
    )
    conn.commit()
    conn.close()

    source_resolver_service.register_contribution(
        wid,
        "calories",
        source_type=SOURCE_POLAR,
        value_snapshot={"calories": 400},
    )
    source_resolver_service.register_contribution(
        wid,
        "calories",
        source_type=SOURCE_HEALTH_CONNECT,
        value_snapshot={"calories": 350},
    )

    view = source_resolver_service.resolve_workout_view(wid)
    cal = next(m for m in view["metrics"] if m["metric"] == "calories")
    assert cal["effective_source"] == SOURCE_HEALTH_CONNECT


def test_legacy_row_backfill(source_db):
    conn = sqlite3.connect(source_db)
    wid = _insert_workout(
        conn,
        data_source="fit_coospo",
        calories_chest=500,
        avg_hr=155,
    )
    conn.execute(
        "INSERT INTO workout_heart_rate (cardio_workout_id, elapsed_sec, heart_rate) VALUES (?, 0, 120)",
        (wid,),
    )
    conn.execute(
        "INSERT INTO gps_tracks (cardio_workout_id, source) VALUES (?, ?)",
        (wid, "fit_coospo"),
    )
    conn.commit()
    conn.close()

    view = source_resolver_service.resolve_workout_view(wid)
    assert view["primary_source_type"] == SOURCE_FIT_IMPORT
    metrics = {m["metric"]: m for m in view["metrics"]}
    assert metrics[METRIC_HR]["effective_source"] == SOURCE_FIT_IMPORT
