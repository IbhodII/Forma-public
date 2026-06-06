# -*- coding: utf-8 -*-
"""Regression tests for bike settings options payload."""
from __future__ import annotations

import sqlite3

from backend.services import bike_settings_service


def _connect(db_path):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn


def test_bike_settings_deduplicates_reference_options(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = _connect(db_path)
    try:
        conn.execute("ATTACH DATABASE ':memory:' AS shared")
        conn.executescript(
            """
            CREATE TABLE bike_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                bike_weight_kg REAL,
                rider_weight_kg REAL,
                tire_type TEXT,
                tire_width_mm INTEGER,
                wheel_size_inch REAL,
                default_route_surface TEXT,
                created_at TEXT,
                updated_at TEXT
            );
            CREATE TABLE daily_weight (date TEXT PRIMARY KEY, weight_kg REAL);
            CREATE TABLE body_metrics (date TEXT PRIMARY KEY, weight_kg REAL);
            CREATE TABLE shared.tire_coefficients (
                tire_type TEXT, crr REAL, description TEXT
            );
            CREATE TABLE shared.surface_multipliers (
                surface TEXT, crr_multiplier REAL, description TEXT
            );
            """
        )
        for _ in range(10):
            conn.execute(
                "INSERT INTO shared.tire_coefficients VALUES ('road_slick', 0.003, 'road')"
            )
            conn.execute(
                "INSERT INTO shared.surface_multipliers VALUES ('asphalt', 1.0, 'asphalt')"
            )
        conn.commit()
    finally:
        conn.close()

    def get_db():
        c = _connect(db_path)
        c.execute("ATTACH DATABASE ':memory:' AS shared")
        c.executescript(
            """
            CREATE TABLE shared.tire_coefficients (
                tire_type TEXT, crr REAL, description TEXT
            );
            CREATE TABLE shared.surface_multipliers (
                surface TEXT, crr_multiplier REAL, description TEXT
            );
            """
        )
        for _ in range(10):
            c.execute("INSERT INTO shared.tire_coefficients VALUES ('road_slick', 0.003, 'road')")
            c.execute("INSERT INTO shared.surface_multipliers VALUES ('asphalt', 1.0, 'asphalt')")
        return c

    monkeypatch.setattr(bike_settings_service, "get_db", get_db)

    settings = bike_settings_service.get_or_create_bike_settings()

    assert len(settings["tire_options"]) == 4
    assert len(settings["surface_options"]) == 4
    assert {o["tire_type"] for o in settings["tire_options"]} == bike_settings_service.TIRE_TYPES
    assert {o["surface"] for o in settings["surface_options"]} == bike_settings_service.ROUTE_SURFACES
