# -*- coding: utf-8 -*-
"""Дневник питания: продукты, записи, нормы, расход."""
from __future__ import annotations

from datetime import date, timedelta
import re
import sqlite3
from typing import Any

from fastapi import HTTPException

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import nutrition_analysis
from backend.core.bmr import compute_bmr as _core_compute_bmr
from backend.core import week_calendar
from backend.services import settings_service, user_service
from utils.hr_profile import age_from_date_of_birth
from utils.micro_nutrients import MICRO_KEYS
from database.meal_plans_storage import mq

MEAL_TYPES = frozenset({"breakfast1", "breakfast2", "lunch", "dinner", "snack"})
MEAL_ORDER = ("breakfast1", "breakfast2", "lunch", "dinner", "snack")
# Устаревшее значение (до v17) — нормализуется в breakfast1
_LEGACY_MEAL_TYPE_BREAKFAST = "breakfast"

_MEAL_TYPE_SORT_SQL = """
    CASE e.meal_type
        WHEN 'breakfast1' THEN 1
        WHEN 'breakfast' THEN 1
        WHEN 'breakfast2' THEN 2
        WHEN 'lunch' THEN 3
        WHEN 'dinner' THEN 4
        WHEN 'snack' THEN 5
        ELSE 6
    END
"""

_MEAL_TYPE_SORT_SQL_TEMPLATES = """
    CASE t.meal_type
        WHEN 'breakfast1' THEN 1
        WHEN 'breakfast' THEN 1
        WHEN 'breakfast2' THEN 2
        WHEN 'lunch' THEN 3
        WHEN 'dinner' THEN 4
        WHEN 'snack' THEN 5
        ELSE 6
    END
"""
FOOD_PHASES = frozenset({"cut", "bulk"})
WEEKDAY_NAMES_RU = (
    "понедельник",
    "вторник",
    "среда",
    "четверг",
    "пятница",
    "суббота",
    "воскресенье",
)

def _round1(n: float) -> float:
    return round(float(n), 1)


def macro_calories(protein: float, fat: float, carbs: float) -> float:
    return _round1(protein * 4 + fat * 9 + carbs * 4)


def _validate_calorie_macro_match(
    protein: float,
    fat: float,
    carbs: float,
    calories: float,
    *,
    is_alcohol: bool = False,
) -> None:
    """Отклонение калорий от 4/9/4 больше 10% — ошибка (кроме алкоголя)."""
    if is_alcohol:
        return
    calculated = macro_calories(protein, fat, carbs)
    entered = float(calories)
    denom = max(calculated, entered, 1.0)
    if abs(calculated - entered) / denom > 0.1:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Расхождение калорий с макросами более 10%. "
                f"Рассчитано {calculated:.0f} ккал, введено {entered:.0f} ккал. "
                "Проверьте данные или отметьте продукт как алкоголь."
            ),
        )


def _product_select_columns() -> str:
    micro = ", ".join(MICRO_KEYS)
    return (
        f"id, name, protein, fat, carbs, calories, fiber_g, {micro}, "
        "unit, is_composite, is_alcohol, external_id, default_portion_g"
    )


def _micros_from_row(row: Any, prefix: str = "") -> dict[str, float]:
    out: dict[str, float] = {}
    for key in MICRO_KEYS:
        col = f"{prefix}{key}" if prefix else key
        out[key] = _round1(row[col] or 0) if col in row.keys() else 0.0
    return out


def _micro_values_from_data(data: dict[str, Any]) -> list[float]:
    return [_round1(float(data.get(key) or 0)) for key in MICRO_KEYS]


def _batch_macros_to_per100(totals: dict[str, float], batch_weight_g: float) -> dict[str, float]:
    if batch_weight_g <= 0:
        raise HTTPException(status_code=400, detail="Масса готового продукта должна быть > 0")
    factor = 100.0 / batch_weight_g
    out = {
        "protein": _round1(totals["protein"] * factor),
        "fat": _round1(totals["fat"] * factor),
        "carbs": _round1(totals["carbs"] * factor),
        "calories": _round1(totals["calories"] * factor),
        "fiber": _round1(totals.get("fiber", 0) * factor),
    }
    for key in MICRO_KEYS:
        out[key] = _round1(totals.get(key, 0) * factor)
    return out


def _component_quantity(item: dict[str, Any]) -> float:
    if "quantity_g" in item and item["quantity_g"] is not None:
        return float(item["quantity_g"])
    if "quantity" in item and item["quantity"] is not None:
        return float(item["quantity"])
    raise HTTPException(status_code=400, detail="Укажите quantity_g для компонента")


def _macros_from_components(
    conn,
    components,
    total_weight_g: float | None,
) -> tuple[dict[str, float], float]:
    if not components:
        raise HTTPException(status_code=400, detail="Укажите состав продукта")
    batch: dict[str, float] = {
        "protein": 0.0,
        "fat": 0.0,
        "carbs": 0.0,
        "calories": 0.0,
        "fiber": 0.0,
        **{key: 0.0 for key in MICRO_KEYS},
    }
    component_weight = 0.0
    seen_ids: set[int] = set()
    for item in components:
        product_id = int(item["product_id"])
        quantity = _component_quantity(item)
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="Количество компонента должно быть > 0")
        if product_id in seen_ids:
            raise HTTPException(status_code=400, detail="Компонент указан дважды")
        seen_ids.add(product_id)
        row = _get_product(conn, product_id)
        per100 = {
            "protein": row["protein"],
            "fat": row["fat"],
            "carbs": row["carbs"],
            "calories": row["calories"],
            "fiber_g": row["fiber_g"] if "fiber_g" in row.keys() else 0,
            "is_alcohol": bool(int(row["is_alcohol"] or 0)) if "is_alcohol" in row.keys() else False,
            **_micros_from_row(row),
        }
        macros = scale_macros(per100, quantity)
        for key in ("protein", "fat", "carbs", "calories", "fiber"):
            batch[key] += macros[key]
        factor = quantity / 100.0
        for key in MICRO_KEYS:
            batch[key] += (per100.get(key) or 0) * factor
        component_weight += quantity
    batch_weight = float(total_weight_g) if total_weight_g and total_weight_g > 0 else component_weight
    per100_macros = _batch_macros_to_per100(batch, batch_weight)
    return per100_macros, batch_weight


def _save_product_components(
    conn,
    product_id: int,
    components: list[dict[str, Any]],
) -> None:
    conn.execute(
        "DELETE FROM shared.food_product_components WHERE product_id = ?",
        (product_id,),
    )
    for item in components:
        conn.execute(
            """
            INSERT INTO shared.food_product_components (product_id, component_product_id, quantity)
            VALUES (?, ?, ?)
            """,
            (product_id, int(item["product_id"]), _component_quantity(item)),
        )


def scale_macros(
    per100: dict[str, float | None], quantity_g: float
) -> dict[str, float]:
    q = max(0.0, float(quantity_g))
    factor = q / 100.0
    if per100.get("is_alcohol"):
        kcal_per100 = per100.get("calories")
        calories = _round1((kcal_per100 or 0) * factor) if kcal_per100 else 0.0
        return {"protein": 0.0, "fat": 0.0, "carbs": 0.0, "calories": calories, "fiber": 0.0}
    protein = _round1((per100.get("protein") or 0) * factor)
    fat = _round1((per100.get("fat") or 0) * factor)
    carbs = _round1((per100.get("carbs") or 0) * factor)
    fiber = _round1((per100.get("fiber_g") or per100.get("fiber") or 0) * factor)
    kcal_per100 = per100.get("calories")
    if kcal_per100 and kcal_per100 > 0:
        calories = _round1(kcal_per100 * factor)
    else:
        calories = macro_calories(protein, fat, carbs)
    return {"protein": protein, "fat": fat, "carbs": carbs, "calories": calories, "fiber": fiber}


def _validate_phase(phase: str) -> str:
    p = phase.strip().lower()
    if p not in FOOD_PHASES:
        raise HTTPException(
            status_code=400,
            detail="phase должен быть cut или bulk",
        )
    return p


def _validate_meal_type(meal_type: str) -> str:
    mt = meal_type.strip().lower()
    if mt == _LEGACY_MEAL_TYPE_BREAKFAST:
        mt = "breakfast1"
    if mt not in MEAL_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"meal_type: {', '.join(MEAL_ORDER)}",
        )
    return mt


def _sum_totals(entries: list[dict[str, Any]]) -> dict[str, float]:
    totals = {"protein": 0.0, "fat": 0.0, "carbs": 0.0, "calories": 0.0, "fiber": 0.0}
    for e in entries:
        totals["calories"] += e["calories"]
        if e.get("is_alcohol"):
            continue
        totals["protein"] += e["protein"]
        totals["fat"] += e["fat"]
        totals["carbs"] += e["carbs"]
        totals["fiber"] += float(e.get("fiber") or 0)
    return {k: _round1(v) for k, v in totals.items()}


def _alcohol_calories(entries: list[dict[str, Any]]) -> float:
    return _round1(sum(float(e["calories"] or 0) for e in entries if e.get("is_alcohol")))


def _goal_percents(
    totals: dict[str, float], goals: dict[str, float] | None
) -> dict[str, float | None] | None:
    if not goals:
        return None
    out: dict[str, float | None] = {}
    for key, goal_key in (
        ("protein", "protein_goal"),
        ("fat", "fat_goal"),
        ("carbs", "carbs_goal"),
        ("calories", "calories_goal"),
    ):
        g = goals.get(goal_key)
        if g and g > 0:
            out[key] = _round1(totals[key] / g * 100)
        else:
            out[key] = None
    return out


def _next_food_product_id(conn) -> int:
    row = conn.execute(
        "SELECT COALESCE(MAX(id), 0) + 1 FROM shared.food_products"
    ).fetchone()
    return int(row[0] or 1)


