# -*- coding: utf-8 -*-
"""Настройки велосипеда и справочники Crr для расчёта мощности."""
from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from typing import Any

from backend.database import get_db

PROFILE_ID = 1

TIRE_TYPES = frozenset({"road_slick", "semi_slick", "gravel", "cx"})
ROUTE_SURFACES = frozenset({"asphalt", "cobblestone", "gravel", "mixed"})
WHEEL_SIZES = (26.0, 27.5, 28.0, 29.0)

_DEFAULT_TIRE_CRR: dict[str, float] = {
    "road_slick": 0.0030,
    "semi_slick": 0.0045,
    "gravel": 0.0080,
    "cx": 0.0120,
}
_DEFAULT_SURFACE_MULT: dict[str, float] = {
    "asphalt": 1.0,
    "cobblestone": 1.5,
    "gravel": 2.0,
    "mixed": 1.3,
}


def _ensure_bike_reference_tables(conn) -> None:
    """Создаёт справочники Crr в shared.db, если их ещё нет (после импорта FIT и т.п.)."""
    try:
        from database.connection import attach_shared, is_shared_attached
        from database.shared_schema import ensure_shared_schema

        if not is_shared_attached(conn):
            attach_shared(conn)
        ensure_shared_schema(conn)
    except Exception:
        pass

DEFAULTS: dict[str, Any] = {
    "bike_weight_kg": 10.0,
    "rider_weight_kg": None,
    "tire_type": "road_slick",
    "tire_width_mm": 25,
    "wheel_size_inch": 28.0,
    "default_route_surface": "asphalt",
}

def _latest_body_weight_kg(conn) -> float | None:
    for sql in (
        """
        SELECT weight_kg FROM daily_weight
        WHERE weight_kg IS NOT NULL AND weight_kg > 0
        ORDER BY date DESC LIMIT 1
        """,
        """
        SELECT weight_kg FROM body_metrics
        WHERE weight_kg IS NOT NULL AND weight_kg > 0
        ORDER BY date DESC LIMIT 1
        """,
    ):
        row = conn.execute(sql).fetchone()
        if row and row[0] is not None:
            try:
                return float(row[0])
            except (TypeError, ValueError):
                continue
    return None


def resolve_rider_weight_kg(settings: dict[str, Any], conn) -> float:
    raw = settings.get("rider_weight_kg")
    if raw is not None:
        try:
            w = float(raw)
            if w > 0:
                return w
        except (TypeError, ValueError):
            pass
    suggested = _latest_body_weight_kg(conn)
    if suggested is not None:
        return suggested
    return 80.0


def resolve_effective_crr(settings: dict[str, Any], conn) -> float:
    tire_type = str(settings.get("tire_type") or DEFAULTS["tire_type"])
    surface = str(settings.get("default_route_surface") or DEFAULTS["default_route_surface"])
    base = _DEFAULT_TIRE_CRR.get(tire_type, 0.004)
    mult = _DEFAULT_SURFACE_MULT.get(surface, 1.0)
    try:
        row = conn.execute(
            "SELECT crr FROM shared.tire_coefficients WHERE tire_type = ?",
            (tire_type,),
        ).fetchone()
        if row:
            base = float(row[0])
        row = conn.execute(
            "SELECT crr_multiplier FROM shared.surface_multipliers WHERE surface = ?",
            (surface,),
        ).fetchone()
        if row:
            mult = float(row[0])
    except sqlite3.OperationalError:
        _ensure_bike_reference_tables(conn)
        try:
            row = conn.execute(
                "SELECT crr FROM shared.tire_coefficients WHERE tire_type = ?",
                (tire_type,),
            ).fetchone()
            if row:
                base = float(row[0])
            row = conn.execute(
                "SELECT crr_multiplier FROM shared.surface_multipliers WHERE surface = ?",
                (surface,),
            ).fetchone()
            if row:
                mult = float(row[0])
        except sqlite3.OperationalError:
            pass
    return round(base * mult, 6)


def resolve_total_mass_kg(settings: dict[str, Any], conn) -> float:
    bike = float(settings.get("bike_weight_kg") or DEFAULTS["bike_weight_kg"])
    rider = resolve_rider_weight_kg(settings, conn)
    return bike + rider


