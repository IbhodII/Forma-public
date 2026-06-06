# -*- coding: utf-8 -*-
"""Idempotent import/merge for strength_hr_session_meta (unique: user_id, workout_date, workout_title)."""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Literal

from backend.services.db_import_merge_common import row_dict, sqlite_row_factory

logger = logging.getLogger(__name__)

MetaUpsertResult = Literal["inserted", "updated", "skipped", "conflict"]

_STATUS_RANK = {"verified": 3, "manual": 2, "auto": 1}


def _mapping_status_rank(status: str | None) -> int:
    return _STATUS_RANK.get(str(status or "auto").lower(), 0)


def hr_meta_richness(row: dict[str, Any]) -> tuple[int, int, int, str]:
    """Higher tuple = richer HR meta (prefer linked HR, verified, status, newer updated_at)."""
    return (
        1 if row.get("hr_workout_id") not in (None, "") else 0,
        1 if row.get("verified_at") not in (None, "") else 0,
        _mapping_status_rank(row.get("mapping_status")),
        str(row.get("updated_at") or ""),
    )


def pick_richer_meta(a: dict[str, Any], b: dict[str, Any]) -> dict[str, Any]:
    return a if hr_meta_richness(a) >= hr_meta_richness(b) else b


_row_from_sqlite = row_dict

_META_EXISTING_COLS = (
    "id",
    "user_id",
    "workout_date",
    "workout_title",
    "hr_workout_id",
    "mapping_status",
    "verified_at",
    "created_at",
    "updated_at",
)

_META_REMAP_COLS = _META_EXISTING_COLS[1:]


def _normalize_meta_row(raw: dict[str, Any], target_user_id: int) -> dict[str, Any]:
    return {
        "user_id": target_user_id,
        "workout_date": str(raw.get("workout_date") or "")[:10],
        "workout_title": str(raw.get("workout_title") or ""),
        "hr_workout_id": raw.get("hr_workout_id"),
        "mapping_status": str(raw.get("mapping_status") or "auto"),
        "verified_at": raw.get("verified_at"),
        "created_at": raw.get("created_at"),
        "updated_at": raw.get("updated_at"),
    }


