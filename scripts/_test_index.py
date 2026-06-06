from database.connection import open_db, SHARED_SCHEMA, shared_table

conn = open_db(attach=True)
mti = shared_table("meal_template_items")
tests = [
    f"CREATE INDEX IF NOT EXISTS idx_test1 ON {mti}(template_id)",
    f"CREATE INDEX IF NOT EXISTS idx_test2 ON {SHARED_SCHEMA}.meal_template_items(template_id)",
    f"CREATE INDEX IF NOT EXISTS {SHARED_SCHEMA}.idx_test3 ON {mti}(template_id)",
]
for sql in tests:
    try:
        conn.execute(sql)
        print("OK", sql[:70])
        conn.execute(f"DROP INDEX IF EXISTS idx_test1")
        conn.execute(f"DROP INDEX IF EXISTS idx_test2")
        conn.execute(f"DROP INDEX IF EXISTS {SHARED_SCHEMA}.idx_test3")
    except Exception as e:
        print("FAIL", e, sql[:70])
conn.close()
