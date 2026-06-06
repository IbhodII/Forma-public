# -*- coding: utf-8 -*-
"""Persisted manual HR block overrides for strength sessions."""
from __future__ import annotations

from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.strength_hr_peak_detection import (
    DetectedBlock,
    _exercise_set_numbers,
    _load_display,
    compute_block_metrics,
    normalize_series,
)

MIN_OVERRIDE_BLOCK_DURATION_SEC = 10
VALID_KINDS = frozenset({"set", "warmup", "rest", "noise"})


class BlockOverrideValidationError(ValueError):
    pass


def _normalize_session(date: str, workout_title: str) -> tuple[str, str]:
    return str(date)[:10], str(workout_title or "")


def validate_override_blocks(blocks: list[dict[str, Any]]) -> None:
    if not blocks:
        return
    ordered = sorted(blocks, key=lambda b: int(b.get("start_sec") or 0))
    prev_end: int | None = None
    for i, block in enumerate(ordered, start=1):
        start = int(block.get("start_sec") or 0)
        end = int(block.get("end_sec") or 0)
        kind = str(block.get("kind") or "set")
        if start >= end:
            raise BlockOverrideValidationError(
                f"Блок {i}: start_sec должен быть меньше end_sec"
            )
        if end - start < MIN_OVERRIDE_BLOCK_DURATION_SEC:
            raise BlockOverrideValidationError(
                f"Блок {i}: минимальная длительность {MIN_OVERRIDE_BLOCK_DURATION_SEC} сек"
            )
        if kind not in VALID_KINDS:
            raise BlockOverrideValidationError(f"Блок {i}: недопустимый kind={kind!r}")
        if prev_end is not None and start < prev_end:
            raise BlockOverrideValidationError(f"Блок {i}: пересечение с предыдущим блоком")
        prev_end = end


def get_overrides(date: str, workout_title: str) -> list[dict[str, Any]]:
    date_str, title = _normalize_session(date, workout_title)
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT block_index, start_sec, end_sec, kind, assigned_order_index,
                   label, notes, source_auto_block_index, original_start_sec, original_end_sec
            FROM strength_hr_block_overrides
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            ORDER BY block_index ASC
            """,
            (uid, date_str, title),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "block_index": int(r[0]),
            "start_sec": int(r[1]),
            "end_sec": int(r[2]),
            "kind": str(r[3] or "set"),
            "assigned_order_index": int(r[4]) if r[4] is not None else None,
            "label": r[5],
            "notes": r[6],
            "source_auto_block_index": int(r[7]) if r[7] is not None else None,
            "original_start_sec": int(r[8]) if r[8] is not None else None,
            "original_end_sec": int(r[9]) if r[9] is not None else None,
        }
        for r in rows
    ]


def save_overrides(date: str, workout_title: str, blocks: list[dict[str, Any]]) -> None:
    date_str, title = _normalize_session(date, workout_title)
    validate_override_blocks(blocks)
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            DELETE FROM strength_hr_block_overrides
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        for i, block in enumerate(
            sorted(blocks, key=lambda b: int(b.get("start_sec") or 0)),
            start=1,
        ):
            conn.execute(
                """
                INSERT INTO strength_hr_block_overrides (
                    user_id, workout_date, workout_title, block_index,
                    start_sec, end_sec, kind, assigned_order_index, label, notes,
                    source_auto_block_index, original_start_sec, original_end_sec,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (
                    uid,
                    date_str,
                    title,
                    i,
                    int(block["start_sec"]),
                    int(block["end_sec"]),
                    str(block.get("kind") or "set"),
                    block.get("assigned_order_index"),
                    block.get("label"),
                    block.get("notes"),
                    block.get("source_auto_block_index"),
                    block.get("original_start_sec"),
                    block.get("original_end_sec"),
                ),
            )
        conn.commit()
    finally:
        conn.close()


def delete_overrides(date: str, workout_title: str) -> None:
    date_str, title = _normalize_session(date, workout_title)
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            DELETE FROM strength_hr_block_overrides
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        conn.commit()
    finally:
        conn.close()


def _find_set_by_order(
    ordered_sets: list[dict[str, Any]],
    order_index: int | None,
) -> dict[str, Any] | None:
    if order_index is None:
        return None
    for s in ordered_sets:
        if int(s.get("order_index") or 0) == int(order_index):
            return s
    return None


def build_effective_blocks_from_overrides(
    hr_points: list[dict[str, Any]],
    overrides: list[dict[str, Any]],
    ordered_sets: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Build detected-block-shaped rows from saved overrides + HR samples."""
    if not overrides:
        return []

    raw = normalize_series(hr_points)
    exercise_set_nums: dict[int, int] = {}
    if ordered_sets:
        nums = _exercise_set_numbers(ordered_sets)
        for i, s in enumerate(ordered_sets):
            exercise_set_nums[int(s.get("order_index") or 0)] = nums[i]

    sorted_overrides = sorted(overrides, key=lambda b: int(b.get("start_sec") or 0))
    effective: list[dict[str, Any]] = []

    for i, ov in enumerate(sorted_overrides):
        start_sec = int(ov["start_sec"])
        end_sec = int(ov["end_sec"])
        kind = str(ov.get("kind") or "set")
        next_start = (
            int(sorted_overrides[i + 1]["start_sec"])
            if i + 1 < len(sorted_overrides)
            else None
        )

        window = [(s, h) for s, h in raw if start_sec <= s < end_sec]
        peak_hr = max((h for _, h in window), default=0) if window else 0
        peak_sec = max(window, key=lambda x: x[1])[0] if window else start_sec

        detected = DetectedBlock(
            block_index=i + 1,
            start_sec=start_sec,
            end_sec=end_sec,
            peak_sec=peak_sec,
            peak_hr=peak_hr,
        )
        metrics = compute_block_metrics(
            raw,
            detected,
            next_block_start=next_start,
            confidence_reason="manual_override",
            match_quality="partial",
            matched=False,
        )
        metrics["kind"] = kind
        metrics["block_id"] = i + 1

        if kind in ("noise", "rest"):
            metrics.update(
                {
                    "matched_order_index": None,
                    "matched_exercise": None,
                    "matched_set_number": None,
                    "matched_load_display": ov.get("label"),
                    "is_warmup": False,
                    "confidence": "low",
                    "confidence_reason": kind,
                }
            )
        else:
            order_idx = ov.get("assigned_order_index")
            matched_set = _find_set_by_order(ordered_sets, order_idx)
            if matched_set:
                ex_set_num = exercise_set_nums.get(int(order_idx or 0), 0)
                metrics.update(
                    {
                        "matched_order_index": int(order_idx),
                        "matched_exercise": str(matched_set.get("exercise") or ""),
                        "matched_set_number": ex_set_num,
                        "matched_load_display": _load_display(matched_set),
                        "is_warmup": bool(matched_set.get("is_warmup")),
                        "confidence": "medium",
                        "confidence_reason": "manual_override",
                    }
                )
            else:
                metrics.update(
                    {
                        "matched_order_index": None,
                        "matched_exercise": None,
                        "matched_set_number": None,
                        "matched_load_display": ov.get("label"),
                        "is_warmup": False,
                        "confidence": "medium",
                        "confidence_reason": "manual_override",
                    }
                )

        effective.append(metrics)

    return effective
