import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WORKOUTS_DB = ROOT / "workouts.db"
SHARED_DB = ROOT / "shared.db"

SHARED_TABLES = [
    "food_products",
    "food_product_components",
    "stretching_exercises",
    "tire_coefficients",
    "surface_multipliers",
]

EXTRA_SHARED = [
    "openfoodfacts_cache",
]

PERSONAL_TABLES_EXAMPLE = [
    "strength_workouts",
    "cardio_workouts",
    "workout_heart_rate",
    "workout_sensors",
]


def table_names(db_path: Path) -> set[str]:
    con = sqlite3.connect(db_path)
    try:
        rows = con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
        return {r[0] for r in rows}
    finally:
        con.close()


def table_columns(db_path: Path, table: str) -> set[str]:
    con = sqlite3.connect(db_path)
    try:
        cols = con.execute(f"PRAGMA table_info({table})").fetchall()
        return {r[1] for r in cols}
    finally:
        con.close()


def main() -> None:
    ws = table_names(WORKOUTS_DB)
    ss = table_names(SHARED_DB)

    print("Shared table presence:")
    for t in SHARED_TABLES:
        print(f"  - {t}: workouts={t in ws} shared={t in ss}")

    print("\nPersonal table user_id presence (sample):")
    for t in PERSONAL_TABLES_EXAMPLE:
        if t not in ws:
            print(f"  - {t}: not in workouts.db")
            continue
        cols = table_columns(WORKOUTS_DB, t)
        print(f"  - {t}: user_id={'user_id' in cols}")

    print("\nOpenFoodFacts cache presence:")
    for t in EXTRA_SHARED:
        print(f"  - {t}: workouts={t in ws} shared={t in ss}")

    # quick hint about external_id existence (if food_products is in shared)
    if "food_products" in ss:
        cols = table_columns(SHARED_DB, "food_products")
        print(f"\nshared.food_products external_id column present: {'external_id' in cols}")


if __name__ == "__main__":
    main()