def _get_product(conn, product_id: int) -> Any:
    row = conn.execute(
        f"""
        SELECT {_product_select_columns()}
        FROM shared.food_products WHERE id = ?
        """,
        (product_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Продукт не найден")
    return row


def _product_from_row(row: Any) -> dict[str, Any]:
    return {
        "id": int(row["id"]),
        "name": str(row["name"]),
        "protein": _round1(row["protein"] or 0),
        "fat": _round1(row["fat"] or 0),
        "carbs": _round1(row["carbs"] or 0),
        "calories": _round1(row["calories"] or 0),
        "fiber_g": _round1(row["fiber_g"] or 0) if "fiber_g" in row.keys() else 0.0,
        "unit": str(row["unit"]) if row["unit"] else "g",
        "is_composite": bool(int(row["is_composite"] or 0)),
        "is_alcohol": bool(int(row["is_alcohol"] or 0)) if "is_alcohol" in row.keys() else False,
        "external_id": (
            str(row["external_id"]).strip()
            if "external_id" in row.keys() and row["external_id"]
            else None
        ),
        "default_portion_g": (
            float(row["default_portion_g"])
            if "default_portion_g" in row.keys() and row["default_portion_g"] is not None
            else None
        ),
        **_micros_from_row(row),
    }


_ENTRY_SELECT = """
    SELECT e.id, e.date, e.phase, e.product_id, e.quantity, e.meal_type, e.notes,
           p.name AS product_name,
           COALESCE(p.protein, e.protein_per100) AS p_protein,
           COALESCE(p.fat, e.fat_per100) AS p_fat,
           COALESCE(p.carbs, e.carbs_per100) AS p_carbs,
           COALESCE(p.calories, e.calories_per100) AS p_calories,
           COALESCE(p.fiber_g, 0) AS p_fiber,
           p.is_alcohol AS is_alcohol
    FROM food_entries e
    INNER JOIN shared.food_products p ON p.id = e.product_id
"""


def _entry_from_row(row: Any) -> dict[str, Any]:
    is_alcohol = bool(int(row["is_alcohol"] or 0))
    per100 = {
        "protein": row["p_protein"],
        "fat": row["p_fat"],
        "carbs": row["p_carbs"],
        "calories": row["p_calories"],
        "fiber_g": row["p_fiber"] if "p_fiber" in row.keys() else 0,
        "is_alcohol": is_alcohol,
    }
    macros = scale_macros(per100, row["quantity"])
    return {
        "id": int(row["id"]),
        "date": str(row["date"])[:10],
        "phase": str(row["phase"]),
        "product_id": int(row["product_id"]),
        "product_name": row["product_name"],
        "quantity": _round1(row["quantity"]),
        "meal_type": str(row["meal_type"]),
        "notes": row["notes"],
        "is_alcohol": is_alcohol,
        **macros,
    }


def _macro_snapshot_from_data(data: dict[str, Any]) -> dict[str, float | None]:
    keys = ("protein_per100", "fat_per100", "carbs_per100", "calories_per100")
    out: dict[str, float | None] = {}
    for key in keys:
        if key in data and data[key] is not None:
            out[key] = _round1(float(data[key]))
        else:
            out[key] = None
    return out


def _macro_snapshot_from_product(conn, product_id: int) -> dict[str, float | None]:
    """Снимок БЖУ/ккал на 100 г из справочника (для INSERT/UPDATE)."""
    row = _get_product(conn, product_id)
    return {
        "protein_per100": _round1(row["protein"] or 0),
        "fat_per100": _round1(row["fat"] or 0),
        "carbs_per100": _round1(row["carbs"] or 0),
        "calories_per100": _round1(row["calories"] or 0),
    }


def _resolve_entry_macro_snapshot(
    conn,
    product_id: int,
    data: dict[str, Any],
) -> dict[str, float | None]:
    """База из продукта; явные поля в data перекрывают (шаблоны рациона)."""
    base = _macro_snapshot_from_product(conn, product_id)
    override = _macro_snapshot_from_data(data)
    return {
        key: override[key] if override[key] is not None else base[key]
        for key in base
    }


def count_products() -> int:
    conn = get_db()
    try:
        row = conn.execute("SELECT COUNT(*) FROM shared.food_products").fetchone()
        return int(row[0]) if row else 0
    except Exception:
        return 0
    finally:
        conn.close()


def ensure_products_catalog() -> int:
    """Возвращает число продуктов в справочнике (без внешнего импорта)."""
    return count_products()


def list_products(
    search: str | None = None,
    phase: str | None = None,
) -> list[dict[str, Any]]:
    del phase  # единый справочник; phase оставлен для совместимости API
    conn = get_db()
    try:
        if search and search.strip():
            q = f"%{search.strip()}%"
            rows = conn.execute(
                f"""
                SELECT {_product_select_columns()}
                FROM shared.food_products
                WHERE name LIKE ? COLLATE NOCASE
                ORDER BY name
                LIMIT 500
                """,
                (q,),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT {_product_select_columns()}
                FROM shared.food_products
                ORDER BY name
                """
            ).fetchall()
        return [_product_from_row(r) for r in rows]
    finally:
        conn.close()


def get_goals(day: str, phase: str = "cut") -> dict[str, Any] | None:
    ph = _validate_phase(phase)
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT date, phase, protein_goal, fat_goal, carbs_goal, calories_goal
            FROM daily_nutrition_goals WHERE date = ? AND phase = ?
            """,
            (str(day)[:10], ph),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {
        "date": str(row["date"])[:10],
        "phase": str(row["phase"]),
        "protein_goal": row["protein_goal"],
        "fat_goal": row["fat_goal"],
        "carbs_goal": row["carbs_goal"],
        "calories_goal": row["calories_goal"],
    }


def save_goals(day: str, phase: str, data: dict[str, Any]) -> dict[str, Any]:
    d = str(day)[:10]
    ph = _validate_phase(phase)
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO daily_nutrition_goals (
                date, phase, protein_goal, fat_goal, carbs_goal, calories_goal
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(date, phase) DO UPDATE SET
                protein_goal = excluded.protein_goal,
                fat_goal = excluded.fat_goal,
                carbs_goal = excluded.carbs_goal,
                calories_goal = excluded.calories_goal
            """,
            (
                d,
                ph,
                data.get("protein_goal"),
                data.get("fat_goal"),
                data.get("carbs_goal"),
                data.get("calories_goal"),
            ),
        )
        conn.commit()
    finally:
        conn.close()
    return get_goals(d, ph) or {"date": d, "phase": ph}


def _weight_for_date(conn, day: str) -> float | None:
    row = conn.execute(
        "SELECT weight_kg FROM daily_weight WHERE date = ?",
        (day,),
    ).fetchone()
    if row:
        return float(row["weight_kg"])
    row = conn.execute(
        """
        SELECT weight_kg FROM daily_weight
        WHERE date <= ?
        ORDER BY date DESC
        LIMIT 1
        """,
        (day,),
    ).fetchone()
    if row:
        return float(row["weight_kg"])
    return None


def _body_fat_for_date(conn, day: str) -> float | None:
    row = conn.execute(
        "SELECT body_fat_percent FROM daily_weight WHERE date = ?",
        (day,),
    ).fetchone()
    if row and row["body_fat_percent"] is not None:
        return float(row["body_fat_percent"])
    row = conn.execute(
        """
        SELECT body_fat_percent FROM daily_weight
        WHERE date <= ? AND body_fat_percent IS NOT NULL
        ORDER BY date DESC
        LIMIT 1
        """,
        (day,),
    ).fetchone()
    if row:
        return float(row["body_fat_percent"])
    row = conn.execute(
        """
        SELECT body_fat_percent FROM body_metrics
        WHERE date <= ? AND body_fat_percent IS NOT NULL
        ORDER BY date DESC
        LIMIT 1
        """,
        (day,),
    ).fetchone()
    if row:
        return float(row["body_fat_percent"])
    return None


def _body_context(conn, day: str, phase: str) -> dict[str, Any]:
    weight = _weight_for_date(conn, day)
    body_fat = _body_fat_for_date(conn, day)
    return nutrition_analysis.build_body_summary(weight, body_fat, phase)


def _daily_totals_for_day(conn, day: str, phase: str) -> dict[str, float]:
    rows = conn.execute(
        f"""
        {_ENTRY_SELECT}
        WHERE e.user_id = ? AND e.date = ? AND e.phase = ?
        """,
        (get_current_user_id(), day, phase),
    ).fetchall()
    return _sum_totals([_entry_from_row(r) for r in rows])


def _daily_totals_for_range(
    conn,
    date_from: str,
    date_to: str,
    phase: str,
) -> dict[str, dict[str, float]]:
    """Food totals keyed by date (single query)."""
    uid = get_current_user_id()
    rows = conn.execute(
        f"""
        {_ENTRY_SELECT}
        WHERE e.user_id = ? AND e.phase = ? AND e.date BETWEEN ? AND ?
        """,
        (uid, phase, str(date_from)[:10], str(date_to)[:10]),
    ).fetchall()
    grouped: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        entry = _entry_from_row(r)
        grouped.setdefault(str(entry["date"])[:10], []).append(entry)
    empty = {"protein": 0.0, "fat": 0.0, "carbs": 0.0, "calories": 0.0, "fiber": 0.0}
    return {day: _sum_totals(entries) if entries else dict(empty) for day, entries in grouped.items()}


def _weights_for_range(conn, date_to: str) -> list[tuple[str, float]]:
    """All weight rows up to date_to for forward-fill lookup."""
    rows = conn.execute(
        """
        SELECT date, weight_kg FROM daily_weight
        WHERE date <= ? AND weight_kg IS NOT NULL
        ORDER BY date
        """,
        (str(date_to)[:10],),
    ).fetchall()
    return [(str(r["date"])[:10], float(r["weight_kg"])) for r in rows]


def _weight_on_day(weights: list[tuple[str, float]], day: str) -> float | None:
    d = str(day)[:10]
    best: float | None = None
    for wdate, wkg in weights:
        if wdate <= d:
            best = wkg
        else:
            break
    return best


def _workout_calories_for_range(conn, date_from: str, date_to: str) -> dict[str, dict[str, float]]:
    uid = get_current_user_id()
    d_from = str(date_from)[:10]
    d_to = str(date_to)[:10]
    acc: dict[str, dict[str, float]] = {}

    cardio_rows = conn.execute(
        """
        SELECT date,
               COALESCE(SUM(
                   COALESCE(calories_chest, calories_watch, calories_hr, calories, 0)
               ), 0) AS kcal
        FROM cardio_workouts
        WHERE date BETWEEN ? AND ? AND user_id = ?
        GROUP BY date
        """,
        (d_from, d_to, uid),
    ).fetchall()
    for row in cardio_rows:
        day = str(row["date"])[:10]
        acc.setdefault(day, {"cardio_kcal": 0.0, "strength_kcal": 0.0, "workout_kcal": 0.0})
        acc[day]["cardio_kcal"] = _round1(float(row["kcal"] or 0))

    strength_rows = conn.execute(
        """
        SELECT date, COALESCE(SUM(kcal), 0) AS kcal FROM (
            SELECT date, workout_title,
                   MAX(COALESCE(calories_chest, calories_hr, 0)) AS kcal
            FROM strength_workouts
            WHERE date BETWEEN ? AND ? AND user_id = ?
            GROUP BY date, workout_title
        )
        GROUP BY date
        """,
        (d_from, d_to, uid),
    ).fetchall()
    for row in strength_rows:
        day = str(row["date"])[:10]
        acc.setdefault(day, {"cardio_kcal": 0.0, "strength_kcal": 0.0, "workout_kcal": 0.0})
        acc[day]["strength_kcal"] = _round1(float(row["kcal"] or 0))

    for day, vals in acc.items():
        vals["workout_kcal"] = _round1(vals["cardio_kcal"] + vals["strength_kcal"])
    return acc


def _workout_calories(conn, day: str) -> dict[str, float]:
    cardio = conn.execute(
        """
        SELECT COALESCE(SUM(
            COALESCE(calories_chest, calories_watch, calories_hr, calories, 0)
        ), 0) AS kcal
        FROM cardio_workouts WHERE date = ? AND user_id = ?
        """,
        (day, get_current_user_id()),
    ).fetchone()
    strength = conn.execute(
        """
        SELECT COALESCE(SUM(kcal), 0) AS kcal FROM (
            SELECT MAX(COALESCE(calories_chest, calories_hr, 0)) AS kcal
            FROM strength_workouts
            WHERE date = ? AND user_id = ?
            GROUP BY workout_title
        )
        """,
        (day, get_current_user_id()),
    ).fetchone()
    cardio_kcal = float(cardio["kcal"] or 0) if cardio else 0.0
    strength_kcal = float(strength["kcal"] or 0) if strength else 0.0
    return {
        "cardio_kcal": _round1(cardio_kcal),
        "strength_kcal": _round1(strength_kcal),
        "workout_kcal": _round1(cardio_kcal + strength_kcal),
    }


def compute_bmr(weight_kg: float, height_cm: float, age_years: int, sex: str | None = None) -> float:
    if sex is None:
        sex = settings_service.get_sex()
    return _round1(_core_compute_bmr(weight_kg, height_cm, age_years, sex=sex))


def get_expenditure(
    day: str,
    intake_totals: dict[str, float] | None = None,
    *,
    conn=None,
    profile: dict[str, Any] | None = None,
    weight_kg: float | None = None,
    workout_totals: dict[str, float] | None = None,
) -> dict[str, Any]:
    d = str(day)[:10]
    profile = profile if profile is not None else (user_service.get_profile() or {})
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    try:
        if weight_kg is None:
            weight = _weight_for_date(conn, d)
        else:
            weight = weight_kg
        if workout_totals is None:
            workouts = _workout_calories(conn, d)
        else:
            workouts = workout_totals
    finally:
        if own_conn:
            conn.close()

    height = profile.get("height_cm")
    dob = profile.get("date_of_birth")
    age = age_from_date_of_birth(dob) if dob else None
    missing: list[str] = []
    if weight is None:
        missing.append("вес")
    if height is None:
        missing.append("рост")
    if age is None:
        missing.append("дата рождения")

    bmr: float | None = None
    sex = settings_service.get_sex()
    bmr_base: float | None = None
    bmr_cycle_adj = False
    bmr_cycle_note: str | None = None
    cycle_phase: str | None = None
    if weight and height and age is not None:
        bmr_base = compute_bmr(weight, float(height), int(age), sex=sex)
        bmr = bmr_base
        if sex == "female":
            try:
                from backend.services import menstrual_cycle_service

                impact = menstrual_cycle_service.get_cycle_impact(d)
                if impact.get("tracking") and impact.get("bmr_adjusted"):
                    mult = float(impact.get("bmr_multiplier") or 1.0)
                    bmr = _round1(bmr_base * mult)
                    bmr_cycle_adj = True
                    bmr_cycle_note = impact.get("bmr_note") or "Скорректировано с учётом фазы цикла"
                    cycle_phase = impact.get("phase")
            except Exception:
                pass

    workout_kcal = workouts["workout_kcal"]
    activity_kcal = 0.0
    tef_kcal = 0.0
    if intake_totals:
        tef = nutrition_analysis.calc_tef(
            float(intake_totals.get("protein") or 0),
            float(intake_totals.get("fat") or 0),
            float(intake_totals.get("carbs") or 0),
        )
        tef_kcal = tef["tef_kcal"]

    total_burn = (
        _round1((bmr or 0) + activity_kcal + workout_kcal + tef_kcal)
        if bmr is not None
        else None
    )

    bmr_note = (
        None
        if bmr is not None
        else f"Укажите в профиле и весе: {', '.join(missing)}"
    )
    if bmr_cycle_note and bmr is not None:
        bmr_note = bmr_cycle_note

    return {
        "bmr": bmr,
        "bmr_base": bmr_base,
        "bmr_cycle_adj": bmr_cycle_adj,
        "bmr_cycle_note": bmr_cycle_note,
        "cycle_phase": cycle_phase,
        "cardio_kcal": workouts["cardio_kcal"],
        "strength_kcal": workouts["strength_kcal"],
        "workout_kcal": workout_kcal,
        "activity_kcal": _round1(activity_kcal),
        "tef_kcal": tef_kcal,
        "total_burn": total_burn,
        "bmr_available": bmr is not None,
        "bmr_note": bmr_note,
        "sex_used": sex,
        "weight_kg": weight,
        "height_cm": height,
        "age_years": age,
    }


def get_day_log(day: str, phase: str = "cut") -> dict[str, Any]:
    d = str(day)[:10]
    ph = _validate_phase(phase)
    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            {_ENTRY_SELECT}
            WHERE e.user_id = ? AND e.date = ? AND e.phase = ?
            ORDER BY
                {_MEAL_TYPE_SORT_SQL},
                e.id
            """,
            (get_current_user_id(), d, ph),
        ).fetchall()
    finally:
        conn.close()

    entries = [_entry_from_row(r) for r in rows]
    for e in entries:
        e["meal_type"] = _validate_meal_type(e["meal_type"])
    daily_totals = _sum_totals(entries)
    goals = get_goals(d, ph)
    goal_percent = _goal_percents(daily_totals, goals)
    expenditure = get_expenditure(d, daily_totals)
    balance = None
    if expenditure.get("total_burn") is not None:
        balance = _round1(daily_totals["calories"] - expenditure["total_burn"])

    conn = get_db()
    try:
        body_summary = _body_context(conn, d, ph)
        weight = body_summary.get("weight_kg")
    finally:
        conn.close()

    insights = nutrition_analysis.build_nutrition_insights(
        daily_totals,
        goals,
        weight,
        ph,
        defaults_g_per_kg={
            k: v
            for k, v in user_service.get_effective_nutrition_grams_per_kg().items()
            if k in ("protein", "fat", "carbs")
        },
    )

    by_meal: dict[str, list[dict[str, Any]]] = {m: [] for m in MEAL_ORDER}
    for e in entries:
        by_meal.setdefault(e["meal_type"], []).append(e)

    by_meal_totals: dict[str, dict[str, float]] = {}
    for meal in MEAL_ORDER:
        meal_entries = by_meal.get(meal) or []
        if meal_entries:
            by_meal_totals[meal] = _sum_totals(meal_entries)

    fiber_target = user_service.get_daily_fiber_target()
    current_fiber = daily_totals.get("fiber", 0.0)
    payload: dict[str, Any] = {
        "date": d,
        "phase": ph,
        "entries": entries,
        "by_meal": by_meal,
        "by_meal_totals": by_meal_totals,
        "daily_totals": daily_totals,
        "alcohol_calories": _alcohol_calories(entries),
        "goals": goals,
        "goal_percent": goal_percent,
        "expenditure": {**expenditure, "balance": balance},
        "body_summary": body_summary,
        "insights": insights,
        "daily_fiber_target": {
            "recommended_grams": fiber_target["recommended_grams"],
            "current_grams": current_fiber,
        },
        "current_fiber": current_fiber,
    }
    payload.update(get_meal_plan_suggestion(d, ph))
    return payload


def get_day_log_lite(day: str, phase: str = "cut") -> dict[str, Any]:
    """Облегчённый дневник для главной: без insights-расчёта и meal_plan."""
    d = str(day)[:10]
    ph = _validate_phase(phase)
    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            {_ENTRY_SELECT}
            WHERE e.user_id = ? AND e.date = ? AND e.phase = ?
            ORDER BY
                {_MEAL_TYPE_SORT_SQL},
                e.id
            """,
            (get_current_user_id(), d, ph),
        ).fetchall()
    finally:
        conn.close()

    entries = [_entry_from_row(r) for r in rows]
    for e in entries:
        e["meal_type"] = _validate_meal_type(e["meal_type"])
    daily_totals = _sum_totals(entries)
    goals = get_goals(d, ph)
    goal_percent = _goal_percents(daily_totals, goals)

    by_meal: dict[str, list[dict[str, Any]]] = {m: [] for m in MEAL_ORDER}
    for e in entries:
        by_meal.setdefault(e["meal_type"], []).append(e)

    by_meal_totals: dict[str, dict[str, float]] = {}
    for meal in MEAL_ORDER:
        meal_entries = by_meal.get(meal) or []
        if meal_entries:
            by_meal_totals[meal] = _sum_totals(meal_entries)

    fiber_target = user_service.get_daily_fiber_target()
    current_fiber = daily_totals.get("fiber", 0.0)
    extras = _food_day_log_schema_defaults(ph)
    return {
        "date": d,
        "phase": ph,
        "entries": entries,
        "by_meal": by_meal,
        "by_meal_totals": by_meal_totals,
        "daily_totals": daily_totals,
        "alcohol_calories": _alcohol_calories(entries),
        "goals": goals,
        "goal_percent": goal_percent,
        **extras,
        "daily_fiber_target": {
            "recommended_grams": fiber_target["recommended_grams"],
            "current_grams": current_fiber,
        },
        "current_fiber": current_fiber,
        "suggested_meal_plan_id": None,
        "suggested_meal_plan_name": None,
        "suggested_plan_reason": None,
    }


def _food_day_log_schema_defaults(phase: str) -> dict[str, Any]:
    """Пустые expenditure/body_summary/insights для FoodDayResponse (Pydantic)."""
    sex = settings_service.get_sex() or "male"
    return {
        "expenditure": {
            "cardio_kcal": 0.0,
            "strength_kcal": 0.0,
            "workout_kcal": 0.0,
            "activity_kcal": 0.0,
            "tef_kcal": 0.0,
            "bmr_available": False,
            "sex_used": sex,
        },
        "body_summary": {
            "phase": phase,
            "goal_label": "",
        },
        "insights": {
            "tef": {
                "base_calories": 0.0,
                "tef_kcal": 0.0,
                "net_calories": 0.0,
                "protein_tef": 0.0,
                "fat_tef": 0.0,
                "carbs_tef": 0.0,
            },
            "macro_calorie_shares": [],
            "per_kg": [],
        },
    }


def get_week_log(anchor_date: str, phase: str = "cut") -> dict[str, Any]:
    ph = _validate_phase(phase)
    week_days = week_dates_from_anchor(anchor_date)
    days: list[dict[str, Any]] = []
    week_totals = {"protein": 0.0, "fat": 0.0, "carbs": 0.0, "calories": 0.0, "fiber": 0.0}
    expenditure_by_day: list[dict[str, Any]] = []
    exp_acc = {
        "bmr": 0.0,
        "activity_kcal": 0.0,
        "workout_kcal": 0.0,
        "tef_kcal": 0.0,
        "total_out_kcal": 0.0,
        "intake_kcal": 0.0,
        "balance_kcal": 0.0,
    }

    week_alcohol_calories = 0.0
    conn = get_db()
    try:
        body_summary = _body_context(conn, week_days[-1], ph)
        weight = body_summary.get("weight_kg")
        profile = user_service.get_profile() or {}
        food_by_day = _daily_totals_for_range(conn, week_days[0], week_days[-1], ph)
        workout_by_day = _workout_calories_for_range(conn, week_days[0], week_days[-1])
        weight_rows = _weights_for_range(conn, week_days[-1])
        for day in week_days:
            daily = food_by_day.get(day) or {
                "protein": 0.0,
                "fat": 0.0,
                "carbs": 0.0,
                "calories": 0.0,
                "fiber": 0.0,
            }
            for key in week_totals:
                week_totals[key] += daily[key]
            day_weight = _weight_on_day(weight_rows, day)
            exp_base = get_expenditure(
                day,
                daily,
                conn=conn,
                profile=profile,
                weight_kg=day_weight,
                workout_totals=workout_by_day.get(
                    day,
                    {"cardio_kcal": 0.0, "strength_kcal": 0.0, "workout_kcal": 0.0},
                ),
            )
            breakdown = nutrition_analysis.build_expenditure_breakdown(
                day,
                daily,
                exp_base.get("bmr"),
                exp_base.get("workout_kcal") or 0.0,
                exp_base.get("activity_kcal") or 0.0,
            )
            expenditure_by_day.append(breakdown)
            for key in exp_acc:
                if breakdown.get(key) is not None:
                    exp_acc[key] += float(breakdown[key] or 0)
            day_entries = [
                _entry_from_row(r)
                for r in conn.execute(
                    f"""
                    {_ENTRY_SELECT}
                    WHERE e.user_id = ? AND e.date = ? AND e.phase = ?
                    """,
                    (get_current_user_id(), day, ph),
                ).fetchall()
            ]
            week_alcohol_calories += _alcohol_calories(day_entries)
            days.append(
                {
                    "date": day,
                    "daily_totals": daily,
                    "is_sunday": is_week_sunday(day),
                    "expenditure": breakdown,
                }
            )
    finally:
        conn.close()

    week_totals = {k: _round1(v) for k, v in week_totals.items()}
    n_days = len(week_days) or 1
    week_daily_average = {
        k: _round1(week_totals[k] / n_days) for k in week_totals
    }
    week_expenditure_totals = {k: _round1(v) for k, v in exp_acc.items()}
    goals = get_goals(week_days[-1], ph)
    insights = nutrition_analysis.build_nutrition_insights(
        week_totals,
        goals,
        weight,
        ph,
        per_kg_totals=week_daily_average,
        defaults_g_per_kg={
            k: v
            for k, v in user_service.get_effective_nutrition_grams_per_kg().items()
            if k in ("protein", "fat", "carbs")
        },
    )

    week_payload = {
        "week_start": week_days[0],
        "week_end": week_days[-1],
        "week_number": nutrition_analysis.week_number_saturday_start(week_days[0]),
        "phase": ph,
        "days": days,
        "week_totals": week_totals,
        "alcohol_calories": _round1(week_alcohol_calories),
        "week_daily_average": week_daily_average,
        "body_summary": body_summary,
        "insights": insights,
        "expenditure_by_day": expenditure_by_day,
        "week_expenditure_totals": week_expenditure_totals,
        "daily_fiber_target": {
            "recommended_grams": user_service.get_daily_fiber_target()["recommended_grams"],
            "current_grams": _round1(week_totals.get("fiber", 0.0) / n_days),
        },
        "current_fiber": week_totals.get("fiber", 0.0),
    }
    from backend.services import nutrition_analytics_service

    week_payload["analytics"] = nutrition_analytics_service.build_week_analytics_for_log(
        week_payload
    )
    return week_payload


def add_entry(data: dict[str, Any]) -> dict[str, Any]:
    d = str(data["date"])[:10]
    ph = _validate_phase(data.get("phase", "cut"))
    product_id = int(data["product_id"])
    quantity = float(data.get("quantity") or 100)
    if quantity <= 0:
        raise HTTPException(status_code=400, detail="quantity должно быть > 0")
    meal_type = _validate_meal_type(data["meal_type"])
    notes = data.get("notes")
    conn = get_db()
    try:
        snapshot = _resolve_entry_macro_snapshot(conn, product_id, data)
        cur = conn.execute(
            """
            INSERT INTO food_entries (
                date, phase, product_id, quantity, meal_type, notes,
                protein_per100, fat_per100, carbs_per100, calories_per100, user_id
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                d,
                ph,
                product_id,
                quantity,
                meal_type,
                notes,
                snapshot["protein_per100"],
                snapshot["fat_per100"],
                snapshot["carbs_per100"],
                snapshot["calories_per100"],
                get_current_user_id(),
            ),
        )
        conn.commit()
        entry_id = cur.lastrowid
        from backend.services.forma_sync.change_tracker import mark_row_pending_on_insert

        mark_row_pending_on_insert(conn, "food_entries", "id", entry_id)
        conn.commit()
        row = conn.execute(
            f"""
            {_ENTRY_SELECT}
            WHERE e.id = ?
            """,
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()
    return _entry_from_row(row)


def update_entry(entry_id: int, data: dict[str, Any]) -> dict[str, Any]:
    conn = get_db()
    try:
        uid = get_current_user_id()
        existing = conn.execute(
            "SELECT * FROM food_entries WHERE id = ? AND user_id = ?",
            (entry_id, uid),
        ).fetchone()
        if existing is None:
            raise HTTPException(status_code=404, detail="Запись не найдена")

        quantity = float(
            data["quantity"] if "quantity" in data else existing["quantity"]
        )
        if quantity <= 0:
            raise HTTPException(status_code=400, detail="quantity должно быть > 0")
        meal_type = _validate_meal_type(
            data.get("meal_type", existing["meal_type"])
        )
        notes = data["notes"] if "notes" in data else existing["notes"]
        product_id = int(
            data["product_id"] if "product_id" in data else existing["product_id"]
        )
        snapshot = _resolve_entry_macro_snapshot(conn, product_id, data)

        cur = conn.execute(
            """
            UPDATE food_entries
            SET product_id = ?, quantity = ?, meal_type = ?, notes = ?,
                protein_per100 = ?, fat_per100 = ?, carbs_per100 = ?, calories_per100 = ?
            WHERE id = ? AND user_id = ?
            """,
            (
                product_id,
                quantity,
                meal_type,
                notes,
                snapshot["protein_per100"],
                snapshot["fat_per100"],
                snapshot["carbs_per100"],
                snapshot["calories_per100"],
                entry_id,
                uid,
            ),
        )
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Запись не найдена")
        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "food_entries", "id", entry_id)
        conn.commit()
        row = conn.execute(
            f"""
            {_ENTRY_SELECT}
            WHERE e.id = ?
            """,
            (entry_id,),
        ).fetchone()
    finally:
        conn.close()
    return _entry_from_row(row)


def delete_entry(entry_id: int) -> None:
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM food_entries WHERE id = ? AND user_id = ?",
            (entry_id, get_current_user_id()),
        )
        conn.commit()
        if cur.rowcount == 0:
            raise HTTPException(status_code=404, detail="Запись не найдена")
    finally:
        conn.close()


def clear_day_entries(date: str, phase: str) -> int:
    """Удалить все записи дневника за дату и режим (cut/bulk) текущего пользователя."""
    import logging

    logger = logging.getLogger(__name__)
    d = str(date)[:10]
    ph = _validate_phase(phase)
    uid = get_current_user_id()
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM food_entries WHERE date = ? AND phase = ? AND user_id = ?",
            (d, ph, uid),
        )
        conn.commit()
        return int(cur.rowcount)
    except Exception:
        logger.exception("clear_day_entries failed date=%s phase=%s user_id=%s", d, ph, uid)
        raise
    finally:
        conn.close()


