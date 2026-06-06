# -*- coding: utf-8 -*-
"""Additional natural-key / catalog / cloud-auth handlers for DB import."""
from __future__ import annotations

import logging
import sqlite3
from typing import Any, Callable

from backend.services.db_import_merge_common import (
    StatsDict,
    empty_stats,
    fetch_existing_row,
    filter_existing_columns,
    inc_stats,
    incoming_newer,
    key_params_from_row,
    log_table_merge,
    prefer_staging_row,
    pragma_columns,
    resolve_timestamp_column,
    row_dict,
    row_key_value,
    rows_payload_equal,
    sqlite_row_factory,
    sql_where_for_keys,
    staging_select_columns,
    table_exists,
    table_has_column,
)
from backend.services.db_import_merge_registry import get_table_merge_spec

_inc = inc_stats
_pragma_columns = pragma_columns
_row_dict = row_dict
_table_exists = table_exists

logger = logging.getLogger(__name__)

_MERGE_FN = Callable[[sqlite3.Connection, int, int, str], StatsDict]
_REMAP_FN = Callable[[sqlite3.Connection, int, list[int]], StatsDict]


_incoming_newer = incoming_newer


# --- cardio_type_settings ---


def _upsert_cardio_type_settings_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    table = "cardio_type_settings"
    uid = int(row["user_id"])
    ctype = str(row["type"])
    inc_active = int(row.get("is_active") if row.get("is_active") is not None else 1)
    inc_order = int(row.get("sort_order") or 0)
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(
        conn, "main", table, spec.timestamp_candidates
    )
    inc_ts = row.get(ts_col) if ts_col else None

    select_cols = filter_existing_columns(
        conn, "main", table, ["is_active", "sort_order", "updated_at"]
    )
    with sqlite_row_factory(conn):
        existing = conn.execute(
            f"""
            SELECT {", ".join(select_cols) if select_cols else "1"}
            FROM {table}
            WHERE user_id = ? AND type = ?
            """,
            (uid, ctype),
        ).fetchone()

    if existing is None:
        ins_cols = filter_existing_columns(
            conn,
            "main",
            table,
            ["user_id", "type", "is_active", "sort_order", "updated_at"],
        )
        vals: list[Any] = []
        placeholders: list[str] = []
        for col in ins_cols:
            placeholders.append("?")
            if col == "user_id":
                vals.append(uid)
            elif col == "type":
                vals.append(ctype)
            elif col == "is_active":
                vals.append(inc_active)
            elif col == "sort_order":
                vals.append(inc_order)
            elif col == "updated_at":
                vals.append(inc_ts)
        if "updated_at" in ins_cols and inc_ts is None:
            idx = ins_cols.index("updated_at")
            placeholders[idx] = "COALESCE(?, CURRENT_TIMESTAMP)"
        conn.execute(
            f"INSERT INTO {table} ({', '.join(ins_cols)}) VALUES ({', '.join(placeholders)})",
            vals,
        )
        return "imported"

    existing_dict = row_dict(existing, select_cols or ["is_active", "sort_order"])
    ex_active = int(
        existing_dict.get("is_active")
        if existing_dict.get("is_active") is not None
        else 1
    )
    ex_order = int(existing_dict.get("sort_order") or 0)
    ex_ts = existing_dict.get(ts_col) if ts_col else None
    richer = inc_active != ex_active or inc_order != ex_order
    newer = _incoming_newer(inc_ts, ex_ts) if ts_col else False

    if not newer and not richer:
        return "skipped_identical"

    new_active = inc_active if newer or richer else ex_active
    new_order = inc_order if newer else ex_order
    set_parts = ["is_active = ?", "sort_order = ?"]
    params: list[Any] = [new_active, new_order]
    if ts_col:
        set_parts.append(f"{ts_col} = COALESCE(?, CURRENT_TIMESTAMP)")
        params.append(inc_ts if newer and inc_ts else ex_ts)
    params.extend([uid, ctype])
    conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE user_id = ? AND type = ?",
        params,
    )
    return "updated" if not richer or newer else "merged"


def _merge_cardio_type_settings_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    stats = empty_stats()
    table = "cardio_type_settings"
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    select_cols = staging_select_columns(imp_cols)
    if "type" not in select_cols:
        return stats
    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    spec = get_table_merge_spec(table)
    imp_ts = resolve_timestamp_column(
        conn, import_schema, table, spec.timestamp_candidates
    )
    by_type: dict[str, dict[str, Any]] = {}
    for raw in src_rows:
        data = _row_dict(raw, select_cols)
        t = str(data.get("type") or "")
        if not t:
            continue
        data["user_id"] = target_user_id
        prev = by_type.get(t)
        if prev is None or prefer_staging_row(
            prev,
            data,
            strategy=spec.strategy,
            ts_col=imp_ts,
            richer_field=spec.richer_field,
            date_field=spec.date_field,
        ):
            by_type[t] = data

    for data in by_type.values():
        _inc(stats, _upsert_cardio_type_settings_row(conn, data))

    log_table_merge(table, stats)
    return stats


def _remap_cardio_type_settings_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = empty_stats()
    remap_cols = filter_existing_columns(
        conn, "main", "cardio_type_settings", ["type", "is_active", "sort_order", "updated_at"]
    )
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                f"""
                SELECT {", ".join(remap_cols)}
                FROM cardio_type_settings WHERE user_id = ?
                """,
                (int(wid),),
            ).fetchall()
            for row in rows:
                data = row_dict(row, remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, _upsert_cardio_type_settings_row(conn, data))
            cur = conn.execute(
                "DELETE FROM cardio_type_settings WHERE user_id = ?",
                (int(wid),),
            )
            stats["deleted_source_rows"] += int(cur.rowcount or 0)
    log_table_merge("cardio_type_settings", stats, context="reassign")
    return stats


