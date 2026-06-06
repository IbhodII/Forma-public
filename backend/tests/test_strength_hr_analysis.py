# -*- coding: utf-8 -*-
"""HR analysis by strength sets/blocks (peak detection)."""
from __future__ import annotations

import sqlite3

import pytest

from backend.services import strength_hr_analysis_service, strength_service
from backend.services.strength_hr_analysis_service import (
    PEAK_DISCLAIMER,
    WARNING_NO_DURATION,
    WARNING_NO_HR,
    WARNING_NO_ORDER,
    WARNING_NO_PEAKS,
)
from backend.services.strength_service import HR_SOURCE_STRENGTH
from backend.database import db_utils
from backend.services import cardio_service


def _peak_pattern_hr(duration_sec: int, n_peaks: int = 3) -> list[tuple[int, int]]:
    """Synthetic HR with n_peaks separated by recovery valleys."""
    rows: list[tuple[int, int]] = []
    seg = duration_sec // n_peaks
    for sec in range(duration_sec):
        phase = sec // seg
        pos = sec % seg
        base = 95 + phase * 5
        if pos < seg // 3:
            hr = base + pos * 2
        elif pos < 2 * seg // 3:
            hr = base + (seg // 3) * 2 - (pos - seg // 3)
        else:
            hr = base + max(0, (pos - 2 * seg // 3))
        rows.append((sec, min(170, hr)))
    return rows


@pytest.fixture
def hr_analysis_db(tmp_path, monkeypatch):
    db_path = tmp_path / "workouts.db"
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
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
            calories_hr INTEGER,
            calories_watch INTEGER,
            is_warmup INTEGER NOT NULL DEFAULT 0,
            is_circuit INTEGER NOT NULL DEFAULT 0,
            duration_sec INTEGER,
            is_bodyweight INTEGER NOT NULL DEFAULT 0,
            user_id INTEGER NOT NULL DEFAULT 1
        );
        CREATE TABLE workout_heart_rate (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cardio_workout_id INTEGER NOT NULL,
            elapsed_sec INTEGER NOT NULL,
            heart_rate INTEGER NOT NULL,
            distance_m REAL,
            source_type TEXT DEFAULT 'cardio'
        );
        """
    )
    conn.commit()
    conn.close()

    def _get_db():
        c = sqlite3.connect(db_path)
        c.row_factory = sqlite3.Row
        return c

    monkeypatch.setattr(strength_service, "get_db", _get_db)
    monkeypatch.setattr(strength_hr_analysis_service, "get_db", _get_db)
    monkeypatch.setattr(cardio_service, "get_db", _get_db)
    monkeypatch.setattr(db_utils, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(strength_service, "get_current_user_id", lambda: 1)
    monkeypatch.setattr(
        strength_hr_analysis_service,
        "get_effective_max_heart_rate",
        lambda: 190,
    )
    return db_path


def _insert_ordered_session(
    conn: sqlite3.Connection,
    *,
    date: str = "2026-05-28",
    title: str = "Push",
    with_hr: bool = True,
    order_indexes: list[int] | None = None,
    exercises: list[str] | None = None,
    reps: list[int] | None = None,
    warmups: list[bool] | None = None,
    duration_sec: int = 240,
    hr_pattern: list[tuple[int, int]] | None = None,
) -> int:
    if order_indexes is None:
        order_indexes = [1, 2, 3]
    if exercises is None:
        exercises = ["Bench", "Row", "Bench"]
    if reps is None:
        reps = [8, 8, 6]
    if warmups is None:
        warmups = [False] * len(order_indexes)
    elif len(warmups) < len(order_indexes):
        warmups = warmups + [False] * (len(order_indexes) - len(warmups))
    if len(reps) < len(order_indexes):
        reps = reps + [reps[-1] if reps else 8] * (len(order_indexes) - len(reps))
    if len(exercises) < len(order_indexes):
        exercises = exercises + [exercises[-1] if exercises else "Ex"] * (
            len(order_indexes) - len(exercises)
        )
    anchor_id: int | None = None
    for i, oi in enumerate(order_indexes):
        conn.execute(
            """
            INSERT INTO strength_workouts (
                date, workout_title, exercise, weight, reps, set_number,
                order_index, is_warmup, user_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            """,
            (
                date,
                title,
                exercises[i],
                80.0,
                reps[i],
                i + 1,
                oi,
                1 if warmups[i] else 0,
            ),
        )
        if anchor_id is None:
            anchor_id = int(conn.execute("SELECT last_insert_rowid()").fetchone()[0])
    if with_hr and anchor_id is not None:
        pattern = hr_pattern or _peak_pattern_hr(duration_sec, n_peaks=len(order_indexes))
        for sec, hr in pattern:
            conn.execute(
                """
                INSERT INTO workout_heart_rate (
                    cardio_workout_id, elapsed_sec, heart_rate, source_type
                ) VALUES (?, ?, ?, ?)
                """,
                (anchor_id, sec, hr, HR_SOURCE_STRENGTH),
            )
    conn.commit()
    return int(anchor_id or 0)


def test_hr_and_ordered_sets_peak_analysis(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(conn, order_indexes=[1, 2, 3])
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert WARNING_NO_HR not in result["warnings"]
    assert result["detection_mode"] == "peak"
    assert "overrides_applied" in result
    assert result["overrides_applied"] is False
    assert result["disclaimer"] == PEAK_DISCLAIMER
    assert len(result["detected_blocks"]) >= 1
    assert result["detected_count"] >= 1
    assert result["hr_available"] is True
    assert result["hr_samples_count"] > 0
    assert result["debug"] is not None
    assert result["thresholds_used"] is not None
    assert "minimum_recovery_drop_bpm" in result["thresholds_used"]


def test_no_hr_warning(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(conn, with_hr=False)
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["warnings"] == [WARNING_NO_HR]
    assert result["detected_blocks"] == []


def test_no_ordered_sets_blocks_only(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        conn.execute(
            """
            INSERT INTO strength_workouts (
                date, workout_title, exercise, weight, reps, set_number,
                order_index, user_id
            ) VALUES ('2026-05-28', 'Legacy', 'Squat', 100, 5, 1, 0, 1)
            """,
        )
        wid = int(conn.execute("SELECT id FROM strength_workouts").fetchone()[0])
        for sec, hr in _peak_pattern_hr(120, n_peaks=2):
            conn.execute(
                """
                INSERT INTO workout_heart_rate (
                    cardio_workout_id, elapsed_sec, heart_rate, source_type
                ) VALUES (?, ?, ?, ?)
                """,
                (wid, sec, hr, HR_SOURCE_STRENGTH),
            )
        conn.commit()
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Legacy")
    assert WARNING_NO_ORDER not in result["warnings"]
    assert result["expected_count"] == 1
    assert result["match_quality"] in ("exact", "partial")
    assert len(result["detected_blocks"]) >= 1


def test_missing_duration_warning(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        conn.execute(
            """
            INSERT INTO strength_workouts (
                date, workout_title, exercise, weight, reps, set_number,
                order_index, user_id
            ) VALUES ('2026-05-28', 'Empty HR', 'Bench', 80, 8, 1, 1, 1)
            """,
        )
        conn.commit()
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Empty HR")
    assert WARNING_NO_HR in result["warnings"] or WARNING_NO_DURATION in result["warnings"]


def test_circuit_order_in_matched_sets(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(
            conn,
            exercises=["A", "B", "A", "B"],
            order_indexes=[1, 2, 3, 4],
            duration_sec=300,
        )
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    if result["sets"]:
        exercises = [s["exercise"] for s in result["sets"] if s.get("peak_hr")]
        assert exercises[: min(2, len(exercises))] == ["A", "B"][: min(2, len(exercises))]
    if result["match_quality"] == "partial":
        assert "superset_detected" in (result.get("confidence_reasons") or []) or any(
            "супerset" in w.lower() for w in result["warnings"]
        )


def test_warmup_sets_labeled(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(
            conn,
            order_indexes=[1, 2],
            exercises=["Bench", "Bench"],
            reps=[10, 8],
            warmups=[True, False],
            duration_sec=180,
        )
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    matched = [b for b in result["detected_blocks"] if b.get("matched_exercise")]
    if matched:
        assert matched[0].get("is_warmup") is True


def test_count_mismatch_warning(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(
            conn,
            order_indexes=[1, 2, 3, 4, 5],
            exercises=["A", "B", "A", "B", "A"],
            reps=[5, 5, 5, 5, 5],
            duration_sec=180,
            hr_pattern=_peak_pattern_hr(180, n_peaks=2),
        )
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert result["detected_count"] != result["expected_count"]
    assert any("блоков" in w for w in result["warnings"])


def test_short_and_long_sessions(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        _insert_ordered_session(
            conn,
            duration_sec=300,
            order_indexes=[1],
            exercises=["Plank"],
            reps=[1],
        )
        _insert_ordered_session(
            conn,
            date="2026-05-29",
            title="Long",
            duration_sec=360,
            order_indexes=[1, 2],
            exercises=["Squat", "Squat"],
            reps=[5, 5],
        )
    finally:
        conn.close()

    short = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    long_ = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-29", "Long")
    assert short["detection_mode"] == "peak"
    assert long_["detection_mode"] == "peak"
    assert short["detected_count"] >= 1
    assert long_["detected_count"] >= 1


def test_flat_hr_no_peaks_warning(hr_analysis_db):
    conn = strength_service.get_db()
    try:
        flat = [(s, 100) for s in range(60)]
        _insert_ordered_session(conn, order_indexes=[1], duration_sec=60, hr_pattern=flat)
    finally:
        conn.close()

    result = strength_hr_analysis_service.get_strength_hr_analysis("2026-05-28", "Push")
    assert WARNING_NO_PEAKS in result["warnings"] or result["detected_count"] <= 1
