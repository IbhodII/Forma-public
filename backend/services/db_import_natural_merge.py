# -*- coding: utf-8 -*-
"""Registry of idempotent merge/remap handlers for natural-key tables during DB import."""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Callable

from backend.services.db_import_merge_common import (
    DedupeFn,
    ImportDedupeContext,
    dedupe_user_scoped_sql,
    fetch_existing_row,
    filter_existing_columns,
    key_params_from_row,
    row_dict,
    row_key_value,
    sqlite_row_factory,
    sql_where_for_keys,
    staging_select_columns,
    table_has_column,
)

logger = logging.getLogger(__name__)

StatsDict = dict[str, int]

_MERGE_FN = Callable[
    [sqlite3.Connection, int, int, str],
    StatsDict,
]
_REMAP_FN = Callable[[sqlite3.Connection, int, list[int]], StatsDict]
_DEDUPE_FN = DedupeFn


def empty_stats() -> StatsDict:
    return {
        "imported": 0,
        "updated": 0,
        "skipped_identical": 0,
        "merged": 0,
        "conflicts": 0,
        "deduped_removed": 0,
        "deleted_source_rows": 0,
    }


def _inc(stats: StatsDict, result: str) -> None:
    if result in stats:
        stats[result] += 1
    elif result == "skipped":
        stats["skipped_identical"] += 1
    else:
        stats["conflicts"] += 1


def log_table_merge(table: str, stats: StatsDict, *, context: str = "merge") -> None:
    logger.info(
        "%s %s imported=%s updated=%s skipped_identical=%s merged=%s "
        "conflicts=%s deduped_removed=%s deleted_source=%s",
        context,
        table,
        stats.get("imported", 0),
        stats.get("updated", 0),
        stats.get("skipped_identical", 0),
        stats.get("merged", 0),
        stats.get("conflicts", 0),
        stats.get("deduped_removed", 0),
        stats.get("deleted_source_rows", 0),
    )


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    return row is not None


def _pragma_columns(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


_row_dict = row_dict


# --- steps_history ---


def _upsert_steps_history_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    day = row_key_value(row, "date")
    incoming_steps = int(row.get("steps") or 0)
    incoming_sl = row.get("step_length_m")
    incoming_source = str(row.get("source") or "excel_archive")
    row = {**row, "user_id": uid, "date": day}

    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        "steps_history",
        row,
        ["steps", "step_length_m", "source"],
        preferred_keys=("user_id", "date"),
    )

    if existing is None:
        try:
            ins_cols = filter_existing_columns(
                conn,
                "main",
                "steps_history",
                ["user_id", "date", "steps", "step_length_m", "source", "updated_at"],
            )
            placeholders: list[str] = []
            vals: list[Any] = []
            for col in ins_cols:
                if col == "user_id":
                    vals.append(uid)
                elif col == "date":
                    vals.append(day)
                elif col == "steps":
                    vals.append(incoming_steps)
                elif col == "step_length_m":
                    vals.append(incoming_sl)
                elif col == "source":
                    vals.append(incoming_source)
                elif col == "updated_at":
                    placeholders.append("CURRENT_TIMESTAMP")
                    continue
                placeholders.append("?")
            conn.execute(
                f"INSERT INTO steps_history ({', '.join(ins_cols)}) "
                f"VALUES ({', '.join(placeholders)})",
                vals,
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                "steps_history",
                row,
                ["steps", "step_length_m", "source"],
                preferred_keys=("user_id", "date"),
            )
            if existing is None:
                return "conflicts"

    sh_fetch_cols = filter_existing_columns(
        conn, "main", "steps_history", ["steps", "step_length_m", "source"]
    )
    existing_sh = row_dict(existing, sh_fetch_cols or ["steps", "source"])
    ex_steps = int(existing_sh.get("steps") or 0)
    ex_sl = existing_sh.get("step_length_m")
    ex_source = str(existing_sh.get("source") or "")
    new_steps = max(ex_steps, incoming_steps)
    if incoming_steps > ex_steps:
        new_sl = incoming_sl if incoming_sl is not None else ex_sl
        new_source = incoming_source
    else:
        new_sl = ex_sl if ex_sl is not None else incoming_sl
        new_source = ex_source or incoming_source

    if (
        new_steps == ex_steps
        and new_sl == ex_sl
        and new_source == ex_source
    ):
        return "skipped_identical"

    upd_cols = ["steps = ?"]
    upd_vals: list[Any] = [new_steps]
    if table_has_column(conn, "main", "steps_history", "step_length_m"):
        upd_cols.append("step_length_m = ?")
        upd_vals.append(new_sl)
    if table_has_column(conn, "main", "steps_history", "source"):
        upd_cols.append("source = ?")
        upd_vals.append(new_source)
    if table_has_column(conn, "main", "steps_history", "user_id") and match_keys != ("user_id", "date"):
        upd_cols.append("user_id = ?")
        upd_vals.append(uid)
    if table_has_column(conn, "main", "steps_history", "updated_at"):
        upd_cols.append("updated_at = CURRENT_TIMESTAMP")
    lookup = match_keys or ("user_id", "date")
    upd_vals.extend(key_params_from_row(row, lookup))
    conn.execute(
        f"UPDATE steps_history SET {', '.join(upd_cols)} WHERE {sql_where_for_keys(lookup)}",
        upd_vals,
    )
    return "merged" if new_steps != ex_steps else "updated"


