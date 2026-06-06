# -*- coding: utf-8 -*-
"""Сводка микронутриентов по неделе и нормы пользователя."""
from __future__ import annotations

import json
from typing import Any

from backend.services.food_service import FOOD_PHASES, _round1, _validate_phase, week_dates_from_anchor
from backend.database import get_db
from utils.micro_nutrients import DEFAULT_MICRO_GOALS, MICRO_KEYS, MICRO_NUTRIENTS


def _micro_goals_from_profile(raw: str | None) -> dict[str, float]:
    if not raw:
        return dict(DEFAULT_MICRO_GOALS)
    try:
        parsed = json.loads(raw)
        if not isinstance(parsed, dict):
            return dict(DEFAULT_MICRO_GOALS)
    except (json.JSONDecodeError, TypeError):
        return dict(DEFAULT_MICRO_GOALS)
    out = dict(DEFAULT_MICRO_GOALS)
    for key in MICRO_KEYS:
        val = parsed.get(key)
        if val is not None:
            try:
                f = float(val)
                if f > 0:
                    out[key] = f
            except (TypeError, ValueError):
                pass
    return out


def get_micro_goals() -> dict[str, Any]:
    from backend.services import user_service

    user_service.settings_service.ensure_settings_columns()
    profile = user_service.get_profile() or {}
    goals = _micro_goals_from_profile(profile.get("micro_goals_json"))
    nutrients = []
    for spec in MICRO_NUTRIENTS:
        key = spec["key"]
        nutrients.append(
            {
                "key": key,
                "label": spec["label"],
                "unit": spec["unit"],
                "goal": goals[key],
            }
        )
    return {"nutrients": nutrients, "goals": goals}


def save_micro_goals(goals: dict[str, Any]) -> dict[str, Any]:
    from backend.services import user_service

    user_service.settings_service.ensure_settings_columns()
    cleaned: dict[str, float] = dict(DEFAULT_MICRO_GOALS)
    for key in MICRO_KEYS:
        if key in goals and goals[key] is not None:
            try:
                f = float(goals[key])
                if f > 0:
                    cleaned[key] = f
            except (TypeError, ValueError):
                pass
    payload = json.dumps(cleaned, ensure_ascii=False)
    conn = get_db()
    try:
        conn.execute(
            "UPDATE user_profile SET micro_goals_json = ? WHERE id = 1",
            (payload,),
        )
        if conn.total_changes == 0:
            conn.execute(
                """
                INSERT INTO user_profile (id, micro_goals_json, updated_at)
                VALUES (1, ?, datetime('now'))
                """,
                (payload,),
            )
        conn.commit()
    finally:
        conn.close()
    return get_micro_goals()


def _rows_to_micro_summary(
    rows: list[Any],
    goals: dict[str, float],
    *,
    goal_multiplier: float = 1.0,
) -> tuple[list[dict[str, Any]], bool, bool, int]:
    consumed = {k: 0.0 for k in MICRO_KEYS}
    tracked = {k: False for k in MICRO_KEYS}
    days_with_food: set[str] = set()

    for row in rows:
        if bool(int(row["is_alcohol"] or 0)):
            continue
        day_key = str(row["date"])[:10] if "date" in row.keys() and row["date"] else None
        qty = float(row["quantity"] or 0)
        if qty <= 0:
            continue
        if day_key:
            days_with_food.add(day_key)
        factor = qty / 100.0
        for key in MICRO_KEYS:
            col = f"p_{key}"
            per100 = float(row[col] if col in row.keys() else 0)
            if per100 > 0:
                tracked[key] = True
            consumed[key] += per100 * factor

    nutrients_out: list[dict[str, Any]] = []
    for spec in MICRO_NUTRIENTS:
        key = spec["key"]
        daily_goal = goals[key]
        goal = daily_goal * goal_multiplier
        raw = consumed[key]
        consumed_r = _round1(raw) if raw > 0 else 0.0
        goal_r = _round1(goal) if goal > 0 else 0.0
        percent = _round1(raw / goal * 100) if goal > 0 and raw > 0 else None
        nutrients_out.append(
            {
                "key": key,
                "label": spec["label"],
                "unit": spec["unit"],
                "consumed": consumed_r,
                "goal": goal_r,
                "daily_goal": daily_goal,
                "percent": percent,
                "has_data": tracked[key],
            }
        )

    has_entries = len(rows) > 0
    has_any_micro_data = any(tracked.values())
    return nutrients_out, has_entries, has_any_micro_data, len(days_with_food)


def get_micros_week(anchor_date: str, phase: str = "cut") -> dict[str, Any]:
    anchor = str(anchor_date)[:10]
    ph = _validate_phase(phase)
    if ph not in FOOD_PHASES:
        ph = "cut"

    week_days = week_dates_from_anchor(anchor)
    week_start = week_days[0]
    week_end = week_days[-1]

    goals = get_micro_goals()["goals"]
    micro_cols = ", ".join(f"COALESCE(p.{k}, 0) AS p_{k}" for k in MICRO_KEYS)

    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            SELECT e.date, e.quantity, p.is_alcohol, {micro_cols}
            FROM food_entries e
            JOIN shared.food_products p ON p.id = e.product_id
            WHERE e.date >= ? AND e.date <= ? AND e.phase = ?
            ORDER BY e.date
            """,
            (week_start, week_end, ph),
        ).fetchall()
    finally:
        conn.close()

    nutrients_out, has_entries, has_any_micro_data, days_with_entries = _rows_to_micro_summary(
        rows,
        goals,
        goal_multiplier=7.0,
    )

    return {
        "anchor_date": anchor,
        "week_start": week_start,
        "week_end": week_end,
        "phase": ph,
        "nutrients": nutrients_out,
        "has_entries": has_entries,
        "has_any_micro_data": has_any_micro_data,
        "days_with_entries": days_with_entries,
    }


def get_micros_day(day: str, phase: str = "cut") -> dict[str, Any]:
    """Оставлено для совместимости API; UI использует недельную сводку."""
    d = str(day)[:10]
    ph = _validate_phase(phase)
    if ph not in FOOD_PHASES:
        ph = "cut"

    goals = get_micro_goals()["goals"]
    micro_cols = ", ".join(f"COALESCE(p.{k}, 0) AS p_{k}" for k in MICRO_KEYS)
    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            SELECT e.date, e.quantity, p.is_alcohol, {micro_cols}
            FROM food_entries e
            JOIN shared.food_products p ON p.id = e.product_id
            WHERE e.date = ? AND e.phase = ?
            """,
            (d, ph),
        ).fetchall()
    finally:
        conn.close()

    nutrients_out, has_entries, has_any_micro_data, _ = _rows_to_micro_summary(
        rows,
        goals,
        goal_multiplier=1.0,
    )

    return {
        "date": d,
        "phase": ph,
        "nutrients": nutrients_out,
        "has_entries": has_entries,
        "has_any_micro_data": has_any_micro_data,
    }
