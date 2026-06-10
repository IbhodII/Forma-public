# -*- coding: utf-8 -*-
"""
Build a public shared.db from a developer source (read-only).

Copies only non-personal reference tables:
  food_products, food_product_components, stretching_exercises,
  strength_exercises, tire_coefficients, surface_multipliers

Excludes meal plans, OFF cache, and any non-reference tables.
Deduplicates tire/surface rows by natural key.
"""
from __future__ import annotations

import argparse
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

REFERENCE_TABLES: tuple[str, ...] = (
    "food_products",
    "food_product_components",
    "stretching_exercises",
    "strength_exercises",
    "tire_coefficients",
    "surface_multipliers",
)

PERSONAL_TABLES: frozenset[str] = frozenset(
    {
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
        "openfoodfacts_cache",
        "cloud_tokens",
        "polar_tokens",
        "user_cloud_links",
    }
)


def _list_tables(conn: sqlite3.Connection) -> list[str]:
    return [
        str(r[0])
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1"
        )
    ]


def _copy_table(src: sqlite3.Connection, dst: sqlite3.Connection, table: str) -> int:
    cols = [r[1] for r in src.execute(f"PRAGMA table_info({table})")]
    if not cols:
        return 0
    col_sql = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    dst.execute(f"CREATE TABLE {table} AS SELECT * FROM src.{table} WHERE 0")
    dst.execute(f"DELETE FROM {table}")

    if table == "tire_coefficients":
        rows = src.execute(
            f"SELECT {col_sql} FROM [{table}] GROUP BY tire_type"
        ).fetchall()
    elif table == "surface_multipliers":
        rows = src.execute(
            f"SELECT {col_sql} FROM [{table}] GROUP BY surface"
        ).fetchall()
    else:
        rows = src.execute(f"SELECT {col_sql} FROM [{table}]").fetchall()

    if rows:
        dst.executemany(
            f"INSERT INTO {table} ({col_sql}) VALUES ({placeholders})",
            rows,
        )
    return len(rows)


def build_public_shared_db(source: Path, target: Path) -> dict[str, int]:
    if not source.is_file():
        raise FileNotFoundError(f"Source not found: {source}")

    src = sqlite3.connect(f"file:{source}?mode=ro", uri=True)
    try:
        src_tables = set(_list_tables(src))
        blocked = sorted(src_tables & PERSONAL_TABLES)
        if blocked:
            print("WARNING: source contains personal/runtime tables (will be excluded):", blocked)

        unexpected = sorted(src_tables - set(REFERENCE_TABLES) - PERSONAL_TABLES)
        if unexpected:
            print("NOTE: ignoring extra source tables:", unexpected)

        if target.exists():
            target.unlink()
        dst = sqlite3.connect(target)
        try:
            dst.execute("ATTACH DATABASE ? AS src", (str(source.resolve()),))
            counts: dict[str, int] = {}
            for table in REFERENCE_TABLES:
                if table not in src_tables:
                    counts[table] = 0
                    continue
                counts[table] = _copy_table(src, dst, table)
            dst.commit()
            dst.execute("VACUUM")
        finally:
            dst.close()
    finally:
        src.close()

    return counts


def main() -> int:
    parser = argparse.ArgumentParser(description="Build public shared.db from dev source")
    parser.add_argument(
        "--source",
        type=Path,
        default=ROOT / "shared.db",
        help="Source shared.db (read-only; use dev copy with --source when refreshing)",
    )
    parser.add_argument(
        "--target",
        type=Path,
        default=ROOT / "shared.db",
        help="Output public shared.db",
    )
    args = parser.parse_args()

    try:
        counts = build_public_shared_db(args.source, args.target)
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    size_mb = args.target.stat().st_size / (1024 * 1024)
    print(f"Wrote {args.target} ({size_mb:.2f} MB)")
    for table, n in counts.items():
        print(f"  {table}: {n}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