def _merge_steps_history_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "steps_history"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    if "date" not in imp_cols or "steps" not in imp_cols:
        return stats

    select_cols = [
        c
        for c in imp_cols
        if c in ("date", "steps", "step_length_m", "source", "updated_at")
    ]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    by_date: dict[str, dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_dict(raw, select_cols)
        day = str(raw_dict.get("date") or "")[:10]
        if not day:
            continue
        norm = {
            "user_id": target_user_id,
            "date": day,
            "steps": int(raw_dict.get("steps") or 0),
            "step_length_m": raw_dict.get("step_length_m"),
            "source": raw_dict.get("source") or "excel_archive",
        }
        prev = by_date.get(day)
        if prev is None or int(norm["steps"]) > int(prev["steps"]):
            by_date[day] = norm
        elif int(norm["steps"]) == int(prev["steps"]) and norm.get("step_length_m") and not prev.get(
            "step_length_m"
        ):
            by_date[day] = {**prev, "step_length_m": norm["step_length_m"]}

    for norm in by_date.values():
        _inc(stats, _upsert_steps_history_row(conn, norm))

    log_table_merge(table, stats, context="merge")
    return stats


def _remap_steps_history_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    if not source_user_ids or not _table_exists(conn, "main", "steps_history"):
        return stats

    _steps_remap_cols = ["user_id", "date", "steps", "step_length_m", "source"]
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                """
                SELECT user_id, date, steps, step_length_m, source
                FROM steps_history WHERE user_id = ?
                """,
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, _steps_remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_steps_history_row(conn, data))
            cur = conn.execute("DELETE FROM steps_history WHERE user_id = ?", (int(wid),))
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    log_table_merge("steps_history", stats, context="reassign")
    return stats


def dedupe_steps_history_sql(conn: sqlite3.Connection, ctx: ImportDedupeContext) -> int:
    return dedupe_user_scoped_sql(
        conn, "steps_history", ctx, key_cols=("user_id", "date")
    )


# --- body_metrics ---


def _upsert_body_metrics_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    measure_date = row_key_value(row, "date")
    skip_cols = frozenset({"id", "user_id", "date"})
    data_cols = [k for k in row if k not in skip_cols]
    row = {**row, "user_id": uid, "date": measure_date}

    bm_cols = _pragma_columns(conn, "main", "body_metrics")
    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        "body_metrics",
        row,
        bm_cols,
        preferred_keys=("user_id", "date"),
    )

    if existing is None:
        cols = ["user_id", "date"] + [c for c in data_cols if row.get(c) is not None]
        vals = [uid, measure_date] + [row[c] for c in cols[2:]]
        placeholders = ", ".join("?" * len(cols))
        try:
            conn.execute(
                f"INSERT INTO body_metrics ({', '.join(cols)}) VALUES ({placeholders})",
                vals,
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                "body_metrics",
                row,
                bm_cols,
                preferred_keys=("user_id", "date"),
            )
            if existing is None:
                return "conflicts"

    bm_cols = _pragma_columns(conn, "main", "body_metrics")
    existing_dict = row_dict(existing, bm_cols)
    merged: dict[str, Any] = {}
    changed = False
    for col in data_cols:
        inc = row.get(col)
        ex = existing_dict.get(col)
        if inc is None:
            merged[col] = ex
        elif ex is None:
            merged[col] = inc
            changed = True
        elif inc != ex:
            merged[col] = inc
            changed = True
        else:
            merged[col] = ex

    if not changed:
        return "skipped_identical"

    set_parts = [f"{c} = ?" for c in merged]
    params = list(merged.values())
    lookup = match_keys or ("user_id", "date")
    if table_has_column(conn, "main", "body_metrics", "user_id") and lookup != ("user_id", "date"):
        set_parts.append("user_id = ?")
        params.append(uid)
    params.extend(key_params_from_row(row, lookup))
    conn.execute(
        f"UPDATE body_metrics SET {', '.join(set_parts)} WHERE {sql_where_for_keys(lookup)}",
        params,
    )
    return "updated"


