# -*- coding: utf-8 -*-
"""Регрессии дневника питания: макросы, очистка дня, недельный рацион."""
from __future__ import annotations

import sqlite3
from pathlib import Path

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
        CREATE TABLE daily_meal_plans (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            phase TEXT NOT NULL,
            description TEXT,
            is_custom INTEGER NOT NULL DEFAULT 1,
            is_weekly INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, name)
        )
        """
    )
    shared.execute(
        """
        CREATE TABLE meal_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
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
    food_service._MEAL_PLAN_USER_SCHEMA_READY = True

    yield {
        "main_path": main_path,
        "shared_path": shared_path,
        "set_user": lambda uid: current_user.update(id=uid),
    }

    food_service._MEAL_PLAN_USER_SCHEMA_READY = False


def _insert_products(conn: sqlite3.Connection) -> tuple[int, int]:
    conn.execute(
        """
        INSERT INTO shared.food_products
        (name, protein, fat, carbs, calories, fiber_g)
        VALUES ('Курица', 25, 3, 0, 130, 0)
        """
    )
    chicken_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.execute(
        """
        INSERT INTO shared.food_products
        (name, protein, fat, carbs, calories, fiber_g)
        VALUES ('Рис', 3, 0.5, 28, 130, 0.5)
        """
    )
    rice_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.commit()
    return int(chicken_id), int(rice_id)


def _insert_entry(
    conn: sqlite3.Connection,
    *,
    product_id: int,
    protein_per100: float,
    carbs_per100: float,
    user_id: int = 1,
) -> int:
    cur = conn.execute(
        """
        INSERT INTO food_entries (
            date, phase, product_id, quantity, meal_type,
            protein_per100, fat_per100, carbs_per100, calories_per100, user_id
        ) VALUES ('2026-05-28', 'cut', ?, 100, 'lunch', ?, 0, ?, 130, ?)
        """,
        (product_id, protein_per100, carbs_per100, user_id),
    )
    conn.commit()
    return int(cur.lastrowid)


def _fetch_entry(conn: sqlite3.Connection, entry_id: int, user_id: int = 1) -> dict:
    row = conn.execute(
        f"{food_service._ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?",
        (entry_id, user_id),
    ).fetchone()
    assert row is not None
    return food_service._entry_from_row(row)


def test_entry_macros_match_product_despite_stale_snapshot(food_db):
    conn = food_service.get_db()
    try:
        chicken_id, rice_id = _insert_products(conn)
        entry_id = _insert_entry(
            conn,
            product_id=rice_id,
            protein_per100=25.0,
            carbs_per100=0.0,
        )
        entry = _fetch_entry(conn, entry_id)
        assert entry["product_name"] == "Рис"
        assert entry["protein"] == pytest.approx(3.0, abs=0.2)
        assert entry["carbs"] == pytest.approx(28.0, abs=0.2)
        assert entry["protein"] != pytest.approx(25.0, abs=0.5)
    finally:
        conn.close()


def test_clear_day_entries_scoped(food_db):
    conn = food_service.get_db()
    try:
        chicken_id, _rice_id = _insert_products(conn)
        _insert_entry(
            conn,
            product_id=chicken_id,
            protein_per100=25.0,
            carbs_per100=0.0,
            user_id=1,
        )
        _insert_entry(
            conn,
            product_id=chicken_id,
            protein_per100=25.0,
            carbs_per100=0.0,
            user_id=2,
        )
    finally:
        conn.close()

    food_db["set_user"](1)
    deleted = food_service.clear_day_entries("2026-05-28", "cut")
    assert deleted == 1

    conn = food_service.get_db()
    try:
        rows = conn.execute("SELECT user_id FROM food_entries").fetchall()
        assert len(rows) == 1
        assert int(rows[0]["user_id"]) == 2
    finally:
        conn.close()


def test_meal_plan_day_offset_weekly(monkeypatch):
    week = [f"2026-05-{d:02d}" for d in range(25, 32)]

    def _fake_week(_anchor: str) -> list[str]:
        return week

    monkeypatch.setattr(food_service, "week_dates_from_anchor", _fake_week)
    plan = {"is_weekly": True}
    assert food_service._meal_plan_day_offset(plan, "2026-05-27") == 2
    assert food_service._meal_plan_day_offset(plan, "2026-05-25") == 0
    assert food_service._meal_plan_day_offset({"is_weekly": False}, "2026-05-27") == 0


