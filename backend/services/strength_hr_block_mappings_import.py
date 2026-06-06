# -*- coding: utf-8 -*-
"""Idempotent import/merge for strength_hr_block_mappings (unique: user_id, date, title, block_index)."""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Literal

from backend.services.db_import_merge_common import row_dict, sqlite_row_factory

logger = logging.getLogger(__name__)

BlockUpsertResult = Literal["inserted", "updated", "skipped", "conflict"]

_BLOCK_SELECT_COLS = (
    "workout_date",
    "workout_title",
    "block_index",
    "start_sec",
    "end_sec",
    "kind",
    "assigned_order_index",
    "exercise",
    "set_number",
    "verified",
    "confidence",
    "label",
    "notes",
    "source_auto_block_index",
    "original_start_sec",
    "original_end_sec",
    "created_at",
    "updated_at",
)


_row_from_sqlite = row_dict

_BLOCK_EXISTING_COLS = (
    "id",
    "user_id",
    "workout_date",
    "workout_title",
    "block_index",
    "start_sec",
    "end_sec",
    "kind",
    "assigned_order_index",
    "exercise",
    "set_number",
    "verified",
    "confidence",
    "label",
    "notes",
    "source_auto_block_index",
    "original_start_sec",
    "original_end_sec",
    "created_at",
    "updated_at",
)

_BLOCK_REMAP_COLS = ("user_id",) + _BLOCK_EXISTING_COLS[1:]


def block_mapping_richness(row: dict[str, Any]) -> tuple[int, int, str]:
    """Higher = richer (verified, has confidence, newer updated_at)."""
    return (
        int(row.get("verified") or 0),
        1 if row.get("confidence") not in (None, "") else 0,
        str(row.get("updated_at") or ""),
    )