def _merge_body_metrics_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "body_metrics"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    live_cols = set(_pragma_columns(conn, "main", table))
    imp_cols = _pragma_columns(conn, import_schema, table)
    common = [c for c in staging_select_columns(imp_cols) if c in live_cols]
    if "date" not in common:
        return stats

    col_sql = ", ".join(common)
    has_user = "user_id" in common
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    by_date: dict[str, dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_dict(raw, common)
        day = str(raw_dict.get("date") or "")[:10]
        if not day:
            continue
        norm = {"user_id": target_user_id, "date": day}
        for c in common:
            if c in ("user_id",):
                continue
            norm[c] = raw_dict.get(c)
        by_date[day] = norm

    for norm in by_date.values():
        _inc(stats, _upsert_body_metrics_row(conn, norm))

    log_table_merge(table, stats, context="merge")
    return stats


def _remap_body_metrics_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    if not source_user_ids or not _table_exists(conn, "main", "body_metrics"):
        return stats

    bm_remap_cols = _pragma_columns(conn, "main", "body_metrics")
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                "SELECT * FROM body_metrics WHERE user_id = ?",
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, bm_remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_body_metrics_row(conn, data))
            cur = conn.execute("DELETE FROM body_metrics WHERE user_id = ?", (int(wid),))
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    log_table_merge("body_metrics", stats, context="reassign")
    return stats


def dedupe_body_metrics_sql(conn: sqlite3.Connection, ctx: ImportDedupeContext) -> int:
    return dedupe_user_scoped_sql(
        conn, "body_metrics", ctx, key_cols=("user_id", "date")
    )


# --- daily_bracelet_calories ---


def _upsert_daily_bracelet_calories_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    day = row_key_value(row, "date")
    incoming_cal = int(row.get("total_calories") or 0)
    incoming_source = str(row.get("source") or "manual")
    row = {**row, "user_id": uid, "date": day}

    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        "daily_bracelet_calories",
        row,
        ["total_calories", "source"],
        preferred_keys=("user_id", "date"),
    )

    if existing is None:
        try:
            ins_cols = filter_existing_columns(
                conn,
                "main",
                "daily_bracelet_calories",
                ["user_id", "date", "total_calories", "source", "updated_at"],
            )
            placeholders: list[str] = []
            vals: list[Any] = []
            for col in ins_cols:
                if col == "user_id":
                    vals.append(uid)
                elif col == "date":
                    vals.append(day)
                elif col == "total_calories":
                    vals.append(incoming_cal)
                elif col == "source":
                    vals.append(incoming_source)
                elif col == "updated_at":
                    placeholders.append("CURRENT_TIMESTAMP")
                    continue
                placeholders.append("?")
            conn.execute(
                f"INSERT INTO daily_bracelet_calories ({', '.join(ins_cols)}) "
                f"VALUES ({', '.join(placeholders)})",
                vals,
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                "daily_bracelet_calories",
                row,
                "total_calories, source",
                preferred_keys=("user_id", "date"),
            )
            if existing is None:
                return "conflicts"

    ex_cal = int(existing["total_calories"] or 0)
    ex_source = str(existing["source"] or "")
    new_cal = max(ex_cal, incoming_cal)
    new_source = incoming_source if incoming_cal > ex_cal else ex_source
    if new_cal == ex_cal and new_source == ex_source:
        return "skipped_identical"

    upd_cols = ["total_calories = ?", "source = ?"]
    upd_vals: list[Any] = [new_cal, new_source]
    lookup = match_keys or ("user_id", "date")
    if table_has_column(conn, "main", "daily_bracelet_calories", "user_id") and lookup != (
        "user_id",
        "date",
    ):
        upd_cols.append("user_id = ?")
        upd_vals.append(uid)
    if table_has_column(conn, "main", "daily_bracelet_calories", "updated_at"):
        upd_cols.append("updated_at = CURRENT_TIMESTAMP")
    upd_vals.extend(key_params_from_row(row, lookup))
    conn.execute(
        f"UPDATE daily_bracelet_calories SET {', '.join(upd_cols)} "
        f"WHERE {sql_where_for_keys(lookup)}",
        upd_vals,
    )
    return "merged" if new_cal != ex_cal else "updated"


