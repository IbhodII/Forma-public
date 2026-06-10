# -*- coding: utf-8 -*-
"""Схема и миграции общей БД shared.db (ATTACH к workouts.db)."""
from __future__ import annotations

import sqlite3

from database.connection import attach_shared


def ensure_shared_schema(conn: sqlite3.Connection) -> None:
    """Создаёт/обновляет таблицы в shared.db (требует ATTACH)."""
    attach_shared(conn)
    from database import migrations as m

    m._ensure_shared_food_catalog(conn)
    m._ensure_shared_stretching_exercises(conn)
    m._ensure_shared_strength_exercises(conn)
    m._ensure_shared_bike_reference(conn)
