# -*- coding: utf-8 -*-
"""Миграции колонок цикла в user_profile и phase в журнале."""
from __future__ import annotations

import sqlite3


def ensure_user_cycle_profile_columns(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    alters: list[tuple[str, str]] = [
        ("last_menstruation", "TEXT"),
        ("cycle_length", "INTEGER DEFAULT 28"),
        ("menstruation_length", "INTEGER DEFAULT 5"),
        ("cycle_enabled", "INTEGER DEFAULT 1"),
    ]
    for name, typedef in alters:
        if name not in cols:
            conn.execute(f"ALTER TABLE user_profile ADD COLUMN {name} {typedef}")

    has_cycle_settings = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='menstrual_cycle_settings'"
    ).fetchone()
    row = None
    if has_cycle_settings:
        row = conn.execute(
            """
            SELECT last_period_start, cycle_length_days, period_length_days
            FROM menstrual_cycle_settings WHERE user_id = 1
            """
        ).fetchone()
    profile = conn.execute(
        "SELECT last_menstruation FROM user_profile WHERE id = 1"
    ).fetchone()
    if row and profile and profile[0] is None and row[0]:
        conn.execute(
            """
            UPDATE user_profile
            SET last_menstruation = ?,
                cycle_length = COALESCE(cycle_length, ?),
                menstruation_length = COALESCE(menstruation_length, ?)
            WHERE id = 1
            """,
            (str(row[0])[:10], int(row[1] or 28), int(row[2] or 5)),
        )


def ensure_menstrual_log_phase_column(conn: sqlite3.Connection) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(menstrual_cycle_log)")}
    if "phase" not in cols:
        conn.execute("ALTER TABLE menstrual_cycle_log ADD COLUMN phase TEXT")
