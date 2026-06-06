# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

import pytest

from backend.services import analytics_service, calibration_service
from database import migrations


@pytest.fixture
def calibration_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.executescript(
        """
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY,
            calibration_factor REAL DEFAULT 1.0,
            last_calibration_date TEXT
        );
        INSERT INTO user_profile (id, calibration_factor) VALUES (1, 1.0);

        CREATE TABLE daily_weight (
            date TEXT PRIMARY KEY,
            weight_kg REAL NOT NULL
        );

        CREATE TABLE calorie_calibration_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            calculated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
            window_start TEXT NOT NULL,
            window_end TEXT NOT NULL,
            days INTEGER NOT NULL,
            factor REAL NOT NULL,
            predicted_deficit_kcal REAL NOT NULL,
            observed_deficit_kcal REAL NOT NULL,
            total_intake_kcal REAL NOT NULL,
            total_predicted_expenditure_kcal REAL NOT NULL,
            weight_measurements INTEGER NOT NULL DEFAULT 0,
            food_days INTEGER NOT NULL DEFAULT 0,
            bracelet_days INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'ok',
            note TEXT
        );
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(calibration_service, "get_db", _get_db)
    monkeypatch.setattr(calibration_service, "get_current_user_id", lambda: 1)
    yield db_path


def test_calibration_factor_uses_observed_vs_predicted_deficit(calibration_db, monkeypatch):
    today = date(2026, 6, 4)
    monkeypatch.setattr(calibration_service, "_today", lambda: today)

    conn = calibration_service.get_db()
    start = today - timedelta(days=13)
    for offset in range(14):
        weight = 92.4 - (offset / 13.0)
        conn.execute(
            "INSERT INTO daily_weight (date, weight_kg) VALUES (?, ?)",
            ((start + timedelta(days=offset)).isoformat(), weight),
        )
    conn.commit()
    conn.close()

    monkeypatch.setattr(calibration_service, "_sum_food_calories", lambda *args, **kwargs: 35000.0)
    monkeypatch.setattr(calibration_service, "_food_logged_days", lambda *args, **kwargs: 14)
    monkeypatch.setattr(calibration_service, "_bracelet_logged_days", lambda *args, **kwargs: 14)

    def _fake_range(*args, **kwargs):
        per_day = 45000.0 / 14.0
        return {
            (start + timedelta(days=i)).isoformat(): {
                "calculation_mode": "bracelet",
                "total_expenditure": per_day,
            }
            for i in range(14)
        }

    monkeypatch.setattr(analytics_service, "get_daily_expenditure_range", _fake_range)

    factor = calibration_service.calculate_calibration_factor(14, phase="cut")

    assert factor == pytest.approx(0.77, abs=0.001)

    conn = calibration_service.get_db()
    try:
        row = conn.execute(
            "SELECT factor, predicted_deficit_kcal, observed_deficit_kcal FROM calorie_calibration_history"
        ).fetchone()
    finally:
        conn.close()
    assert row["factor"] == pytest.approx(0.77, abs=0.001)
    assert row["predicted_deficit_kcal"] == pytest.approx(10000.0)
    assert row["observed_deficit_kcal"] == pytest.approx(7700.0)


def test_corrected_activity_calibrates_after_chest_priority_replacement():
    corrected = analytics_service._build_corrected_from_parts(
        "2026-06-04",
        {"total": 2450, "source": "manual"},
        (260, 182, 182, []),
        prefer_chest=True,
        calibration=0.77,
    )

    assert corrected["workout_effective_total"] == 182
    assert corrected["corrected_activity"] == round((2450 - 260 + 182) * 0.77)


def test_v074_migration_resets_legacy_calibration_factor():
    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE user_profile (
            id INTEGER PRIMARY KEY,
            calibration_factor REAL DEFAULT 1.0,
            last_calibration_date TEXT
        )
        """
    )
    conn.execute(
        "INSERT INTO user_profile (id, calibration_factor, last_calibration_date) VALUES (1, 1.5, '2026-06-03')"
    )

    migrations._migration_v074_calorie_calibration_history(conn)

    row = conn.execute(
        "SELECT calibration_factor, last_calibration_date FROM user_profile WHERE id = 1"
    ).fetchone()
    assert row[0] == 1.0
    assert row[1] is None
    assert conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='calorie_calibration_history'"
    ).fetchone()
