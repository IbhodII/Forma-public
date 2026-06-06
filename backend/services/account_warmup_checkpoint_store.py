# -*- coding: utf-8 -*-
"""Persistent checkpoint and aggregate cache for account warmup."""
from __future__ import annotations

import json
import sqlite3
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Literal

from database.connection import open_db

WarmupCheckpointStatus = Literal["idle", "running", "completed", "failed", "cancelled"]


def _utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


@dataclass
class WarmupCursor:
    stage: str = ""
    tier: str = ""
    date_from: str = ""
    date_to: str = ""
    last_id: int = 0
    phase: str = ""
    batch_index: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "stage": self.stage,
            "tier": self.tier,
            "date_from": self.date_from,
            "date_to": self.date_to,
            "last_id": self.last_id,
            "phase": self.phase,
            "batch_index": self.batch_index,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> WarmupCursor:
        if not data:
            return cls()
        return cls(
            stage=str(data.get("stage") or ""),
            tier=str(data.get("tier") or ""),
            date_from=str(data.get("date_from") or ""),
            date_to=str(data.get("date_to") or ""),
            last_id=int(data.get("last_id") or 0),
            phase=str(data.get("phase") or ""),
            batch_index=int(data.get("batch_index") or 0),
        )


@dataclass
class WarmupCheckpoint:
    user_id: int
    status: WarmupCheckpointStatus = "idle"
    mode: str | None = None
    task_id: str | None = None
    cursor: WarmupCursor = field(default_factory=WarmupCursor)
    processed_units: int = 0
    total_units: int = 0
    started_at: str | None = None
    updated_at: str | None = None
    completed_at: str | None = None
    last_error: str | None = None


def _row_to_checkpoint(row: sqlite3.Row | None) -> WarmupCheckpoint | None:
    if row is None:
        return None
    cursor_raw = row["cursor_json"]
    cursor_data: dict[str, Any] | None = None
    if cursor_raw:
        try:
            cursor_data = json.loads(cursor_raw)
        except json.JSONDecodeError:
            cursor_data = None
    return WarmupCheckpoint(
        user_id=int(row["user_id"]),
        status=row["status"] or "idle",
        mode=row["mode"],
        task_id=row["task_id"],
        cursor=WarmupCursor.from_dict(cursor_data),
        processed_units=int(row["processed_units"] or 0),
        total_units=int(row["total_units"] or 0),
        started_at=row["started_at"],
        updated_at=row["updated_at"],
        completed_at=row["completed_at"],
        last_error=row["last_error"],
    )


def get_checkpoint(user_id: int, *, conn: sqlite3.Connection | None = None) -> WarmupCheckpoint:
    own = conn is None
    if own:
        conn = open_db(attach=False)
    try:
        row = conn.execute(
            "SELECT * FROM account_warmup_checkpoint WHERE user_id = ?",
            (int(user_id),),
        ).fetchone()
        cp = _row_to_checkpoint(row)
        if cp is None:
            return WarmupCheckpoint(user_id=int(user_id))
        return cp
    finally:
        if own:
            conn.close()


def save_checkpoint(checkpoint: WarmupCheckpoint, *, conn: sqlite3.Connection | None = None) -> None:
    own = conn is None
    if own:
        conn = open_db(attach=False)
    try:
        now = _utc_now()
        conn.execute(
            """
            INSERT INTO account_warmup_checkpoint (
                user_id, status, mode, task_id, cursor_json,
                processed_units, total_units, started_at, updated_at, completed_at, last_error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                status = excluded.status,
                mode = excluded.mode,
                task_id = excluded.task_id,
                cursor_json = excluded.cursor_json,
                processed_units = excluded.processed_units,
                total_units = excluded.total_units,
                started_at = COALESCE(account_warmup_checkpoint.started_at, excluded.started_at),
                updated_at = excluded.updated_at,
                completed_at = excluded.completed_at,
                last_error = excluded.last_error
            """,
            (
                int(checkpoint.user_id),
                checkpoint.status,
                checkpoint.mode,
                checkpoint.task_id,
                json.dumps(checkpoint.cursor.to_dict(), ensure_ascii=False),
                int(checkpoint.processed_units),
                int(checkpoint.total_units),
                checkpoint.started_at or now,
                now,
                checkpoint.completed_at,
                checkpoint.last_error,
            ),
        )
        conn.commit()
    finally:
        if own:
            conn.close()


def get_cache_fingerprint(
    user_id: int,
    metric_key: str,
    grain: str,
    bucket_date: str,
    *,
    conn: sqlite3.Connection | None = None,
) -> str | None:
    own = conn is None
    if own:
        conn = open_db(attach=False)
    try:
        row = conn.execute(
            """
            SELECT source_fingerprint FROM account_warmup_daily_cache
            WHERE user_id = ? AND metric_key = ? AND grain = ? AND bucket_date = ?
            """,
            (int(user_id), metric_key, grain, bucket_date),
        ).fetchone()
        if row is None:
            return None
        return row["source_fingerprint"]
    finally:
        if own:
            conn.close()


def upsert_daily_cache(
    user_id: int,
    metric_key: str,
    grain: str,
    bucket_date: str,
    payload: dict[str, Any],
    *,
    source_fingerprint: str | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    own = conn is None
    if own:
        conn = open_db(attach=False)
    try:
        now = _utc_now()
        conn.execute(
            """
            INSERT INTO account_warmup_daily_cache (
                user_id, metric_key, grain, bucket_date,
                payload_json, computed_at, source_fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id, metric_key, grain, bucket_date) DO UPDATE SET
                payload_json = excluded.payload_json,
                computed_at = excluded.computed_at,
                source_fingerprint = excluded.source_fingerprint
            """,
            (
                int(user_id),
                metric_key,
                grain,
                bucket_date,
                json.dumps(payload, ensure_ascii=False),
                now,
                source_fingerprint,
            ),
        )
        conn.commit()
    finally:
        if own:
            conn.close()
