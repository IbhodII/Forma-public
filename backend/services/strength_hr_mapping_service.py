# -*- coding: utf-8 -*-
"""Persisted HR block mappings (verified/manual) for strength sessions."""
from __future__ import annotations

from typing import Any, Literal

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.strength_hr_block_override_service import (
    BlockOverrideValidationError,
    validate_override_blocks,
)
from backend.services.strength_service import resolve_session_hr_workout_id

MappingStatus = Literal["auto", "verified", "manual"]
VALID_KINDS = frozenset({"set", "warmup", "rest", "noise"})


def _normalize_session(date: str, workout_title: str) -> tuple[str, str]:
    return str(date)[:10], str(workout_title or "")


def _validate_mapping_blocks(blocks: list[dict[str, Any]]) -> None:
    if not blocks:
        return
    validate_override_blocks(blocks)
    for i, block in enumerate(blocks, start=1):
        kind = str(block.get("kind") or "set")
        if kind not in VALID_KINDS:
            raise BlockOverrideValidationError(f"Блок {i}: недопустимый kind={kind!r}")


def get_session_meta(date: str, workout_title: str) -> dict[str, Any] | None:
    date_str, title = _normalize_session(date, workout_title)
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT hr_workout_id, mapping_status, verified_at, created_at, updated_at
            FROM strength_hr_session_meta
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        ).fetchone()
    finally:
        conn.close()
    if not row:
        return None
    return {
        "hr_workout_id": int(row[0]) if row[0] is not None else None,
        "mapping_status": str(row[1] or "auto"),
        "verified_at": row[2],
        "created_at": row[3],
        "updated_at": row[4],
    }


def get_mappings(date: str, workout_title: str) -> list[dict[str, Any]]:
    date_str, title = _normalize_session(date, workout_title)
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT block_index, start_sec, end_sec, kind, assigned_order_index,
                   exercise, set_number, verified, confidence,
                   label, notes, source_auto_block_index, original_start_sec, original_end_sec
            FROM strength_hr_block_mappings
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
            "exercise": r[5],
            "set_number": int(r[6]) if r[6] is not None else None,
            "verified": bool(int(r[7] or 0)),
            "confidence": r[8],
            "label": r[9],
            "notes": r[10],
            "source_auto_block_index": int(r[11]) if r[11] is not None else None,
            "original_start_sec": int(r[12]) if r[12] is not None else None,
            "original_end_sec": int(r[13]) if r[13] is not None else None,
        }
        for r in rows
    ]