def test_apply_meal_plan_weekly_offset(food_db, monkeypatch):
    week = [f"2026-05-{d:02d}" for d in range(25, 32)]
    monkeypatch.setattr(food_service, "week_dates_from_anchor", lambda _a: week)
    monkeypatch.setattr(
        food_service,
        "get_meal_plan",
        lambda plan_id: {
            "id": plan_id,
            "name": "Week",
            "phase": "cut",
            "description": None,
            "is_custom": True,
            "is_weekly": True,
            "days": [],
            "templates": [],
        },
    )

    conn = food_service.get_db()
    try:
        _chicken_id, rice_id = _insert_products(conn)
        conn.execute(
            """
            INSERT INTO shared.daily_meal_plans
            (id, user_id, name, phase, description, is_custom, is_weekly)
            VALUES (1, 1, 'Неделя', 'cut', NULL, 1, 1)
            """
        )
        conn.execute(
            """
            INSERT INTO shared.meal_plan_items
            (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (1, 0, 'breakfast1', ?, 100)
            """,
            (_chicken_id,),
        )
        conn.execute(
            """
            INSERT INTO shared.meal_plan_items
            (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (1, 2, 'lunch', ?, 150)
            """,
            (rice_id,),
        )
        conn.commit()
    finally:
        conn.close()

    result = food_service.apply_meal_plan(1, "2026-05-27", "cut")
    assert result["total_added"] == 1
    assert len(result["entries"]) == 1
    assert result["entries"][0]["product_id"] == rice_id
    assert result["entries"][0]["product_name"] == "Рис"
    assert result["entries"][0]["quantity"] == pytest.approx(150.0, abs=0.1)


def test_apply_meal_plan_range_uses_explicit_start_date(food_db, monkeypatch):
    from backend.core import week_calendar
    from backend.services import settings_service

    monkeypatch.setattr(settings_service, "get_week_start_day", lambda: week_calendar.WEEKDAY_SAT)
    monkeypatch.setattr(food_service, "get_week_log", lambda *_a, **_k: {})
    monkeypatch.setattr(
        food_service,
        "get_meal_plan",
        lambda plan_id: {
            "id": plan_id,
            "name": "Week",
            "phase": "cut",
            "description": None,
            "is_custom": True,
            "is_weekly": True,
            "days": [],
            "templates": [],
        },
    )

    conn = food_service.get_db()
    try:
        chicken_id, _rice_id = _insert_products(conn)
        conn.execute(
            """
            INSERT INTO shared.daily_meal_plans
            (id, name, phase, description, is_custom, is_weekly)
            VALUES (2, 'Сб-старт', 'cut', NULL, 1, 1)
            """
        )
        conn.execute(
            """
            INSERT INTO shared.meal_plan_items
            (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (2, 0, 'breakfast1', ?, 100)
            """,
            (chicken_id,),
        )
        conn.commit()
    finally:
        conn.close()

    result = food_service.apply_meal_plan_range(
        2,
        "2026-05-25",
        "2026-05-31",
        "cut",
        overwrite=False,
    )
    assert result["week_start"] == "2026-05-25"
    assert result["week_end"] == "2026-05-31"
    assert len(result["days"]) == 7
    assert result["total_added"] >= 1


