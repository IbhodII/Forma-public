# -*- coding: utf-8 -*-
"""Passive / continuous heart rate samples from Health Connect."""
from __future__ import annotations

import math
import sqlite3
from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id

HR_BPM_MIN = 25
HR_BPM_MAX = 240
BATCH_SIZE = 500
SOURCE_HEALTH_CONNECT = "health_connect"


def _table_exists(conn: sqlite3.Connection, name: str) -> bool:
    row = conn.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
        (name,),
    ).fetchone()
    return row is not None


def _parse_iso(ts: str) -> datetime | None:
    try:
        return datetime.fromisoformat(str(ts).replace("Z", "+00:00"))
    except ValueError:
        return None


def _is_valid_bpm(bpm: int) -> bool:
    return HR_BPM_MIN <= int(bpm) <= HR_BPM_MAX


def _normalize_sample_time(raw: str) -> str | None:
    dt = _parse_iso(raw)
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def insert_samples_batch(
    user_id: int,
    samples: list[dict[str, Any]],
    *,
    source: str = SOURCE_HEALTH_CONNECT,
    conn: sqlite3.Connection | None = None,
) -> dict[str, int]:
    """Append-only insert; duplicates ignored via UNIQUE(user_id, recorded_at)."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    assert conn is not None

    if not _table_exists(conn, "passive_heart_rate_samples"):
        if own_conn:
            conn.close()
        return {"received": 0, "inserted": 0, "duplicates": 0, "rejected_invalid": 0}

    received = len(samples)
    rejected_invalid = 0
    rows: list[tuple[int, str, int, str]] = []
    seen: set[str] = set()

    for s in samples:
        if not isinstance(s, dict):
            rejected_invalid += 1
            continue
        time_raw = s.get("time") or s.get("timestamp")
        bpm_raw = s.get("bpm")
        if time_raw is None or bpm_raw is None:
            rejected_invalid += 1
            continue
        try:
            bpm = int(round(float(bpm_raw)))
        except (TypeError, ValueError):
            rejected_invalid += 1
            continue
        if not _is_valid_bpm(bpm):
            rejected_invalid += 1
            continue
        recorded_at = _normalize_sample_time(str(time_raw))
        if not recorded_at:
            rejected_invalid += 1
            continue
        if recorded_at in seen:
            continue
        seen.add(recorded_at)
        rows.append((user_id, recorded_at, bpm, source))

    inserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        chunk = rows[i : i + BATCH_SIZE]
        before = conn.total_changes
        conn.executemany(
            """
            INSERT OR IGNORE INTO passive_heart_rate_samples
                (user_id, recorded_at, bpm, source)
            VALUES (?, ?, ?, ?)
            """,
            chunk,
        )
        inserted += conn.total_changes - before

    if own_conn:
        conn.commit()
        conn.close()

    duplicates = max(0, len(rows) - inserted)
    return {
        "received": received,
        "inserted": inserted,
        "duplicates": duplicates,
        "rejected_invalid": rejected_invalid,
    }


def query_samples(
    user_id: int,
    from_iso: str,
    to_iso: str,
    *,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    conn = get_db()
    try:
        if not _table_exists(conn, "passive_heart_rate_samples"):
            return []
        sql = """
            SELECT recorded_at, bpm, source
            FROM passive_heart_rate_samples
            WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
            ORDER BY recorded_at ASC
        """
        params: list[Any] = [user_id, from_iso, to_iso]
        if limit is not None:
            sql += " LIMIT ?"
            params.append(int(limit))
        rows = conn.execute(sql, params).fetchall()
        return [
            {"time": str(r["recorded_at"]), "bpm": int(r["bpm"]), "source": str(r["source"])}
            for r in rows
        ]
    finally:
        conn.close()


def _percentile(values: list[int], pct: float) -> int | None:
    if not values:
        return None
    sorted_vals = sorted(values)
    idx = max(0, min(len(sorted_vals) - 1, math.ceil(pct * len(sorted_vals)) - 1))
    return int(sorted_vals[idx])


def _overnight_samples(samples: list[tuple[str, int]], day: str) -> list[int]:
    """Overnight window 00:00–06:00 UTC for the given calendar day."""
    start = datetime.fromisoformat(f"{day}T00:00:00+00:00")
    end = start + timedelta(hours=6)
    out: list[int] = []
    for ts, bpm in samples:
        dt = _parse_iso(ts)
        if dt is None:
            continue
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        if start <= dt.astimezone(timezone.utc) < end:
            out.append(bpm)
    return out


def get_daily_stats(
    user_id: int,
    date_from: str,
    date_to: str,
) -> list[dict[str, Any]]:
    d0 = date.fromisoformat(str(date_from)[:10])
    d1 = date.fromisoformat(str(date_to)[:10])
    if d1 < d0:
        d0, d1 = d1, d0

    from_iso = f"{d0.isoformat()}T00:00:00.000Z"
    to_iso = f"{d1.isoformat()}T23:59:59.999Z"
    conn = get_db()
    try:
        if not _table_exists(conn, "passive_heart_rate_samples"):
            return []
        count_row = conn.execute(
            """
            SELECT COUNT(*) FROM passive_heart_rate_samples
            WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
            """,
            (user_id, from_iso, to_iso),
        ).fetchone()
        if not count_row or int(count_row[0]) <= 0:
            return []
        rows = conn.execute(
            """
            SELECT recorded_at, bpm
            FROM passive_heart_rate_samples
            WHERE user_id = ? AND recorded_at >= ? AND recorded_at <= ?
            ORDER BY recorded_at ASC
            """,
            (user_id, from_iso, to_iso),
        ).fetchall()
    finally:
        conn.close()

    by_day: dict[str, list[int]] = {}
    day_samples: dict[str, list[tuple[str, int]]] = {}
    for r in rows:
        ts = str(r["recorded_at"])
        bpm = int(r["bpm"])
        dt = _parse_iso(ts)
        if dt is None:
            continue
        day_key = dt.astimezone(timezone.utc).date().isoformat()
        by_day.setdefault(day_key, []).append(bpm)
        day_samples.setdefault(day_key, []).append((ts, bpm))

    out: list[dict[str, Any]] = []
    cur = d0
    while cur <= d1:
        key = cur.isoformat()
        bpms = by_day.get(key, [])
        if bpms:
            overnight = _overnight_samples(day_samples.get(key, []), key)
            resting = min(overnight) if overnight else _percentile(bpms, 0.05)
            out.append(
                {
                    "date": key,
                    "sample_count": len(bpms),
                    "avg_hr": int(round(sum(bpms) / len(bpms))),
                    "min_hr": min(bpms),
                    "max_hr": max(bpms),
                    "resting_hr": resting,
                }
            )
        else:
            out.append(
                {
                    "date": key,
                    "sample_count": 0,
                    "avg_hr": None,
                    "min_hr": None,
                    "max_hr": None,
                    "resting_hr": None,
                }
            )
        cur += timedelta(days=1)
    return out


def get_table_stats(user_id: int | None = None) -> dict[str, Any]:
    uid = user_id if user_id is not None else get_current_user_id()
    conn = get_db()
    try:
        if not _table_exists(conn, "passive_heart_rate_samples"):
            return {"total_samples": 0, "first_at": None, "last_at": None}
        row = conn.execute(
            """
            SELECT COUNT(*) AS cnt, MIN(recorded_at) AS first_at, MAX(recorded_at) AS last_at
            FROM passive_heart_rate_samples
            WHERE user_id = ?
            """,
            (uid,),
        ).fetchone()
        return {
            "total_samples": int(row["cnt"] or 0),
            "first_at": row["first_at"],
            "last_at": row["last_at"],
        }
    finally:
        conn.close()


def get_week_summary(user_id: int, cutoff_date: str) -> dict[str, Any]:
    """Aggregate stats since cutoff for hub/debug (SQL aggregates, без полного скана)."""
    conn = get_db()
    try:
        if not _table_exists(conn, "passive_heart_rate_samples"):
            return {"sample_count": 0, "min_hr": None, "max_hr": None, "resting_hr_estimate": None}
        from_iso = f"{str(cutoff_date)[:10]}T00:00:00.000Z"
        agg = conn.execute(
            """
            SELECT COUNT(*) AS cnt, MIN(bpm) AS min_hr, MAX(bpm) AS max_hr,
                   MIN(recorded_at) AS first_at, MAX(recorded_at) AS last_at
            FROM passive_heart_rate_samples
            WHERE user_id = ? AND recorded_at >= ?
            """,
            (user_id, from_iso),
        ).fetchone()
        if not agg or int(agg["cnt"] or 0) == 0:
            return {"sample_count": 0, "min_hr": None, "max_hr": None, "resting_hr_estimate": None}
        low_rows = conn.execute(
            """
            SELECT bpm FROM passive_heart_rate_samples
            WHERE user_id = ? AND recorded_at >= ?
            ORDER BY bpm ASC
            LIMIT 80
            """,
            (user_id, from_iso),
        ).fetchall()
    finally:
        conn.close()

    low_bpms = [int(r["bpm"]) for r in low_rows]
    resting = _percentile(low_bpms, 0.05) if low_bpms else None
    return {
        "sample_count": int(agg["cnt"]),
        "min_hr": int(agg["min_hr"]) if agg["min_hr"] is not None else None,
        "max_hr": int(agg["max_hr"]) if agg["max_hr"] is not None else None,
        "resting_hr_estimate": resting,
        "first_at": str(agg["first_at"]) if agg["first_at"] else None,
        "last_at": str(agg["last_at"]) if agg["last_at"] else None,
    }
