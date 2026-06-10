# -*- coding: utf-8 -*-
"""Audit shared.db for GitHub publication readiness."""
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path

REFERENCE_TABLES = frozenset(
    {
        "food_products",
        "food_product_components",
        "stretching_exercises",
        "strength_exercises",
        "tire_coefficients",
        "surface_multipliers",
    }
)

PERSONAL_TABLES = frozenset(
    {
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
        "strength_workouts",
        "cardio_workouts",
        "workout_heart_rate",
        "workout_sensors",
        "user_strength_exercises",
        "all_exercises",
        "body_metrics",
        "body_measurements",
        "users",
        "user_profiles",
        "profiles",
        "food_entries",
        "weekly_meal_schedule",
    }
)

AUTH_TABLES = frozenset(
    {
        "cloud_tokens",
        "polar_tokens",
        "user_cloud_links",
        "oauth_credentials",
        "oauth_tokens",
        "auth_tokens",
        "sessions",
    }
)

RUNTIME_CACHE_TABLES = frozenset(
    {
        "openfoodfacts_cache",
    }
)

TOKEN_COLUMN_PATTERNS = (
    "token",
    "access_token",
    "refresh_token",
    "oauth",
    "client_secret",
    "api_key",
    "secret",
    "password",
    "credential",
)


def classify_table(name: str) -> str:
    if name in REFERENCE_TABLES:
        return "reference"
    if name in AUTH_TABLES:
        return "auth"
    if name in RUNTIME_CACHE_TABLES:
        return "runtime cache"
    if name in PERSONAL_TABLES:
        return "personal"
    return "unknown"


def audit_db(path: Path) -> dict:
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        tables = [
            str(r[0])
            for r in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY 1"
            )
        ]
        rows = []
        token_hits: list[str] = []
        for table in tables:
            count = conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            cols = [r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()]
            classification = classify_table(table)
            rows.append(
                {
                    "table": table,
                    "count": count,
                    "classification": classification,
                    "columns": cols,
                }
            )
            for col in cols:
                low = col.lower()
                if any(p in low for p in TOKEN_COLUMN_PATTERNS):
                    sample = conn.execute(
                        f"SELECT COUNT(*) FROM [{table}] WHERE [{col}] IS NOT NULL AND TRIM([{col}]) != ''"
                    ).fetchone()[0]
                    if sample:
                        token_hits.append(f"{table}.{col} ({sample} non-empty)")

        checks = {
            "no_cloud_tokens": "cloud_tokens" not in tables,
            "no_polar_tokens": "polar_tokens" not in tables,
            "no_oauth_credentials": not any(t in tables for t in ("oauth_credentials", "oauth_tokens")),
            "no_workouts": not any(
                t in tables
                for t in (
                    "strength_workouts",
                    "cardio_workouts",
                    "workout_heart_rate",
                    "workout_sensors",
                )
            ),
            "no_measurements": not any(
                t in tables for t in ("body_metrics", "body_measurements", "measurements")
            ),
            "no_user_profiles": not any(t in tables for t in ("users", "user_profiles", "profiles")),
            "no_meal_plans": not any(
                t in tables
                for t in (
                    "meal_templates",
                    "meal_template_items",
                    "daily_meal_plans",
                    "daily_meal_plan_templates",
                    "meal_plan_items",
                )
            ),
            "no_user_exercise_history": not any(
                t in tables
                for t in ("user_strength_exercises", "all_exercises", "strength_workouts")
            ),
            "no_runtime_cache": "openfoodfacts_cache" not in tables,
            "all_tables_reference": all(classify_table(t) == "reference" for t in tables),
            "no_token_columns_with_data": len(token_hits) == 0,
        }
        ready = all(checks.values())
        return {
            "path": str(path),
            "tables": rows,
            "token_hits": token_hits,
            "checks": checks,
            "ready_for_github": ready,
        }
    finally:
        conn.close()


def print_report(result: dict) -> None:
    print(f"Database: {result['path']}")
    print()
    print("| table | rows | classification |")
    print("| --- | ---: | --- |")
    for row in result["tables"]:
        print(f"| {row['table']} | {row['count']} | {row['classification']} |")
    print()
    print("Verification:")
    for key, ok in result["checks"].items():
        label = key.replace("_", " ")
        print(f"  - {label}: {'PASS' if ok else 'FAIL'}")
    if result["token_hits"]:
        print()
        print("Token-like columns with non-empty data:")
        for hit in result["token_hits"]:
            print(f"  - {hit}")
    print()
    if result["ready_for_github"]:
        print("READY FOR GITHUB")
    else:
        print("NOT READY FOR GITHUB")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "db",
        nargs="?",
        default=str(Path(__file__).resolve().parent.parent / "shared.public.db"),
    )
    args = parser.parse_args()
    result = audit_db(Path(args.db))
    print_report(result)
    return 0 if result["ready_for_github"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