def _merge_daily_bracelet_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "daily_bracelet_calories"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    if "date" not in imp_cols or "total_calories" not in imp_cols:
        return stats

    select_cols = [c for c in imp_cols if c in ("date", "total_calories", "source", "updated_at")]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    by_date: dict[str, dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_dict(raw, select_cols)
        day = str(raw_dict.get("date") or "")[:10]
        if not day:
            continue
        norm = {
            "user_id": target_user_id,
            "date": day,
            "total_calories": int(raw_dict.get("total_calories") or 0),
            "source": raw_dict.get("source") or "manual",
        }
        prev = by_date.get(day)
        if prev is None or norm["total_calories"] > prev["total_calories"]:
            by_date[day] = norm

    for norm in by_date.values():
        _inc(stats, _upsert_daily_bracelet_calories_row(conn, norm))

    log_table_merge(table, stats, context="merge")
    return stats


def _remap_daily_bracelet_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    if not source_user_ids or not _table_exists(conn, "main", "daily_bracelet_calories"):
        return stats

    _bracelet_remap_cols = ["user_id", "date", "total_calories", "source"]
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                "SELECT user_id, date, total_calories, source FROM daily_bracelet_calories WHERE user_id = ?",
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, _bracelet_remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_daily_bracelet_calories_row(conn, data))
            cur = conn.execute(
                "DELETE FROM daily_bracelet_calories WHERE user_id = ?",
                (int(wid),),
            )
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    log_table_merge("daily_bracelet_calories", stats, context="reassign")
    return stats


# --- passive_heart_rate_samples ---