def list_tire_options(conn) -> list[dict[str, Any]]:
    placeholders = ", ".join("?" for _ in TIRE_TYPES)
    try:
        rows = conn.execute(
            f"""
            SELECT tire_type, MIN(crr) AS crr, MIN(description) AS description
            FROM shared.tire_coefficients
            WHERE tire_type IN ({placeholders})
            GROUP BY tire_type
            ORDER BY crr
            """,
            tuple(TIRE_TYPES),
        ).fetchall()
        by_type = {str(r["tire_type"]): dict(r) for r in rows}
        return [
            by_type.get(k) or {"tire_type": k, "crr": v, "description": None}
            for k, v in sorted(_DEFAULT_TIRE_CRR.items(), key=lambda x: x[1])
        ]
    except sqlite3.OperationalError:
        _ensure_bike_reference_tables(conn)
        try:
            rows = conn.execute(
                f"""
                SELECT tire_type, MIN(crr) AS crr, MIN(description) AS description
                FROM shared.tire_coefficients
                WHERE tire_type IN ({placeholders})
                GROUP BY tire_type
                ORDER BY crr
                """,
                tuple(TIRE_TYPES),
            ).fetchall()
            by_type = {str(r["tire_type"]): dict(r) for r in rows}
            return [
                by_type.get(k) or {"tire_type": k, "crr": v, "description": None}
                for k, v in sorted(_DEFAULT_TIRE_CRR.items(), key=lambda x: x[1])
            ]
        except sqlite3.OperationalError:
            return [
                {"tire_type": k, "crr": v, "description": None}
                for k, v in sorted(_DEFAULT_TIRE_CRR.items(), key=lambda x: x[1])
            ]


def list_surface_options(conn) -> list[dict[str, Any]]:
    placeholders = ", ".join("?" for _ in ROUTE_SURFACES)
    try:
        rows = conn.execute(
            f"""
            SELECT surface, MIN(crr_multiplier) AS crr_multiplier, MIN(description) AS description
            FROM shared.surface_multipliers
            WHERE surface IN ({placeholders})
            GROUP BY surface
            ORDER BY surface
            """,
            tuple(ROUTE_SURFACES),
        ).fetchall()
        by_surface = {str(r["surface"]): dict(r) for r in rows}
        return [
            by_surface.get(k) or {"surface": k, "crr_multiplier": v, "description": None}
            for k, v in sorted(_DEFAULT_SURFACE_MULT.items(), key=lambda x: x[0])
        ]
    except sqlite3.OperationalError:
        _ensure_bike_reference_tables(conn)
        try:
            rows = conn.execute(
                f"""
                SELECT surface, MIN(crr_multiplier) AS crr_multiplier, MIN(description) AS description
                FROM shared.surface_multipliers
                WHERE surface IN ({placeholders})
                GROUP BY surface
                ORDER BY surface
                """,
                tuple(ROUTE_SURFACES),
            ).fetchall()
            by_surface = {str(r["surface"]): dict(r) for r in rows}
            return [
                by_surface.get(k) or {"surface": k, "crr_multiplier": v, "description": None}
                for k, v in sorted(_DEFAULT_SURFACE_MULT.items(), key=lambda x: x[0])
            ]
        except sqlite3.OperationalError:
            return [
                {"surface": k, "crr_multiplier": v, "description": None}
                for k, v in sorted(_DEFAULT_SURFACE_MULT.items(), key=lambda x: x[0])
            ]


def _row_to_dict(row, conn) -> dict[str, Any]:
    data = dict(row)
    payload = {
        "id": int(data["id"]),
        "user_id": int(data.get("user_id") or PROFILE_ID),
        "bike_weight_kg": float(data.get("bike_weight_kg") or DEFAULTS["bike_weight_kg"]),
        "rider_weight_kg": (
            float(data["rider_weight_kg"])
            if data.get("rider_weight_kg") is not None
            else None
        ),
        "tire_type": str(data.get("tire_type") or DEFAULTS["tire_type"]),
        "tire_width_mm": int(data.get("tire_width_mm") or DEFAULTS["tire_width_mm"]),
        "wheel_size_inch": float(data.get("wheel_size_inch") or DEFAULTS["wheel_size_inch"]),
        "default_route_surface": str(
            data.get("default_route_surface") or DEFAULTS["default_route_surface"]
        ),
        "created_at": data.get("created_at"),
        "updated_at": data.get("updated_at"),
    }
    payload["suggested_rider_weight_kg"] = _latest_body_weight_kg(conn)
    payload["effective_rider_weight_kg"] = resolve_rider_weight_kg(payload, conn)
    payload["effective_crr"] = resolve_effective_crr(payload, conn)
    payload["tire_options"] = list_tire_options(conn)
    payload["surface_options"] = list_surface_options(conn)
    return payload