_PRODUCT_EXISTS_DETAIL = "Product already exists"
_BARCODE_EXISTS_DETAIL = "Product with this barcode already exists"


def get_product_by_external_id(external_id: str) -> dict[str, Any] | None:
    code = re.sub(r"\D", "", str(external_id or "").strip())
    if not code:
        return None
    conn = get_db()
    try:
        row = conn.execute(
            f"""
            SELECT {_product_select_columns()}
            FROM shared.food_products
            WHERE external_id = ?
            LIMIT 1
            """,
            (code,),
        ).fetchone()
        if row is None:
            return None
        return _product_from_row(row)
    finally:
        conn.close()


def ensure_product_from_off_preview(preview: dict[str, Any]) -> dict[str, Any] | None:
    """Сохранить продукт OFF в справочник по штрихкоду (только при явном сохранении пользователем)."""
    name = str(preview.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Нет названия продукта — сохранение невозможно.")
    protein = float(preview.get("protein") or 0)
    fat = float(preview.get("fat") or 0)
    carbs = float(preview.get("carbs") or 0)
    calories = float(preview.get("calories") or 0)
    if calories <= 0 and protein <= 0 and fat <= 0 and carbs <= 0:
        raise HTTPException(
            status_code=400,
            detail="Нет данных КБЖУ — укажите макросы вручную или выберите другой продукт.",
        )
    code = re.sub(r"\D", "", str(preview.get("external_id") or "").strip())
    if not code:
        return None
    existing = get_product_by_external_id(code)
    if existing:
        return existing
    try:
        return create_product(
            {
                "name": preview["name"],
                "protein": float(preview.get("protein") or 0),
                "fat": float(preview.get("fat") or 0),
                "carbs": float(preview.get("carbs") or 0),
                "fiber_g": float(preview.get("fiber_g") or 0),
                "calories": float(preview.get("calories") or 0),
                "is_alcohol": bool(preview.get("is_alcohol", False)),
                "external_id": code,
                "vitamin_c_mg": float(preview.get("vitamin_c_mg") or 0),
                "vitamin_d_mcg": float(preview.get("vitamin_d_mcg") or 0),
                "vitamin_b12_mcg": float(preview.get("vitamin_b12_mcg") or 0),
                "calcium_mg": float(preview.get("calcium_mg") or 0),
                "iron_mg": float(preview.get("iron_mg") or 0),
                "magnesium_mg": float(preview.get("magnesium_mg") or 0),
                "zinc_mg": float(preview.get("zinc_mg") or 0),
                "potassium_mg": float(preview.get("potassium_mg") or 0),
                "sodium_mg": float(preview.get("sodium_mg") or 0),
            }
        )
    except HTTPException as exc:
        if exc.status_code == 409:
            return get_product_by_external_id(code)
        raise


def find_products_by_name(q: str, *, limit: int = 8) -> list[dict[str, Any]]:
    term = str(q or "").strip()
    if len(term) < 2:
        return []
    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            SELECT {_product_select_columns()}
            FROM shared.food_products
            WHERE name LIKE ? ESCAPE '\\'
            ORDER BY name
            LIMIT ?
            """,
            (f"%{term.replace('%', '\\%').replace('_', '\\_')}%", limit),
        ).fetchall()
        return [_product_from_row(r) for r in rows]
    finally:
        conn.close()


def get_off_cache(cache_key: str) -> str | None:
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT payload FROM shared.openfoodfacts_cache WHERE cache_key = ?",
            (cache_key,),
        ).fetchone()
        return str(row["payload"]) if row else None
    finally:
        conn.close()


def set_off_cache(cache_key: str, payload: str) -> None:
    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO shared.openfoodfacts_cache (cache_key, payload, fetched_at)
            VALUES (?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(cache_key) DO UPDATE SET
                payload = excluded.payload,
                fetched_at = CURRENT_TIMESTAMP
            """,
            (cache_key, payload),
        )
        conn.commit()
    finally:
        conn.close()


