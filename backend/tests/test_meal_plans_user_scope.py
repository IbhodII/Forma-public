# -*- coding: utf-8 -*-
"""Meal plans and templates scoped per user (no cross-account cloning)."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from backend.services import food_service
from utils.constants import STANDARD_MEAL_PLAN_NAMES

STANDARD_CUT_NAME = STANDARD_MEAL_PLAN_NAMES["cut"]


@pytest.fixture
def meal_plan_db(tmp_path, monkeypatch):
    main_path = tmp_path / "workouts.db"
    shared_path = tmp_path / "shared.db"
    shared = sqlite3.connect(shared_path)
    shared.executescript(
        """
        CREATE TABLE food_products (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            protein REAL, fat REAL, carbs REAL, calories REAL,
            fiber_g REAL DEFAULT 0
        );
        CREATE TABLE meal_templates (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            meal_type TEXT NOT NULL,
            phase TEXT NOT NULL,
            UNIQUE(user_id, name)
        );
        CREATE TABLE meal_template_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            template_id INTEGER NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL
        );
        CREATE TABLE daily_meal_plans (
            id INTEGER PRIMARY KEY,
            user_id INTEGER NOT NULL DEFAULT 1,
            name TEXT NOT NULL,
            phase TEXT NOT NULL,
            description TEXT,
            is_custom INTEGER NOT NULL DEFAULT 0,
            is_weekly INTEGER NOT NULL DEFAULT 0,
            UNIQUE(user_id, name)
        );
        CREATE TABLE daily_meal_plan_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            template_id INTEGER NOT NULL,
            sort_order INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE meal_plan_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            plan_id INTEGER NOT NULL,
            day_offset INTEGER NOT NULL DEFAULT 0,
            meal_type TEXT NOT NULL,
            product_id INTEGER NOT NULL,
            quantity REAL NOT NULL
        );
        """
    )
    shared.execute(
        "INSERT INTO food_products (id, name, protein, fat, carbs, calories) VALUES (1, 'Oats', 10, 5, 60, 350)"
    )
    shared.execute(
        """
        INSERT INTO meal_templates (id, user_id, name, meal_type, phase)
        VALUES (1, 1, 'cut_breakfast', 'breakfast1', 'cut')
        """
    )
    shared.execute(
        "INSERT INTO meal_template_items (template_id, product_id, quantity) VALUES (1, 1, 100)"
    )
    shared.execute(
        """
        INSERT INTO daily_meal_plans (id, user_id, name, phase, description, is_custom)
        VALUES (1, 1, ?, 'cut', 'std', 1)
        """,
        (STANDARD_CUT_NAME,),
    )
    shared.execute(
        "INSERT INTO daily_meal_plan_templates (plan_id, template_id, sort_order) VALUES (1, 1, 1)"
    )
    shared.execute(
        """
        INSERT INTO daily_meal_plans (id, user_id, name, phase, is_custom)
        VALUES (2, 1, 'My plan', 'cut', 1)
        """
    )
    shared.execute(
        """
        INSERT INTO meal_plan_items (plan_id, day_offset, meal_type, product_id, quantity)
        VALUES (2, 0, 'breakfast1', 1, 80)
        """
    )
    shared.commit()
    shared.close()

    main = sqlite3.connect(main_path)
    main.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
    main.executescript(
        """
        CREATE TABLE weekly_meal_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            day_of_week INTEGER NOT NULL,
            meal_plan_id INTEGER NOT NULL,
            user_id INTEGER NOT NULL,
            UNIQUE(day_of_week, user_id)
        );
        """
    )
    main.commit()
    main.close()

    current = {"id": 1}

    def _get_db():
        c = sqlite3.connect(main_path)
        c.row_factory = sqlite3.Row
        c.execute(f"ATTACH DATABASE '{shared_path.as_posix()}' AS shared")
        return c

    monkeypatch.setattr(food_service, "get_db", _get_db)
    monkeypatch.setattr(food_service, "get_current_user_id", lambda: current["id"])
    food_service._MEAL_PLAN_USER_SCHEMA_READY = True
    yield {"set_user": lambda uid: current.update(id=uid), "shared_path": shared_path}
    food_service._MEAL_PLAN_USER_SCHEMA_READY = False


def test_list_meal_plans_only_current_user(meal_plan_db):
    plans = food_service.list_meal_plans()
    assert len(plans) == 2
    assert {p["name"] for p in plans} == {STANDARD_CUT_NAME, "My plan"}
    std = next(p for p in plans if p["name"] == STANDARD_CUT_NAME)
    assert std["uses_templates"] is True

    meal_plan_db["set_user"](2)
    plans2 = food_service.list_meal_plans()
    assert plans2 == []


def test_user2_cannot_read_user1_plan(meal_plan_db):
    meal_plan_db["set_user"](2)
    with pytest.raises(Exception) as exc:
        food_service.get_meal_plan(1)
    assert "404" in str(exc.value) or "не найден" in str(exc.value).lower()


def test_template_plan_delete_only_own_account(meal_plan_db):
    result = food_service.delete_meal_plan(1)
    assert result["name"] == STANDARD_CUT_NAME
    remaining = food_service.list_meal_plans()
    assert len(remaining) == 1
    assert remaining[0]["name"] == "My plan"