# --- Generic newer-wins row merge ---


def _merge_by_key_from_staging(
    conn: sqlite3.Connection,
    table: str,
    key_cols: tuple[str, ...],
    upsert_fn: Callable[[sqlite3.Connection, dict[str, Any]], str],
    *,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
    dedupe_key: Callable[[dict[str, Any]], tuple[Any, ...]] | None = None,
) -> StatsDict:
    stats = empty_stats()
    if not _table_exists(conn, "main", table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    select_cols = staging_select_columns(imp_cols)
    if not all(k in select_cols or k == "user_id" for k in key_cols):
        return stats

    col_sql = ", ".join(select_cols)
    has_user = "user_id" in imp_cols
    if has_user:
        src_rows = conn.execute(
            f"SELECT {col_sql} FROM {import_schema}.{table} WHERE user_id = ?",
            (int(import_uid),),
        ).fetchall()
    else:
        src_rows = conn.execute(f"SELECT {col_sql} FROM {import_schema}.{table}").fetchall()

    spec = get_table_merge_spec(table)
    imp_ts = resolve_timestamp_column(
        conn, import_schema, table, spec.timestamp_candidates
    )
    grouped: dict[tuple[Any, ...], dict[str, Any]] = {}
    for raw in src_rows:
        data = _row_dict(raw, select_cols)
        data["user_id"] = target_user_id
        dk = dedupe_key(data) if dedupe_key else tuple(data.get(k) for k in key_cols)
        prev = grouped.get(dk)
        if prev is None or prefer_staging_row(
            prev,
            data,
            strategy=spec.strategy,
            ts_col=imp_ts,
            richer_field=spec.richer_field,
            date_field=spec.date_field,
        ):
            grouped[dk] = data

    for data in grouped.values():
        _inc(stats, upsert_fn(conn, data))

    log_table_merge(table, stats)
    return stats


def _remap_by_key_user_ids(
    conn: sqlite3.Connection,
    table: str,
    upsert_fn: Callable[[sqlite3.Connection, dict[str, Any]], str],
    *,
    target_user_id: int,
    source_user_ids: list[int],
    select_cols: str = "*",
) -> StatsDict:
    stats = empty_stats()
    if select_cols.strip() == "*":
        remap_cols = _pragma_columns(conn, "main", table)
    else:
        remap_cols = [c.strip() for c in select_cols.split(",")]
    with sqlite_row_factory(conn):
        for wid in source_user_ids:
            rows = conn.execute(
                f"SELECT {select_cols} FROM {table} WHERE user_id = ?",
                (int(wid),),
            ).fetchall()
            for row in rows:
                data = row_dict(row, remap_cols)
                data["user_id"] = target_user_id
                _inc(stats, upsert_fn(conn, data))
            cur = conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (int(wid),))
            stats["deleted_source_rows"] += int(cur.rowcount or 0)
    log_table_merge(table, stats, context="reassign")
    return stats


# --- bike_settings (one row per user_id) ---


def _upsert_bike_settings_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    live_cols = set(_pragma_columns(conn, "main", "bike_settings"))
    imp_cols = [c for c in row if c not in ("id", "user_id") and c in live_cols]
    with sqlite_row_factory(conn):
        existing = conn.execute(
            "SELECT * FROM bike_settings WHERE user_id = ? LIMIT 1",
            (uid,),
        ).fetchone()

    if existing is None:
        cols = ["user_id"] + imp_cols
        vals = [uid] + [row.get(c) for c in imp_cols]
        placeholders = ", ".join("?" for _ in cols)
        conn.execute(
            f"INSERT INTO bike_settings ({', '.join(cols)}) VALUES ({placeholders})",
            vals,
        )
        return "imported"

    live_cols = _pragma_columns(conn, "main", "bike_settings")
    existing_dict = row_dict(existing, live_cols)
    ts_col = resolve_timestamp_column(
        conn, "main", "bike_settings", get_table_merge_spec("bike_settings").timestamp_candidates
    )
    if ts_col:
        if not _incoming_newer(row.get(ts_col), existing_dict.get(ts_col)):
            return "skipped_identical"
    elif rows_payload_equal(row, existing_dict, tuple(imp_cols)):
        return "skipped_identical"

    skip_ts = {ts_col} if ts_col else frozenset()
    set_parts = [f"{c} = ?" for c in imp_cols if c not in skip_ts and c in live_cols]
    params = [row.get(c) for c in imp_cols if c not in skip_ts and c in live_cols]
    if ts_col and ts_col in live_cols:
        set_parts.append(f"{ts_col} = COALESCE(?, CURRENT_TIMESTAMP)")
        params.append(row.get(ts_col))
    params.append(uid)
    conn.execute(
        f"UPDATE bike_settings SET {', '.join(set_parts)} WHERE user_id = ?",
        params,
    )
    return "updated"


def _merge_bike_settings_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "bike_settings",
        ("user_id",),
        _upsert_bike_settings_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"],),
    )


def _remap_bike_settings_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "bike_settings",
        _upsert_bike_settings_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- menstrual_cycle_settings ---


