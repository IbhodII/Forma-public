# -*- coding: utf-8 -*-
"""Routing meal-plan tables between shared.db (legacy) and workouts.db (v070+)."""
from __future__ import annotations

import sqlite3

META_MEAL_PLANS_IN_WORKOUTS = "meal_plans_in_workouts_v1"
META_SHARED_MEAL_PLANS_PURGED = "shared_meal_plans_purged_v1"

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

MEAL_PLAN_DROP_ORDER: tuple[str, ...] = tuple(reversed(MEAL_PLAN_COPY_ORDER))

MEAL_INDEX_NAMES: tuple[str, ...] = (
    "idx_meal_template_items_tid",
    "idx_meal_plan_templates_plan",
    "idx_daily_meal_plans_user",
    "idx_meal_templates_user",
    "idx_meal_plan_items_plan",
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


def shared_meal_plans_purged(conn: sqlite3.Connection) -> bool:
    try:
        row = conn.execute(
            "SELECT value FROM app_meta WHERE key = ?",
            (META_SHARED_MEAL_PLANS_PURGED,),
        ).fetchone()
        return row is not None and str(row[0]) == "1"
    except sqlite3.Error:
        return False


def meal_plan_schema(conn: sqlite3.Connection) -> str:
    """Schema for meal-plan tables: main after v070/v078, else legacy shared."""
    if meal_plans_in_workouts(conn) or shared_meal_plans_purged(conn):
        return "main"
    return "shared"


def mq(conn: sqlite3.Connection, table: str) -> str:
    """Qualified table name for SQL (main after v070/v078, else shared)."""
    if table not in MEAL_PLAN_TABLES:
        raise ValueError(f"Not a meal plan table: {table}")
    return f"{meal_plan_schema(conn)}.{table}"
