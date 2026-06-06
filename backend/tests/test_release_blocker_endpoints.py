# -*- coding: utf-8 -*-
"""Regression: POST /food/products, POST /body/metrics, POST /weight/daily."""
from __future__ import annotations

import sqlite3
from datetime import date, timedelta

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from backend.database.db_utils import _repair_shared_legacy_columns
from backend.schemas.models import BodyMetricCreate
from backend.services import body_service
from backend.services import food_service
from utils.micro_nutrients import MICRO_KEYS


def _micro_cols_ddl() -> str:
    return ", ".join(f"{k} REAL DEFAULT 0" for k in MICRO_KEYS)


@pytest.fixture
def food_db_legacy(tmp_path, monkeypatch):
    """Legacy shared.food_products without default_portion_g (pre-v049)."""
    main_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"

    shared = sqlite3.connect(shared_path)
    shared.execute(
        f"""
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            protein REAL, fat REAL, carbs REAL, calories REAL,
            fiber_g REAL DEFAULT 0,
            {_micro_cols_ddl()},
            unit TEXT DEFAULT 'g',
            is_composite INTEGER DEFAULT 0,
            is_alcohol INTEGER DEFAULT 0,
            external_id TEXT
        )
        """
    )
    shared.execute(
        """
        CREATE TABLE food_product_components (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            product_id INTEGER NOT NULL,
            component_product_id INTEGER NOT NULL,
            quantity REAL NOT NULL
        )
        """
    )
    shared.commit()
    shared.close()

    main = sqlite3.connect(main_path)
    main.row_factory = sqlite3.Row
    main.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
    _repair_shared_legacy_columns(main)
    main.commit()
    main.close()

    def _get_db():
        c = sqlite3.connect(main_path)
        c.row_factory = sqlite3.Row
        c.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
        _repair_shared_legacy_columns(c)
        return c

    monkeypatch.setattr(food_service, "get_db", _get_db)
    monkeypatch.setattr(food_service, "get_current_user_id", lambda: 1)
    yield


def test_create_product_legacy_schema_and_duplicate(food_db_legacy):
    created = food_service.create_product(
        {
            "name": "Regression Product",
            "protein": 10.0,
            "fat": 5.0,
            "carbs": 20.0,
            "calories": 165.0,
        }
    )
    assert created["name"] == "Regression Product"
    assert int(created["id"]) > 0

    listed = food_service.find_products_by_name("Regression")
    assert any(p["name"] == "Regression Product" for p in listed)

    with pytest.raises(HTTPException) as exc:
        food_service.create_product(
            {
                "name": "Regression Product",
                "protein": 1.0,
                "fat": 1.0,
                "carbs": 1.0,
                "calories": 10.0,
            }
        )
    assert exc.value.status_code == 409


@pytest.fixture
def food_db_broken_id(tmp_path, monkeypatch):
    """Real-world legacy: id INT column without PRIMARY KEY / AUTOINCREMENT."""
    main_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"

    shared = sqlite3.connect(shared_path)
    shared.execute(
        f"""
        CREATE TABLE food_products (
            id INT,
            name TEXT NOT NULL UNIQUE,
            protein REAL, fat REAL, carbs REAL, calories REAL,
            fiber_g REAL DEFAULT 0,
            {_micro_cols_ddl()},
            unit TEXT DEFAULT 'g',
            is_composite INTEGER DEFAULT 0,
            is_alcohol INTEGER DEFAULT 0,
            external_id TEXT,
            default_portion_g REAL
        )
        """
    )
    shared.execute(
        "INSERT INTO food_products (id, name, protein, fat, carbs, calories) "
        "VALUES (1, 'Existing', 1, 1, 1, 10)"
    )
    shared.commit()
    shared.close()

    def _get_db():
        c = sqlite3.connect(main_path)
        c.row_factory = sqlite3.Row
        c.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
        return c

    monkeypatch.setattr(food_service, "get_db", _get_db)
    monkeypatch.setattr(food_service, "get_current_user_id", lambda: 1)
    yield


def test_create_product_assigns_id_when_table_has_no_autoincrement(food_db_broken_id):
    created = food_service.create_product(
        {
            "name": "Broken Schema Product",
            "protein": 11.0,
            "fat": 4.0,
            "carbs": 15.0,
            "calories": 140.0,
        }
    )
    assert int(created["id"]) == 2
    assert food_service.list_products("Broken")[0]["id"] == 2