def _upsert_menstrual_cycle_settings_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    table = "menstrual_cycle_settings"
    uid = int(row["user_id"])
    live_cols = set(_pragma_columns(conn, "main", table))
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(conn, "main", table, spec.timestamp_candidates)
    fields = tuple(
        f
        for f in (
            "cycle_length_days",
            "period_length_days",
            "last_period_start",
            "updated_at",
        )
        if f in live_cols
    )
    with sqlite_row_factory(conn):
        existing = conn.execute(
            f"SELECT * FROM {table} WHERE user_id = ? LIMIT 1",
            (uid,),
        ).fetchone()

    if existing is None:
        cols = ["user_id"] + [f for f in fields if f in row]
        vals = [uid] + [row.get(f) for f in cols if f != "user_id"]
        conn.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) "
            f"VALUES ({', '.join('?' for _ in cols)})",
            vals,
        )
        return "imported"

    existing_dict = row_dict(existing, list(live_cols))
    if ts_col:
        if not _incoming_newer(row.get(ts_col), existing_dict.get(ts_col)):
            return "skipped_identical"
    elif rows_payload_equal(row, existing_dict, fields):
        return "skipped_identical"

    updates = {f: row.get(f) for f in fields if f in row and row.get(f) is not None}
    if not updates:
        return "skipped_identical"
    set_sql = ", ".join(f"{k} = ?" for k in updates)
    conn.execute(
        f"UPDATE {table} SET {set_sql} WHERE user_id = ?",
        [*updates.values(), uid],
    )
    return "updated"


def _merge_menstrual_cycle_settings_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "menstrual_cycle_settings",
        ("user_id",),
        _upsert_menstrual_cycle_settings_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"],),
    )


def _remap_menstrual_cycle_settings_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "menstrual_cycle_settings",
        _upsert_menstrual_cycle_settings_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- menstrual_cycle_log ---


def _upsert_menstrual_cycle_log_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    table = "menstrual_cycle_log"
    uid = int(row["user_id"])
    day = str(row.get("date") or "")[:10]
    if not day:
        return "conflicts"

    payload_cols = ("flow_intensity", "symptoms", "notes", "phase")
    log_select_cols = filter_existing_columns(
        conn,
        "main",
        table,
        ["date", *payload_cols, "updated_at", "created_at"],
    )
    log_sql = ", ".join(log_select_cols) if log_select_cols else "1"
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(conn, "main", table, spec.timestamp_candidates)

    row = {**row, "user_id": uid, "date": day}
    existing, match_keys = fetch_existing_row(
        conn,
        "main",
        table,
        row,
        log_select_cols or ["date", *payload_cols],
        preferred_keys=("user_id", "date"),
    )

    if existing is None:
        ins_cols = filter_existing_columns(
            conn, "main", table, ["user_id", "date", *payload_cols, "updated_at", "created_at"]
        )
        vals: list[Any] = []
        for col in ins_cols:
            if col == "user_id":
                vals.append(uid)
            elif col == "date":
                vals.append(day)
            else:
                vals.append(row.get(col))
        try:
            conn.execute(
                f"INSERT INTO {table} ({', '.join(ins_cols)}) "
                f"VALUES ({', '.join('?' for _ in ins_cols)})",
                vals,
            )
            return "imported"
        except sqlite3.IntegrityError:
            existing, match_keys = fetch_existing_row(
                conn,
                "main",
                table,
                row,
                log_sql,
                preferred_keys=("user_id", "date"),
            )
            if existing is None:
                return "conflicts"

    existing_dict = row_dict(existing, log_select_cols or list(payload_cols))
    if ts_col and not _incoming_newer(row.get(ts_col), existing_dict.get(ts_col)):
        incoming_any = any(row.get(c) for c in payload_cols)
        existing_any = any(existing_dict.get(c) for c in payload_cols)
        if not incoming_any or existing_any:
            return "skipped_identical"
    elif rows_payload_equal(row, existing_dict, payload_cols):
        return "skipped_identical"

    merged: dict[str, Any] = {}
    for c in payload_cols:
        if row.get(c) is not None:
            merged[c] = row[c]
        elif existing_dict.get(c) is not None:
            merged[c] = existing_dict[c]

    if not merged:
        return "skipped_identical"

    set_parts = [f"{c} = ?" for c in merged]
    params = list(merged.values())
    lookup = match_keys or ("user_id", "date")
    if table_has_column(conn, "main", table, "user_id") and lookup != ("user_id", "date"):
        set_parts.append("user_id = ?")
        params.append(uid)
    params.extend(key_params_from_row(row, lookup))
    conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE {sql_where_for_keys(lookup)}",
        params,
    )
    return "updated"


def _merge_menstrual_cycle_log_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "menstrual_cycle_log",
        ("user_id", "date"),
        _upsert_menstrual_cycle_log_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"], str(d.get("date") or "")[:10]),
    )


def _remap_menstrual_cycle_log_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "menstrual_cycle_log",
        _upsert_menstrual_cycle_log_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- exercise_sets ---


