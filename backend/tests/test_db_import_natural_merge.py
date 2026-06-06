# -*- coding: utf-8 -*-
"""Natural-key idempotent merge for DB import (steps_history, etc.)."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from backend.services.db_import_natural_merge import (
    _merge_steps_history_from_staging,
    _remap_steps_history_user_ids,
    _upsert_steps_history_row,
    merge_table_from_staging,
)


def _create_steps_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
        """
    )


def test_steps_upsert_max_merge():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "w.db"
        conn = sqlite3.connect(path)
        _create_steps_table(conn)
        conn.execute(
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (1, '2026-06-01', 5000, 'old')"
        )
        conn.commit()
        result = _upsert_steps_history_row(
            conn,
            {
                "user_id": 1,
                "date": "2026-06-01",
                "steps": 8000,
                "step_length_m": 0.7,
                "source": "import",
            },
        )
        row = conn.execute(
            "SELECT steps, source FROM steps_history WHERE user_id = 1"
        ).fetchone()
        conn.close()
        assert result == "merged"
        assert row == (8000, "import")


def test_merge_steps_duplicate_dates_in_staging():
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "target.db"
        staging = Path(tmp) / "staging.db"

        conn = sqlite3.connect(target)
        _create_steps_table(conn)
        conn.commit()
        conn.close()

        sconn = sqlite3.connect(staging)
        sconn.execute(
            """
            CREATE TABLE steps_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL,
                date TEXT NOT NULL,
                steps INTEGER NOT NULL,
                source TEXT DEFAULT 'excel_archive',
                updated_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        sconn.executemany(
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (?, ?, ?, ?)",
            [
                (99, "2026-06-02", 1000, "a"),
                (99, "2026-06-02", 3000, "b"),
            ],
        )
        sconn.commit()
        sconn.close()

        conn = sqlite3.connect(target)
        conn.execute("ATTACH DATABASE ? AS import_main", (str(staging.resolve()),))
        stats = _merge_steps_history_from_staging(conn, target_user_id=2, import_uid=99)
        count = conn.execute(
            "SELECT COUNT(*) FROM steps_history WHERE user_id = 2"
        ).fetchone()[0]
        steps = conn.execute(
            "SELECT steps FROM steps_history WHERE user_id = 2 AND date = '2026-06-02'"
        ).fetchone()[0]
        conn.close()

        assert stats["imported"] == 1
        assert count == 1
        assert steps == 3000


def test_remap_steps_collision_no_unique_error():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "w.db"
        conn = sqlite3.connect(path)
        _create_steps_table(conn)
        conn.execute(
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (1, '2026-06-03', 100, 'live')"
        )
        conn.execute(
            "INSERT INTO steps_history (user_id, date, steps, source) VALUES (5, '2026-06-03', 500, 'import')"
        )
        conn.commit()
        stats = _remap_steps_history_user_ids(conn, target_user_id=1, source_user_ids=[5])
        count = conn.execute("SELECT COUNT(*) FROM steps_history WHERE user_id = 1").fetchone()[0]
        steps = conn.execute(
            "SELECT steps FROM steps_history WHERE user_id = 1 AND date = '2026-06-03'"
        ).fetchone()[0]
        foreign = conn.execute(
            "SELECT COUNT(*) FROM steps_history WHERE user_id = 5"
        ).fetchone()[0]
        conn.close()

        assert stats["merged"] + stats["updated"] + stats["imported"] >= 1
        assert count == 1
        assert steps == 500
        assert foreign == 0


def test_merge_via_registry():
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "target.db"
        staging = Path(tmp) / "staging.db"
        sqlite3.connect(staging).close()
        sconn = sqlite3.connect(staging)
        _create_steps_table(sconn)
        sconn.execute(
            "INSERT INTO steps_history (user_id, date, steps) VALUES (7, '2026-07-01', 42)"
        )
        sconn.commit()
        sconn.close()

        conn = sqlite3.connect(target)
        _create_steps_table(conn)
        conn.execute("ATTACH DATABASE ? AS import_main", (str(staging.resolve()),))
        detail = merge_table_from_staging(
            conn, "steps_history", target_user_id=1, import_uid=7
        )
        conn.close()
        assert detail is not None
        assert detail["imported"] == 1
