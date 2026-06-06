# -*- coding: utf-8 -*-
"""
Импорт упражнений растяжки из free-exercise-db-main.zip → shared.stretching_exercises.

Запуск из корня проекта:
    .\\venv\\Scripts\\python.exe scripts/import_free_exercise_db.py

Архив по умолчанию: C:\\Users\\brett\\Downloads\\free-exercise-db-main.zip
"""
from __future__ import annotations

import json
import sqlite3
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import SHARED_DB_PATH
from database.migrations import ensure_db_schema

DEFAULT_ZIP = Path(r"C:\Users\brett\Downloads\free-exercise-db-main.zip")
EXERCISES_JSON_IN_ZIP = "free-exercise-db-main/dist/exercises.json"


def _normalize_images(images: list) -> list[str]:
    """Относительные пути вида exercises/Air_Bike/0.jpg."""
    out: list[str] = []
    for raw in images:
        path = str(raw or "").strip().replace("\\", "/").lstrip("/")
        if not path:
            continue
        if not path.startswith("exercises/"):
            path = f"exercises/{path}"
        out.append(path)
    return out


def _load_stretching_from_zip(zip_path: Path) -> list[dict]:
    if not zip_path.is_file():
        raise FileNotFoundError(f"Архив не найден: {zip_path}")

    with zipfile.ZipFile(zip_path, "r") as zf:
        if EXERCISES_JSON_IN_ZIP not in zf.namelist():
            candidates = [n for n in zf.namelist() if n.endswith("dist/exercises.json")]
            if not candidates:
                raise FileNotFoundError(
                    f"В архиве нет {EXERCISES_JSON_IN_ZIP}. "
                    f"Найдено json: {candidates[:5]}"
                )
            json_name = candidates[0]
        else:
            json_name = EXERCISES_JSON_IN_ZIP

        with zf.open(json_name) as f:
            data = json.load(f)

    if isinstance(data, list):
        items = data
    elif isinstance(data, dict):
        items = data.get("exercises") or data.get("data") or []
    else:
        items = []

    return [ex for ex in items if str(ex.get("category") or "").strip().lower() == "stretching"]


def _ensure_stretching_schema(conn: sqlite3.Connection) -> None:
    """Таблица с AUTOINCREMENT id (миграции на workouts.db + shared)."""
    from database.connection import open_db
    from database.migrations import ensure_db_schema

    ensure_db_schema()
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='stretching_exercises'"
    ).fetchone()
    ddl = str(row[0] or "").upper() if row else ""
    if "AUTOINCREMENT" not in ddl or "PRIMARY KEY" not in ddl:
        wconn = open_db(attach=True)
        try:
            from database.migrations import _migration_v039_stretching_exercises_pk

            _migration_v039_stretching_exercises_pk(wconn)
            wconn.commit()
        finally:
            wconn.close()


def import_stretching(
    zip_path: Path = DEFAULT_ZIP,
    db_path: Path = SHARED_DB_PATH,
    *,
    clear_existing: bool = True,
) -> int:
    stretching = _load_stretching_from_zip(zip_path)

    conn = sqlite3.connect(db_path)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        _ensure_stretching_schema(conn)

        if clear_existing:
            conn.execute("DELETE FROM stretching_exercises")
            conn.execute(
                "DELETE FROM sqlite_sequence WHERE name = 'stretching_exercises'"
            )

        inserted = 0
        for ex in stretching:
            original_name = str(ex.get("name") or "").strip()
            if not original_name:
                continue

            instructions = ex.get("instructions") or []
            if isinstance(instructions, str):
                original_description = instructions.strip()
            else:
                original_description = "\n".join(
                    str(line).strip() for line in instructions if str(line).strip()
                )

            primary = ex.get("primaryMuscles") or []
            secondary = ex.get("secondaryMuscles") or []
            if not isinstance(primary, list):
                primary = [primary] if primary else []
            if not isinstance(secondary, list):
                secondary = [secondary] if secondary else []
            muscles = [str(m).strip() for m in primary + secondary if str(m).strip()]
            target_muscle_group = ", ".join(muscles) if muscles else None

            images = ex.get("images") or []
            if not isinstance(images, list):
                images = []
            images_json = json.dumps(_normalize_images(images), ensure_ascii=False)

            conn.execute(
                """
                INSERT INTO stretching_exercises (
                    original_name,
                    original_description,
                    images_json,
                    target_muscle_group,
                    name,
                    description,
                    translated,
                    description_translated
                ) VALUES (?, ?, ?, ?, ?, ?, 0, 0)
                """,
                (
                    original_name,
                    original_description or None,
                    images_json,
                    target_muscle_group,
                    original_name,
                    original_description or None,
                ),
            )
            inserted += 1

        conn.commit()
        return inserted
    finally:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.close()


def main() -> None:
    zip_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_ZIP
    ensure_db_schema()

    count = import_stretching(zip_path)
    print(f"Импортировано {count} упражнений категории stretching в {SHARED_DB_PATH}")

    conn = sqlite3.connect(SHARED_DB_PATH)
    try:
        total = conn.execute("SELECT COUNT(*) FROM stretching_exercises").fetchone()[0]
        sample = conn.execute(
            """
            SELECT original_name, images_json
            FROM stretching_exercises
            WHERE images_json IS NOT NULL AND images_json != '[]'
            LIMIT 1
            """
        ).fetchone()
        print(f"Всего в таблице: {total}")
        if sample:
            print(f"Пример: {sample[0]} -> {sample[1]}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