def _upsert_exercise_sets_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    wtype = str(row["workout_type"])
    eff = str(row["effective_from"])

    es_select_cols = filter_existing_columns(
        conn,
        "main",
        "exercise_sets",
        ["id", "set_name", "effective_to", "is_default", "updated_at"],
    )
    es_select = ", ".join(es_select_cols) if es_select_cols else "1"
    with sqlite_row_factory(conn):
        existing = conn.execute(
            f"""
            SELECT {es_select}
            FROM exercise_sets
            WHERE user_id = ? AND workout_type = ? AND effective_from = ?
            """,
            (uid, wtype, eff),
        ).fetchone()

    cols = ("set_name", "effective_to", "is_default")
    if existing is None:
        insert_cols = ["user_id", "workout_type", "effective_from"] + [
            c for c in cols if c in row
        ]
        vals = [uid, wtype, eff] + [row.get(c) for c in insert_cols if c not in (
            "user_id",
            "workout_type",
            "effective_from",
        )]
        conn.execute(
            f"INSERT INTO exercise_sets ({', '.join(insert_cols)}) "
            f"VALUES ({', '.join('?' for _ in insert_cols)})",
            vals,
        )
        return "imported"

    existing_es = row_dict(existing, es_select_cols or ["set_name", "effective_to", "is_default"])
    ts_col_es = resolve_timestamp_column(
        conn, "main", "exercise_sets", get_table_merge_spec("exercise_sets").timestamp_candidates
    )
    if ts_col_es and not _incoming_newer(
        row.get(ts_col_es), existing_es.get(ts_col_es)
    ):
        return "skipped_identical"

    updates = {c: row.get(c) for c in cols if c in row and row.get(c) is not None}
    if not updates:
        return "skipped_identical"
    set_sql = ", ".join(f"{c} = ?" for c in updates)
    if table_has_column(conn, "main", "exercise_sets", "id"):
        conn.execute(
            f"UPDATE exercise_sets SET {set_sql} WHERE id = ?",
            [*updates.values(), int(existing["id"])],
        )
    else:
        conn.execute(
            f"""
            UPDATE exercise_sets SET {set_sql}
            WHERE user_id = ? AND workout_type = ? AND effective_from = ?
            """,
            [*updates.values(), uid, wtype, eff],
        )
    return "updated"


def _merge_exercise_sets_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "exercise_sets",
        ("user_id", "workout_type", "effective_from"),
        _upsert_exercise_sets_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (
            d["user_id"],
            d["workout_type"],
            d["effective_from"],
        ),
    )


def _remap_exercise_sets_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "exercise_sets",
        _upsert_exercise_sets_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- workout_presets ---


def _upsert_workout_presets_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    name = str(row["name"])

    wp_select_cols = filter_existing_columns(
        conn,
        "main",
        "workout_presets",
        ["id", "is_active", "sort_order", "updated_at", "created_at"],
    )
    wp_sql = ", ".join(wp_select_cols) if wp_select_cols else "1"
    with sqlite_row_factory(conn):
        existing = conn.execute(
            f"""
            SELECT {wp_sql}
            FROM workout_presets
            WHERE user_id = ? AND name = ? COLLATE NOCASE
            """,
            (uid, name),
        ).fetchone()

    if existing is None:
        ins_cols = filter_existing_columns(
            conn,
            "main",
            "workout_presets",
            ["user_id", "name", "is_active", "sort_order", "updated_at", "created_at"],
        )
        placeholders: list[str] = []
        vals: list[Any] = []
        for col in ins_cols:
            if col == "user_id":
                vals.append(uid)
            elif col == "name":
                vals.append(name)
            elif col == "is_active":
                vals.append(int(row.get("is_active") if row.get("is_active") is not None else 1))
            elif col == "sort_order":
                vals.append(int(row.get("sort_order") or 0))
            elif col in ("updated_at", "created_at"):
                placeholders.append("COALESCE(?, CURRENT_TIMESTAMP)")
                vals.append(row.get(col))
                continue
            placeholders.append("?")
        conn.execute(
            f"INSERT INTO workout_presets ({', '.join(ins_cols)}) "
            f"VALUES ({', '.join(placeholders)})",
            vals,
        )
        return "imported"

    existing_dict = row_dict(existing, wp_select_cols or ["1"])
    ts_col = resolve_timestamp_column(
        conn, "main", "workout_presets", get_table_merge_spec("workout_presets").timestamp_candidates
    )
    ex_ts = None
    if ts_col:
        ex_ts = existing_dict.get(ts_col)
    elif "created_at" in existing_dict:
        ex_ts = existing_dict.get("created_at")
    payload_fields = ("is_active", "sort_order")
    if ts_col and not _incoming_newer(row.get(ts_col), ex_ts):
        return "skipped_identical"
    if not ts_col and rows_payload_equal(row, existing_dict, payload_fields):
        return "skipped_identical"

    updates: dict[str, Any] = {}
    for c in payload_fields:
        if c in row and row.get(c) is not None:
            if row.get(c) != existing_dict.get(c):
                updates[c] = row[c]
    if not updates and not ts_col:
        return "skipped_identical"
    set_parts = [f"{c} = ?" for c in updates]
    params = list(updates.values())
    if ts_col and table_has_column(conn, "main", "workout_presets", ts_col):
        set_parts.append(f"{ts_col} = COALESCE(?, CURRENT_TIMESTAMP)")
        params.append(row.get(ts_col))
    if table_has_column(conn, "main", "workout_presets", "id"):
        params.append(int(existing["id"]))
        conn.execute(
            f"UPDATE workout_presets SET {', '.join(set_parts)} WHERE id = ?",
            params,
        )
    else:
        params.extend([uid, name])
        conn.execute(
            f"""
            UPDATE workout_presets SET {', '.join(set_parts)}
            WHERE user_id = ? AND name = ? COLLATE NOCASE
            """,
            params,
        )
    return "updated"


def _merge_workout_presets_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "workout_presets",
        ("user_id", "name"),
        _upsert_workout_presets_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"], str(d.get("name") or "").lower()),
    )


def _remap_workout_presets_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    stats = _remap_by_key_user_ids(
        conn,
        "workout_presets",
        _upsert_workout_presets_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )
    _remap_preset_child_ids(conn, target_user_id, source_user_ids)
    return stats


