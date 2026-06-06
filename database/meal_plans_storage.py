# -*- coding: utf-8 -*-
"""Routing meal-plan tables between shared.db (legacy) and workouts.db (v070+)."""
from __future__ import annotations

import sqlite3

META_MEAL_PLANS_IN_WORKOUTS = "meal_plans_in_workouts_v1"

MEAL_PLAN_TABLES: frozenset[str] = frozenset(
    {
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
    }
)

MEAL_PLAN_COPY_ORDER: tuple[str, ...] = (
    "meal_templates",
    "daily_meal_plans",
    "meal_template_items",
    "daily_meal_plan_templates",
    "meal_plan_items",
)


def meal_plans_in_workouts(conn: sqlite3.Connection) -> bool:
    try:
        row = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            (META_MEAL_PLANS_IN_WORKOUTS,),
        ).fetchone()
        return row is not None and str(row[0]) == "1"
    except sqlite3.Error:
        return False


def mq(conn: sqlite3.Connection, table: str) -> str:
    """Qualified table name for SQL (main after v070, else shared)."""
    if table not in MEAL_PLAN_TABLES:
        raise ValueError(f"Not a meal plan table: {table}")
    schema = "main" if meal_plans_in_workouts(conn) else "shared"
    return f"{schema}.{table}"