def find_product_by_name_exact(name: str) -> dict[str, Any] | None:
    key = str(name or "").strip()
    if not key:
        return None
    conn = get_db()
    try:
        row = conn.execute(
            f"""
            SELECT {_product_select_columns()}
            FROM shared.food_products
            WHERE name = ?
            LIMIT 1
            """,
            (key,),
        ).fetchone()
        if row is None:
            return None
        return _product_from_row(row)
    finally:
        conn.close()


def create_product(data: dict[str, Any]) -> dict[str, Any]:
    data = dict(data)
    data.pop("contribute_to_openfoodfacts", None)
    data.pop("brand", None)

    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название продукта")

    external_id_raw = data.get("external_id")
    external_id = (
        re.sub(r"\D", "", str(external_id_raw).strip()) if external_id_raw else None
    ) or None

    components = data.get("components") or []
    total_weight_g = data.get("total_weight_g")

    conn = get_db()
    row = None
    try:
        if external_id and conn.execute(
            "SELECT 1 FROM shared.food_products WHERE external_id = ? LIMIT 1",
            (external_id,),
        ).fetchone() is not None:
            raise HTTPException(status_code=409, detail=_BARCODE_EXISTS_DETAIL)

        if conn.execute(
            "SELECT 1 FROM shared.food_products WHERE name = ? LIMIT 1",
            (name,),
        ).fetchone() is not None:
            raise HTTPException(status_code=409, detail=_PRODUCT_EXISTS_DETAIL)

        if components:
            per100_macros, _ = _macros_from_components(conn, components, total_weight_g)
            protein = per100_macros["protein"]
            fat = per100_macros["fat"]
            carbs = per100_macros["carbs"]
            calories = per100_macros["calories"]
            fiber_g = per100_macros.get("fiber", 0.0)
            is_composite = 1
        else:
            protein = float(data.get("protein") or 0)
            fat = float(data.get("fat") or 0)
            carbs = float(data.get("carbs") or 0)
            fiber_g = float(data.get("fiber_g") or 0)
            is_alcohol = bool(data.get("is_alcohol"))
            calories_in = data.get("calories")
            if calories_in is not None and float(calories_in) > 0:
                calories = _round1(float(calories_in))
            else:
                calories = macro_calories(protein, fat, carbs)
            is_composite = 0
            _validate_calorie_macro_match(
                protein, fat, carbs, calories, is_alcohol=is_alcohol
            )
            micro_values = _micro_values_from_data(data)

        is_alcohol_flag = (
            1
            if components
            else (1 if bool(data.get("is_alcohol")) else 0)
        )
        default_portion_g = data.get("default_portion_g")
        if default_portion_g is not None:
            default_portion_g = float(default_portion_g)
            if default_portion_g <= 0:
                default_portion_g = None
        if components:
            micro_values = [_round1(per100_macros.get(k, 0)) for k in MICRO_KEYS]
        micro_cols = ", ".join(MICRO_KEYS)
        micro_ph = ", ".join("?" for _ in MICRO_KEYS)
        product_id = _next_food_product_id(conn)
        conn.execute(
            f"""
            INSERT INTO shared.food_products (
                id, name, protein, fat, carbs, calories, fiber_g, {micro_cols},
                unit, is_composite, is_alcohol, external_id, default_portion_g
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, {micro_ph}, 'g', ?, ?, ?, ?)
            """,
            (
                product_id,
                name,
                protein,
                fat,
                carbs,
                calories,
                fiber_g,
                *micro_values,
                is_composite,
                is_alcohol_flag,
                external_id,
                default_portion_g,
            ),
        )
        row = conn.execute(
            f"""
            SELECT {_product_select_columns()}
            FROM shared.food_products
            WHERE id = ?
            """,
            (product_id,),
        ).fetchone()
        if row is None or row["id"] is None:
            raise HTTPException(status_code=500, detail="Не удалось сохранить продукт")
        product_id = int(row["id"])
        if components:
            _save_product_components(conn, product_id, components)
        conn.commit()
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_PRODUCT_EXISTS_DETAIL) from exc
    finally:
        conn.close()
    return _product_from_row(row)