def _remap_preset_child_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> None:
    """Point preset_exercises/preset_sets at target preset ids (same name)."""
    for wid in source_user_ids:
        presets = conn.execute(
            """
            SELECT id, name FROM workout_presets WHERE user_id = ?
            """,
            (int(wid),),
        ).fetchall()
        for old_id, name in presets:
            target_row = conn.execute(
                """
                SELECT id FROM workout_presets
                WHERE user_id = ? AND name = ? COLLATE NOCASE
                """,
                (target_user_id, name),
            ).fetchone()
            if not target_row:
                continue
            new_id = int(target_row[0])
            if int(old_id) == new_id:
                continue
            for child in ("preset_exercises", "preset_sets"):
                if not _table_exists(conn, "main", child):
                    continue
                cols = _pragma_columns(conn, "main", child)
                if "preset_id" not in cols:
                    continue
                conn.execute(
                    f"UPDATE {child} SET preset_id = ? WHERE preset_id = ?",
                    (new_id, int(old_id)),
                )


# --- account_warmup_daily_cache ---


def _upsert_warmup_cache_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    mkey = str(row["metric_key"])
    grain = str(row["grain"])
    bucket = str(row["bucket_date"])

    with sqlite_row_factory(conn):
        existing = conn.execute(
            """
            SELECT payload_json, computed_at, source_fingerprint
            FROM account_warmup_daily_cache
            WHERE user_id = ? AND metric_key = ? AND grain = ? AND bucket_date = ?
            """,
            (uid, mkey, grain, bucket),
        ).fetchone()

    if existing is None:
        conn.execute(
            """
            INSERT INTO account_warmup_daily_cache (
                user_id, metric_key, grain, bucket_date,
                payload_json, computed_at, source_fingerprint
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                uid,
                mkey,
                grain,
                bucket,
                row.get("payload_json"),
                row.get("computed_at"),
                row.get("source_fingerprint"),
            ),
        )
        return "imported"

    if not _incoming_newer(row.get("computed_at"), existing["computed_at"]):
        return "skipped_identical"

    conn.execute(
        """
        UPDATE account_warmup_daily_cache
        SET payload_json = ?, computed_at = ?, source_fingerprint = ?
        WHERE user_id = ? AND metric_key = ? AND grain = ? AND bucket_date = ?
        """,
        (
            row.get("payload_json"),
            row.get("computed_at"),
            row.get("source_fingerprint"),
            uid,
            mkey,
            grain,
            bucket,
        ),
    )
    return "updated"


def _merge_warmup_cache_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "account_warmup_daily_cache",
        ("user_id", "metric_key", "grain", "bucket_date"),
        _upsert_warmup_cache_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (
            d["user_id"],
            d["metric_key"],
            d["grain"],
            d["bucket_date"],
        ),
    )


def _remap_warmup_cache_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "account_warmup_daily_cache",
        _upsert_warmup_cache_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- cloud/auth preserve_target ---


def _preserve_target_merge(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return empty_stats()


def _preserve_target_remap(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return empty_stats()


# --- shared catalog: food_products by name ---


def _merge_food_products_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_shared",
) -> StatsDict:
    stats = empty_stats()
    table = "food_products"
    dest_schema = "shared"
    if not _table_exists(conn, dest_schema, table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    live_cols = _pragma_columns(conn, dest_schema, table)
    common = [c for c in staging_select_columns(imp_cols) if c in live_cols]
    if "name" not in common:
        return stats

    src_rows = conn.execute(
        f"SELECT {', '.join(common)} FROM {import_schema}.{table}"
    ).fetchall()

    for raw in src_rows:
        data = _row_dict(raw, common)
        name = str(data.get("name") or "")
        if not name:
            continue
        with sqlite_row_factory(conn):
            if table_has_column(conn, dest_schema, table, "id"):
                existing = conn.execute(
                    f"SELECT id FROM {dest_schema}.{table} WHERE name = ? COLLATE NOCASE",
                    (name,),
                ).fetchone()
            else:
                existing = conn.execute(
                    f"SELECT 1 FROM {dest_schema}.{table} WHERE name = ? COLLATE NOCASE",
                    (name,),
                ).fetchone()

        if existing is None:
            cols = common
            conn.execute(
                f"INSERT INTO {dest_schema}.{table} ({', '.join(cols)}) "
                f"VALUES ({', '.join('?' for _ in cols)})",
                [data.get(c) for c in cols],
            )
            stats["imported"] += 1
        else:
            upd_cols = [c for c in common if c != "name"]
            if not upd_cols:
                stats["skipped_identical"] += 1
                continue
            set_sql = ", ".join(f"{c} = ?" for c in upd_cols)
            if table_has_column(conn, dest_schema, table, "id"):
                conn.execute(
                    f"UPDATE {dest_schema}.{table} SET {set_sql} WHERE id = ?",
                    [data.get(c) for c in upd_cols] + [int(existing["id"])],
                )
            else:
                conn.execute(
                    f"UPDATE {dest_schema}.{table} SET {set_sql} WHERE name = ? COLLATE NOCASE",
                    [data.get(c) for c in upd_cols] + [name],
                )
            stats["updated"] += 1

    log_table_merge(table, stats)
    return stats


def _merge_meal_templates_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_shared",
) -> StatsDict:
    stats = empty_stats()
    table = "meal_templates"
    dest_schema = "shared"
    if not _table_exists(conn, dest_schema, table) or not _table_exists(conn, import_schema, table):
        return stats

    imp_cols = _pragma_columns(conn, import_schema, table)
    select_cols = staging_select_columns(imp_cols)
    if "name" not in select_cols:
        return stats
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
        data = _row_dict(raw, select_cols)
        if has_user:
            data["user_id"] = target_user_id
        name = str(data.get("name") or "")
        uid = int(data.get("user_id") or target_user_id)
        with sqlite_row_factory(conn):
            if has_user:
                if table_has_column(conn, dest_schema, table, "id"):
                    existing = conn.execute(
                        f"""
                        SELECT id FROM {dest_schema}.{table}
                        WHERE user_id = ? AND name = ? COLLATE NOCASE
                        """,
                        (uid, name),
                    ).fetchone()
                else:
                    existing = conn.execute(
                        f"""
                        SELECT 1 FROM {dest_schema}.{table}
                        WHERE user_id = ? AND name = ? COLLATE NOCASE
                        """,
                        (uid, name),
                    ).fetchone()
            elif table_has_column(conn, dest_schema, table, "id"):
                existing = conn.execute(
                    f"SELECT id FROM {dest_schema}.{table} WHERE name = ? COLLATE NOCASE",
                    (name,),
                ).fetchone()
            else:
                existing = conn.execute(
                    f"SELECT 1 FROM {dest_schema}.{table} WHERE name = ? COLLATE NOCASE",
                    (name,),
                ).fetchone()

        if existing is None:
            cols = [c for c in select_cols if c in data]
            conn.execute(
                f"INSERT INTO {dest_schema}.{table} ({', '.join(cols)}) "
                f"VALUES ({', '.join('?' for _ in cols)})",
                [data.get(c) for c in cols],
            )
            stats["imported"] += 1
        else:
            upd = [c for c in select_cols if c not in ("name", "user_id", "id")]
            if upd:
                set_sql = ", ".join(f"{c} = ?" for c in upd)
                if table_has_column(conn, dest_schema, table, "id"):
                    conn.execute(
                        f"UPDATE {dest_schema}.{table} SET {set_sql} WHERE id = ?",
                        [data.get(c) for c in upd] + [int(existing["id"])],
                    )
                elif has_user:
                    conn.execute(
                        f"""
                        UPDATE {dest_schema}.{table} SET {set_sql}
                        WHERE user_id = ? AND name = ? COLLATE NOCASE
                        """,
                        [data.get(c) for c in upd] + [uid, name],
                    )
                else:
                    conn.execute(
                        f"""
                        UPDATE {dest_schema}.{table} SET {set_sql}
                        WHERE name = ? COLLATE NOCASE
                        """,
                        [data.get(c) for c in upd] + [name],
                    )
                stats["updated"] += 1
            else:
                stats["skipped_identical"] += 1

    log_table_merge(table, stats)
    return stats


def _upsert_weekly_meal_schedule_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    uid = int(row["user_id"])
    dow = int(row["day_of_week"])
    plan_id = row.get("meal_plan_id")
    with sqlite_row_factory(conn):
        existing = conn.execute(
            "SELECT meal_plan_id FROM weekly_meal_schedule WHERE user_id=? AND day_of_week=?",
            (uid, dow),
        ).fetchone()
    if existing is None:
        conn.execute(
            "INSERT INTO weekly_meal_schedule (user_id, day_of_week, meal_plan_id) VALUES (?,?,?)",
            (uid, dow, plan_id),
        )
        return "imported"
    if existing["meal_plan_id"] == plan_id:
        return "skipped_identical"
    conn.execute(
        "UPDATE weekly_meal_schedule SET meal_plan_id=? WHERE user_id=? AND day_of_week=?",
        (plan_id, uid, dow),
    )
    return "updated"


def _merge_weekly_meal_schedule_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "weekly_meal_schedule",
        ("user_id", "day_of_week"),
        _upsert_weekly_meal_schedule_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"], int(d["day_of_week"])),
    )


def _remap_weekly_meal_schedule_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "weekly_meal_schedule",
        _upsert_weekly_meal_schedule_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


def _upsert_hr_block_overrides_row(conn: sqlite3.Connection, row: dict[str, Any]) -> str:
    table = "strength_hr_block_overrides"
    uid = int(row["user_id"])
    wdate = str(row["workout_date"])[:10]
    title = str(row["workout_title"])
    bidx = int(row["block_index"])
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(conn, "main", table, spec.timestamp_candidates)
    ovr_select_cols = filter_existing_columns(
        conn,
        "main",
        table,
        ["id", "start_sec", "end_sec", "updated_at"],
    )
    ovr_sql = ", ".join(ovr_select_cols) if ovr_select_cols else "1"
    with sqlite_row_factory(conn):
        existing = conn.execute(
            f"""
            SELECT {ovr_sql}
            FROM {table}
            WHERE user_id=? AND workout_date=? AND workout_title=? AND block_index=?
            """,
            (uid, wdate, title, bidx),
        ).fetchone()
    live_cols = set(_pragma_columns(conn, "main", table))
    fields = tuple(
        f
        for f in (
            "start_sec",
            "end_sec",
            "kind",
            "assigned_order_index",
            "label",
            "notes",
            "updated_at",
        )
        if f in live_cols
    )
    if existing is None:
        cols = ["user_id", "workout_date", "workout_title", "block_index"] + [
            f for f in fields if f in row
        ]
        vals = [uid, wdate, title, bidx] + [row.get(f) for f in cols if f not in (
            "user_id",
            "workout_date",
            "workout_title",
            "block_index",
        )]
        conn.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) "
            f"VALUES ({', '.join('?' for _ in cols)})",
            vals,
        )
        return "imported"

    existing_dict = row_dict(existing, ovr_select_cols or ["start_sec", "end_sec"])
    if ts_col and not _incoming_newer(row.get(ts_col), existing_dict.get(ts_col)):
        return "skipped_identical"
    skip = {ts_col} if ts_col else frozenset()
    updates = {f: row.get(f) for f in fields if f in row and f not in skip}
    if not updates and not (ts_col and ts_col in live_cols):
        return "skipped_identical"
    set_parts = [f"{f} = ?" for f in updates]
    params = list(updates.values())
    if ts_col and ts_col in live_cols:
        set_parts.append(f"{ts_col} = COALESCE(?, CURRENT_TIMESTAMP)")
        params.append(row.get(ts_col))
    set_sql = ", ".join(set_parts)
    updates_list = params
    if table_has_column(conn, "main", table, "id") and "id" in existing_dict:
        conn.execute(
            f"UPDATE {table} SET {set_sql} WHERE id = ?",
            [*updates_list, int(existing_dict["id"])],
        )
    else:
        conn.execute(
            f"""
            UPDATE {table} SET {set_sql}
            WHERE user_id=? AND workout_date=? AND workout_title=? AND block_index=?
            """,
            [*updates_list, uid, wdate, title, bidx],
        )
    return "updated"


def _merge_hr_block_overrides_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "strength_hr_block_overrides",
        ("user_id", "workout_date", "workout_title", "block_index"),
        _upsert_hr_block_overrides_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (
            d["user_id"],
            str(d["workout_date"])[:10],
            d["workout_title"],
            int(d["block_index"]),
        ),
    )


def _remap_hr_block_overrides_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "strength_hr_block_overrides",
        _upsert_hr_block_overrides_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


# --- account_warmup_checkpoint (singleton per user_id) ---


def _upsert_account_warmup_checkpoint_row(
    conn: sqlite3.Connection, row: dict[str, Any]
) -> str:
    uid = int(row["user_id"])
    with sqlite_row_factory(conn):
        existing = conn.execute(
            "SELECT * FROM account_warmup_checkpoint WHERE user_id = ?",
            (uid,),
        ).fetchone()

    fields = (
        "status",
        "mode",
        "task_id",
        "cursor_json",
        "processed_units",
        "total_units",
        "started_at",
        "updated_at",
        "completed_at",
        "last_error",
    )

    table = "account_warmup_checkpoint"
    live_cols = set(_pragma_columns(conn, "main", table))
    fields = tuple(f for f in fields if f in live_cols)

    if existing is None:
        cols = ["user_id"] + [f for f in fields if f in row]
        vals = [uid] + [row.get(f) for f in cols if f != "user_id"]
        conn.execute(
            f"INSERT INTO {table} ({', '.join(cols)}) "
            f"VALUES ({', '.join('?' for _ in cols)})",
            vals,
        )
        return "imported"

    existing_dict = row_dict(existing, list(live_cols))
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(conn, "main", table, spec.timestamp_candidates)
    inc_ts = row.get(ts_col) if ts_col else None
    ex_ts = existing_dict.get(ts_col) if ts_col else None
    newer = _incoming_newer(inc_ts, ex_ts) if ts_col else False
    inc_proc = int(row.get("processed_units") or 0)
    ex_proc = int(existing_dict.get("processed_units") or 0)
    richer = inc_proc > ex_proc or (
        int(row.get("total_units") or 0) > int(existing_dict.get("total_units") or 0)
    )

    if not newer and not richer:
        same = True
        for f in fields:
            if ts_col and f == ts_col:
                continue
            if f in row and row.get(f) is not None and row.get(f) != existing_dict.get(f):
                same = False
                break
        if same:
            return "skipped_identical"

    new_values: dict[str, Any] = {
        "status": row.get("status") if newer or row.get("status") else existing_dict.get("status"),
        "mode": (
            row.get("mode")
            if (newer and row.get("mode") is not None)
            else existing_dict.get("mode")
        ),
        "task_id": (
            row.get("task_id")
            if (newer and row.get("task_id") is not None)
            else existing_dict.get("task_id")
        ),
        "cursor_json": (
            row.get("cursor_json")
            if (newer and row.get("cursor_json") is not None)
            else existing_dict.get("cursor_json")
        ),
        "processed_units": max(ex_proc, inc_proc),
        "total_units": max(
            int(existing_dict.get("total_units") or 0),
            int(row.get("total_units") or 0),
        ),
        "completed_at": (
            row.get("completed_at")
            if (newer and row.get("completed_at") is not None)
            else existing_dict.get("completed_at")
        ),
        "last_error": (
            row.get("last_error")
            if (newer and row.get("last_error") is not None)
            else existing_dict.get("last_error")
        ),
    }
    ex_started = existing_dict.get("started_at")
    inc_started = row.get("started_at")
    if "started_at" in live_cols:
        if ex_started and inc_started:
            new_values["started_at"] = (
                ex_started if str(ex_started) <= str(inc_started) else inc_started
            )
        else:
            new_values["started_at"] = ex_started or inc_started
    if ts_col and ts_col in live_cols:
        new_values[ts_col] = inc_ts if newer and inc_ts else ex_ts

    set_parts = [f"{c} = ?" for c in new_values if c in live_cols]
    params = [new_values[c] for c in new_values if c in live_cols]
    if "started_at" in live_cols and "started_at" in set_parts:
        idx = set_parts.index("started_at = ?")
        set_parts[idx] = "started_at = COALESCE(?, started_at)"
    if ts_col and ts_col in live_cols and f"{ts_col} = ?" in set_parts:
        idx = set_parts.index(f"{ts_col} = ?")
        set_parts[idx] = f"{ts_col} = COALESCE(?, {ts_col})"
    params.append(uid)
    conn.execute(
        f"UPDATE {table} SET {', '.join(set_parts)} WHERE user_id = ?",
        params,
    )
    return "merged" if richer else "updated"


def _merge_account_warmup_checkpoint_from_staging(
    conn: sqlite3.Connection,
    target_user_id: int,
    import_uid: int,
    import_schema: str = "import_main",
) -> StatsDict:
    return _merge_by_key_from_staging(
        conn,
        "account_warmup_checkpoint",
        ("user_id",),
        _upsert_account_warmup_checkpoint_row,
        target_user_id=target_user_id,
        import_uid=import_uid,
        import_schema=import_schema,
        dedupe_key=lambda d: (d["user_id"],),
    )


def _remap_account_warmup_checkpoint_user_ids(
    conn: sqlite3.Connection,
    target_user_id: int,
    source_user_ids: list[int],
) -> StatsDict:
    return _remap_by_key_user_ids(
        conn,
        "account_warmup_checkpoint",
        _upsert_account_warmup_checkpoint_row,
        target_user_id=target_user_id,
        source_user_ids=source_user_ids,
    )


EXTRA_NATURAL_KEY_HANDLERS: dict[str, tuple[_MERGE_FN, _REMAP_FN, None]] = {
    "account_warmup_checkpoint": (
        _merge_account_warmup_checkpoint_from_staging,
        _remap_account_warmup_checkpoint_user_ids,
        None,
    ),
    "cardio_type_settings": (
        _merge_cardio_type_settings_from_staging,
        _remap_cardio_type_settings_user_ids,
        None,
    ),
    "bike_settings": (
        _merge_bike_settings_from_staging,
        _remap_bike_settings_user_ids,
        None,
    ),
    "menstrual_cycle_settings": (
        _merge_menstrual_cycle_settings_from_staging,
        _remap_menstrual_cycle_settings_user_ids,
        None,
    ),
    "menstrual_cycle_log": (
        _merge_menstrual_cycle_log_from_staging,
        _remap_menstrual_cycle_log_user_ids,
        None,
    ),
    "exercise_sets": (
        _merge_exercise_sets_from_staging,
        _remap_exercise_sets_user_ids,
        None,
    ),
    "workout_presets": (
        _merge_workout_presets_from_staging,
        _remap_workout_presets_user_ids,
        None,
    ),
    "account_warmup_daily_cache": (
        _merge_warmup_cache_from_staging,
        _remap_warmup_cache_user_ids,
        None,
    ),
    "weekly_meal_schedule": (
        _merge_weekly_meal_schedule_from_staging,
        _remap_weekly_meal_schedule_user_ids,
        None,
    ),
    "strength_hr_block_overrides": (
        _merge_hr_block_overrides_from_staging,
        _remap_hr_block_overrides_user_ids,
        None,
    ),
}

CATALOG_MERGE_HANDLERS: dict[str, _MERGE_FN] = {
    "food_products": _merge_food_products_from_staging,
    "meal_templates": _merge_meal_templates_from_staging,
}

CLOUD_AUTH_HANDLERS: dict[str, tuple[_MERGE_FN, _REMAP_FN]] = {
    "cloud_tokens": (_preserve_target_merge, _preserve_target_remap),
    "user_cloud_links": (_preserve_target_merge, _preserve_target_remap),
    "users": (_preserve_target_merge, _preserve_target_remap),
}

# Upsert dispatch for mini-database copy
def import_cardio_type_settings_json_rows(
    conn: sqlite3.Connection,
    rows: list[dict[str, Any]],
    *,
    target_user_id: int,
    report_imported: dict[str, int],
    report_updated: dict[str, int],
    report_skipped: dict[str, int],
    report_errors: list[str],
) -> None:
    table = "cardio_type_settings"
    spec = get_table_merge_spec(table)
    ts_col = resolve_timestamp_column(conn, "main", table, spec.timestamp_candidates)
    by_type: dict[str, dict[str, Any]] = {}
    for raw in rows:
        t = str(raw.get("type") or "")
        if not t:
            continue
        norm = {
            "user_id": target_user_id,
            "type": t,
            "is_active": raw.get("is_active"),
            "sort_order": raw.get("sort_order"),
        }
        if ts_col:
            norm[ts_col] = raw.get(ts_col)
        prev = by_type.get(t)
        if prev is None or prefer_staging_row(
            prev,
            norm,
            strategy=spec.strategy,
            ts_col=ts_col,
            richer_field=spec.richer_field,
        ):
            by_type[t] = norm

    for norm in by_type.values():
        try:
            result = _upsert_cardio_type_settings_row(conn, norm)
            if result == "imported":
                report_imported[table] = report_imported.get(table, 0) + 1
            elif result in ("updated", "merged"):
                report_updated[table] = report_updated.get(table, 0) + 1
            else:
                report_skipped[table] = report_skipped.get(table, 0) + 1
        except sqlite3.OperationalError as err:
            report_errors.append(f"{table}: {err}")


ROW_UPSERT_FNS: dict[str, Callable[[sqlite3.Connection, dict[str, Any]], str]] = {
    "cardio_type_settings": _upsert_cardio_type_settings_row,
    "bike_settings": _upsert_bike_settings_row,
    "menstrual_cycle_settings": _upsert_menstrual_cycle_settings_row,
    "menstrual_cycle_log": _upsert_menstrual_cycle_log_row,
    "exercise_sets": _upsert_exercise_sets_row,
    "workout_presets": _upsert_workout_presets_row,
    "account_warmup_daily_cache": _upsert_warmup_cache_row,
    "weekly_meal_schedule": _upsert_weekly_meal_schedule_row,
    "strength_hr_block_overrides": _upsert_hr_block_overrides_row,
    "account_warmup_checkpoint": _upsert_account_warmup_checkpoint_row,
}
