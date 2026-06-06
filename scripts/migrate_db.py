from database.connection import open_db
from database.migrations import ensure_db_schema, get_schema_version

ensure_db_schema()

conn = open_db(attach=True)
try:
    version = get_schema_version(conn)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    users = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
    ).fetchone()
    cardio = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='cardio_type_settings'"
    ).fetchone()
    print(f"schema_version={version}")
    print(f"users_table={'yes' if users else 'no'}")
    print(f"cardio_type_settings={'yes' if cardio else 'no'}")
    print(
        "max_physiological_deficit_per_kg_fat="
        f"{'yes' if 'max_physiological_deficit_per_kg_fat' in cols else 'no'}"
    )
    cardio_cols = {r[1] for r in conn.execute("PRAGMA table_info(cardio_workouts)").fetchall()}
    print(f"cardio_duration_sec={'yes' if 'duration_sec' in cardio_cols else 'no'}")
finally:
    conn.close()
