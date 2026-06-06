# -*- coding: utf-8 -*-
"""Idempotent strength_hr_block_mappings merge and reassign."""
from __future__ import annotations

import sqlite3
import tempfile
from pathlib import Path

from backend.services.strength_hr_block_mappings_import import (
    dedupe_strength_hr_block_mappings,
    merge_strength_hr_block_mappings_from_staging,
    remap_strength_hr_block_mappings_user_ids,
    upsert_strength_hr_block_mapping_row,
)


def _create_block_table(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE strength_hr_block_mappings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            start_sec INTEGER NOT NULL,
            end_sec INTEGER NOT NULL,
            kind TEXT NOT NULL DEFAULT 'set',
            assigned_order_index INTEGER,
            exercise TEXT,
            set_number INTEGER,
            verified INTEGER NOT NULL DEFAULT 0,
            confidence TEXT,
            label TEXT,
            notes TEXT,
            source_auto_block_index INTEGER,
            original_start_sec INTEGER,
            original_end_sec INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX idx_hr_block_mappings_session_block
        ON strength_hr_block_mappings(user_id, workout_date, workout_title, block_index)
        """
    )


def test_block_upsert_skips_duplicate():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        conn = sqlite3.connect(path)
        _create_block_table(conn)
        row = {
            "user_id": 1,
            "workout_date": "2026-01-15",
            "workout_title": "Push",
            "block_index": 0,
            "start_sec": 0,
            "end_sec": 60,
            "kind": "set",
            "verified": 1,
            "updated_at": "2026-01-15T10:00:00",
        }
        assert upsert_strength_hr_block_mapping_row(conn, row) == "inserted"
        assert upsert_strength_hr_block_mapping_row(conn, row) == "skipped"
        count = conn.execute("SELECT COUNT(*) FROM strength_hr_block_mappings").fetchone()[0]
        conn.close()
        assert count == 1


def test_merge_block_mappings_from_staging():
    with tempfile.TemporaryDirectory() as tmp:
        target = Path(tmp) / "target.db"
        staging = Path(tmp) / "staging.db"

        tconn = sqlite3.connect(target)
        _create_block_table(tconn)
        tconn.commit()
        tconn.close()

        sconn = sqlite3.connect(staging)
        _create_block_table(sconn)
        sconn.execute("DROP INDEX idx_hr_block_mappings_session_block")
        sconn.executemany(
            """
            INSERT INTO strength_hr_block_mappings (
                user_id, workout_date, workout_title, block_index,
                start_sec, end_sec, kind, verified, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (99, "2026-02-01", "Legs", 0, 0, 30, "set", 0, "2026-02-01"),
                (99, "2026-02-01", "Legs", 0, 0, 45, "set", 1, "2026-02-02"),
            ],
        )
        sconn.commit()
        sconn.close()

        conn = sqlite3.connect(target)
        conn.execute("ATTACH DATABASE ? AS import_main", (str(staging.resolve()),))
        stats = merge_strength_hr_block_mappings_from_staging(
            conn, target_user_id=2, import_uid=99
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT end_sec, verified FROM strength_hr_block_mappings
            WHERE user_id = 2 AND workout_date = '2026-02-01' AND block_index = 0
            """
        ).fetchone()
        conn.close()

        assert stats["imported"] == 1
        assert row == (45, 1)


def test_reassign_block_mappings_collision():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        conn = sqlite3.connect(path)
        _create_block_table(conn)
        conn.execute(
            """
            INSERT INTO strength_hr_block_mappings (
                user_id, workout_date, workout_title, block_index,
                start_sec, end_sec, kind, verified
            ) VALUES (1, '2026-03-01', 'Chest', 0, 0, 60, 'set', 0)
            """
        )
        conn.execute(
            """
            INSERT INTO strength_hr_block_mappings (
                user_id, workout_date, workout_title, block_index,
                start_sec, end_sec, kind, verified, updated_at
            ) VALUES (5, '2026-03-01', 'Chest', 0, 0, 90, 'set', 1, '2026-03-02')
            """
        )
        conn.commit()

        stats = remap_strength_hr_block_mappings_user_ids(
            conn, target_user_id=1, source_user_ids=[5]
        )
        count = conn.execute(
            "SELECT COUNT(*) FROM strength_hr_block_mappings WHERE user_id = 1"
        ).fetchone()[0]
        end_sec = conn.execute(
            """
            SELECT end_sec, verified FROM strength_hr_block_mappings
            WHERE user_id = 1 AND block_index = 0
            """
        ).fetchone()
        conn.close()

        assert stats["updated"] + stats["imported"] >= 1
        assert count == 1
        assert end_sec == (90, 1)


def test_dedupe_block_mappings_keeps_verified():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        conn = sqlite3.connect(path)
        _create_block_table(conn)
        conn.execute("DROP INDEX idx_hr_block_mappings_session_block")
        conn.executemany(
            """
            INSERT INTO strength_hr_block_mappings (
                user_id, workout_date, workout_title, block_index,
                start_sec, end_sec, kind, verified
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """,
            [
                (1, "2026-03-01", "Chest", 0, 0, 60, "set", 0),
                (1, "2026-03-01", "Chest", 0, 0, 90, "set", 1),
            ],
        )
        conn.commit()
        removed = dedupe_strength_hr_block_mappings(conn, user_id=1)
        verified = conn.execute(
            "SELECT verified FROM strength_hr_block_mappings WHERE user_id = 1"
        ).fetchone()[0]
        conn.close()
        assert removed == 1
        assert verified == 1
