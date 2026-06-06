from database.connection import WORKOUTS_DB_PATH, SHARED_DB_PATH, open_db
from database.migrations import get_schema_version

print("workouts:", WORKOUTS_DB_PATH.exists(), WORKOUTS_DB_PATH)
print("shared:", SHARED_DB_PATH.exists(), SHARED_DB_PATH)

conn = open_db(attach=True)
try:
    print("schema_version:", get_schema_version(conn))
    cols = [r[1] for r in conn.execute("PRAGMA table_info(user_profile)")]
    print("user_profile columns:", cols)
    tables = [
        r[0]
        for r in conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
        ).fetchall()
    ]
    print("has cardio_type_settings:", "cardio_type_settings" in tables)
    print("table count:", len(tables))
finally:
    conn.close()