def pick_richer_block_mapping(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    return a if block_mapping_richness(a) >= block_mapping_richness(b) else b


def _normalize_block_row(raw: dict[str, Any], target_user_id: int) -> dict[str, Any]:
    return {
        "user_id": target_user_id,
        "workout_date": str(raw.get("workout_date") or "")[:10],
        "workout_title": str(raw.get("workout_title") or ""),
        "block_index": int(raw.get("block_index") or 0),
        "start_sec": int(raw.get("start_sec") or 0),
        "end_sec": int(raw.get("end_sec") or 0),
        "kind": str(raw.get("kind") or "set"),
        "assigned_order_index": raw.get("assigned_order_index"),
        "exercise": raw.get("exercise"),
        "set_number": raw.get("set_number"),
        "verified": int(raw.get("verified") or 0),
        "confidence": raw.get("confidence"),
        "label": raw.get("label"),
        "notes": raw.get("notes"),
        "source_auto_block_index": raw.get("source_auto_block_index"),
        "original_start_sec": raw.get("original_start_sec"),
        "original_end_sec": raw.get("original_end_sec"),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
    }


def upsert_strength_hr_block_mapping_row(
    conn: sqlite3.Connection,
    row: dict[str, Any],
) -> BlockUpsertResult:
    """Insert or update one block mapping; never raises on unique conflict."""
    from backend.services.db_import_merge_common import fetch_existing_row

    uid = int(row["user_id"])
    wdate = str(row["workout_date"])[:10]
    title = str(row["workout_title"])
    block_index = int(row["block_index"])
    row = {
        **row,
        "user_id": uid,
        "workout_date": wdate,
        "workout_title": title,
        "block_index": block_index,
    }
    select_sql = (
        "id, user_id, workout_date, workout_title, block_index, "
        "start_sec, end_sec, kind, assigned_order_index, exercise, set_number, "
        "verified, confidence, label, notes, source_auto_block_index, "
        "original_start_sec, original_end_sec, created_at, updated_at"
    )
    existing, _match_keys = fetch_existing_row(
        conn,
        "main",
        "strength_hr_block_mappings",
        row,
        select_sql,
        preferred_keys=("user_id", "workout_date", "workout_title", "block_index"),
    )

    if existing is None:
        try:
            conn.execute(
                """
                INSERT INTO strength_hr_block_mappings (
                    user_id, workout_date, workout_title, block_index,
                    start_sec, end_sec, kind, assigned_order_index, exercise, set_number,
                    verified, confidence, label, notes, source_auto_block_index,
                    original_start_sec, original_end_sec, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uid,
                    wdate,
                    title,
                    block_index,
                    row["start_sec"],
                    row["end_sec"],
                    row["kind"],
                    row.get("assigned_order_index"),
                    row.get("exercise"),
                    row.get("set_number"),
                    row.get("verified", 0),
                    row.get("confidence"),
                    row.get("label"),
                    row.get("notes"),
                    row.get("source_auto_block_index"),
                    row.get("original_start_sec"),
                    row.get("original_end_sec"),
                    row.get("created_at"),
                    row.get("updated_at"),
                ),
            )
            return "inserted"
        except sqlite3.IntegrityError:
            logger.warning(
                "strength_hr_block_mappings race on insert user_id=%s date=%s title=%r block=%s",
                uid,
                wdate,
                title,
                block_index,
            )
            existing, _match_keys = fetch_existing_row(
                conn,
                "main",
                "strength_hr_block_mappings",
                row,
                select_sql,
                preferred_keys=("user_id", "workout_date", "workout_title", "block_index"),
            )
            if existing is None:
                return "conflict"

    existing_dict = row_dict(existing, list(_BLOCK_EXISTING_COLS))
    if block_mapping_richness(row) <= block_mapping_richness(existing_dict):
        return "skipped"

    conn.execute(
        """
        UPDATE strength_hr_block_mappings
        SET start_sec = ?, end_sec = ?, kind = ?, assigned_order_index = ?,
            exercise = ?, set_number = ?, verified = ?, confidence = ?,
            label = ?, notes = ?, source_auto_block_index = ?,
            original_start_sec = ?, original_end_sec = ?,
            updated_at = COALESCE(?, updated_at)
        WHERE id = ?
        """,
        (
            row["start_sec"],
            row["end_sec"],
            row["kind"],
            row.get("assigned_order_index"),
            row.get("exercise"),
            row.get("set_number"),
            row.get("verified", 0),
            row.get("confidence"),
            row.get("label"),
            row.get("notes"),
            row.get("source_auto_block_index"),
            row.get("original_start_sec"),
            row.get("original_end_sec"),
            row.get("updated_at") or existing_dict.get("updated_at"),
            int(existing_dict["id"]),
        ),
    )
    return "updated"


def dedupe_strength_hr_block_mappings_sql(conn: sqlite3.Connection, *, user_id: int) -> int:
    """Fast SQL dedupe: keep max(id) per (workout_date, workout_title, block_index)."""
    cur = conn.execute(
        """
        DELETE FROM strength_hr_block_mappings
        WHERE user_id = ?
          AND id NOT IN (
            SELECT MAX(id)
            FROM strength_hr_block_mappings
            WHERE user_id = ?
            GROUP BY workout_date, workout_title, block_index
          )
        """,
        (int(user_id), int(user_id)),
    )
    return int(cur.rowcount or 0)


def dedupe_strength_hr_block_mappings(
    conn: sqlite3.Connection,
    *,
    user_id: int | None = None,
) -> int:
    """Remove duplicate block rows; keep richest per natural key."""
    with sqlite_row_factory(conn):
        if user_id is not None:
            rows = conn.execute(
                """
                SELECT id, user_id, workout_date, workout_title, block_index,
                       start_sec, end_sec, kind, assigned_order_index, exercise, set_number,
                       verified, confidence, label, notes, source_auto_block_index,
                       original_start_sec, original_end_sec, created_at, updated_at
                FROM strength_hr_block_mappings
                WHERE user_id = ?
                """,
                (int(user_id),),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, user_id, workout_date, workout_title, block_index,
                       start_sec, end_sec, kind, assigned_order_index, exercise, set_number,
                       verified, confidence, label, notes, source_auto_block_index,
                       original_start_sec, original_end_sec, created_at, updated_at
                FROM strength_hr_block_mappings
                """
            ).fetchall()

    if not rows:
        return 0

    best_by_key: dict[tuple[int, str, str, int], dict[str, Any]] = {}
    for row in rows:
        data = row_dict(row, list(_BLOCK_EXISTING_COLS))
        key = (
            int(data["user_id"]),
            str(data["workout_date"]),
            str(data["workout_title"]),
            int(data["block_index"]),
        )
        prev = best_by_key.get(key)
        best_by_key[key] = pick_richer_block_mapping(data, prev) if prev else data

    keep_ids = {int(r["id"]) for r in best_by_key.values()}
    delete_ids = [int(r["id"]) for r in rows if int(r["id"]) not in keep_ids]
    if not delete_ids:
        return 0

    placeholders = ", ".join("?" * len(delete_ids))
    conn.execute(
        f"DELETE FROM strength_hr_block_mappings WHERE id IN ({placeholders})",
        delete_ids,
    )
    return len(delete_ids)


def empty_block_import_stats() -> dict[str, int]:
    return {
        "imported": 0,
        "updated": 0,
        "skipped_duplicates": 0,
        "conflicts": 0,
        "deduped_removed": 0,
    }


def _apply_upsert_stats(stats: dict[str, int], result: BlockUpsertResult) -> None:
    if result == "inserted":
        stats["imported"] += 1
    elif result == "updated":
        stats["updated"] += 1
    elif result == "skipped":
        stats["skipped_duplicates"] += 1
    else:
        stats["conflicts"] += 1


def remap_strength_hr_block_mappings_user_ids(
    conn: sqlite3.Connection,
    *,
    target_user_id: int,
    source_user_ids: list[int],
) -> dict[str, int]:
    """Upsert rows from foreign user_ids into target, then delete source rows."""
    stats = empty_block_import_stats()
    stats["deleted_source_rows"] = 0
    if not source_user_ids:
        return stats

    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                """
                SELECT user_id, workout_date, workout_title, block_index,
                       start_sec, end_sec, kind, assigned_order_index, exercise, set_number,
                       verified, confidence, label, notes, source_auto_block_index,
                       original_start_sec, original_end_sec, created_at, updated_at
                FROM strength_hr_block_mappings
                WHERE user_id = ?
                """,
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, list(_BLOCK_REMAP_COLS))
                norm = _normalize_block_row(data, int(target_user_id))
                _apply_upsert_stats(stats, upsert_strength_hr_block_mapping_row(conn, norm))
            cur = conn.execute(
                "DELETE FROM strength_hr_block_mappings WHERE user_id = ?",
                (int(wid),),
            )
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    stats["deduped_removed"] = dedupe_strength_hr_block_mappings(
        conn, user_id=int(target_user_id)
    )
    logger.info(
        "strength_hr_block_mappings reassign target=%s sources=%s imported=%s updated=%s "
        "skipped=%s deleted_source=%s deduped_removed=%s",
        target_user_id,
        source_user_ids,
        stats["imported"],
        stats["updated"],
        stats["skipped_duplicates"],
        stats["deleted_source_rows"],
        stats["deduped_removed"],
    )
    return stats


