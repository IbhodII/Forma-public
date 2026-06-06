# -*- coding: utf-8 -*-
import sqlite3

import pytest

from backend.services import body_service


@pytest.fixture
def body_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE body_metrics (
            date TEXT PRIMARY KEY,
            weight_kg REAL,
            body_fat_percent REAL,
            muscle_mass_kg REAL,
            waist_cm REAL,
            hips_cm REAL
        )
        """
    )
    conn.execute(
        "INSERT INTO body_metrics (date, weight_kg, waist_cm) VALUES (?, ?, ?)",
        ("2026-05-20", 72.0, 78.0),
    )
    conn.execute(
        "INSERT INTO body_metrics (date, weight_kg) VALUES (?, ?)",
        ("2026-05-27", 71.5),
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(body_service, "get_db", _get_db)
    monkeypatch.setattr(body_service, "_load_daily_weight_map", lambda: {})
    return db_path


def test_get_field_reference_per_field_latest(body_db):
    ref = body_service.get_field_reference()
    assert ref["fields"]["weight_kg"] == pytest.approx(71.5)
    assert ref["field_dates"]["weight_kg"] == "2026-05-27"
    assert ref["fields"]["waist_cm"] == pytest.approx(78.0)
    assert ref["field_dates"]["waist_cm"] == "2026-05-20"
