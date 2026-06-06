# -*- coding: utf-8 -*-
"""App metadata key/value store (forma_sync, etc.) via get_db."""
from __future__ import annotations

from backend.database.db_utils import get_db


def ensure_app_meta_table(conn=None) -> None:
    own = conn is None
    if own:
        conn = get_db()
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
        )
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


def meta_get(key: str) -> str | None:
    conn = get_db()
    try:
        ensure_app_meta_table(conn)
        row = conn.execute("SELECT value FROM app_meta WHERE key = ?", (key,)).fetchone()
        return str(row[0]) if row else None
    finally:
        conn.close()


def meta_set(key: str, value: str) -> None:
    conn = get_db()
    try:
        ensure_app_meta_table(conn)
        conn.execute(
            "INSERT INTO app_meta (key, value) VALUES (?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        conn.commit()
    finally:
        conn.close()