def merge_strength_hr_block_mappings_from_staging(
    conn: sqlite3.Connection,
    *,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> dict[str, int]:
    """Idempotent merge from attached import DB into main.strength_hr_block_mappings."""
    stats = empty_block_import_stats()
    table = "strength_hr_block_mappings"

    def _exists(schema: str) -> bool:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
        return row is not None

    if not _exists("main") or not _exists(import_schema):
        return stats

    imp_cols = [
        r[1]
        for r in conn.execute(f"PRAGMA {import_schema}.table_info({table})").fetchall()
    ]
    needed = {"workout_date", "workout_title", "block_index"}
    if not needed.issubset(imp_cols):
        return stats

    select_cols = [c for c in imp_cols if c in _BLOCK_SELECT_COLS or c in needed]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    by_key: dict[tuple[str, str, int], dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_from_sqlite(raw, select_cols)
        if has_user:
            raw_dict["user_id"] = import_uid
        norm = _normalize_block_row(raw_dict, int(target_user_id))
        key = (norm["workout_date"], norm["workout_title"], norm["block_index"])
        prev = by_key.get(key)
        by_key[key] = pick_richer_block_mapping(norm, prev) if prev else norm

    for norm in by_key.values():
        _apply_upsert_stats(stats, upsert_strength_hr_block_mapping_row(conn, norm))

    stats["deduped_removed"] = dedupe_strength_hr_block_mappings(
        conn, user_id=int(target_user_id)
    )

    logger.info(
        "strength_hr_block_mappings merge user_id=%s imported=%s updated=%s "
        "skipped_duplicates=%s conflicts=%s deduped_removed=%s source_rows=%s unique_keys=%s",
        target_user_id,
        stats["imported"],
        stats["updated"],
        stats["skipped_duplicates"],
        stats["conflicts"],
        stats["deduped_removed"],
        len(src_rows),
        len(by_key),
    )
    return stats