def update_product(product_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Обновить простой (не составной) продукт."""
    conn = get_db()
    try:
        row = _get_product(conn, product_id)
        if bool(int(row["is_composite"] or 0)):
            raise HTTPException(
                status_code=400,
                detail="Составное блюдо обновляется через /food/composite",
            )

        name = str(data["name"]).strip() if data.get("name") is not None else str(row["name"])
        if not name:
            raise HTTPException(status_code=400, detail="Укажите название продукта")

        protein = float(data["protein"]) if data.get("protein") is not None else float(row["protein"] or 0)
        fat = float(data["fat"]) if data.get("fat") is not None else float(row["fat"] or 0)
        carbs = float(data["carbs"]) if data.get("carbs") is not None else float(row["carbs"] or 0)
        fiber_g = (
            float(data["fiber_g"])
            if data.get("fiber_g") is not None
            else float(row["fiber_g"] or 0) if "fiber_g" in row.keys() else 0.0
        )
        is_alcohol = (
            bool(data["is_alcohol"])
            if data.get("is_alcohol") is not None
            else bool(int(row["is_alcohol"] or 0))
        )

        if data.get("calories") is not None:
            calories = _round1(float(data["calories"]))
        else:
            calories = _round1(float(row["calories"] or 0))
            if calories <= 0:
                calories = macro_calories(protein, fat, carbs)

        _validate_calorie_macro_match(
            protein, fat, carbs, calories, is_alcohol=is_alcohol
        )

        dup = conn.execute(
            """
            SELECT id FROM shared.food_products
            WHERE name = ? COLLATE NOCASE AND id != ?
            """,
            (name, product_id),
        ).fetchone()
        if dup is not None:
            raise HTTPException(status_code=409, detail=_PRODUCT_EXISTS_DETAIL)

        micro_sets = []
        micro_values: list[float] = []
        for key in MICRO_KEYS:
            if key in data and data[key] is not None:
                micro_sets.append(f"{key} = ?")
                micro_values.append(_round1(float(data[key])))
            else:
                micro_sets.append(f"{key} = ?")
                micro_values.append(_micros_from_row(row)[key])

        if "default_portion_g" in data:
            raw_portion = data["default_portion_g"]
            if raw_portion is None:
                default_portion_g = None
            else:
                default_portion_g = float(raw_portion)
                if default_portion_g <= 0:
                    default_portion_g = None
        else:
            default_portion_g = (
                float(row["default_portion_g"])
                if "default_portion_g" in row.keys() and row["default_portion_g"] is not None
                else None
            )

        if "external_id" in data:
            external_id_raw = data["external_id"]
            external_id = (
                re.sub(r"\D", "", str(external_id_raw).strip())
                if external_id_raw
                else None
            ) or None
            if external_id:
                dup_barcode = conn.execute(
                    """
                    SELECT id FROM shared.food_products
                    WHERE external_id = ? AND id != ?
                    """,
                    (external_id, product_id),
                ).fetchone()
                if dup_barcode is not None:
                    raise HTTPException(status_code=409, detail=_BARCODE_EXISTS_DETAIL)
        else:
            external_id = (
                str(row["external_id"]).strip()
                if "external_id" in row.keys() and row["external_id"]
                else None
            )

        conn.execute(
            f"""
            UPDATE shared.food_products
            SET name = ?, protein = ?, fat = ?, carbs = ?, calories = ?, fiber_g = ?,
                {", ".join(micro_sets)}, is_alcohol = ?, default_portion_g = ?, external_id = ?
            WHERE id = ?
            """,
            (
                name,
                protein,
                fat,
                carbs,
                calories,
                fiber_g,
                *micro_values,
                1 if is_alcohol else 0,
                default_portion_g,
                external_id,
                product_id,
            ),
        )
        conn.commit()
        updated = _get_product(conn, product_id)
        return _product_from_row(updated)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(status_code=409, detail=_PRODUCT_EXISTS_DETAIL) from exc
    finally:
        conn.close()


def create_composite_product(data: dict[str, Any]) -> dict[str, Any]:
    """Создать многосоставное блюдо из ингредиентов справочника."""
    name = str(data.get("name", "")).strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название блюда")
    components = data.get("components") or []
    if not components:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы один компонент")
    return create_product(
        {
            "name": name,
            "components": components,
            "total_weight_g": data.get("total_weight_g"),
        }
    )


def _list_product_components(conn, product_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        """
        SELECT c.component_product_id AS product_id,
               c.quantity AS quantity_g,
               p.name AS product_name
        FROM shared.food_product_components c
        JOIN shared.food_products p ON p.id = c.component_product_id
        WHERE c.product_id = ?
        ORDER BY c.id
        """,
        (product_id,),
    ).fetchall()
    return [
        {
            "product_id": int(r["product_id"]),
            "product_name": str(r["product_name"]),
            "quantity_g": _round1(float(r["quantity_g"] or 0)),
        }
        for r in rows
    ]


def _validate_composite_components(
    conn,
    product_id: int,
    components: list[dict[str, Any]],
) -> None:
    for item in components:
        cid = int(item["product_id"])
        if cid == product_id:
            raise HTTPException(
                status_code=400,
                detail="Блюдо не может содержать само себя в составе",
            )
        row = _get_product(conn, cid)
        if bool(int(row["is_composite"] or 0)):
            raise HTTPException(
                status_code=400,
                detail=f"Компонент «{row['name']}» — составное блюдо; укажите простые продукты",
            )


def get_product_by_id(
    product_id: int,
    *,
    include_components: bool = False,
) -> dict[str, Any]:
    conn = get_db()
    try:
        row = _get_product(conn, product_id)
        result = _product_from_row(row)
        if include_components:
            if result["is_composite"]:
                result["components"] = _list_product_components(conn, product_id)
            else:
                result["components"] = []
        return result
    finally:
        conn.close()


def update_composite_product(product_id: int, data: dict[str, Any]) -> dict[str, Any]:
    """Обновить состав и БЖУ многосоставного блюда."""
    components = data.get("components") or []
    if not components:
        raise HTTPException(status_code=400, detail="Добавьте хотя бы один компонент")

    conn = get_db()
    try:
        row = _get_product(conn, product_id)
        if not bool(int(row["is_composite"] or 0)):
            raise HTTPException(
                status_code=400,
                detail="Продукт не является составным блюдом",
            )

        _validate_composite_components(conn, product_id, components)
        total_weight_g = data.get("total_weight_g")
        per100_macros, _ = _macros_from_components(conn, components, total_weight_g)
        _validate_calorie_macro_match(
            per100_macros["protein"],
            per100_macros["fat"],
            per100_macros["carbs"],
            per100_macros["calories"],
            is_alcohol=False,
        )

        fiber_g = per100_macros.get("fiber", 0.0)
        micro_values = [_round1(per100_macros.get(k, 0)) for k in MICRO_KEYS]
        micro_sets = ", ".join(f"{k} = ?" for k in MICRO_KEYS)
        macro_params = (
            per100_macros["protein"],
            per100_macros["fat"],
            per100_macros["carbs"],
            per100_macros["calories"],
            fiber_g,
            *micro_values,
        )

        name = data.get("name")
        if name is not None:
            name = str(name).strip()
            if not name:
                raise HTTPException(status_code=400, detail="Укажите название блюда")
            dup = conn.execute(
                """
                SELECT id FROM shared.food_products
                WHERE name = ? COLLATE NOCASE AND id != ?
                """,
                (name, product_id),
            ).fetchone()
            if dup is not None:
                raise HTTPException(
                    status_code=400,
                    detail="Продукт с таким названием уже есть",
                )
            conn.execute(
                f"""
                UPDATE shared.food_products
                SET name = ?, protein = ?, fat = ?, carbs = ?, calories = ?, fiber_g = ?,
                    {micro_sets}
                WHERE id = ?
                """,
                (
                    name,
                    *macro_params,
                    product_id,
                ),
            )
        else:
            conn.execute(
                f"""
                UPDATE shared.food_products
                SET protein = ?, fat = ?, carbs = ?, calories = ?, fiber_g = ?,
                    {micro_sets}
                WHERE id = ?
                """,
                (
                    *macro_params,
                    product_id,
                ),
            )

        _save_product_components(conn, product_id, components)
        conn.commit()
        updated = _get_product(conn, product_id)
        return _product_from_row(updated)
    except sqlite3.IntegrityError as exc:
        raise HTTPException(
            status_code=400,
            detail="Не удалось обновить блюдо",
        ) from exc
    finally:
        conn.close()


def list_templates(phase: str | None = None) -> list[dict[str, Any]]:
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        if phase:
            ph = _validate_phase(phase)
            rows = conn.execute(
                f"""
                SELECT t.id, t.name, t.meal_type, t.phase,
                       (SELECT COUNT(*) FROM {mq(conn, "meal_template_items")} i WHERE i.template_id = t.id) AS items_count
                FROM {mq(conn, "meal_templates")} t
                WHERE t.user_id = ? AND t.phase = ?
                ORDER BY
                    {_MEAL_TYPE_SORT_SQL_TEMPLATES},
                    t.name
                """,
                (uid, ph),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT t.id, t.name, t.meal_type, t.phase,
                       (SELECT COUNT(*) FROM {mq(conn, "meal_template_items")} i WHERE i.template_id = t.id) AS items_count
                FROM {mq(conn, "meal_templates")} t
                WHERE t.user_id = ?
                ORDER BY t.phase, t.meal_type, t.name
                """,
                (uid,),
            ).fetchall()
    finally:
        conn.close()
    return [
        {
            "id": int(r["id"]),
            "name": r["name"],
            "meal_type": r["meal_type"],
            "phase": r["phase"],
            "items_count": int(r["items_count"] or 0),
        }
        for r in rows
    ]


