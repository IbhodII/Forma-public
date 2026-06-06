import sqlite3
from database.connection import open_db

conn = open_db(attach=True)
for label, sql in [
    ("pragma_dot", "PRAGMA shared.table_info('food_products')"),
    ("pragma_table_info", "SELECT name FROM pragma_table_info('food_products', 'shared')"),
]:
    try:
        rows = conn.execute(sql).fetchall()
        print(label, "OK", len(rows))
    except Exception as e:
        print(label, "FAIL", e)
conn.close()