def test_apply_meal_plan_range_merge_skips_duplicate_products(food_db, monkeypatch):
    monkeypatch.setattr(food_service, "get_week_log", lambda *_a, **_k: {})
    monkeypatch.setattr(
        food_service,
        "get_meal_plan",
        lambda plan_id: {
            "id": plan_id,
            "name": "Day",
            "phase": "cut",
            "description": None,
            "is_custom": True,
            "is_weekly": False,
            "days": [],
            "templates": [],
        },
    )

    conn = food_service.get_db()
    try:
        chicken_id, _rice_id = _insert_products(conn)
        conn.execute(
            """
            INSERT INTO shared.daily_meal_plans
            (id, name, phase, description, is_custom, is_weekly)
            VALUES (3, 'День', 'cut', NULL, 1, 0)
            """
        )
        conn.execute(
            """
            INSERT INTO shared.meal_plan_items
            (plan_id, day_offset, meal_type, product_id, quantity)
            VALUES (3, 0, 'breakfast1', ?, 100)
            """,
            (chicken_id,),
        )
        conn.execute(
            """
            INSERT INTO food_entries
            (date, phase, product_id, quantity, meal_type, user_id,
             protein_per100, fat_per100, carbs_per100, calories_per100)
            VALUES ('2026-05-28', 'cut', ?, 100, 'lunch', 1, 20, 1, 1, 100)
            """,
            (chicken_id,),
        )
        conn.commit()
    finally:
        conn.close()

    first = food_service.apply_meal_plan_range(3, "2026-05-28", "2026-05-28", "cut", overwrite=False)
    second = food_service.apply_meal_plan_range(3, "2026-05-28", "2026-05-28", "cut", overwrite=False)
    assert first["total_added"] == 1
    assert second["total_added"] == 0
    conn = food_service.get_db()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM food_entries WHERE date = '2026-05-28' AND phase = 'cut'"
        ).fetchone()[0]
    finally:
        conn.close()
    assert count == 2


def test_food_entries_delete_after_v047_drops_main_product_fk(tmp_path):
    """Legacy FK на main.food_products ломает DELETE после split; v047 чинит."""
    from database.migrations import (
        _food_entries_has_product_fk,
        _migration_v047_food_entries_drop_product_fk,
    )

    main_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"

    conn = sqlite3.connect(main_path)
    conn.execute(
        """
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE food_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            phase TEXT NOT NULL DEFAULT 'cut',
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL DEFAULT 100,
            meal_type TEXT NOT NULL,
            notes TEXT,
            user_id INTEGER NOT NULL DEFAULT 1,
            FOREIGN KEY (product_id) REFERENCES food_products(id)
        )
        """
    )
    conn.execute(
        """
        INSERT INTO food_products (name) VALUES ('Test')
        """
    )
    conn.execute(
        """
        INSERT INTO food_entries (date, phase, product_id, quantity, meal_type, user_id)
        VALUES ('2026-05-28', 'cut', 1, 100, 'lunch', 1)
        """
    )
    conn.commit()
    assert _food_entries_has_product_fk(conn)

    conn.execute("DROP TABLE food_products")
    conn.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
    conn.execute(
        """
        CREATE TABLE shared.food_products (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL
        )
        """
    )
    conn.execute("INSERT INTO shared.food_products (id, name) VALUES (1, 'Test')")
    conn.commit()
    conn.execute("PRAGMA foreign_keys=ON")

    with pytest.raises(sqlite3.OperationalError, match="food_products"):
        conn.execute("DELETE FROM food_entries WHERE date = '2026-05-28'")

    _migration_v047_food_entries_drop_product_fk(conn)
    conn.commit()
    assert not _food_entries_has_product_fk(conn)

    conn.execute("DELETE FROM food_entries WHERE date = '2026-05-28'")
    conn.commit()
    assert conn.execute("SELECT COUNT(*) FROM food_entries").fetchone()[0] == 0
    conn.close()


def test_apply_meal_plan_request_accepts_future_date():
    from datetime import date, timedelta

    from backend.schemas.models import ApplyMealPlanRequest, FoodEntryCreate

    future = (date.today() + timedelta(days=14)).isoformat()
    req = ApplyMealPlanRequest(
        plan_id=1,
        date=future,
        phase="cut",
        apply_week=False,
        replace_existing=True,
    )
    assert req.date == future

    entry = FoodEntryCreate(
        date=future,
        phase="cut",
        product_id=1,
        quantity=100,
        meal_type="lunch",
    )
    assert entry.date == future


def test_normalize_api_date_rejects_future_for_workouts():
    from datetime import date, timedelta

    import pytest

    from backend.schemas.models import _normalize_api_date

    future = (date.today() + timedelta(days=1)).isoformat()
    with pytest.raises(ValueError, match="будущем"):
        _normalize_api_date(future)
