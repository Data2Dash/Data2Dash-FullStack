"""
Quick migration: add missing columns to the users table.
Safe to run multiple times -- skips columns that already exist.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data2dash.db")

MIGRATIONS = [
    # (table, column, definition)
    # SQLite ALTER TABLE does not allow non-constant defaults -- use NULL.
    # SQLAlchemy's server_default=func.now() handles new rows automatically.
    ("users", "updated_at",    "DATETIME"),
    ("users", "last_login_at", "DATETIME"),
]

conn = sqlite3.connect(DB_PATH)
cur  = conn.cursor()

for table, column, definition in MIGRATIONS:
    cur.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cur.fetchall()}
    if column not in existing:
        sql = f"ALTER TABLE {table} ADD COLUMN {column} {definition}"
        print(f"  Running: {sql}")
        cur.execute(sql)
        print(f"  [OK] Added '{column}' to '{table}'")
    else:
        print(f"  [SKIP] '{column}' already exists in '{table}'")

conn.commit()
conn.close()
print("Migration complete.")
