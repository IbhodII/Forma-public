#!/usr/bin/env python3
"""Diagnose stretching_exercises in shared.db (repo + AppData)."""
from __future__ import annotations

import os
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def check_shared(path: Path, label: str) -> None:
    print(f"\n=== {label} ===")
    print(f"  path: {path}")
    if not path.exists():
        print("  MISSING")
        return
    conn = sqlite3.connect(path)
    try:
        tables = [
            r[0]
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
            ).fetchall()
        ]
        if "stretching_exercises" not in tables:
            print("  TABLE stretching_exercises: MISSING")
            print("  tables:", ", ".join(tables[:15]), "...")
            return
        cols = [r[1] for r in conn.execute("PRAGMA table_info(stretching_exercises)").fetchall()]
        n = conn.execute("SELECT COUNT(*) FROM stretching_exercises").fetchone()[0]
        print(f"  rows: {n}")
        print(f"  columns: {', '.join(cols)}")
        if n:
            sample = conn.execute(
                "SELECT id, name, images_json IS NOT NULL AS has_img FROM stretching_exercises LIMIT 3"
            ).fetchall()
            print("  sample:", sample)
    finally:
        conn.close()


def check_attached(workouts: Path, label: str) -> None:
    shared = workouts.parent / "shared.db"
    print(f"\n=== {label} (ATTACH) ===")
    print(f"  workouts: {workouts}")
    if not workouts.exists():
        print("  workouts MISSING")
        return
    conn = sqlite3.connect(workouts)
    try:
        if shared.exists():
            conn.execute(f"ATTACH DATABASE '{shared.as_posix()}' AS shared")
            n = conn.execute("SELECT COUNT(*) FROM shared.stretching_exercises").fetchone()[0]
            print(f"  shared.stretching_exercises rows: {n}")
        else:
            print("  shared.db MISSING next to workouts")
    except sqlite3.OperationalError as e:
        print(f"  ERROR: {e}")
    finally:
        conn.close()


def main() -> None:
    check_shared(ROOT / "shared.db", "repo shared.db")
    check_attached(ROOT / "workouts.db", "repo")
    appdata = Path(os.environ.get("APPDATA", "")) / "Forma"
    check_shared(appdata / "shared.db", "AppData Forma shared.db")
    check_attached(appdata / "workouts.db", "AppData Forma")


if __name__ == "__main__":
    main()