def _upsert_passive_hr_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    recorded_at = str(row["recorded_at"])
    incoming_bpm = int(row.get("bpm") or 0)
    incoming_source = str(row.get("source") or "health_connect")
    row = {**row, "user_id": uid, "recorded_at": recorded_at}

    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        "passive_heart_rate_samples",
        row,
        ["bpm", "source"],
        preferred_keys=("user_id", "recorded_at"),
    )

    if existing is None:
        try:
            conn.execute(
                """
                INSERT INTO passive_heart_rate_samples (
                    user_id, recorded_at, bpm, source, created_at
                ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (uid, recorded_at, incoming_bpm, incoming_source),
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                "passive_heart_rate_samples",
                row,
                "bpm, source",
                preferred_keys=("user_id", "recorded_at"),
            )
            if existing is None:
                return "conflicts"

    ex_bpm = int(existing["bpm"] or 0)
    ex_source = str(existing["source"] or "")
    new_bpm = max(ex_bpm, incoming_bpm)
    new_source = incoming_source if incoming_bpm >= ex_bpm else ex_source
    if new_bpm == ex_bpm and new_source == ex_source:
        return "skipped_identical"

    lookup = match_keys or ("user_id", "recorded_at")
    upd_vals: list[Any] = [new_bpm, new_source]
    if table_has_column(conn, "main", "passive_heart_rate_samples", "user_id") and lookup != (
        "user_id",
        "recorded_at",
    ):
        conn.execute(
            f"""
            UPDATE passive_heart_rate_samples
            SET bpm = ?, source = ?, user_id = ?
            WHERE {sql_where_for_keys(lookup)}
            """,
            [new_bpm, new_source, uid, *key_params_from_row(row, lookup)],
        )
    else:
        conn.execute(
            f"""
            UPDATE passive_heart_rate_samples
            SET bpm = ?, source = ?
            WHERE {sql_where_for_keys(lookup)}
            """,
            [new_bpm, new_source, *key_params_from_row(row, lookup)],
        )
    return "merged" if new_bpm != ex_bpm else "updated"


def _merge_passive_hr_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "passive_heart_rate_samples"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    if "recorded_at" not in imp_cols or "bpm" not in imp_cols:
        return stats

    select_cols = [c for c in imp_cols if c in ("recorded_at", "bpm", "source", "created_at")]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    by_key: dict[str, dict[str, Any]] = {}
    for raw in src_rows:
        raw_dict = _row_dict(raw, select_cols)
        key = str(raw_dict.get("recorded_at") or "")
        if not key:
            continue
        norm = {
            "user_id": target_user_id,
            "recorded_at": key,
            "bpm": int(raw_dict.get("bpm") or 0),
            "source": raw_dict.get("source") or "health_connect",
        }
        prev = by_key.get(key)
        if prev is None or norm["bpm"] >= prev["bpm"]:
            by_key[key] = norm

    for norm in by_key.values():
        _inc(stats, _upsert_passive_hr_row(conn, norm))

    log_table_merge(table, stats, context="merge")
    return stats


def _remap_passive_hr_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    if not source_user_ids or not _table_exists(conn, "main", "passive_heart_rate_samples"):
        return stats

    _phr_remap_cols = ["user_id", "recorded_at", "bpm", "source"]
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                "SELECT user_id, recorded_at, bpm, source FROM passive_heart_rate_samples WHERE user_id = ?",
                (int(wid),),
            ).fetchall()
            for raw in rows:
                data = row_dict(raw, _phr_remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_passive_hr_row(conn, data))
            cur = conn.execute(
                "DELETE FROM passive_heart_rate_samples WHERE user_id = ?",
                (int(wid),),
            )
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    log_table_merge("passive_heart_rate_samples", stats, context="reassign")
    return stats


# --- sleep_data ---


def _upsert_sleep_data_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    external_id = row.get("external_id")
    if external_id is not None and str(external_id).strip():
        return _upsert_sleep_by_external_id(conn, row)
    return _upsert_sleep_by_session_key(conn, row)


def _upsert_sleep_by_external_id(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    external_id = str(row["external_id"]).strip()
    row = {**row, "user_id": uid, "external_id": external_id}
    cols = [
        "user_id",
        "date",
        "start_time",
        "end_time",
        "duration_seconds",
        "light_seconds",
        "deep_seconds",
        "rem_seconds",
        "source",
        "external_id",
    ]
    values = [row.get(c) for c in cols]
    values[0] = uid

    has_id = table_has_column(conn, "main", "sleep_data", "id")
    sleep_select = ["id"] if has_id else []
    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        "sleep_data",
        row,
        sleep_select,
        preferred_keys=("user_id", "external_id"),
    )

    if existing is None:
        try:
            placeholders = ", ".join("?" * len(cols))
            conn.execute(
                f"INSERT INTO sleep_data ({', '.join(cols)}) VALUES ({placeholders})",
                values,
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                "sleep_data",
                row,
                sleep_select,
                preferred_keys=("user_id", "external_id"),
            )
            if existing is None:
                return "conflicts"

    set_cols = [c for c in cols if c not in ("user_id", "external_id")]
    set_sql = ", ".join(f"{c} = ?" for c in set_cols)
    if has_id:
        conn.execute(
            f"UPDATE sleep_data SET {set_sql} WHERE id = ?",
            [row.get(c) for c in set_cols] + [int(existing["id"])],
        )
    else:
        conn.execute(
            f"UPDATE sleep_data SET {set_sql} WHERE user_id = ? AND external_id = ?",
            [row.get(c) for c in set_cols] + [uid, external_id],
        )
    return "updated"


def _upsert_sleep_by_session_key(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    day = str(row.get("date") or "")[:10]
    start_time = str(row.get("start_time") or "")
    end_time = str(row.get("end_time") or "")
    if not day or not start_time or not end_time:
        return "conflicts"

    with sqlite_row_factory(conn):
        existing = conn.execute(
            """
            SELECT 1 FROM sleep_data
            WHERE user_id = ? AND date = ? AND start_time = ? AND end_time = ?
            """,
            (uid, day, start_time, end_time),
        ).fetchone()

    if existing is not None:
        return "skipped_identical"

    cols = [
        "user_id",
        "date",
        "start_time",
        "end_time",
        "duration_seconds",
        "light_seconds",
        "deep_seconds",
        "rem_seconds",
        "source",
        "external_id",
    ]
    try:
        conn.execute(
            f"INSERT INTO sleep_data ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
            [row.get(c) if c != "user_id" else uid for c in cols],
        )
        return "imported"
    except sqlite3.IntegrityError:
        return "conflicts"


def _merge_sleep_data_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "sleep_data"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    needed = {"date", "start_time", "end_time"}
    if not needed.issubset(imp_cols):
        return stats

    select_cols = [
        c
        for c in imp_cols
        if c
        in (
            "date",
            "start_time",
            "end_time",
            "duration_seconds",
            "light_seconds",
            "deep_seconds",
            "rem_seconds",
            "source",
            "external_id",
        )
    ]
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    for raw in src_rows:
        raw_dict = _row_dict(raw, select_cols)
        norm = {"user_id": target_user_id, **raw_dict}
        _inc(stats, _upsert_sleep_data_row(conn, norm))

    log_table_merge(table, stats, context="merge")
    return stats


def _remap_sleep_data_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    if not source_user_ids or not _table_exists(conn, "main", "sleep_data"):
        return stats

    sleep_remap_cols = _pragma_columns(conn, "main", "sleep_data")
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute("SELECT * FROM sleep_data WHERE user_id = ?", (int(wid),)).fetchall()
            for raw in rows:
                data = row_dict(raw, sleep_remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_sleep_data_row(conn, data))
            cur = conn.execute("DELETE FROM sleep_data WHERE user_id = ?", (int(wid),))
            stats["deleted_source_rows"] += int(cur.rowcount or 0)

    log_table_merge("sleep_data", stats, context="reassign")
    return stats


# --- HR adapters ---


def _hr_meta_merge(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    from backend.services.strength_hr_session_meta_import import (
        merge_strength_hr_session_meta_from_staging,
    )

    raw = merge_strength_hr_session_meta_from_staging(
        conn,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
    )
    stats = empty_stats()
    stats["imported"] = raw.get("imported", 0)
    stats["updated"] = raw.get("updated", 0)
    stats["skipped_identical"] = raw.get("skipped_duplicates", 0)
    stats["deduped_removed"] = raw.get("deduped_removed", 0)
    stats["conflicts"] = raw.get("conflicts", 0)
    return stats


def _hr_meta_remap(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    from backend.services.strength_hr_session_meta_import import (
        remap_strength_hr_session_meta_user_ids,
    )

    raw = remap_strength_hr_session_meta_user_ids(
        conn, target_user_id=target_user_id, source_user_ids=source_user_ids
    )
    stats = empty_stats()
    for k, v in raw.items():
        if k in stats:
            stats[k] = v
        elif k == "skipped_duplicates":
            stats["skipped_identical"] = v
    return stats


def _hr_blocks_merge(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    from backend.services.strength_hr_block_mappings_import import (
        merge_strength_hr_block_mappings_from_staging,
    )

    raw = merge_strength_hr_block_mappings_from_staging(
        conn,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
    )
    stats = empty_stats()
    stats["imported"] = raw.get("imported", 0)
    stats["updated"] = raw.get("updated", 0)
    stats["skipped_identical"] = raw.get("skipped_duplicates", 0)
    stats["deduped_removed"] = raw.get("deduped_removed", 0)
    stats["conflicts"] = raw.get("conflicts", 0)
    return stats


def _hr_blocks_remap(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    from backend.services.strength_hr_block_mappings_import import (
        remap_strength_hr_block_mappings_user_ids,
    )

    raw = remap_strength_hr_block_mappings_user_ids(
        conn, target_user_id=target_user_id, source_user_ids=source_user_ids
    )
    stats = empty_stats()
    for k, v in raw.items():
        if k in stats:
            stats[k] = v
        elif k == "skipped_duplicates":
            stats["skipped_identical"] = v
    return stats


def _hr_meta_dedupe(conn: sqlite3.Connection, ctx: ImportDedupeContext) -> int:
    from backend.services.strength_hr_session_meta_import import (
        dedupe_strength_hr_session_meta,
        dedupe_strength_hr_session_meta_sql,
    )

    user_id = int(ctx.user_id)
    row = conn.execute(
        "SELECT COUNT(*) FROM strength_hr_session_meta WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    count = int(row[0]) if row else 0
    if count <= 0:
        return 0
    if count <= ctx.row_limit:
        return dedupe_strength_hr_session_meta(conn, user_id=user_id)
    return dedupe_strength_hr_session_meta_sql(conn, user_id=user_id)


def _hr_blocks_dedupe(conn: sqlite3.Connection, ctx: ImportDedupeContext) -> int:
    from backend.services.strength_hr_block_mappings_import import (
        dedupe_strength_hr_block_mappings,
        dedupe_strength_hr_block_mappings_sql,
    )

    user_id = int(ctx.user_id)
    row = conn.execute(
        "SELECT COUNT(*) FROM strength_hr_block_mappings WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    count = int(row[0]) if row else 0
    if count <= 0:
        return 0
    if count <= ctx.row_limit:
        return dedupe_strength_hr_block_mappings(conn, user_id=user_id)
    return dedupe_strength_hr_block_mappings_sql(conn, user_id=user_id)


# Registry: table -> (merge, remap, optional dedupe)

NATURAL_KEY_HANDLERS: dict[str, tuple[_MERGE_FN, _REMAP_FN, _DEDUPE_FN | None]] = {
    "steps_history": (
        _merge_steps_history_from_staging,
        _remap_steps_history_user_ids,
        dedupe_steps_history_sql,
    ),
    "body_metrics": (
        _merge_body_metrics_from_staging,
        _remap_body_metrics_user_ids,
        dedupe_body_metrics_sql,
    ),
    "daily_bracelet_calories": (
        _merge_daily_bracelet_from_staging,
        _remap_daily_bracelet_user_ids,
        None,
    ),
    "passive_heart_rate_samples": (
        _merge_passive_hr_from_staging,
        _remap_passive_hr_user_ids,
        None,
    ),
    "sleep_data": (
        _merge_sleep_data_from_staging,
        _remap_sleep_data_user_ids,
        None,
    ),
    "strength_hr_session_meta": (
        _hr_meta_merge,
        _hr_meta_remap,
        _hr_meta_dedupe,
    ),
    "strength_hr_block_mappings": (
        _hr_blocks_merge,
        _hr_blocks_remap,
        _hr_blocks_dedupe,
    ),
}

CATALOG_MERGE_HANDLERS: dict[str, Any] = {}
CLOUD_AUTH_HANDLERS: dict[str, Any] = {}
ROW_UPSERT_FNS: dict[str, Callable[..., str]] = {}


def _register_extended_handlers() -> None:
    from backend.services.db_import_conflict_handlers import (
        CATALOG_MERGE_HANDLERS,
        CLOUD_AUTH_HANDLERS,
        EXTRA_NATURAL_KEY_HANDLERS,
        ROW_UPSERT_FNS,
    )

    NATURAL_KEY_HANDLERS.update(EXTRA_NATURAL_KEY_HANDLERS)
    globals().update(
        {
            "CATALOG_MERGE_HANDLERS": CATALOG_MERGE_HANDLERS,
            "CLOUD_AUTH_HANDLERS": CLOUD_AUTH_HANDLERS,
            "ROW_UPSERT_FNS": ROW_UPSERT_FNS,
        }
    )


_register_extended_handlers()


def is_natural_key_table(table: str) -> bool:
    return table in NATURAL_KEY_HANDLERS


def is_catalog_merge_table(table: str) -> bool:
    return table in CATALOG_MERGE_HANDLERS


def is_cloud_auth_table(table: str) -> bool:
    return table in CLOUD_AUTH_HANDLERS


def has_user_scoped_handler(table: str) -> bool:
    if table in NATURAL_KEY_HANDLERS:
        return True
    from backend.services.db_import_unique_inventory import RECONCILE_HANDLED_TABLES

    return table in RECONCILE_HANDLED_TABLES


def is_safe_generic_import(
    table: str,
    schema: str = "main",
    *,
    conn: sqlite3.Connection | None = None,
) -> bool:
    """True only when blind INSERT OR REPLACE / UPDATE user_id is allowed."""
    if is_cloud_auth_table(table) or is_natural_key_table(table):
        return False
    if schema == "shared":
        return table not in CATALOG_MERGE_HANDLERS
    from backend.services.db_import_unique_inventory import (
        RECONCILE_HANDLED_TABLES,
        list_user_scoped_tables_in_schema,
        scan_unique_constraints,
    )

    if table in RECONCILE_HANDLED_TABLES:
        return False

    if conn is not None:
        constraints = scan_unique_constraints(conn, schemas=(schema,))
        user_scoped = list_user_scoped_tables_in_schema(constraints, schema=schema)
        if table in user_scoped:
            return False
    return True


def assert_safe_user_id_reassign(
    conn: sqlite3.Connection,
    table: str,
    *,
    schema: str = "main",
) -> None:
    """Refuse blind UPDATE user_id for tables with user-scoped UNIQUE/PK."""
    from backend.services.db_import_unique_inventory import (
        list_user_scoped_tables_in_schema,
        scan_unique_constraints,
    )

    if is_natural_key_table(table) or is_cloud_auth_table(table):
        return
    constraints = scan_unique_constraints(conn, schemas=(schema,))
    user_scoped = list_user_scoped_tables_in_schema(constraints, schema=schema)
    if table in user_scoped and not has_user_scoped_handler(table):
        raise RuntimeError(
            f"Reassign blocked for {table}: user-scoped UNIQUE requires merge handler"
        )


def merge_catalog_from_staging(
    conn: sqlite3.Connection,
    table: str,
    *,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_shared",
) -> StatsDict | None:
    fn = CATALOG_MERGE_HANDLERS.get(table)
    if fn is None:
        return None
    return fn(conn, target_user_id, import_uid, import_schema)


def assert_safe_main_table_import(table: str) -> None:
    """Defense in depth: refuse generic import for protected tables."""
    if not is_safe_generic_import(table, "main"):
        raise RuntimeError(
            f"Import blocked for {table}: user-scoped UNIQUE requires merge handler"
        )


def merge_table_from_staging(
    conn: sqlite3.Connection,
    table: str,
    *,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict | None:
    handlers = NATURAL_KEY_HANDLERS.get(table)
    if handlers is None:
        return None
    return handlers[0](conn, target_user_id, import_uid, import_schema)


def remap_table_user_ids(
    conn: sqlite3.Connection,
    table: str,
    *,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict | None:
    handlers = NATURAL_KEY_HANDLERS.get(table)
    if handlers is None:
        return None
    return handlers[1](conn, target_user_id, source_user_ids)


def copy_natural_key_rows_from_attached(
    conn: sqlite3.Connection,
    table: str,
    *,
    src_schema: str,
    dest_schema: str,
    where_sql: str,
    params: tuple[Any, ...],
    target_user_id: int,
) -> int:
    """Row-wise upsert from attached DB (mini-database import); returns rows touched."""
    if table not in NATURAL_KEY_HANDLERS or not _table_exists(conn, dest_schema, table):
        return 0
    if not _table_exists(conn, src_schema, table):
        return 0

    src_qual = f"{src_schema}.{table}"
    imp_cols = _pragma_columns(conn, src_schema, table)
    select_cols = staging_select_columns(imp_cols)
    if not select_cols:
        return 0
    col_sql = ", ".join(select_cols)
    src_rows = conn.execute(
        f"SELECT {col_sql} FROM {src_qual} WHERE {where_sql}",
        params,
    ).fetchall()

    touched = 0
    for raw in src_rows:
        data = _row_dict(raw, select_cols)
        if "user_id" in data:
            data["user_id"] = target_user_id
        else:
            data["user_id"] = target_user_id
        upsert_fn = ROW_UPSERT_FNS.get(table)
        if table == "steps_history":
            result = _upsert_steps_history_row(conn, data)
        elif table == "body_metrics":
            result = _upsert_body_metrics_row(conn, data)
        elif table == "daily_bracelet_calories":
            result = _upsert_daily_bracelet_calories_row(conn, data)
        elif table == "passive_heart_rate_samples":
            result = _upsert_passive_hr_row(conn, data)
        elif table == "sleep_data":
            result = _upsert_sleep_data_row(conn, data)
        elif upsert_fn is not None:
            result = upsert_fn(conn, data)
        else:
            continue
        if result not in ("skipped_identical", "conflicts"):
            touched += 1
    return touched


def import_steps_history_json_rows(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    *,
    target_user_id: int,
    report_imported: dict[str, int],
    report_updated: dict[str, int],
    report_skipped: dict[str, int],
    report_errors: list[str],
) -> None:
    """JSON backup import path for steps_history."""
    table = "steps_history"
    by_date: dict[str, dict[str, Any]] = {}
    for raw in rows:
        day = str(raw.get("date") or "")[:10]
        if not day:
            continue
        norm = {
            "user_id": target_user_id,
            "date": day,
            "steps": int(raw.get("steps") or 0),
            "step_length_m": raw.get("step_length_m"),
            "source": raw.get("source") or "excel_archive",
        }
        prev = by_date.get(day)
        if prev is None or int(norm["steps"]) > int(prev["steps"]):
            by_date[day] = norm

    for norm in by_date.values():
        try:
            result = _upsert_steps_history_row(conn, norm)
            if result == "imported":
                report_imported[table] = report_imported.get(table, 0) + 1
            elif result in ("updated", "merged"):
                report_updated[table] = report_updated.get(table, 0) + 1
            else:
                report_skipped[table] = report_skipped.get(table, 0) + 1
        except sqlite3.OperationalError as err:
            report_errors.append(f"{table}: {err}")


def post_import_dedupe_table(
    conn: sqlite3.Connection,
    table: str,
    *,
    user_id: int,
    row_limit: int = 20_000,
) -> int:
    handlers = NATURAL_KEY_HANDLERS.get(table)
    if handlers is None or handlers[2] is None:
        return 0
    if not _table_exists(conn, "main", table):
        return 0
    row = conn.execute(
        f"SELECT COUNT(*) FROM {table} WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    count = int(row[0]) if row else 0
    if count <= 0:
        return 0
    ctx = ImportDedupeContext(user_id=int(user_id), row_limit=int(row_limit))
    return handlers[2](conn, ctx)