def test_save_daily_weight_upserts_same_date(tmp_path, monkeypatch):
    from backend.database import daily_weight_store as dws

    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE daily_weight (
            date TEXT PRIMARY KEY,
            weight_kg REAL NOT NULL,
            body_fat_percent REAL,
            source TEXT,
            user_id INTEGER
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(dws, "get_db", _get_db)
    monkeypatch.setattr(dws, "get_current_user_id", lambda: 1)

    dws.save_daily_weight("2026-06-01", 80.0, 15.0, source="manual")
    dws.save_daily_weight("2026-06-01", 81.5, None, keep_existing_fat=True, source="manual")

    conn = _get_db()
    try:
        row = conn.execute(
            "SELECT weight_kg, body_fat_percent, user_id FROM daily_weight WHERE date = ?",
            ("2026-06-01",),
        ).fetchone()
    finally:
        conn.close()

    assert float(row["weight_kg"]) == pytest.approx(81.5)
    assert float(row["body_fat_percent"]) == pytest.approx(15.0)
    assert int(row["user_id"]) == 1


@pytest.fixture()
def body_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE body_metrics (
            user_id INTEGER NOT NULL DEFAULT 1,
            date TEXT NOT NULL,
            weight_kg REAL,
            body_fat_percent REAL,
            waist_cm REAL,
            PRIMARY KEY (user_id, date)
        )
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(body_service, "get_db", _get_db)
    monkeypatch.setattr(body_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        "backend.services.forma_sync.change_tracker.mark_local_change",
        lambda *args, **kwargs: None,
    )
    yield db_path


def test_body_metric_create_accepts_today_and_rejects_future(body_db):
    today = date.today().isoformat()
    future = (date.today() + timedelta(days=1)).isoformat()

    payload = BodyMetricCreate(date=today, allow_replace=True, waist_cm=82.0)
    assert body_service.create_metric(payload.to_service_payload()) == "ok"

    items, total = body_service.get_metrics(10, 0)
    assert total >= 1
    assert any(str(r["date"])[:10] == today for r in items)

    control, control_total = body_service.get_metrics(10, 0, control_day_only=True)
    assert control_total <= total

    with pytest.raises(ValidationError):
        BodyMetricCreate(date=future, allow_replace=True, waist_cm=82.0)


def test_body_metrics_history_filters_weight_only_rows(body_db):
    rows = [
        BodyMetricCreate(date="2026-06-01", allow_replace=True, weight_kg=80.0),
        BodyMetricCreate(date="2026-06-02", allow_replace=True, weight_kg=79.5, waist_cm=82.0),
        BodyMetricCreate(date="2026-06-03", allow_replace=True, waist_cm=81.0),
    ]
    for payload in rows:
        assert body_service.create_metric(payload.to_service_payload()) == "ok"

    all_items, all_total = body_service.get_metrics(10, 0)
    filtered, filtered_total = body_service.get_metrics(
        10,
        0,
        body_measurements_only=True,
    )

    assert all_total == 3
    assert filtered_total == 2
    assert {str(r["date"])[:10] for r in filtered} == {"2026-06-02", "2026-06-03"}
    assert "2026-06-01" in {str(r["date"])[:10] for r in all_items}


def test_body_metric_delete_is_scoped_to_current_user(body_db):
    conn = sqlite3.connect(body_db)
    try:
        conn.execute(
            "INSERT INTO body_metrics (user_id, date, waist_cm) VALUES (?, ?, ?)",
            (1, "2026-06-04", 82.0),
        )
        conn.execute(
            "INSERT INTO body_metrics (user_id, date, waist_cm) VALUES (?, ?, ?)",
            (2, "2026-06-04", 90.0),
        )
        conn.commit()
    finally:
        conn.close()

    assert body_service.delete_metric("2026-06-04") is True

    conn = sqlite3.connect(body_db)
    try:
        rows = conn.execute(
            "SELECT user_id, waist_cm FROM body_metrics WHERE date = ? ORDER BY user_id",
            ("2026-06-04",),
        ).fetchall()
    finally:
        conn.close()

    assert rows == [(2, 90.0)]


def test_weight_daily_flow_with_body_sync(body_db, monkeypatch):
    from backend.database import daily_weight_store as dws

    def _get_db():
        c = sqlite3.connect(body_db)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(dws, "get_db", _get_db)
    monkeypatch.setattr(dws, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(body_service, "get_db", _get_db)

    today = date.today().isoformat()
    dws.save_daily_weight(today, 75.5, source="manual")
    body_service.sync_weight_from_daily(today, 76.0, None)
    dws.save_daily_weight(today, 76.0, source="manual")

    conn = _get_db()
    try:
        w = conn.execute(
            "SELECT weight_kg FROM daily_weight WHERE date = ?",
            (today,),
        ).fetchone()
        m = conn.execute(
            "SELECT weight_kg FROM body_metrics WHERE user_id = 1 AND date = ?",
            (today,),
        ).fetchone()
    finally:
        conn.close()

    assert float(w["weight_kg"]) == pytest.approx(76.0)
    assert float(m["weight_kg"]) == pytest.approx(76.0)
