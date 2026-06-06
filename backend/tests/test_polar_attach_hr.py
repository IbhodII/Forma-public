# -*- coding: utf-8 -*-
"""Polar attach: HR samples → workout_heart_rate, imported gating."""
from __future__ import annotations

import json
import sqlite3

import pytest

from backend.services import polar_attach_service
from import_polar_historical import HR_SOURCE_CARDIO, HR_SOURCE_STRENGTH

HR_SAMPLE_BLOCK = {
    "recording-rate": 1,
    "sample-type": "1",
    "data": "90,91,92,93,94",
}

HR_SAMPLE_BLOCK_TYPE_0 = {
    "recording-rate": 1,
    "sample-type": 0,
    "data": "84,85,86,86,87",
}

SUMMARY_ONLY = {
    "id": 488338200,
    "transaction-id": 332767381,
    "heart-rate": {"average": 109, "maximum": 151},
    "duration": "PT52M38.189S",
}


@pytest.fixture
def polar_hr_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE cardio_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            type TEXT,
            distance_km REAL,
            duration_sec INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            calories INTEGER,
            calories_chest INTEGER,
            calories_watch INTEGER,
            data_source TEXT,
            start_time TEXT,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE strength_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            workout_title TEXT,
            exercise TEXT,
            weight REAL,
            reps INTEGER,
            set_number INTEGER,
            order_index INTEGER NOT NULL DEFAULT 0,
            avg_hr INTEGER,
            calories_chest INTEGER,
            calories_watch INTEGER,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE polar_pending_workouts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            polar_transaction_id TEXT NOT NULL UNIQUE,
            date TEXT,
            type TEXT,
            duration_sec INTEGER,
            distance_km REAL,
            calories INTEGER,
            avg_hr INTEGER,
            max_hr INTEGER,
            raw_data TEXT,
            imported INTEGER NOT NULL DEFAULT 0,
            local_user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            distance_m REAL,
            source_type TEXT DEFAULT 'cardio'
        );
        CREATE TABLE gps_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            track_data TEXT,
            source TEXT,
            date TEXT,
            file_name TEXT
        );
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(polar_attach_service, "get_db", _get_db)
    monkeypatch.setattr(polar_attach_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        polar_attach_service,
        "_hydrate_polar_raw_data",
        lambda _conn, _pending, data: data,
    )
    return db_path


def _insert_cardio(conn: sqlite3.Connection) -> int:
    cur = conn.execute(
        """
        INSERT INTO cardio_workouts (
            date, type, distance_km, duration_sec, avg_hr, data_source, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        ("2026-05-28", "бег", 5.0, 1800, None, "manual", 1),
    )
    conn.commit()
    return int(cur.lastrowid)


def _insert_strength(conn: sqlite3.Connection) -> int:
    cur = conn.execute(
        """
        INSERT INTO strength_workouts (
            date, workout_title, exercise, weight, reps, set_number,
            avg_hr, calories_chest, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        ("2026-05-28", "Push", "Bench", 80.0, 8, 1, None, None, 1),
    )
    conn.commit()
    return int(cur.lastrowid)


def _insert_pending(
    conn: sqlite3.Connection,
    *,
    tid: str,
    raw: dict,
    workout_type: str = "бег",
) -> None:
    conn.execute(
        """
        INSERT INTO polar_pending_workouts (
            polar_transaction_id, date, type, calories, avg_hr, max_hr,
            raw_data, imported, local_user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 1)
        """,
        (
            tid,
            "2026-05-28",
            workout_type,
            500,
            109,
            151,
            json.dumps(raw),
        ),
    )
    conn.commit()


def test_attach_cardio_saves_hr_samples(polar_hr_db):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_cardio(conn)
        tid = "polar-cardio-hr-1"
        _insert_pending(conn, tid=tid, raw={**SUMMARY_ONLY, "samples": [HR_SAMPLE_BLOCK]})
    finally:
        conn.close()

    result = polar_attach_service.attach_polar_to_cardio(wid, tid)

    assert result["has_hr_chart"] is True
    assert result["hr_samples"] == 5
    assert result["hr_samples_parsed"] == 5
    assert result["hr_samples_inserted"] == 5
    assert result["hr_parser_source"] == "AccessLink"

    conn = polar_attach_service.get_db()
    try:
        rows = conn.execute(
            """
            SELECT elapsed_sec, heart_rate, source_type
            FROM workout_heart_rate
            WHERE cardio_workout_id = ?
            ORDER BY elapsed_sec
            """,
            (wid,),
        ).fetchall()
        assert len(rows) == 5
        assert rows[0]["heart_rate"] == 90
        assert all(r["source_type"] == HR_SOURCE_CARDIO for r in rows)
        pending = conn.execute(
            "SELECT imported FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            (tid,),
        ).fetchone()
        assert pending["imported"] == 1
    finally:
        conn.close()


def test_attach_cardio_saves_accesslink_sample_type_zero(polar_hr_db):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_cardio(conn)
        tid = "polar-cardio-hr-type-0"
        _insert_pending(
            conn,
            tid=tid,
            raw={**SUMMARY_ONLY, "samples": [HR_SAMPLE_BLOCK_TYPE_0]},
        )
    finally:
        conn.close()

    result = polar_attach_service.attach_polar_to_cardio(wid, tid)

    assert result["has_hr_chart"] is True
    assert result["hr_samples"] == 5
    assert result["hr_samples_parsed"] == 5
    assert result["hr_parser_source"] == "AccessLink"

    conn = polar_attach_service.get_db()
    try:
        rows = conn.execute(
            """
            SELECT elapsed_sec, heart_rate, source_type
            FROM workout_heart_rate
            WHERE cardio_workout_id = ?
            ORDER BY elapsed_sec
            """,
            (wid,),
        ).fetchall()
        assert [(r["elapsed_sec"], r["heart_rate"]) for r in rows] == [
            (0, 84),
            (1, 85),
            (2, 86),
            (3, 86),
            (4, 87),
        ]
        assert all(r["source_type"] == HR_SOURCE_CARDIO for r in rows)
    finally:
        conn.close()


def test_attach_summary_only_no_hr_rows(polar_hr_db):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_cardio(conn)
        tid = "polar-cardio-summary"
        _insert_pending(conn, tid=tid, raw=dict(SUMMARY_ONLY))
    finally:
        conn.close()

    result = polar_attach_service.attach_polar_to_cardio(wid, tid)

    assert result["has_hr_chart"] is False
    assert result["hr_samples"] == 0
    assert result["hr_samples_received"] == 0
    assert result["hr_samples_parsed"] == 0
    assert "Parsed=0" in " ".join(result["warnings"])

    conn = polar_attach_service.get_db()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM workout_heart_rate WHERE cardio_workout_id = ?",
            (wid,),
        ).fetchone()[0]
        assert count == 0
        pending = conn.execute(
            "SELECT imported FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            (tid,),
        ).fetchone()
        assert pending["imported"] == 1
    finally:
        conn.close()