def upsert_strength_hr_session_meta_row(
    conn: sqlite3.Connection,
    row: dict[str, Any],
) -> MetaUpsertResult:
    """Insert or update one meta row; never raises on unique conflict."""
    from backend.services.db_import_merge_common import fetch_existing_row

    uid = int(row["user_id"])
    wdate = str(row["workout_date"])[:10]
    title = str(row["workout_title"])
    row = {**row, "user_id": uid, "workout_date": wdate, "workout_title": title}
    select_sql = (
        "id, user_id, workout_date, workout_title, hr_workout_id, "
        "mapping_status, verified_at, created_at, updated_at"
    )
    existing, _match_keys = fetch_existing_row(
        conn,
        "main",
        "strength_hr_session_meta",
        row,
        select_sql,
        preferred_keys=("user_id", "workout_date", "workout_title"),
    )

    if existing is None:
        try:
            conn.execute(
                """
                INSERT INTO strength_hr_session_meta (
                    user_id, workout_date, workout_title, hr_workout_id,
                    mapping_status, verified_at, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    uid,
                    wdate,
                    title,
                    row.get("hr_workout_id"),
                    row.get("mapping_status") or "auto",
                    row.get("verified_at"),
                    row.get("created_at"),
                    row.get("updated_at"),
                ),
            )
            return "inserted"
        except sqlite3.IntegrityError:
            logger.warning(
                "strength_hr_session_meta race on insert user_id=%s date=%s title=%r",
                uid,
                wdate,
                title,
            )
            existing, _match_keys = fetch_existing_row(
                conn,
                "main",
                "strength_hr_session_meta",
                row,
                select_sql,
                preferred_keys=("user_id", "workout_date", "workout_title"),
            )
            if existing is None:
                return "conflict"

    existing_dict = row_dict(existing, list(_META_EXISTING_COLS))
    incoming = row
    if hr_meta_richness(incoming) <= hr_meta_richness(existing_dict):
        return "skipped"

    hr_wid = incoming.get("hr_workout_id")
    if hr_wid is None and existing_dict.get("hr_workout_id") is not None:
        hr_wid = existing_dict["hr_workout_id"]

    mapping_status = incoming.get("mapping_status") or existing_dict.get("mapping_status") or "auto"
    if _mapping_status_rank(str(mapping_status)) < _mapping_status_rank(
        str(existing_dict.get("mapping_status"))
    ):
        mapping_status = existing_dict.get("mapping_status")

    verified_at = incoming.get("verified_at")
    if verified_at is None:
        verified_at = existing_dict.get("verified_at")

    updated_at = incoming.get("updated_at") or existing_dict.get("updated_at")

    conn.execute(
        """
        UPDATE strength_hr_session_meta
        SET hr_workout_id = ?, mapping_status = ?, verified_at = ?,
            updated_at = COALESCE(?, updated_at)
        WHERE id = ?
        """,
        (hr_wid, mapping_status, verified_at, updated_at, int(existing_dict["id"])),
    )
    return "updated"


def dedupe_strength_hr_session_meta_sql(conn: sqlite3.Connection, *, user_id: int) -> int:
    """Fast SQL dedupe: keep max(id) per (workout_date, workout_title) for one user."""
    cur = conn.execute(
        """
        DELETE FROM strength_hr_session_meta
        WHERE user_id = ?
          AND id NOT IN (
            SELECT MAX(id)
            FROM strength_hr_session_meta
            WHERE user_id = ?
            GROUP BY workout_date, workout_title
          )
        """,
        (int(user_id), int(user_id)),
    )
    return int(cur.rowcount or 0)


def dedupe_strength_hr_session_meta(conn: sqlite3.Connection, *, user_id: int | None = None) -> int:
    """
    Remove duplicate meta rows (same user_id + workout_date + workout_title), keep richest.
    Returns number of deleted rows.
    """
    with sqlite_row_factory(conn):
        if user_id is not None:
            rows = conn.execute(
                """
                SELECT id, user_id, workout_date, workout_title, hr_workout_id,
                       mapping_status, verified_at, created_at, updated_at
                FROM strength_hr_session_meta
                WHERE user_id = ?
                """,
                (int(user_id),),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, user_id, workout_date, workout_title, hr_workout_id,
                       mapping_status, verified_at, created_at, updated_at
                FROM strength_hr_session_meta
                """
            ).fetchall()

    if not rows:
        return 0

    meta_cols = list(_META_EXISTING_COLS)
    best_by_key: dict[tuple[int, str, str], dict[str, Any]] = {}
    for row in rows:
        data = row_dict(row, meta_cols)
        key = (int(data["user_id"]), str(data["workout_date"]), str(data["workout_title"]))
        prev = best_by_key.get(key)
        best_by_key[key] = pick_richer_meta(data, prev) if prev else data

    keep_ids = {int(r["id"]) for r in best_by_key.values()}
    delete_ids = [
        int(row_dict(r, meta_cols)["id"])
        for r in rows
        if int(row_dict(r, meta_cols)["id"]) not in keep_ids
    ]
    if not delete_ids:
        return 0

    placeholders = ", ".join("?" * len(delete_ids))
    conn.execute(
        f"DELETE FROM strength_hr_session_meta WHERE id IN ({placeholders})",
        delete_ids,
    )
    return len(delete_ids)


def empty_meta_import_stats() -> dict[str, int]:
    return {
        "imported": 0,
        "updated": 0,
        "skipped_duplicates": 0,
        "conflicts": 0,
        "deduped_removed": 0,
    }


