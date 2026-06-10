# -*- coding: utf-8 -*-
"""
Create packaging/seed/*.db for PyInstaller.

Never copies repository-root workouts.db (developer personal data).
workouts.db is generated from migrations via build_packaging_workouts_seed.py.
"""
from __future__ import annotations

import shutil
import sqlite3
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SEED_DIR = ROOT / "packaging" / "seed"
TEMPLATE_DIR = ROOT / "packaging" / "seed-template"

if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from packaging_secrets import MAX_PACKAGED_DB_BYTES
from packaging_seed_common import (
    audit_packaging_seed_dir,
    purge_personal_rows,
    reset_local_desktop_identity,
    SEED_MUST_BE_EMPTY_TABLES,
)

_SHARED_MEAL_TABLES: tuple[str, ...] = (
    "meal_templates",
    "meal_template_items",
    "daily_meal_plans",
    "daily_meal_plan_templates",
    "meal_plan_items",
)


def _table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {str(r[0]) for r in rows}


def _purge_shared_meal_tables(shared_path: Path) -> None:
    conn = sqlite3.connect(shared_path)
    try:
        existing = _table_names(conn)
        conn.execute("PRAGMA foreign_keys = OFF")
        for table in reversed(_SHARED_MEAL_TABLES):
            if table in existing:
                conn.execute(f"DROP TABLE IF EXISTS {table}")
        for index_name in (
            "idx_meal_template_items_tid",
            "idx_meal_plan_templates_plan",
            "idx_daily_meal_plans_user",
            "idx_meal_templates_user",
            "idx_meal_plan_items_plan",
        ):
            conn.execute(f"DROP INDEX IF EXISTS {index_name}")
        conn.commit()
        conn.execute("VACUUM")
    finally:
        conn.close()


def _copy_if_small(src: Path, dst: Path, label: str) -> None:
    if not src.is_file():
        raise FileNotFoundError(f"Missing {label}: {src}")
    size = src.stat().st_size
    if size > MAX_PACKAGED_DB_BYTES:
        raise RuntimeError(
            f"{label} is {size} bytes (max {MAX_PACKAGED_DB_BYTES}). "
            "Regenerate sanitized seed databases."
        )
    if dst.exists():
        dst.unlink()
    shutil.copy2(src, dst)


def _build_workouts_template() -> int:
    script = ROOT / "scripts" / "build_packaging_workouts_seed.py"
    print(f"Building clean workouts seed via {script.name}…")
    proc = subprocess.run(
        [sys.executable, str(script)],
        cwd=str(ROOT),
        check=False,
    )
    return int(proc.returncode)


def _finalize_workouts_seed(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        purge_personal_rows(conn, SEED_MUST_BE_EMPTY_TABLES)
        reset_local_desktop_identity(conn)
    finally:
        conn.close()


def main() -> int:
    SEED_DIR.mkdir(parents=True, exist_ok=True)
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)

    if (ROOT / "workouts.db").is_file():
        print(
            "NOTE: repository workouts.db is ignored for packaging "
            "(never bundled into installer).",
        )

    shared_src = TEMPLATE_DIR / "shared.db"
    if not shared_src.is_file():
        shared_src = ROOT / "shared.db"
    workouts_src = TEMPLATE_DIR / "workouts.db"

    if not workouts_src.is_file():
        code = _build_workouts_template()
        if code != 0:
            return code
        workouts_src = TEMPLATE_DIR / "workouts.db"

    if not workouts_src.is_file():
        print(
            "ERROR: missing packaging/seed-template/workouts.db. "
            "Run: python scripts/build_packaging_workouts_seed.py",
            file=sys.stderr,
        )
        return 1

    shared_dst = SEED_DIR / "shared.db"
    workouts_dst = SEED_DIR / "workouts.db"

    try:
        _copy_if_small(shared_src, shared_dst, "shared.db")
        _purge_shared_meal_tables(shared_dst)
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    try:
        _copy_if_small(workouts_src, workouts_dst, "workouts.db")
        _finalize_workouts_seed(workouts_dst)
    except (RuntimeError, FileNotFoundError) as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    errors = audit_packaging_seed_dir(SEED_DIR)
    if errors:
        print("ERROR: packaging seed audit failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    for name in ("workouts.db", "shared.db"):
        path = SEED_DIR / name
        print(f"Ready {path} ({path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
