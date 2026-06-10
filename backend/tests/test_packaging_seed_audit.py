# -*- coding: utf-8 -*-
"""Packaging seed audit and clean identity rules."""
from __future__ import annotations

import sqlite3
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from packaging_seed_common import (
    LOCAL_DESKTOP_PROVIDER,
    LOCAL_DESKTOP_USERNAME,
    audit_workouts_seed,
    reset_local_desktop_identity,
    sanitize_workouts_seed,
)


def _make_users_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    try:
        conn.execute(
            """
            CREATE TABLE users (
                id INTEGER PRIMARY KEY,
                username TEXT,
                cloud_provider TEXT,
                cloud_user_id TEXT,
                display_email TEXT
            )
            """
        )
        conn.execute(
            """
            INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
            VALUES (1, 'dev', 'yandex', '12345', 'dev@example.com')
            """
        )
        conn.execute(
            """
            CREATE TABLE body_metrics (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                date TEXT,
                weight_kg REAL
            )
            """
        )
        conn.execute(
            "INSERT INTO body_metrics (user_id, date, weight_kg) VALUES (1, '2026-01-01', 80.0)"
        )
        conn.execute(
            """
            CREATE TABLE meal_templates (
                id INTEGER PRIMARY KEY,
                user_id INTEGER,
                name TEXT,
                meal_type TEXT,
                phase TEXT
            )
            """
        )
        conn.commit()
    finally:
        conn.close()


def test_sanitize_resets_local_identity_and_clears_personal_rows():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        _make_users_db(path)
        conn = sqlite3.connect(path)
        try:
            sanitize_workouts_seed(conn)
        finally:
            conn.close()
            conn = sqlite3.connect(path)
        try:
            row = conn.execute(
                "SELECT username, cloud_provider, display_email FROM users WHERE id = 1"
            ).fetchone()
            assert row == (LOCAL_DESKTOP_USERNAME, LOCAL_DESKTOP_PROVIDER, None)
            count = conn.execute("SELECT COUNT(*) FROM body_metrics").fetchone()[0]
            assert int(count) == 0
        finally:
            conn.close()


def test_audit_fails_on_cloud_identity_and_body_data():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        _make_users_db(path)
        errors = audit_workouts_seed(path)
        assert any("body_metrics" in err for err in errors)
        assert any("cloud_provider" in err for err in errors)


def test_reset_local_desktop_identity_only():
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "workouts.db"
        _make_users_db(path)
        conn = sqlite3.connect(path)
        try:
            reset_local_desktop_identity(conn)
        finally:
            conn.close()
        conn = sqlite3.connect(path)
        try:
            row = conn.execute(
                "SELECT cloud_provider, display_email FROM users WHERE id = 1"
            ).fetchone()
            assert row == (LOCAL_DESKTOP_PROVIDER, None)
        finally:
            conn.close()
