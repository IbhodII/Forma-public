# -*- coding: utf-8 -*-
"""
Миграция preset_exercises.default_reps → preset_sets.
Запуск из корня проекта:
    python scripts/migrate_preset_sets.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import WORKOUTS_DB_PATH, open_db
from database.migrations import (
    _migrate_plank_duration_in_strength_workouts,
    _migrate_preset_exercises_to_preset_sets,
    _seed_default_exercise_sets,
)


def main() -> None:
    if not WORKOUTS_DB_PATH.is_file():
        print(f"БД не найдена: {WORKOUTS_DB_PATH}")
        sys.exit(1)
    conn = open_db(attach=False)
    try:
        _migrate_preset_exercises_to_preset_sets(conn)
        _migrate_plank_duration_in_strength_workouts(conn)
        _seed_default_exercise_sets(conn)
        conn.commit()
        n = conn.execute("SELECT COUNT(*) FROM preset_sets").fetchone()[0]
        print(f"Готово. Записей в preset_sets: {n}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
