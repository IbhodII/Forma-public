# -*- coding: utf-8 -*-
from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from backend.database.db_utils import get_db, user_filter


@contextmanager
def with_connection() -> Iterator[sqlite3.Connection]:
    conn = get_db()
    try:
        yield conn
    finally:
        conn.close()


def count_for_user(
    conn: sqlite3.Connection,
    table: str,
    user_id: int,
    *,
    alias: str = "",
    extra_where: str = "",
    extra_params: tuple[Any, ...] = (),
) -> int:
    uf_sql, uf_params = user_filter(alias, user_id)
    prefix = f"{alias}." if alias else ""
    where = f"WHERE {uf_sql}"
    if extra_where:
        where += f" AND {extra_where}"
    sql = f"SELECT COUNT(*) FROM {table} {where}"
    row = conn.execute(sql, (*uf_params, *extra_params)).fetchone()
    return int(row[0]) if row else 0


def table_exists(conn: sqlite3.Connection, table: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
        (table,),
    ).fetchone()
    return row is not None