def mappings_as_overrides(mappings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Convert persisted mappings to override-shaped rows for effective block builder."""
    return [
        {
            "block_index": m["block_index"],
            "start_sec": m["start_sec"],
            "end_sec": m["end_sec"],
            "kind": m.get("kind") or "set",
            "assigned_order_index": m.get("assigned_order_index"),
            "label": m.get("label"),
            "notes": m.get("notes"),
            "source_auto_block_index": m.get("source_auto_block_index"),
            "original_start_sec": m.get("original_start_sec"),
            "original_end_sec": m.get("original_end_sec"),
        }
        for m in mappings
    ]


def _upsert_session_meta(
    conn,
    uid: int,
    date_str: str,
    title: str,
    *,
    mapping_status: MappingStatus,
    verified: bool = False,
) -> None:
    hr_wid = resolve_session_hr_workout_id(date_str, title, conn=conn)
    verified_at = "CURRENT_TIMESTAMP" if verified else None
    existing = conn.execute(
        """
        SELECT id FROM strength_hr_session_meta
        WHERE user_id = ? AND workout_date = ? AND workout_title = ?
        """,
        (uid, date_str, title),
    ).fetchone()
    if existing:
        if verified:
            conn.execute(
                """
                UPDATE strength_hr_session_meta
                SET hr_workout_id = ?, mapping_status = ?, verified_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND workout_date = ? AND workout_title = ?
                """,
                (hr_wid, mapping_status, uid, date_str, title),
            )
        else:
            conn.execute(
                """
                UPDATE strength_hr_session_meta
                SET hr_workout_id = ?, mapping_status = ?, verified_at = NULL,
                    updated_at = CURRENT_TIMESTAMP
                WHERE user_id = ? AND workout_date = ? AND workout_title = ?
                """,
                (hr_wid, mapping_status, uid, date_str, title),
            )
    else:
        if verified:
            conn.execute(
                """
                INSERT INTO strength_hr_session_meta (
                    user_id, workout_date, workout_title, hr_workout_id,
                    mapping_status, verified_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                """,
                (uid, date_str, title, hr_wid, mapping_status),
            )
        else:
            conn.execute(
                """
                INSERT INTO strength_hr_session_meta (
                    user_id, workout_date, workout_title, hr_workout_id,
                    mapping_status, updated_at
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (uid, date_str, title, hr_wid, mapping_status),
            )


def save_mappings(
    date: str,
    workout_title: str,
    blocks: list[dict[str, Any]],
    *,
    mapping_status: MappingStatus = "manual",
    verified: bool = False,
) -> None:
    date_str, title = _normalize_session(date, workout_title)
    _validate_mapping_blocks(blocks)
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            DELETE FROM strength_hr_block_mappings
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        block_verified = 1 if verified or mapping_status == "verified" else 0
        for i, block in enumerate(
            sorted(blocks, key=lambda b: int(b.get("start_sec") or 0)),
            start=1,
        ):
            conn.execute(
                """
                INSERT INTO strength_hr_block_mappings (
                    user_id, workout_date, workout_title, block_index,
                    start_sec, end_sec, kind, assigned_order_index,
                    exercise, set_number, verified, confidence,
                    label, notes, source_auto_block_index, original_start_sec, original_end_sec,
                    updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
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
                    block.get("exercise"),
                    block.get("set_number"),
                    int(block.get("verified", block_verified)),
                    block.get("confidence"),
                    block.get("label"),
                    block.get("notes"),
                    block.get("source_auto_block_index"),
                    block.get("original_start_sec"),
                    block.get("original_end_sec"),
                ),
            )
        _upsert_session_meta(
            conn,
            uid,
            date_str,
            title,
            mapping_status=mapping_status,
            verified=verified or mapping_status == "verified",
        )
        conn.commit()
    finally:
        conn.close()


def delete_mappings(date: str, workout_title: str) -> None:
    date_str, title = _normalize_session(date, workout_title)
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            """
            DELETE FROM strength_hr_block_mappings
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        conn.execute(
            """
            DELETE FROM strength_hr_session_meta
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        conn.commit()
    finally:
        conn.close()


def _blocks_from_analysis(analysis: dict[str, Any]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    for b in analysis.get("detected_blocks") or []:
        matched = b.get("matched_set") or {}
        blocks.append(
            {
                "start_sec": int(b["start_sec"]),
                "end_sec": int(b["end_sec"]),
                "kind": b.get("kind") or "set",
                "assigned_order_index": b.get("matched_order_index"),
                "exercise": b.get("matched_exercise") or matched.get("exercise"),
                "set_number": b.get("matched_set_number") or matched.get("set_number"),
                "confidence": b.get("confidence"),
                "source_auto_block_index": b.get("block_index") or b.get("block_id"),
                "original_start_sec": b.get("start_sec"),
                "original_end_sec": b.get("end_sec"),
            }
        )
    return blocks


def verify_auto_mapping(date: str, workout_title: str) -> dict[str, Any]:
    """Snapshot current auto-detected blocks as verified mapping."""
    from backend.services import strength_hr_analysis_service

    analysis = strength_hr_analysis_service.get_strength_hr_analysis(
        date,
        workout_title,
        _skip_comparison=True,
        _ignore_saved_mappings=True,
    )
    blocks = _blocks_from_analysis(analysis)
    if not blocks:
        raise BlockOverrideValidationError("Нет блоков для подтверждения")
    save_mappings(date, workout_title, blocks, mapping_status="verified", verified=True)
    return get_session_meta(date, workout_title) or {"mapping_status": "verified"}


def sync_legacy_override(
    date: str,
    workout_title: str,
    blocks: list[dict[str, Any]],
) -> None:
    """Write manual mapping and mirror to legacy overrides table."""
    save_mappings(date, workout_title, blocks, mapping_status="manual", verified=False)
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


def delete_legacy_and_mappings(date: str, workout_title: str) -> None:
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
        conn.execute(
            """
            DELETE FROM strength_hr_block_mappings
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        conn.execute(
            """
            DELETE FROM strength_hr_session_meta
            WHERE user_id = ? AND workout_date = ? AND workout_title = ?
            """,
            (uid, date_str, title),
        )
        conn.commit()
    finally:
        conn.close()
