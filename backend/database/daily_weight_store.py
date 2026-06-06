# -*- coding: utf-8 -*-
"""daily_weight access via get_db (replaces legacy database.db_utils direct connect)."""
from __future__ import annotations

from typing import Any

import pandas as pd

from backend.database.db_utils import get_current_user_id, get_db


def ensure_daily_weight_table(conn=None) -> None:
    own = conn is None
    if own:
        conn = get_db()
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS daily_weight (
                date TEXT PRIMARY KEY,
                weight_kg REAL NOT NULL,
                body_fat_percent REAL
            )
            """
        )
        try:
            conn.execute("ALTER TABLE daily_weight ADD COLUMN source TEXT")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE daily_weight ADD COLUMN user_id INTEGER")
        except Exception:
            pass
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


def load_daily_weight_recent(
    *,
    limit: int = 30,
    date_from: str | None = None,
    user_id: int | None = None,
) -> pd.DataFrame:
    """Последние N записей веса (без полного скана истории)."""
    from utils.date_utils import normalize_date_column

    ensure_daily_weight_table()
    uid = int(user_id) if user_id is not None else get_current_user_id()
    lim = max(1, min(int(limit), 500))
    conn = get_db()
    try:
        dw_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)").fetchall()}
        clauses = ["user_id = ?"] if "user_id" in dw_cols else []
        params: list[Any] = [uid] if "user_id" in dw_cols else []
        if date_from:
            clauses.append("date >= ?")
            params.append(str(date_from)[:10])
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        source_col = ", source" if "source" in dw_cols else ""
        df = pd.read_sql_query(
            f"""
            SELECT date, weight_kg, body_fat_percent{source_col}
            FROM daily_weight{where}
            ORDER BY date DESC
            LIMIT ?
            """,
            conn,
            params=(*params, lim),
        )
    except Exception:
        return pd.DataFrame()
    finally:
        conn.close()
    if df.empty:
        return df
    df = normalize_date_column(df, "date")
    if "source" not in df.columns:
        df["source"] = "manual"
    return df.sort_values("date", ascending=True)


def load_daily_weight(user_id: int | None = None) -> pd.DataFrame:
    from utils.date_utils import normalize_date_column

    ensure_daily_weight_table()
    uid = int(user_id) if user_id is not None else get_current_user_id()
    conn = get_db()
    try:
        dw_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)").fetchall()}
        if "user_id" in dw_cols:
            df = pd.read_sql_query(
                """
                SELECT date, weight_kg, body_fat_percent, source
                FROM daily_weight WHERE user_id = ?
                ORDER BY date DESC
                """,
                conn,
                params=(uid,),
            )
        else:
            df = pd.read_sql_query(
                "SELECT date, weight_kg, body_fat_percent, source FROM daily_weight ORDER BY date DESC",
                conn,
            )
    except Exception:
        if "user_id" in dw_cols:
            df = pd.read_sql_query(
                """
                SELECT date, weight_kg, body_fat_percent
                FROM daily_weight WHERE user_id = ?
                ORDER BY date DESC
                """,
                conn,
                params=(uid,),
            )
        else:
            df = pd.read_sql_query(
                "SELECT date, weight_kg, body_fat_percent FROM daily_weight ORDER BY date DESC",
                conn,
            )
        if not df.empty:
            df["source"] = "manual"
    finally:
        conn.close()
    if not df.empty:
        df = normalize_date_column(df, "date")
    return df


def save_daily_weight(
    measure_date: str,
    weight_kg: float,
    body_fat_percent: float | None = None,
    *,
    keep_existing_fat: bool = True,
    source: str | None = None,
    user_id: int | None = None,
) -> None:
    ensure_daily_weight_table()
    d = measure_date[:10]
    uid = int(user_id) if user_id is not None else get_current_user_id()
    conn = get_db()
    try:
        dw_cols = {r[1] for r in conn.execute("PRAGMA table_info(daily_weight)").fetchall()}
        if keep_existing_fat and body_fat_percent is None:
            if "user_id" in dw_cols:
                old = conn.execute(
                    "SELECT body_fat_percent FROM daily_weight WHERE user_id = ? AND date = ?",
                    (uid, d),
                ).fetchone()
            else:
                old = conn.execute(
                    "SELECT body_fat_percent FROM daily_weight WHERE date = ?", (d,)
                ).fetchone()
            if old and old[0] is not None:
                body_fat_percent = float(old[0])
        if "user_id" in dw_cols:
            conn.execute(
                """
                INSERT INTO daily_weight (user_id, date, weight_kg, body_fat_percent, source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    user_id = excluded.user_id,
                    weight_kg = excluded.weight_kg,
                    body_fat_percent = COALESCE(excluded.body_fat_percent, daily_weight.body_fat_percent),
                    source = COALESCE(excluded.source, daily_weight.source)
                """,
                (uid, d, float(weight_kg), body_fat_percent, source),
            )
        else:
            conn.execute(
                """
                INSERT INTO daily_weight (date, weight_kg, body_fat_percent, source)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    weight_kg = excluded.weight_kg,
                    body_fat_percent = COALESCE(excluded.body_fat_percent, daily_weight.body_fat_percent),
                    source = COALESCE(excluded.source, daily_weight.source)
                """,
                (d, float(weight_kg), body_fat_percent, source),
            )
        conn.commit()
    finally:
        conn.close()