def get_template(template_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        tpl = _require_owned_template(conn, template_id)
        items_rows = conn.execute(
            f"""
            SELECT i.quantity,
                   p.id AS product_id, p.name AS product_name,
                   COALESCE(i.protein, p.protein) AS protein,
                   COALESCE(i.fat, p.fat) AS fat,
                   COALESCE(i.carbs, p.carbs) AS carbs,
                   COALESCE(i.calories, p.calories) AS calories
            FROM {mq(conn, "meal_template_items")} i
            JOIN shared.food_products p ON p.id = i.product_id
            WHERE i.template_id = ?
            ORDER BY i.id
            """,
            (template_id,),
        ).fetchall()
    finally:
        conn.close()

    items: list[dict[str, Any]] = []
    totals = {"protein": 0.0, "fat": 0.0, "carbs": 0.0, "calories": 0.0}
    for r in items_rows:
        per100 = {
            "protein": r["protein"],
            "fat": r["fat"],
            "carbs": r["carbs"],
            "calories": r["calories"],
        }
        macros = scale_macros(per100, r["quantity"])
        items.append(
            {
                "product_id": int(r["product_id"]),
                "product_name": r["product_name"],
                "quantity": _round1(r["quantity"]),
                "protein_per100": _round1(per100["protein"] or 0),
                "fat_per100": _round1(per100["fat"] or 0),
                "carbs_per100": _round1(per100["carbs"] or 0),
                "calories_per100": _round1(per100["calories"] or 0),
                **macros,
            }
        )
        for k in totals:
            totals[k] += macros[k]
    totals = {k: _round1(v) for k, v in totals.items()}

    return {
        "id": int(tpl["id"]),
        "name": tpl["name"],
        "meal_type": tpl["meal_type"],
        "phase": tpl["phase"],
        "items": items,
        "totals": totals,
    }


def update_template(template_id: int, body: dict[str, Any]) -> dict[str, Any]:
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        tpl = _require_owned_template(conn, template_id)

        if "name" in body and body["name"] is not None:
            name = str(body["name"]).strip()
            if not name:
                raise HTTPException(status_code=400, detail="Укажите название шаблона")
            conn.execute(
                f"UPDATE {mq(conn, "meal_templates")} SET name = ? WHERE id = ? AND user_id = ?",
                (name, template_id, _meal_plan_owner_id()),
            )

        if body.get("items") is not None:
            raw_items: list[dict[str, Any]] = []
            for item in list(body["items"]):
                pid = int(item.get("product_id") or 0)
                qty = float(item.get("quantity") or 0)
                if pid > 0 and qty > 0:
                    raw_items.append({"product_id": pid, "quantity": qty})
            if not raw_items:
                raise HTTPException(
                    status_code=400,
                    detail="Добавьте хотя бы один продукт в шаблон",
                )
            _validate_plan_product_ids(
                conn,
                [
                    {
                        "day_offset": 0,
                        "meals": [{"meal_type": "breakfast1", "items": raw_items}],
                    }
                ],
            )
            conn.execute(
                f"DELETE FROM {mq(conn, "meal_template_items")} WHERE template_id = ?",
                (template_id,),
            )
            for item in raw_items:
                pid = int(item["product_id"])
                qty = float(item["quantity"])
                product = _get_product(conn, pid)
                conn.execute(
                    f"""
                    INSERT INTO {mq(conn, "meal_template_items")} (
                        template_id, product_id, quantity,
                        protein, fat, carbs, calories
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        template_id,
                        pid,
                        qty,
                        product["protein"],
                        product["fat"],
                        product["carbs"],
                        product["calories"],
                    ),
                )
        conn.commit()
    finally:
        conn.close()
    return get_template(template_id)


def apply_template(
    template_id: int,
    date: str,
    phase: str,
    meal_type: str | None = None,
) -> dict[str, Any]:
    d = str(date)[:10]
    ph = _validate_phase(phase)
    tpl = get_template(template_id)
    if str(tpl["phase"]) != ph:
        raise HTTPException(
            status_code=400,
            detail="Шаблон относится к другому режиму (сушка/набор)",
        )
    mt = _validate_meal_type(meal_type or tpl["meal_type"])
    created: list[dict[str, Any]] = []
    for item in tpl["items"]:
        entry = add_entry(
            {
                "date": d,
                "phase": ph,
                "product_id": item["product_id"],
                "quantity": item["quantity"],
                "meal_type": mt,
                "notes": None,
                "protein_per100": item["protein_per100"],
                "fat_per100": item["fat_per100"],
                "carbs_per100": item["carbs_per100"],
                "calories_per100": item["calories_per100"],
            }
        )
        created.append(entry)
    return {
        "added": len(created),
        "entries": created,
        "meal_type": mt,
        "template_name": tpl["name"],
    }


def week_start_saturday(d: date) -> date:
    """Legacy: суббота как начало недели."""
    return week_calendar.week_start_for_date(d, week_calendar.WEEKDAY_SAT)


def week_dates_from_anchor(anchor: str) -> list[str]:
    start_day = settings_service.get_week_start_day()
    return week_calendar.week_dates_from_anchor(anchor, start_day)


def _meal_plan_day_offset(plan: dict[str, Any], target_date: str) -> int:
    """Индекс дня в недельном рационе (0..6) для целевой даты."""
    if not plan.get("is_weekly"):
        return 0
    d = str(target_date)[:10]
    week_days = week_dates_from_anchor(d)
    if d in week_days:
        return week_days.index(d)
    return 0


def is_week_sunday(day: str) -> bool:
    """Воскресенье в текущей неделе пользователя (для правил рациона)."""
    start_day = settings_service.get_week_start_day()
    return week_calendar.is_weekday_in_week(day, week_calendar.WEEKDAY_SUN, start_day)


def resolve_template_id_for_day(
    template_id: int,
    template_name: str,
    meal_type: str,
    day: str,
    phase: str,
) -> tuple[int, str]:
    """В воскресенье подменяет будничный «Ужин» на шаблон «Ужин (вс)»."""
    if not is_week_sunday(day) or meal_type != "dinner":
        return template_id, template_name
    low = template_name.lower()
    if "вс" in low or "вск" in low:
        return template_id, template_name

    prefix = template_name.rsplit("_", 1)[0] if "_" in template_name else ""
    sun_name = f"{prefix}_Ужин (вс)" if prefix else "Ужин (вс)"
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        row = conn.execute(
            f"""
            SELECT id, name FROM {mq(conn, "meal_templates")}
            WHERE user_id = ? AND name = ? AND phase = ?
            """,
            (uid, sun_name, phase),
        ).fetchone()
    finally:
        conn.close()
    if row:
        return int(row["id"]), str(row["name"])
    return template_id, template_name


def should_skip_meal_on_day(meal_type: str, template_name: str, day: str) -> bool:
    """В воскресенье в рацион не входит обед."""
    if not is_week_sunday(day):
        return False
    if meal_type == "lunch":
        return True
    low = template_name.lower()
    return "обед" in low


_MEAL_PLAN_USER_SCHEMA_READY = False


def _ensure_meal_plan_user_schema(conn: sqlite3.Connection) -> None:
    global _MEAL_PLAN_USER_SCHEMA_READY
    if _MEAL_PLAN_USER_SCHEMA_READY:
        return
    from database import migrations as m
    from database.connection import attach_shared, is_shared_attached, shared_table

    if not is_shared_attached(conn):
        attach_shared(conn)
    m._ensure_daily_meal_plans_is_custom(conn)
    m._ensure_weekly_meal_schedule(conn)
    from database.meal_plans_storage import meal_plan_schema

    if meal_plan_schema(conn) == "main":
        _MEAL_PLAN_USER_SCHEMA_READY = True
        return
    m._migration_v029_meal_plan_items(conn)
    m._migration_v046_meal_plan_items_drop_product_fk(conn)
    m._migration_v063_meal_plans_user_scope(conn)
    _MEAL_PLAN_USER_SCHEMA_READY = True


def _meal_plan_owner_id() -> int:
    return get_current_user_id()


def _next_template_id(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        f"SELECT COALESCE(MAX(id), 0) + 1 FROM {mq(conn, "meal_templates")}"
    ).fetchone()
    return int(row[0] or 1)


def _plan_uses_templates(conn: sqlite3.Connection, plan_id: int) -> bool:
    has_tpl = conn.execute(
        f"SELECT 1 FROM {mq(conn, "daily_meal_plan_templates")} WHERE plan_id = ? LIMIT 1",
        (plan_id,),
    ).fetchone()
    if not has_tpl:
        return False
    has_items = conn.execute(
        f"SELECT 1 FROM {mq(conn, "meal_plan_items")} WHERE plan_id = ? LIMIT 1",
        (plan_id,),
    ).fetchone()
    return has_items is None


def _require_owned_plan(conn: sqlite3.Connection, plan_id: int) -> sqlite3.Row:
    uid = _meal_plan_owner_id()
    row = conn.execute(
        f"""
        SELECT id, name, phase, description,
               COALESCE(is_custom, 0) AS is_custom,
               COALESCE(is_weekly, 0) AS is_weekly
        FROM {mq(conn, "daily_meal_plans")}
        WHERE id = ? AND user_id = ?
        """,
        (plan_id, uid),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Рацион не найден")
    return row


def _require_owned_template(conn: sqlite3.Connection, template_id: int) -> sqlite3.Row:
    uid = _meal_plan_owner_id()
    row = conn.execute(
        f"SELECT id, name, meal_type, phase FROM {mq(conn, "meal_templates")} WHERE id = ? AND user_id = ?",
        (template_id, uid),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    return row


def _next_meal_plan_id(conn: sqlite3.Connection) -> int:
    row = conn.execute(
        f"SELECT COALESCE(MAX(id), 0) + 1 FROM {mq(conn, "daily_meal_plans")}"
    ).fetchone()
    return int(row[0] or 1)


def _plan_row_to_summary(r: sqlite3.Row) -> dict[str, Any]:
    uses_templates = bool(int(r["uses_templates"] or 0))
    return {
        "id": int(r["id"]),
        "name": r["name"],
        "phase": r["phase"],
        "description": r["description"],
        "meals_count": int(r["meals_count"] or 0),
        "is_custom": bool(int(r["is_custom"] or 0)),
        "is_weekly": bool(int(r["is_weekly"] or 0)),
        "uses_templates": uses_templates,
    }


def _plan_select_sql(conn: sqlite3.Connection) -> str:
    return f"""
        SELECT p.id, p.name, p.phase, p.description,
               COALESCE(p.is_custom, 0) AS is_custom,
               COALESCE(p.is_weekly, 0) AS is_weekly,
               (
                 (SELECT COUNT(DISTINCT i.day_offset || ':' || i.meal_type)
                  FROM {mq(conn, "meal_plan_items")} i WHERE i.plan_id = p.id)
                 + (SELECT COUNT(*) FROM {mq(conn, "daily_meal_plan_templates")} pt
                    WHERE pt.plan_id = p.id)
               ) AS meals_count,
               CASE
                 WHEN EXISTS (
                   SELECT 1 FROM {mq(conn, "daily_meal_plan_templates")} pt
                   WHERE pt.plan_id = p.id
                 ) AND NOT EXISTS (
                   SELECT 1 FROM {mq(conn, "meal_plan_items")} i
                   WHERE i.plan_id = p.id LIMIT 1
                 ) THEN 1
                 ELSE 0
               END AS uses_templates
        FROM {mq(conn, "daily_meal_plans")} p
    """


def _normalize_plan_days_input(
    days: list[dict[str, Any]],
    *,
    is_weekly: bool,
) -> list[dict[str, Any]]:
    """Сгруппировать приёмы с продуктами; пустые приёмы отбрасываются."""
    by_offset: dict[int, dict[str, list[dict[str, Any]]]] = {}
    for day in days:
        offset = int(day.get("day_offset") or 0)
        if not is_weekly and offset != 0:
            continue
        if is_weekly and (offset < 0 or offset > 6):
            raise HTTPException(status_code=400, detail="day_offset: 0–6 для недельного рациона")
        meals_map = by_offset.setdefault(offset, {})
        for meal in day.get("meals") or []:
            mt = _validate_meal_type(str(meal.get("meal_type") or "breakfast1"))
            items: list[dict[str, Any]] = []
            for item in meal.get("items") or []:
                pid = int(item.get("product_id") or 0)
                qty = float(item.get("quantity") or 0)
                if pid <= 0 or qty <= 0:
                    continue
                items.append({"product_id": pid, "quantity": qty})
            if items:
                meals_map.setdefault(mt, []).extend(items)
    result: list[dict[str, Any]] = []
    for offset in sorted(by_offset.keys()):
        meals = [
            {"meal_type": mt, "items": items}
            for mt, items in sorted(by_offset[offset].items(), key=lambda x: x[0])
        ]
        if meals:
            result.append({"day_offset": offset, "meals": meals})
    return result


def _set_plan_items(
    conn: sqlite3.Connection,
    plan_id: int,
    days: list[dict[str, Any]],
) -> None:
    conn.execute(
        f"DELETE FROM {mq(conn, "meal_plan_items")} WHERE plan_id = ?",
        (plan_id,),
    )
    for day in days:
        offset = int(day["day_offset"])
        for meal in day["meals"]:
            mt = str(meal["meal_type"])
            for item in meal["items"]:
                conn.execute(
                    f"""
                    INSERT INTO {mq(conn, "meal_plan_items")}
                    (plan_id, day_offset, meal_type, product_id, quantity)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    (plan_id, offset, mt, int(item["product_id"]), float(item["quantity"])),
                )


def _load_plan_days(conn: sqlite3.Connection, plan_id: int) -> list[dict[str, Any]]:
    rows = conn.execute(
        f"""
        SELECT i.day_offset, i.meal_type, i.product_id, i.quantity, p.name AS product_name
        FROM {mq(conn, "meal_plan_items")} i
        JOIN shared.food_products p ON p.id = i.product_id
        WHERE i.plan_id = ?
        ORDER BY i.day_offset, i.meal_type, i.id
        """,
        (plan_id,),
    ).fetchall()
    by_day: dict[int, dict[str, list[dict[str, Any]]]] = {}
    for r in rows:
        offset = int(r["day_offset"])
        mt = str(r["meal_type"])
        by_day.setdefault(offset, {}).setdefault(mt, []).append(
            {
                "product_id": int(r["product_id"]),
                "product_name": str(r["product_name"]),
                "quantity": float(r["quantity"]),
            }
        )
    days: list[dict[str, Any]] = []
    for offset in sorted(by_day.keys()):
        meals = [
            {"meal_type": mt, "items": items}
            for mt, items in sorted(by_day[offset].items(), key=lambda x: x[0])
        ]
        days.append({"day_offset": offset, "meals": meals})
    return days


def _validate_plan_product_ids(conn: sqlite3.Connection, days: list[dict[str, Any]]) -> None:
    ids: set[int] = set()
    for day in days:
        for meal in day["meals"]:
            for item in meal["items"]:
                ids.add(int(item["product_id"]))
    if not ids:
        return
    placeholders = ",".join("?" * len(ids))
    found = conn.execute(
        f"SELECT id FROM shared.food_products WHERE id IN ({placeholders})",
        tuple(ids),
    ).fetchall()
    if len(found) != len(ids):
        raise HTTPException(status_code=400, detail="Один или несколько продуктов не найдены")


def _plan_has_items(conn: sqlite3.Connection, plan_id: int) -> bool:
    row = conn.execute(
        f"SELECT 1 FROM {mq(conn, "meal_plan_items")} WHERE plan_id = ? LIMIT 1",
        (plan_id,),
    ).fetchone()
    return row is not None


def _existing_meal_types_for_day(conn: sqlite3.Connection, day: str, phase: str) -> set[str]:
    rows = conn.execute(
        """
        SELECT DISTINCT meal_type FROM food_entries
        WHERE date = ? AND phase = ? AND user_id = ?
        """,
        (day, phase, get_current_user_id()),
    ).fetchall()
    return {_validate_meal_type(str(r[0])) for r in rows}


def _entry_key(meal_type: str, product_id: int, quantity: float) -> tuple[str, int, float]:
    return (_validate_meal_type(meal_type), int(product_id), round(float(quantity), 1))


def _existing_entry_keys_for_day(
    conn: sqlite3.Connection,
    day: str,
    phase: str,
) -> set[tuple[str, int, float]]:
    rows = conn.execute(
        """
        SELECT meal_type, product_id, quantity FROM food_entries
        WHERE date = ? AND phase = ? AND user_id = ?
        """,
        (day, phase, get_current_user_id()),
    ).fetchall()
    return {_entry_key(str(r[0]), int(r[1]), float(r[2])) for r in rows}


def resolve_meal_plan_apply_dates(
    plan: dict[str, Any],
    start_date: str,
    end_date: str | None,
) -> tuple[date, date, list[str]]:
    """Диапазон дат применения рациона (без сдвига к началу календарной недели)."""
    try:
        start = date.fromisoformat(str(start_date)[:10])
    except ValueError as err:
        raise HTTPException(status_code=400, detail="Некорректная start_date") from err

    is_weekly = bool(plan.get("is_weekly"))
    if end_date:
        try:
            end = date.fromisoformat(str(end_date)[:10])
        except ValueError as err:
            raise HTTPException(status_code=400, detail="Некорректная end_date") from err
    elif is_weekly:
        end = start + timedelta(days=6)
    else:
        end = start

    if end < start:
        raise HTTPException(status_code=400, detail="end_date раньше start_date")

    dates: list[str] = []
    current = start
    while current <= end:
        if is_weekly and (current - start).days > 6:
            break
        dates.append(current.isoformat())
        current += timedelta(days=1)
    if not dates:
        raise HTTPException(status_code=400, detail="Пустой диапазон дат")
    return start, end, dates


def preview_meal_plan_range(
    plan_id: int,
    start_date: str,
    end_date: str | None,
    phase: str,
) -> dict[str, Any]:
    ph = _validate_phase(phase)
    plan = get_meal_plan(plan_id)
    if str(plan["phase"]) != ph:
        raise HTTPException(
            status_code=400,
            detail="Рацион относится к другому режиму (сушка/набор)",
        )

    start, end, dates = resolve_meal_plan_apply_dates(plan, start_date, end_date)
    conn = get_db()
    try:
        day_rows: list[dict[str, Any]] = []
        total_existing = 0
        for d in dates:
            count = conn.execute(
                """
                SELECT COUNT(*) FROM food_entries
                WHERE date = ? AND phase = ? AND user_id = ?
                """,
                (d, ph, get_current_user_id()),
            ).fetchone()[0]
            total_existing += int(count)
            day_rows.append({"date": d, "existing_entries": int(count)})
    finally:
        conn.close()

    return {
        "plan_id": plan_id,
        "plan_name": plan["name"],
        "phase": ph,
        "is_weekly": bool(plan.get("is_weekly")),
        "start_date": start.isoformat(),
        "end_date": end.isoformat(),
        "dates": dates,
        "total_existing_entries": total_existing,
        "days": day_rows,
    }


def _apply_plan_items_for_day(
    conn: sqlite3.Connection,
    plan_id: int,
    day: str,
    day_offset: int,
    phase: str,
    *,
    overwrite: bool,
) -> tuple[int, list[dict[str, Any]]]:
    rows = conn.execute(
        f"""
        SELECT meal_type, product_id, quantity
        FROM {mq(conn, "meal_plan_items")}
        WHERE plan_id = ? AND day_offset = ?
        ORDER BY meal_type, id
        """,
        (plan_id, day_offset),
    ).fetchall()
    if not rows:
        return 0, []

    by_meal: dict[str, list[tuple[int, float]]] = {}
    for r in rows:
        mt = _validate_meal_type(str(r["meal_type"]))
        by_meal.setdefault(mt, []).append((int(r["product_id"]), float(r["quantity"])))

    existing_keys = set() if overwrite else _existing_entry_keys_for_day(conn, day, phase)
    added_entries: list[dict[str, Any]] = []
    total = 0

    for meal_type, items in by_meal.items():
        for product_id, quantity in items:
            key = _entry_key(meal_type, product_id, quantity)
            if not overwrite and key in existing_keys:
                continue
            _get_product(conn, product_id)
            cur = conn.execute(
                """
                INSERT INTO food_entries (
                    date, phase, product_id, quantity, meal_type, notes,
                    protein_per100, fat_per100, carbs_per100, calories_per100, user_id
                )
                SELECT ?, ?, ?, ?, ?, NULL,
                       COALESCE(p.protein, 0), COALESCE(p.fat, 0),
                       COALESCE(p.carbs, 0), COALESCE(p.calories, 0),
                       ?
                FROM shared.food_products p WHERE p.id = ?
                """,
                (day, phase, product_id, quantity, meal_type, get_current_user_id(), product_id),
            )
            entry_id = cur.lastrowid
            row = conn.execute(
            f"{_ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?",
            (entry_id, get_current_user_id()),
            ).fetchone()
            if row:
                entry = _entry_from_row(row)
                added_entries.append(entry)
                existing_keys.add(key)
                total += 1
    return total, added_entries


def list_meal_plans(
    phase: str | None = None,
    *,
    include_custom: bool = True,
) -> list[dict[str, Any]]:
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        custom_clause = ""
        params: list[Any] = [uid]
        if not include_custom:
            custom_clause = " AND COALESCE(p.is_custom, 0) = 0"
        if phase:
            ph = _validate_phase(phase)
            params.append(ph)
            rows = conn.execute(
                f"""
                {_plan_select_sql(conn)}
                WHERE p.user_id = ? AND p.phase = ?{custom_clause}
                ORDER BY p.phase, p.name
                """,
                tuple(params),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                {_plan_select_sql(conn)}
                WHERE p.user_id = ?{custom_clause}
                ORDER BY p.phase, p.name
                """,
                tuple(params),
            ).fetchall()
        conn.commit()
    finally:
        conn.close()
    return [_plan_row_to_summary(r) for r in rows]


def get_meal_plan(plan_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        uid = _meal_plan_owner_id()
        plan = _require_owned_plan(conn, plan_id)
        template_rows = conn.execute(
            f"""
            SELECT pt.sort_order, pt.template_id,
                   t.name AS template_name, t.meal_type,
                   (SELECT COUNT(*) FROM {mq(conn, "meal_template_items")} i
                    WHERE i.template_id = t.id) AS items_count
            FROM {mq(conn, "daily_meal_plan_templates")} pt
            JOIN {mq(conn, "meal_templates")} t ON t.id = pt.template_id
            WHERE pt.plan_id = ?
            ORDER BY pt.sort_order, pt.id
            """,
            (plan_id,),
        ).fetchall()
        days = _load_plan_days(conn, plan_id)
        uses_templates = _plan_uses_templates(conn, plan_id)
    finally:
        conn.close()
    return {
        "id": int(plan["id"]),
        "name": plan["name"],
        "phase": str(plan["phase"]),
        "description": plan["description"],
        "is_custom": bool(int(plan["is_custom"] or 0)),
        "is_weekly": bool(int(plan["is_weekly"] or 0)),
        "uses_templates": uses_templates,
        "days": days,
        "templates": [
            {
                "template_id": int(r["template_id"]),
                "template_name": r["template_name"],
                "meal_type": r["meal_type"],
                "sort_order": int(r["sort_order"]),
                "items_count": int(r["items_count"] or 0),
            }
            for r in template_rows
        ],
    }


def _validate_template_ids_for_phase(
    conn: sqlite3.Connection,
    template_ids: list[int],
    phase: str,
) -> list[int]:
    if not template_ids:
        raise HTTPException(status_code=400, detail="Выберите хотя бы один шаблон приёма пищи")
    unique_ids: list[int] = []
    seen: set[int] = set()
    for tid in template_ids:
        i = int(tid)
        if i in seen:
            continue
        seen.add(i)
        unique_ids.append(i)
    placeholders = ",".join("?" * len(unique_ids))
    uid = _meal_plan_owner_id()
    rows = conn.execute(
        f"""
        SELECT id, phase FROM {mq(conn, "meal_templates")}
        WHERE user_id = ? AND id IN ({placeholders})
        """,
        (uid, *unique_ids),
    ).fetchall()
    found = {int(r["id"]): str(r["phase"]) for r in rows}
    if len(found) != len(unique_ids):
        raise HTTPException(status_code=400, detail="Один или несколько шаблонов не найдены")
    for tid in unique_ids:
        if found[tid] != phase:
            raise HTTPException(
                status_code=400,
                detail="Шаблон относится к другому режиму (сушка/набор)",
            )
    return unique_ids


def _set_plan_templates(
    conn: sqlite3.Connection,
    plan_id: int,
    template_ids: list[int],
) -> None:
    conn.execute(
        f"DELETE FROM {mq(conn, "daily_meal_plan_templates")} WHERE plan_id = ?",
        (plan_id,),
    )
    for order, tid in enumerate(template_ids):
        conn.execute(
            f"""
            INSERT INTO {mq(conn, "daily_meal_plan_templates")} (plan_id, template_id, sort_order)
            VALUES (?, ?, ?)
            """,
            (plan_id, tid, order),
        )


def create_meal_plan(body: dict[str, Any]) -> dict[str, Any]:
    name = str(body.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Укажите название рациона")
    ph = _validate_phase(str(body.get("phase") or "cut"))
    description = body.get("description")
    if description is not None:
        description = str(description).strip() or None
    is_weekly = bool(body.get("is_weekly"))
    template_ids = list(body.get("template_ids") or [])
    days = _normalize_plan_days_input(
        list(body.get("days") or []),
        is_weekly=is_weekly,
    )
    if not days and not template_ids:
        raise HTTPException(
            status_code=400,
            detail="Добавьте хотя бы один приём пищи с продуктами или выберите шаблоны",
        )

    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        uid = _meal_plan_owner_id()
        dup = conn.execute(
            f"""
            SELECT id FROM {mq(conn, "daily_meal_plans")}
            WHERE user_id = ? AND phase = ? AND name = ? COLLATE NOCASE
            """,
            (uid, ph, name),
        ).fetchone()
        if dup is not None:
            raise HTTPException(status_code=409, detail="Рацион с таким названием уже есть")
        validated_templates: list[int] = []
        if template_ids:
            validated_templates = _validate_template_ids_for_phase(conn, template_ids, ph)
        if days:
            _validate_plan_product_ids(conn, days)
        plan_id = _next_meal_plan_id(conn)
        conn.execute(
            f"""
            INSERT INTO {mq(conn, "daily_meal_plans")}
            (id, user_id, name, phase, description, is_custom, is_weekly)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (plan_id, uid, name, ph, description, 1 if is_weekly else 0),
        )
        if validated_templates:
            _set_plan_templates(conn, plan_id, validated_templates)
        if days:
            _set_plan_items(conn, plan_id, days)
        conn.commit()
    finally:
        conn.close()
    return get_meal_plan(plan_id)


def update_meal_plan(plan_id: int, body: dict[str, Any]) -> dict[str, Any]:
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        uid = _meal_plan_owner_id()
        plan = _require_owned_plan(conn, plan_id)
        ph = str(plan["phase"])
        if "name" in body and body["name"] is not None:
            name = str(body["name"]).strip()
            if not name:
                raise HTTPException(status_code=400, detail="Укажите название рациона")
            dup = conn.execute(
                f"""
                SELECT id FROM {mq(conn, "daily_meal_plans")}
                WHERE user_id = ? AND phase = ? AND name = ? COLLATE NOCASE AND id != ?
                """,
                (uid, ph, name, plan_id),
            ).fetchone()
            if dup is not None:
                raise HTTPException(status_code=409, detail="Рацион с таким названием уже есть")
            conn.execute(
                f"UPDATE {mq(conn, "daily_meal_plans")} SET name = ? WHERE id = ?",
                (name, plan_id),
            )
        if "description" in body:
            desc = body["description"]
            if desc is not None:
                desc = str(desc).strip() or None
            conn.execute(
                f"UPDATE {mq(conn, "daily_meal_plans")} SET description = ? WHERE id = ?",
                (desc, plan_id),
            )
        if "is_weekly" in body and body["is_weekly"] is not None:
            conn.execute(
                f"UPDATE {mq(conn, "daily_meal_plans")} SET is_weekly = ? WHERE id = ?",
                (1 if body["is_weekly"] else 0, plan_id),
            )
        is_weekly = bool(
            conn.execute(
                f"SELECT COALESCE(is_weekly, 0) FROM {mq(conn, "daily_meal_plans")} WHERE id = ?",
                (plan_id,),
            ).fetchone()[0]
        )
        if body.get("days") is not None:
            days = _normalize_plan_days_input(list(body["days"]), is_weekly=is_weekly)
            if not days and body.get("template_ids") is None:
                has_tpl = conn.execute(
                    f"SELECT 1 FROM {mq(conn, "daily_meal_plan_templates")} WHERE plan_id = ? LIMIT 1",
                    (plan_id,),
                ).fetchone()
                if not has_tpl:
                    raise HTTPException(
                        status_code=400,
                        detail="Добавьте хотя бы один приём пищи с продуктами",
                    )
            if days:
                _validate_plan_product_ids(conn, days)
                _set_plan_items(conn, plan_id, days)
            else:
                conn.execute(
                    f"DELETE FROM {mq(conn, "meal_plan_items")} WHERE plan_id = ?",
                    (plan_id,),
                )
        if body.get("template_ids") is not None:
            validated = _validate_template_ids_for_phase(
                conn,
                list(body["template_ids"]),
                ph,
            )
            _set_plan_templates(conn, plan_id, validated)
        conn.commit()
    finally:
        conn.close()
    return get_meal_plan(plan_id)


def delete_meal_plan(plan_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        plan = _require_owned_plan(conn, plan_id)
        conn.execute(
            "DELETE FROM weekly_meal_schedule WHERE meal_plan_id = ?",
            (plan_id,),
        )
        conn.execute(
            f"DELETE FROM {mq(conn, "daily_meal_plans")} WHERE id = ?",
            (plan_id,),
        )
        conn.commit()
    finally:
        conn.close()
    return {"deleted": True, "id": plan_id, "name": plan["name"]}


def get_weekly_meal_schedule() -> list[dict[str, Any]]:
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        rows = conn.execute(
            f"""
            SELECT s.day_of_week, s.meal_plan_id, p.name AS meal_plan_name
            FROM weekly_meal_schedule s
            JOIN {mq(conn, "daily_meal_plans")} p ON p.id = s.meal_plan_id AND p.user_id = ?
            WHERE s.user_id = ?
            """,
            (uid, uid),
        ).fetchall()
        conn.commit()
    finally:
        conn.close()
    by_day = {int(r["day_of_week"]): r for r in rows}
    result: list[dict[str, Any]] = []
    for dow in range(7):
        row = by_day.get(dow)
        if row is None:
            result.append(
                {
                    "day_of_week": dow,
                    "meal_plan_id": None,
                    "meal_plan_name": None,
                }
            )
        else:
            result.append(
                {
                    "day_of_week": dow,
                    "meal_plan_id": int(row["meal_plan_id"]),
                    "meal_plan_name": row["meal_plan_name"],
                }
            )
    return result


def save_weekly_meal_schedule(days: list[dict[str, Any]]) -> list[dict[str, Any]]:
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        for item in days:
            dow = int(item["day_of_week"])
            if dow < 0 or dow > 6:
                raise HTTPException(status_code=400, detail="day_of_week: 0–6 (пн–вс)")
            meal_plan_id = item.get("meal_plan_id")
            conn.execute(
                """
                DELETE FROM weekly_meal_schedule
                WHERE user_id = ? AND day_of_week = ?
                """,
                (uid, dow),
            )
            if meal_plan_id is None:
                continue
            pid = int(meal_plan_id)
            plan = conn.execute(
                f"SELECT id FROM {mq(conn, "daily_meal_plans")} WHERE id = ? AND user_id = ?",
                (pid, uid),
            ).fetchone()
            if plan is None:
                raise HTTPException(status_code=400, detail="Рацион не найден")
            conn.execute(
                """
                INSERT INTO weekly_meal_schedule (day_of_week, meal_plan_id, user_id)
                VALUES (?, ?, ?)
                """,
                (dow, pid, uid),
            )
        conn.commit()
    finally:
        conn.close()
    return get_weekly_meal_schedule()


def get_meal_plan_suggestion(day: str, phase: str) -> dict[str, Any]:
    d = str(day)[:10]
    ph = _validate_phase(phase)
    try:
        parsed = date.fromisoformat(d)
    except ValueError:
        return {}
    dow = parsed.weekday()
    uid = _meal_plan_owner_id()
    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        row = conn.execute(
            f"""
            SELECT s.meal_plan_id, p.name, p.phase
            FROM weekly_meal_schedule s
            JOIN {mq(conn, "daily_meal_plans")} p ON p.id = s.meal_plan_id AND p.user_id = ?
            WHERE s.user_id = ? AND s.day_of_week = ?
            """,
            (uid, uid, dow),
        ).fetchone()
        conn.commit()
    finally:
        conn.close()
    if row is None or str(row["phase"]) != ph:
        return {}
    day_name = WEEKDAY_NAMES_RU[dow]
    return {
        "suggested_meal_plan_id": int(row["meal_plan_id"]),
        "suggested_meal_plan_name": row["name"],
        "suggested_plan_reason": f"По расписанию на {day_name}",
    }


def _apply_template_items_for_day(
    conn: sqlite3.Connection,
    template_id: int,
    day: str,
    phase: str,
    meal_type: str,
    *,
    overwrite: bool,
) -> tuple[int, list[dict[str, Any]], str]:
    uid = _meal_plan_owner_id()
    tpl = conn.execute(
        f"""
        SELECT t.name, t.meal_type
        FROM {mq(conn, "meal_templates")} t
        WHERE t.id = ? AND t.user_id = ?
        """,
        (template_id, uid),
    ).fetchone()
    if tpl is None:
        raise HTTPException(status_code=404, detail="Шаблон не найден")
    mt = _validate_meal_type(meal_type or str(tpl["meal_type"]))
    items = conn.execute(
        f"""
        SELECT i.product_id, i.quantity,
               COALESCE(p.protein, 0) AS protein, COALESCE(p.fat, 0) AS fat,
               COALESCE(p.carbs, 0) AS carbs, COALESCE(p.calories, 0) AS calories
        FROM {mq(conn, "meal_template_items")} i
        JOIN shared.food_products p ON p.id = i.product_id
        WHERE i.template_id = ?
        ORDER BY i.id
        """,
        (template_id,),
    ).fetchall()
    if not items:
        return 0, [], str(tpl["name"])

    existing_keys = set() if overwrite else _existing_entry_keys_for_day(conn, day, phase)
    added_entries: list[dict[str, Any]] = []
    total = 0
    for row in items:
        product_id = int(row["product_id"])
        quantity = float(row["quantity"])
        key = _entry_key(mt, product_id, quantity)
        if not overwrite and key in existing_keys:
            continue
        _get_product(conn, product_id)
        cur = conn.execute(
            """
            INSERT INTO food_entries (
                date, phase, product_id, quantity, meal_type, notes,
                protein_per100, fat_per100, carbs_per100, calories_per100, user_id
            ) VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?)
            """,
            (
                day,
                phase,
                product_id,
                quantity,
                mt,
                float(row["protein"]),
                float(row["fat"]),
                float(row["carbs"]),
                float(row["calories"]),
                get_current_user_id(),
            ),
        )
        entry_id = cur.lastrowid
        erow = conn.execute(
            f"{_ENTRY_SELECT} WHERE e.id = ? AND e.user_id = ?",
            (entry_id, get_current_user_id()),
        ).fetchone()
        if erow:
            added_entries.append(_entry_from_row(erow))
            existing_keys.add(key)
            total += 1
    return total, added_entries, str(tpl["name"])


def _apply_meal_plan_templates_day(
    plan: dict[str, Any],
    plan_id: int,
    d: str,
    ph: str,
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    if not plan["templates"]:
        return {"total_added": 0, "meals": [], "entries": []}

    all_entries: list[dict[str, Any]] = []
    meals_result: list[dict[str, Any]] = []
    total_added = 0

    conn = get_db()
    try:
        for ref in plan["templates"]:
            if should_skip_meal_on_day(
                str(ref["meal_type"]),
                str(ref["template_name"]),
                d,
            ):
                continue
            tid, tname = resolve_template_id_for_day(
                int(ref["template_id"]),
                str(ref["template_name"]),
                str(ref["meal_type"]),
                d,
                ph,
            )
            added, entries, tpl_name = _apply_template_items_for_day(
                conn,
                tid,
                d,
                ph,
                ref["meal_type"],
                overwrite=overwrite,
            )
            total_added += added
            all_entries.extend(entries)
            meals_result.append(
                {
                    "template_id": tid,
                    "template_name": tpl_name or tname,
                    "meal_type": _validate_meal_type(ref["meal_type"]),
                    "added": added,
                }
            )
        conn.commit()
    finally:
        conn.close()

    return {
        "total_added": total_added,
        "meals": meals_result,
        "entries": all_entries,
    }


def apply_meal_plan(
    plan_id: int,
    date: str,
    phase: str,
    *,
    replace_existing: bool = False,
) -> dict[str, Any]:
    d = str(date)[:10]
    ph = _validate_phase(phase)
    plan = get_meal_plan(plan_id)
    if str(plan["phase"]) != ph:
        raise HTTPException(
            status_code=400,
            detail="Рацион относится к другому режиму (сушка/набор)",
        )

    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        if _plan_has_items(conn, plan_id):
            if replace_existing:
                clear_day_entries(d, ph)
            offset = _meal_plan_day_offset(plan, d)
            added, entries = _apply_plan_items_for_day(
                conn,
                plan_id,
                d,
                offset,
                ph,
                overwrite=replace_existing,
            )
            conn.commit()
            return {
                "plan_id": plan_id,
                "plan_name": plan["name"],
                "date": d,
                "phase": ph,
                "total_added": added,
                "meals": [],
                "entries": entries,
            }
    finally:
        conn.close()

    if not plan["templates"]:
        raise HTTPException(status_code=400, detail="В рационе нет приёмов пищи")
    if replace_existing:
        clear_day_entries(d, ph)
    tpl = _apply_meal_plan_templates_day(plan, plan_id, d, ph, overwrite=replace_existing)
    return {
        "plan_id": plan_id,
        "plan_name": plan["name"],
        "date": d,
        "phase": ph,
        "total_added": tpl["total_added"],
        "meals": tpl["meals"],
        "entries": tpl["entries"],
    }


def apply_meal_plan_range(
    plan_id: int,
    start_date: str,
    end_date: str | None,
    phase: str,
    *,
    overwrite: bool = False,
) -> dict[str, Any]:
    """Применить рацион к диапазону дат (день или неделя по day_offset)."""
    ph = _validate_phase(phase)
    plan = get_meal_plan(plan_id)
    if str(plan["phase"]) != ph:
        raise HTTPException(
            status_code=400,
            detail="Рацион относится к другому режиму (сушка/набор)",
        )

    is_weekly = bool(plan.get("is_weekly"))
    start, end, apply_dates = resolve_meal_plan_apply_dates(plan, start_date, end_date)

    conn = get_db()
    try:
        _ensure_meal_plan_user_schema(conn)
        has_items = _plan_has_items(conn, plan_id)
    finally:
        conn.close()

    if not has_items and not plan["templates"]:
        raise HTTPException(status_code=400, detail="В рационе нет приёмов пищи")

    days_result: list[dict[str, Any]] = []
    all_entries: list[dict[str, Any]] = []
    meals_result: list[dict[str, Any]] = []
    total_added = 0
    cleared = 0

    for d in apply_dates:
        day_offset = (date.fromisoformat(d) - start).days if is_weekly else 0

        if overwrite:
            cleared += clear_day_entries(d, ph)

        if has_items:
            conn = get_db()
            try:
                added, entries = _apply_plan_items_for_day(
                    conn,
                    plan_id,
                    d,
                    day_offset,
                    ph,
                    overwrite=overwrite,
                )
                conn.commit()
            finally:
                conn.close()
            total_added += added
            all_entries.extend(entries)
            days_result.append({"date": d, "added": added})
        else:
            day_tpl = _apply_meal_plan_templates_day(
                plan,
                plan_id,
                d,
                ph,
                overwrite=overwrite,
            )
            added = int(day_tpl["total_added"])
            total_added += added
            all_entries.extend(day_tpl["entries"])
            meals_result.extend(day_tpl["meals"])
            days_result.append({"date": d, "added": added})

    apply_week = len(apply_dates) > 1 or is_weekly
    week_stats = None
    if apply_week:
        week_stats = get_week_log(start.isoformat(), ph)

    return {
        "plan_id": plan_id,
        "plan_name": plan["name"],
        "date": start.isoformat(),
        "phase": ph,
        "apply_week": apply_week,
        "week_start": start.isoformat(),
        "week_end": end.isoformat(),
        "days_cleared": cleared,
        "total_added": total_added,
        "days": days_result,
        "meals": meals_result,
        "entries": all_entries,
        "week_stats": week_stats,
    }


def apply_meal_plan_week(
    plan_id: int,
    anchor_date: str,
    phase: str,
    *,
    replace_existing: bool = False,
) -> dict[str, Any]:
    """Заполнить дневник на 7 дней от anchor_date (совместимость)."""
    plan = get_meal_plan(plan_id)
    start = str(anchor_date)[:10]
    if plan.get("is_weekly") and plan.get("days"):
        start_day = settings_service.get_week_start_day()
        start = week_calendar.week_start_for_date(
            date.fromisoformat(start), start_day
        ).isoformat()
        end = (date.fromisoformat(start) + timedelta(days=6)).isoformat()
        return apply_meal_plan_range(
            plan_id,
            start,
            end,
            phase,
            overwrite=replace_existing,
        )
    week_days = week_dates_from_anchor(anchor_date)
    days_result: list[dict[str, Any]] = []
    total_added = 0
    cleared = 0
    all_entries: list[dict[str, Any]] = []
    for day in week_days:
        if replace_existing:
            cleared += clear_day_entries(day, phase)
        day_result = apply_meal_plan(
            plan_id,
            day,
            phase,
            replace_existing=replace_existing,
        )
        added = int(day_result["total_added"])
        total_added += added
        all_entries.extend(day_result["entries"])
        days_result.append({"date": day, "added": added})
    week_stats = get_week_log(anchor_date, phase)
    return {
        "plan_id": plan_id,
        "plan_name": plan["name"],
        "date": start,
        "phase": phase,
        "apply_week": True,
        "week_start": week_days[0],
        "week_end": week_days[-1],
        "days_cleared": cleared,
        "total_added": total_added,
        "days": days_result,
        "meals": [],
        "entries": all_entries,
        "week_stats": week_stats,
    }