def test_attach_samples_fail_keeps_pending(polar_hr_db, monkeypatch):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_cardio(conn)
        tid = "polar-cardio-fail"
        _insert_pending(conn, tid=tid, raw={**SUMMARY_ONLY, "samples": [HR_SAMPLE_BLOCK]})
    finally:
        conn.close()

    monkeypatch.setattr(
        polar_attach_service,
        "insert_hr_samples_if_empty",
        lambda *args, **kwargs: False,
    )
    monkeypatch.setattr(
        polar_attach_service,
        "workout_has_hr_samples",
        lambda *args, **kwargs: False,
    )

    with pytest.raises(ValueError, match="Не удалось сохранить точки пульса"):
        polar_attach_service.attach_polar_to_cardio(wid, tid)

    conn = polar_attach_service.get_db()
    try:
        pending = conn.execute(
            "SELECT imported FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            (tid,),
        ).fetchone()
        assert pending["imported"] == 0
    finally:
        conn.close()


def test_attach_skips_insert_when_hr_exists(polar_hr_db):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_cardio(conn)
        tid = "polar-cardio-existing"
        conn.executemany(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, source_type
            ) VALUES (?, ?, ?, ?)
            """,
            [(wid, 0, 100, HR_SOURCE_CARDIO), (wid, 1, 101, HR_SOURCE_CARDIO)],
        )
        _insert_pending(conn, tid=tid, raw={**SUMMARY_ONLY, "samples": [HR_SAMPLE_BLOCK]})
        conn.commit()
    finally:
        conn.close()

    result = polar_attach_service.attach_polar_to_cardio(wid, tid)

    assert result["has_hr_chart"] is True
    assert result["hr_samples"] == 0
    assert result["hr_samples_inserted"] == 0
    assert any("уже существуют" in w for w in result["warnings"])

    conn = polar_attach_service.get_db()
    try:
        count = conn.execute(
            "SELECT COUNT(*) FROM workout_heart_rate WHERE cardio_workout_id = ?",
            (wid,),
        ).fetchone()[0]
        assert count == 2
        pending = conn.execute(
            "SELECT imported FROM polar_pending_workouts WHERE polar_transaction_id = ?",
            (tid,),
        ).fetchone()
        assert pending["imported"] == 1
    finally:
        conn.close()


def test_attach_strength_saves_hr_with_source_type(polar_hr_db, monkeypatch):
    conn = polar_attach_service.get_db()
    try:
        wid = _insert_strength(conn)
        tid = "polar-strength-hr"
        _insert_pending(
            conn,
            tid=tid,
            raw={**SUMMARY_ONLY, "samples": [HR_SAMPLE_BLOCK]},
            workout_type="силовая",
        )
    finally:
        conn.close()

    fake_detail = {
        "date": "2026-05-28",
        "workout_title": "Push",
        "exercises": [],
        "avg_hr": 109,
        "has_hr": True,
        "hr_workout_id": wid,
        "anchor_row_id": wid,
    }
    monkeypatch.setattr(
        "backend.services.strength_service.get_session_detail",
        lambda _date, _title: fake_detail,
    )

    result = polar_attach_service.attach_polar_to_strength(wid, tid)

    assert result["has_hr_chart"] is True
    assert result["hr_samples"] == 5

    conn = polar_attach_service.get_db()
    try:
        rows = conn.execute(
            """
            SELECT source_type FROM workout_heart_rate
            WHERE cardio_workout_id = ?
            """,
            (wid,),
        ).fetchall()
        assert len(rows) == 5
        assert all(r["source_type"] == HR_SOURCE_STRENGTH for r in rows)
    finally:
        conn.close()
