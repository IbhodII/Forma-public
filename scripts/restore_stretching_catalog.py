#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Восстановить stretching_exercises в shared.db Forma из эталона (репозиторий).

Примеры (CMD — кавычки с %APPDATA%, не $env:...):
  .\\venv\\Scripts\\python.exe scripts\\restore_stretching_catalog.py
  .\\venv\\Scripts\\python.exe scripts\\restore_stretching_catalog.py --target "%APPDATA%\\health-dashboard-frontend"

PowerShell:
  .\\venv\\Scripts\\python.exe scripts\\restore_stretching_catalog.py --target "$env:APPDATA\\health-dashboard-frontend"
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_SHARED = ROOT / "shared.db"

_STRETCHING_DDL = """
CREATE TABLE IF NOT EXISTS stretching_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    target_muscle_group TEXT,
    description TEXT,
    original_name TEXT,
    translated INTEGER NOT NULL DEFAULT 0,
    original_description TEXT,
    description_translated INTEGER NOT NULL DEFAULT 0,
    images_json TEXT
)
"""


_POWERSHELL_ENV = re.compile(r"\$env:([A-Za-z_][A-Za-z0-9_]*)", re.IGNORECASE)


def _expand_target_path(raw: str) -> str:
    """CMD (%APPDATA%), PowerShell ($env:APPDATA) и литералы."""
    text = str(raw).strip().strip('"').strip("'")
    if not text:
        return text

    def _repl(match: re.Match[str]) -> str:
        name = match.group(1)
        value = os.environ.get(name) or os.environ.get(name.upper())
        if not value:
            raise ValueError(
                f"Переменная окружения {name!r} не задана. "
                f"В CMD используйте %APPDATA% вместо $env:APPDATA."
            )
        return value

    text = _POWERSHELL_ENV.sub(_repl, text)
    return os.path.expandvars(os.path.expanduser(text))


def _resolve_target_dir(explicit: str | None) -> Path:
    if explicit:
        expanded = _expand_target_path(explicit)
        if "$env:" in expanded.lower():
            raise ValueError(
                "Путь содержит необработанный $env:.... "
                "Запускайте из PowerShell или укажите %APPDATA%\\health-dashboard-frontend в CMD."
            )
        return Path(expanded)
    env = os.environ.get("FORMA_DATA_DIR", "").strip()
    if env:
        return Path(_expand_target_path(env))
    for candidate in (
        Path(os.environ.get("APPDATA", "")) / "health-dashboard-frontend",
        Path(os.environ.get("APPDATA", "")) / "Forma",
        Path(os.environ.get("LOCALAPPDATA", "")) / "Forma",
    ):
        if (candidate / "shared.db").exists() or (candidate / "workouts.db").exists():
            return candidate
    return Path(os.environ.get("APPDATA", "")) / "health-dashboard-frontend"


def _backup(path: Path) -> None:
    if not path.exists():
        return
    dest = path.with_suffix(f".db.bak-{datetime.now().strftime('%Y%m%d-%H%M%S')}")
    shutil.copy2(path, dest)
    print(f"Бэкап: {dest}")


def _table_exists(conn: sqlite3.Connection) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='stretching_exercises'"
    ).fetchone()
    return row is not None


def _count(conn: sqlite3.Connection) -> int:
    if not _table_exists(conn):
        return -1
    return int(conn.execute("SELECT COUNT(*) FROM stretching_exercises").fetchone()[0])


def _ensure_workouts_placeholder(target_dir: Path) -> None:
    """Forma ожидает workouts.db рядом с shared.db."""
    workouts = target_dir / "workouts.db"
    if workouts.exists():
        return
    repo_workouts = ROOT / "workouts.db"
    if repo_workouts.is_file():
        shutil.copy2(repo_workouts, workouts)
        print(f"Создан workouts.db из репозитория: {workouts}")
        return
    conn = sqlite3.connect(workouts)
    conn.execute("CREATE TABLE IF NOT EXISTS user_profile (id INTEGER PRIMARY KEY)")
    conn.commit()
    conn.close()
    print(f"Создан пустой workouts.db: {workouts}")


def restore(target_dir: Path, source_shared: Path, *, force_replace: bool) -> int:
    if not source_shared.is_file():
        raise FileNotFoundError(f"Эталон не найден: {source_shared}")

    target_dir.mkdir(parents=True, exist_ok=True)
    target_shared = target_dir / "shared.db"
    _ensure_workouts_placeholder(target_dir)

    need_full_copy = force_replace
    if target_shared.exists():
        conn = sqlite3.connect(target_shared)
        try:
            n = _count(conn)
            if n < 0:
                need_full_copy = True
                print("Таблица stretching_exercises отсутствует — копируем весь shared.db")
        finally:
            conn.close()
    else:
        need_full_copy = True
        print("shared.db нет — копируем из репозитория")

    if need_full_copy:
        _backup(target_shared)
        shutil.copy2(source_shared, target_shared)
        conn = sqlite3.connect(target_shared)
        try:
            return _count(conn)
        finally:
            conn.close()

    _backup(target_shared)
    src = sqlite3.connect(source_shared)
    dst = sqlite3.connect(target_shared)
    try:
        dst.executescript(_STRETCHING_DDL)
        dst.execute("DELETE FROM stretching_exercises")
        dst.execute("DELETE FROM sqlite_sequence WHERE name = 'stretching_exercises'")

        cols = [r[1] for r in dst.execute("PRAGMA table_info(stretching_exercises)")]
        src_cols = [r[1] for r in src.execute("PRAGMA table_info(stretching_exercises)")]
        common = [c for c in cols if c in src_cols]
        col_sql = ", ".join(common)
        rows = src.execute(f"SELECT {col_sql} FROM stretching_exercises").fetchall()
        ph = ", ".join("?" for _ in common)
        dst.executemany(
            f"INSERT INTO stretching_exercises ({col_sql}) VALUES ({ph})",
            rows,
        )
        dst.commit()
        return len(rows)
    finally:
        src.close()
        dst.close()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--target", help="Папка Forma (shared.db + workouts.db)")
    parser.add_argument("--source", type=Path, default=SOURCE_SHARED)
    parser.add_argument(
        "--replace-shared",
        action="store_true",
        help="Всегда заменить shared.db целиком эталоном",
    )
    args = parser.parse_args()

    try:
        target_dir = _resolve_target_dir(args.target)
    except ValueError as exc:
        print(f"Ошибка: {exc}", file=sys.stderr)
        raise SystemExit(2) from exc
    print(f"Папка: {target_dir}")

    n = restore(target_dir, args.source, force_replace=args.replace_shared)
    print(f"Упражнений растяжки в shared.db: {n}")
    print("Закройте Forma в диспетчере задач и запустите снова.")


if __name__ == "__main__":
    main()
