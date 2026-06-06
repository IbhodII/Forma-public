# -*- coding: utf-8 -*-
"""Тесты оценки мощности и CdA."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import bike_power_service
from utils.power_estimation import (
    average_estimated_power_from_sensor_rows,
    compute_cda,
    estimate_power,
    frontal_area_barry_m2,
)


def test_estimate_power_basic_vs_aero():
    """С аэродинамикой на высокой скорости мощность выше, чем без неё."""
    v = 10.0  # m/s ~36 km/h
    basic = estimate_power(v, 0.0, 85.0, 0.004, cda=None)
    advanced = estimate_power(v, 0.0, 85.0, 0.004, cda=0.35)
    assert advanced > basic > 0


def test_advanced_model_differs_from_basic_on_rows():
    rows = [
        {"elapsed_sec": 0, "speed_kmh": 30.0, "elevation_m": 100.0},
        {"elapsed_sec": 1, "speed_kmh": 32.0, "elevation_m": 100.0},
        {"elapsed_sec": 2, "speed_kmh": 31.0, "elevation_m": 100.0},
    ]
    basic = average_estimated_power_from_sensor_rows(
        rows, total_mass_kg=85.0, crr=0.004, model="basic"
    )
    adv = average_estimated_power_from_sensor_rows(
        rows, total_mass_kg=85.0, crr=0.004, cda=0.35, model="advanced"
    )
    assert basic is not None and adv is not None
    assert adv > basic


def test_barry_frontal_area_positive():
    a = frontal_area_barry_m2(75.0, 180.0)
    assert 0.35 < a < 0.55
    cda = compute_cda(75.0, 180.0, cd=0.88)
    assert 0.30 < cda < 0.50


def test_real_power_not_overwritten(tmp_path, monkeypatch):
    """Если в датчиках есть power_watts > 0, оценка не пишется."""
    db_path = tmp_path / "test.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY,
            type TEXT,
            has_power_data INTEGER DEFAULT 0,
            avg_power_watts REAL,
            estimated_avg_power_watts REAL,
            power_source TEXT,
            avg_power REAL,
            max_power REAL
        );
        CREATE TABLE workout_sensors (
            cardio_workout_id INTEGER,
            elapsed_sec INTEGER,
            speed_kmh REAL,
            elevation_m REAL,
            power_watts REAL
        );
        CREATE TABLE bike_settings (
            id INTEGER PRIMARY KEY,
            user_id INTEGER,
            bike_weight_kg REAL,
            rider_weight_kg REAL,
            tire_type TEXT,
            tire_width_mm INTEGER,
            wheel_size_inch REAL,
            default_route_surface TEXT,
            created_at TEXT,
            updated_at TEXT
        );
        CREATE TABLE body_metrics (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE daily_weight (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY,
            sex TEXT,
            date_of_birth TEXT,
            height_cm REAL,
            updated_at TEXT
        );
        INSERT INTO cardio_workouts (id, type) VALUES (1, 'bike');
        INSERT INTO workout_sensors VALUES
            (1, 0, 25.0, 100.0, 200.0),
            (1, 1, 26.0, 100.0, 210.0);
        INSERT INTO bike_settings (
            user_id, bike_weight_kg, rider_weight_kg, tire_type,
            tire_width_mm, wheel_size_inch, default_route_surface,
            created_at, updated_at
        ) VALUES (1, 10, 80, 'road_slick', 25, 28, 'asphalt', 'x', 'x');
        INSERT INTO user_profile (id, sex, height_cm, updated_at)
        VALUES (1, 'male', 180, 'x');
        """
    )

    import backend.database as db_mod

    monkeypatch.setattr(db_mod, "get_db", lambda: conn)

    assert bike_power_service._try_save_estimated_power(conn, 1)
    row = conn.execute(
        "SELECT power_source, avg_power_watts, estimated_avg_power_watts FROM cardio_workouts WHERE id=1"
    ).fetchone()
    assert row["power_source"] == bike_power_service.POWER_SOURCE_REAL
    assert row["avg_power_watts"] == 205.0
    assert row["estimated_avg_power_watts"] is None


def test_get_rider_cda_with_profile(tmp_path, monkeypatch):
    db_path = tmp_path / "test2.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE body_metrics (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE daily_weight (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY, sex TEXT, date_of_birth TEXT, height_cm REAL, updated_at TEXT
        );
        CREATE TABLE bike_settings (
            id INTEGER PRIMARY KEY, user_id INTEGER, bike_weight_kg REAL,
            rider_weight_kg REAL, tire_type TEXT, tire_width_mm INTEGER,
            wheel_size_inch REAL, default_route_surface TEXT, created_at TEXT, updated_at TEXT
        );
        INSERT INTO body_metrics VALUES ('2025-01-01', 75.0, 15.0);
        INSERT INTO user_profile (id, sex, height_cm, updated_at) VALUES (1, 'male', 180, 'x');
        INSERT INTO bike_settings (
            user_id, bike_weight_kg, rider_weight_kg, tire_type,
            tire_width_mm, wheel_size_inch, default_route_surface, created_at, updated_at
        ) VALUES (1, 10, NULL, 'road_slick', 25, 28, 'asphalt', 'x', 'x');
        """
    )
    import backend.database as db_mod

    monkeypatch.setattr(db_mod, "get_db", lambda: conn)
    settings = {"tire_type": "road_slick", "rider_weight_kg": None, "bike_weight_kg": 10.0}
    cda = bike_power_service._get_rider_cda(conn, settings)
    assert cda is not None and cda > 0.2


def test_get_rider_cda_without_height_returns_none(tmp_path):
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE body_metrics (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE daily_weight (date TEXT, weight_kg REAL, body_fat_percent REAL);
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY, sex TEXT, date_of_birth TEXT, height_cm REAL, updated_at TEXT
        );
        INSERT INTO body_metrics VALUES ('2025-01-01', 75.0, NULL);
        INSERT INTO user_profile (id, sex, updated_at) VALUES (1, 'male', 'x');
        """
    )
    settings = {"tire_type": "road_slick", "rider_weight_kg": 75.0, "bike_weight_kg": 10.0}
    assert bike_power_service._get_rider_cda(conn, settings) is None