def get_or_create_bike_settings(*, conn=None) -> dict[str, Any]:
    own = conn is None
    if own:
        conn = get_db()
    try:
        row = conn.execute(
            "SELECT * FROM bike_settings WHERE user_id = ? LIMIT 1",
            (PROFILE_ID,),
        ).fetchone()
        if row is None:
            now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
            conn.execute(
                """
                INSERT INTO bike_settings (
                    user_id, bike_weight_kg, rider_weight_kg, tire_type,
                    tire_width_mm, wheel_size_inch, default_route_surface,
                    created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    PROFILE_ID,
                    DEFAULTS["bike_weight_kg"],
                    None,
                    DEFAULTS["tire_type"],
                    DEFAULTS["tire_width_mm"],
                    DEFAULTS["wheel_size_inch"],
                    DEFAULTS["default_route_surface"],
                    now,
                    now,
                ),
            )
            if own:
                conn.commit()
            row = conn.execute(
                "SELECT * FROM bike_settings WHERE user_id = ? LIMIT 1",
                (PROFILE_ID,),
            ).fetchone()
        return _row_to_dict(row, conn)
    finally:
        if own:
            conn.close()


def save_bike_settings(data: dict[str, Any]) -> dict[str, Any]:
    current = get_or_create_bike_settings()
    updates: dict[str, Any] = {}

    if "bike_weight_kg" in data:
        val = data["bike_weight_kg"]
        if val is None:
            raise ValueError("bike_weight_kg обязателен")
        updates["bike_weight_kg"] = _positive_float(val, "bike_weight_kg")

    if "rider_weight_kg" in data:
        val = data["rider_weight_kg"]
        if val is None or val == "":
            updates["rider_weight_kg"] = None
        else:
            updates["rider_weight_kg"] = _positive_float(val, "rider_weight_kg")

    if "tire_type" in data and data["tire_type"] is not None:
        t = str(data["tire_type"]).strip()
        if t not in TIRE_TYPES:
            raise ValueError(f"Недопустимый tire_type: {t}")
        updates["tire_type"] = t

    if "tire_width_mm" in data and data["tire_width_mm"] is not None:
        w = int(data["tire_width_mm"])
        if w < 18 or w > 60:
            raise ValueError("tire_width_mm должен быть 18–60")
        updates["tire_width_mm"] = w

    if "wheel_size_inch" in data and data["wheel_size_inch"] is not None:
        ws = float(data["wheel_size_inch"])
        if ws not in WHEEL_SIZES:
            raise ValueError("wheel_size_inch: допустимо 26, 27.5, 28, 29")
        updates["wheel_size_inch"] = ws

    if "default_route_surface" in data and data["default_route_surface"] is not None:
        s = str(data["default_route_surface"]).strip()
        if s not in ROUTE_SURFACES:
            raise ValueError(f"Недопустимый default_route_surface: {s}")
        updates["default_route_surface"] = s

    if not updates:
        return get_or_create_bike_settings()

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    set_sql = ", ".join(f"{col} = ?" for col in updates)
    params = [*updates.values(), now, int(current["id"])]
    conn = get_db()
    try:
        conn.execute(
            f"UPDATE bike_settings SET {set_sql}, updated_at = ? WHERE id = ?",
            params,
        )
        conn.commit()
    finally:
        conn.close()
    return get_or_create_bike_settings()


def _positive_float(val: Any, name: str) -> float:
    try:
        n = float(val)
    except (TypeError, ValueError) as err:
        raise ValueError(f"{name} должно быть числом") from err
    if n <= 0:
        raise ValueError(f"{name} должно быть > 0")
    return n
