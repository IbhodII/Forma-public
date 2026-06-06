import sqlite3
import traceback

from database.connection import open_db
from database.migrations import _SCHEMA_MIGRATIONS, get_schema_version, _apply_migration

conn = open_db(attach=True)
try:
    current = get_schema_version(conn)
    print("before:", current)
    for target_version, migrate_fn in _SCHEMA_MIGRATIONS:
        if target_version <= current:
            continue
        print(f"running migration {target_version}...")
        try:
            _apply_migration(conn, target_version, migrate_fn)
            conn.commit()
            print(f"  ok -> {get_schema_version(conn)}")
        except Exception as exc:
            print(f"  FAILED at {target_version}: {exc}")
            traceback.print_exc()
            break
finally:
    conn.close()
