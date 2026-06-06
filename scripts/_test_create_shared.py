from database.connection import open_db, shared_table

conn = open_db(attach=True)
fp = shared_table("food_products")
sql = f"CREATE TABLE IF NOT EXISTS {fp} (id INTEGER PRIMARY KEY, name TEXT)"
try:
    conn.execute(sql)
    print("CREATE TABLE OK")
except Exception as e:
    print("CREATE TABLE FAIL", e)

idx = f"CREATE INDEX IF NOT EXISTS idx_fp_name ON {fp}(name)"
try:
    conn.execute(idx)
    print("CREATE INDEX OK")
except Exception as e:
    print("CREATE INDEX FAIL", e)
conn.commit()
conn.close()
