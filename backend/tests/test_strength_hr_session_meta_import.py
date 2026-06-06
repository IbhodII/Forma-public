# -*- coding: utf-8 -*-
"""Idempotent strength_hr_session_meta merge during DB import."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

import pytest

from backend.services.strength_hr_session_meta_import import (
    dedupe_strength_hr_session_meta,
    merge_strength_hr_session_meta_from_staging,
    upsert_strength_hr_session_meta_row,
)


def _create_meta_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE strength_hr_session_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            hr_workout_id INTEGER,
            mapping_status TEXT NOT NULL DEFAULT 'auto',
            verified_at TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX idx_hr_session_meta_user_session
        ON strength_hr_session_meta(user_id, workout_date, workout_title)
        """
    )


def test_upsert_skips_duplicate_without_error():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        conn = sqlite3.connect(path)
        _create_meta_table(conn)
        row = {
            "user_id": 1,
            "workout_date": "2026-01-15",
            "workout_title": "Push",
            "hr_workout_id": 10,
            "mapping_status": "auto",
            "verified_at": None,
            "updated_at": "2026-01-15T10:00:00",
        }
        assert upsert_strength_hr_session_meta_row(conn, row) == "inserted"
        assert upsert_strength_hr_session_meta_row(conn, row) == "skipped"
        count = conn.execute("SELECT COUNT(*) FROM strength_hr_session_meta").fetchone()[0]
        conn.close()
        assert count == 1


def test_merge_from_staging_dedupes_source_and_updates_target():
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "target.db"
        staging = Path(tmp) / "staging.db"

        tconn = sqlite3.connect(target)
        _create_meta_table(tconn)
        tconn.execute(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, hr_workout_id,
                mapping_status, updated_at
            ) VALUES (2, '2026-02-01', 'Legs', 5, 'auto', '2026-02-01')
            """
        )
        tconn.commit()

        sconn = sqlite3.connect(staging)
        _create_meta_table(sconn)
        sconn.execute("DROP INDEX idx_hr_session_meta_user_session")
        sconn.executemany(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, hr_workout_id,
                mapping_status, verified_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (99, "2026-02-01", "Legs", 5, "auto", None, "2026-02-01"),
                (99, "2026-02-01", "Legs", 12, "verified", "2026-02-02", "2026-02-03"),
                (99, "2026-02-02", "Pull", 20, "manual", None, "2026-02-02"),
            ],
        )
        sconn.commit()
        sconn.close()
        tconn.close()

        conn = sqlite3.connect(target)
        conn.execute(f"ATTACH DATABASE ? AS import_main", (str(staging.resolve()),))
        stats = merge_strength_hr_session_meta_from_staging(
            conn, target_user_id=2, import_uid=99
        )
        conn.commit()
        rows = conn.execute(
            """
            SELECT workout_date, workout_title, hr_workout_id, mapping_status, verified_at
            FROM strength_hr_session_meta WHERE user_id = 2 ORDER BY workout_date
            """
        ).fetchall()
        conn.close()

        assert stats["imported"] == 1
        assert stats["updated"] == 1
        assert stats["skipped_duplicates"] == 0
        assert len(rows) == 2
        assert rows[0][2] == 12
        assert rows[0][3] == "verified"
        assert rows[0][4] == "2026-02-02"


def test_dedupe_after_user_id_remap_collision():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        conn = sqlite3.connect(path)
        _create_meta_table(conn)
        conn.execute("DROP INDEX idx_hr_session_meta_user_session")
        conn.executemany(
            """
            INSERT INTO strength_hr_session_meta (
                user_id, workout_date, workout_title, mapping_status
            ) VALUES (?, ?, ?, ?)
            """,
            [
                (1, "2026-03-01", "Chest", "auto"),
                (1, "2026-03-01", "Chest", "manual"),
            ],
        )
        conn.commit()
        removed = dedupe_strength_hr_session_meta(conn, user_id=1)
        count = conn.execute(
            "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = 1"
        ).fetchone()[0]
        status = conn.execute(
            "SELECT mapping_status FROM strength_hr_session_meta WHERE user_id = 1"
        ).fetchone()[0]
        conn.close()
        assert removed == 1
        assert count == 1
        assert status == "manual"