def merge_strength_hr_session_meta_from_staging(
    conn: sqlite3.Connection,
    *,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> dict[str, int]:
    """
    Idempotent merge from attached import DB into main.strength_hr_session_meta.
    Deduplicates source rows before upsert; logs summary counts.
    """
    stats = empty_meta_import_stats()
    table = "strength_hr_session_meta"

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
    needed = {"workout_date", "workout_title"}
    if not needed.issubset(imp_cols):
        return stats

    select_cols = [c for c in imp_cols if c in needed or c in (
        "hr_workout_id",
        "mapping_status",
        "verified_at",
        "created_at",
        "updated_at",
    )]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table}"
        ).fetchall()

    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_from_sqlite(raw, select_cols)
        if has_user:
            raw_dict["user_id"] = import_uid
        norm = _normalize_meta_row(raw_dict, int(target_user_id))
        key = (norm["workout_date"], norm["workout_title"])
        prev = by_key.get(key)
        by_key[key] = pick_richer_meta(norm, prev) if prev else norm

    for norm in by_key.values():
        result = upsert_strength_hr_session_meta_row(conn, norm)
        if result == "inserted":
            stats["imported"] += 1
        elif result == "updated":
            stats["updated"] += 1
        elif result == "skipped":
            stats["skipped_duplicates"] += 1
        else:
            stats["conflicts"] += 1

    stats["deduped_removed"] = dedupe_strength_hr_session_meta(
        conn, user_id=int(target_user_id)
    )

    logger.info(
        "strength_hr_session_meta merge user_id=%s imported=%s updated=%s "
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


def import_strength_hr_session_meta_rows(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    *,
    target_user_id: int,
    report_imported: dict[str, int],
    report_updated: dict[str, int],
    report_skipped: dict[str, int],
    report_errors: list[str],
) -> None:
    """JSON backup import path — idempotent per natural key."""
    table = "strength_hr_session_meta"
    by_key: dict[tuple[str, str], dict[str, Any]] = {}
    for raw in rows:
        norm = _normalize_meta_row(_remap_json_row(raw, target_user_id), target_user_id)
        key = (norm["workout_date"], norm["workout_title"])
        prev = by_key.get(key)
        by_key[key] = pick_richer_meta(norm, prev) if prev else norm

    for norm in by_key.values():
        try:
            result = upsert_strength_hr_session_meta_row(conn, norm)
            if result == "inserted":
                report_imported[table] = report_imported.get(table, 0) + 1
            elif result == "updated":
                report_updated[table] = report_updated.get(table, 0) + 1
            else:
                report_skipped[table] = report_skipped.get(table, 0) + 1
        except sqlite3.OperationalError as err:
            report_errors.append(f"{table}: {err}")

    dedupe_strength_hr_session_meta(conn, user_id=target_user_id)


def _remap_json_row(raw: dict[str, Any], target_user_id: int) -> dict[str, Any]:
    out = dict(raw)
    if "user_id" in out:
        out["user_id"] = target_user_id
    return out


def _apply_meta_upsert_stats(stats: dict[str, int], result: MetaUpsertResult) -> None:
    if result == "inserted":
        stats["imported"] += 1
    elif result == "updated":
        stats["updated"] += 1
    elif result == "skipped":
        stats["skipped_duplicates"] += 1
    else:
        stats["conflicts"] += 1


def remap_strength_hr_session_meta_user_ids(
    conn: sqlite3.Connection,
    *,
    target_user_id: int,
    source_user_ids: list[int],
) -> dict[str, int]:
    """Upsert rows from foreign user_ids into target, then delete source rows (no blind UPDATE)."""
    stats = empty_meta_import_stats()
    stats["deleted_source_rows"] = 0
    if not source_user_ids:
        return stats

    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                """
                SELECT user_id, workout_date, workout_title, hr_workout_id,
                       mapping_status, verified_at, created_at, updated_at
                FROM strength_hr_session_meta
                WHERE user_id = ?
                """,
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, list(_META_REMAP_COLS))
                norm = _normalize_meta_row(data, int(target_user_id))
                _apply_meta_upsert_stats(stats, upsert_strength_hr_session_meta_row(conn, norm))
            cur = conn.execute(
                "DELETE FROM strength_hr_session_meta WHERE user_id = ?",
                (int(wid),),
            )
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    stats["deduped_removed"] = dedupe_strength_hr_session_meta(
        conn, user_id=int(target_user_id)
    )
    if stats["conflicts"] > 0:
        logger.warning(
            "strength_hr_session_meta reassign conflicts=%s target=%s sources=%s",
            stats["conflicts"],
            target_user_id,
            source_user_ids,
        )
    logger.info(
        "strength_hr_session_meta reassign target=%s sources=%s imported=%s updated=%s "
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
