# -*- coding: utf-8 -*-
"""Обновление продуктов справочника: простые и составные."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import food_service
from utils.micro_nutrients import MICRO_KEYS


def _micro_cols_ddl() -> str:
    return ", ".join(f"{k} REAL DEFAULT 0" for k in MICRO_KEYS)


@pytest.fixture
def food_db(tmp_path, monkeypatch):
    main_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"

    shared = sqlite3.connect(shared_path)
    shared.execute(
        f"""
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            protein REAL, fat REAL, carbs REAL, calories REAL,
            fiber_g REAL DEFAULT 0,
            {_micro_cols_ddl()},
            unit TEXT DEFAULT 'g',
            is_composite INTEGER DEFAULT 0,
            is_alcohol INTEGER DEFAULT 0,
            external_id TEXT,
            default_portion_g REAL DEFAULT NULL
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
    main.execute(
        """
        CREATE TABLE food_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut',
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 100,
            meal_type TEXT NOT NULL,
            notes TEXT,
            protein_per100 REAL,
            fat_per100 REAL,
            carbs_per100 REAL,
            calories_per100 REAL,
            user_id INTEGER NOT NULL DEFAULT 1
        )
        """
    )
    main.commit()
    main.close()

    current_user = {"id": 1}

    def _get_db():
        c = sqlite3.connect(main_path)
        c.row_factory = sqlite3.Row
        c.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
        return c

    def _uid():
        return int(current_user["id"])

    monkeypatch.setattr(food_service, "get_db", _get_db)
    monkeypatch.setattr(food_service, "get_current_user_id", _uid)

    yield {"main_path": main_path, "shared_path": shared_path}


def _insert_simple(conn: sqlite3.Connection, **kwargs) -> int:
    cols = [
        "name",
        "protein",
        "fat",
        "carbs",
        "calories",
        "fiber_g",
        "is_alcohol",
        "external_id",
        "default_portion_g",
        "iron_mg",
    ]
    values = {
        "name": kwargs.get("name", "Продукт"),
        "protein": kwargs.get("protein", 10.0),
        "fat": kwargs.get("fat", 5.0),
        "carbs": kwargs.get("carbs", 20.0),
        "calories": kwargs.get("calories", 165.0),
        "fiber_g": kwargs.get("fiber_g", 1.0),
        "is_alcohol": kwargs.get("is_alcohol", 0),
        "external_id": kwargs.get("external_id"),
        "default_portion_g": kwargs.get("default_portion_g"),
        "iron_mg": kwargs.get("iron_mg", 0.0),
    }
    placeholders = ", ".join("?" for _ in cols)
    conn.execute(
        f"""
        INSERT INTO shared.food_products ({", ".join(cols)})
        VALUES ({placeholders})
        """,
        tuple(values[c] for c in cols),
    )
    conn.commit()
    return int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])


def test_update_simple_product_fields(food_db):
    conn = food_service.get_db()
    try:
        product_id = _insert_simple(conn, name="Яблоко", fiber_g=2.0, iron_mg=0.1)
    finally:
        conn.close()

    updated = food_service.update_product(
        product_id,
        {
            "name": "Яблоко зелёное",
            "protein": 0.4,
            "fat": 0.2,
            "carbs": 14.0,
            "fiber_g": 2.5,
            "calories": 59.0,
            "is_alcohol": False,
            "external_id": "4601234567890",
            "default_portion_g": 150.0,
            "iron_mg": 0.2,
        },
    )

    assert updated["name"] == "Яблоко зелёное"
    assert updated["protein"] == pytest.approx(0.4)
    assert updated["fiber_g"] == pytest.approx(2.5)
    assert updated["default_portion_g"] == pytest.approx(150.0)
    assert updated["external_id"] == "4601234567890"
    assert updated["iron_mg"] == pytest.approx(0.2)


def test_update_product_does_not_modify_entry_snapshot_columns(food_db):
    conn = food_service.get_db()
    try:
        product_id = _insert_simple(conn, name="Рис", protein=3.0, carbs=28.0, calories=130.0)
        conn.execute(
            """
            INSERT INTO food_entries (
                date, phase, product_id, quantity, meal_type,
                protein_per100, fat_per100, carbs_per100, calories_per100, user_id
            ) VALUES ('2026-05-28', 'cut', ?, 100, 'lunch', 99.0, 0.0, 1.0, 400.0, 1)
            """,
            (product_id,),
        )
        conn.commit()
        entry_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
        before = conn.execute(
            """
            SELECT protein_per100, fat_per100, carbs_per100, calories_per100
            FROM food_entries WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()

    food_service.update_product(
        product_id,
        {
            "name": "Рис обновлённый",
            "protein": 4.0,
            "fat": 0.5,
            "carbs": 30.0,
            "calories": 140.0,
            "fiber_g": 0.5,
            "is_alcohol": False,
        },
    )

    conn = food_service.get_db()
    try:
        after = conn.execute(
            """
            SELECT protein_per100, fat_per100, carbs_per100, calories_per100
            FROM food_entries WHERE id = ?
            """,
            (entry_id,),
        ).fetchone()
        assert float(before["protein_per100"]) == pytest.approx(99.0)
        assert float(after["protein_per100"]) == pytest.approx(99.0)
        assert float(after["carbs_per100"]) == pytest.approx(1.0)
    finally:
        conn.close()


def test_update_composite_recalculates_fiber_and_micros(food_db):
    conn = food_service.get_db()
    try:
        rice_id = _insert_simple(
            conn,
            name="Рис",
            protein=3.0,
            fat=0.5,
            carbs=28.0,
            calories=130.0,
            fiber_g=1.0,
            iron_mg=0.5,
        )
        veg_id = _insert_simple(
            conn,
            name="Овощи",
            protein=2.0,
            fat=0.2,
            carbs=5.0,
            calories=30.0,
            fiber_g=3.0,
            iron_mg=1.0,
        )
    finally:
        conn.close()

    composite = food_service.create_composite_product(
        {
            "name": "Рис с овощами",
            "components": [
                {"product_id": rice_id, "quantity_g": 100.0},
                {"product_id": veg_id, "quantity_g": 100.0},
            ],
        }
    )
    composite_id = int(composite["id"])
    assert composite["fiber_g"] == pytest.approx(2.0, abs=0.1)

    updated = food_service.update_composite_product(
        composite_id,
        {
            "name": "Рис с овощами",
            "components": [
                {"product_id": rice_id, "quantity_g": 50.0},
                {"product_id": veg_id, "quantity_g": 150.0},
            ],
        },
    )

    assert updated["fiber_g"] == pytest.approx(2.5, abs=0.2)
    assert updated["iron_mg"] == pytest.approx(0.875, abs=0.2)
