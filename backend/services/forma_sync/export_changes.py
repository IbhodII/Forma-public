# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.change_tracker import (
    ExportedEntityRef,
    PENDING_WHERE,
    load_active_rows,
    load_pending_rows,
)
from backend.services.forma_sync.entity_mappers import (
    SOURCE,
    aggregate_strength_session,
    body_row_to_payload,
    bracelet_row_to_payload,
    build_user_preferences_payload,
    cardio_row_to_payload,
    empty_jsonl_map,
    food_row_to_payload,
    product_row_to_payload,
    row_updated_at,
    session_updated_at,
    stretch_row_to_payload,
)
from backend.services.forma_sync.entity_types import FormaSyncJsonlRow, build_entity_id


def _ref(table: str, key_column: str, key_value: str | int) -> ExportedEntityRef:
    return ExportedEntityRef(table=table, key_column=key_column, key_value=key_value)


def _body_metrics_key(row: sqlite3.Row) -> tuple[str, str | int]:
    """body_metrics: в старых схемах PK — date, без колонки id."""
    keys = row.keys()
    if "id" in keys and row["id"] is not None:
        return "id", int(row["id"])
    return "date", str(row["date"])


def export_pending_changes(conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    device_id = sync_meta.get_or_create_device_id()
    uid = get_current_user_id()
    exported_refs: list[ExportedEntityRef] = []
    jsonl = empty_jsonl_map()

    try:
        conn.row_factory = sqlite3.Row
        for row in load_pending_rows(conn, "food_entries", uid):
            entry_id = int(row["id"])
            deleted_at = row["deleted_at"]
            ts = row_updated_at(row)
            payload = None if deleted_at else food_row_to_payload(row)
            jsonl["food_entries"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("food_entries", SOURCE, entry_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=payload,
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("food_entries", "id", entry_id))

        for row in load_pending_rows(conn, "body_metrics", uid):
            key_col, entry_id = _body_metrics_key(row)
            deleted_at = row["deleted_at"] if "deleted_at" in row.keys() else None
            ts = row_updated_at(row)
            jsonl["body_metrics"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("body_metrics", SOURCE, entry_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=None if deleted_at else body_row_to_payload(row),
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("body_metrics", key_col, entry_id))

        session_rows = conn.execute(
            f"""SELECT date, workout_title FROM strength_workouts
                WHERE user_id = ? AND {PENDING_WHERE}
                GROUP BY date, workout_title""",
            (uid,),
        ).fetchall()
        for sess in session_rows:
            date_str = str(sess["date"])[:10]
            title = str(sess["workout_title"])
            set_rows = conn.execute(
                """SELECT * FROM strength_workouts
                   WHERE user_id = ? AND date = ? AND workout_title = ?""",
                (uid, date_str, title),
            ).fetchall()
            deleted_at = next((r["deleted_at"] for r in set_rows if r["deleted_at"]), None)
            ts = session_updated_at(set_rows)
            session_key = f"{date_str}|{title}"
            payload = None if deleted_at else aggregate_strength_session(conn, date_str, title, uid)
            jsonl["strength_workouts"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("strength_workouts", SOURCE, session_key),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=payload,
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            for r in set_rows:
                exported_refs.append(_ref("strength_workouts", "id", int(r["id"])))

        for row in load_pending_rows(conn, "stretching_log", uid):
            log_id = int(row["id"])
            deleted_at = row["deleted_at"]
            ts = row_updated_at(row)
            jsonl["stretching_log"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("stretching_log", SOURCE, log_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=None if deleted_at else stretch_row_to_payload(row),
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("stretching_log", "id", log_id))

        for row in load_pending_rows(conn, "daily_bracelet_calories", uid):
            day = str(row["date"])[:10]
            deleted_at = row["deleted_at"]
            ts = row_updated_at(row)
            jsonl["bracelet_calories"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("bracelet_calories", SOURCE, day),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=None if deleted_at else bracelet_row_to_payload(row),
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("daily_bracelet_calories", "date", day))

        for row in load_pending_rows(conn, "cardio_workouts", uid):
            workout_id = int(row["id"])
            deleted_at = row["deleted_at"]
            ts = row_updated_at(row)
            jsonl["cardio_workouts"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("cardio_workouts", SOURCE, workout_id),
                    server_id=workout_id,
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=None if deleted_at else cardio_row_to_payload(row),
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("cardio_workouts", "id", workout_id))

        product_ids: set[int] = set()
        for row in jsonl["food_entries"]:
            if row.payload and isinstance(row.payload, dict) and row.payload.get("product_id"):
                product_ids.add(int(row.payload["product_id"]))
        if product_ids:
            try:
                conn.row_factory = sqlite3.Row
                placeholders = ",".join("?" * len(product_ids))
                prod_rows = conn.execute(
                    f"SELECT * FROM shared.food_products WHERE id IN ({placeholders})",
                    tuple(product_ids),
                ).fetchall()
                for prow in prod_rows:
                    pid = int(prow["id"])
                    ts = row_updated_at(prow, sync_meta.get_last_upload_at() or "")
                    jsonl["food_products"].append(
                        FormaSyncJsonlRow(
                            id=build_entity_id("food_products", SOURCE, pid),
                            server_id=pid,
                            updated_at=ts,
                            source=SOURCE,
                            device_id=device_id,
                            payload=product_row_to_payload(prow),
                        )
                    )
            except sqlite3.OperationalError as err:
                logger.warning("forma_sync export: skip food_products (%s)", err)

        for row in load_pending_rows(conn, "workout_presets", uid):
            preset_id = int(row["id"])
            deleted_at = row["deleted_at"]
            ts = row_updated_at(row)
            from backend.services import preset_service

            payload = None if deleted_at else preset_service.get_preset_by_id(preset_id)
            jsonl["strength_presets"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("strength_presets", SOURCE, preset_id),
                    server_id=preset_id,
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=payload,
                    deleted_at=str(deleted_at) if deleted_at else None,
                )
            )
            exported_refs.append(_ref("workout_presets", "id", preset_id))

        pref_touch = conn.execute(
            """SELECT updated_at FROM forma_sync_touch
               WHERE entity_type = 'user_preferences' AND entity_key = 'default'"""
        ).fetchone()
        if pref_touch:
            ts = str(pref_touch["updated_at"])
            jsonl["user_preferences"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("user_preferences", SOURCE, "default"),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=build_user_preferences_payload(conn),
                )
            )

        row_count = sum(len(v) for v in jsonl.values())
        return {"jsonl": jsonl, "exported_refs": exported_refs, "row_count": row_count}
    finally:
        if own_conn:
            conn.close()


def export_baseline_changes(conn: sqlite3.Connection | None = None) -> dict[str, Any]:
    """Export all active local rows for first-time cloud baseline (rev 1)."""
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    device_id = sync_meta.get_or_create_device_id()
    uid = get_current_user_id()
    exported_refs: list[ExportedEntityRef] = []
    jsonl = empty_jsonl_map()

    try:
        conn.row_factory = sqlite3.Row
        for row in load_active_rows(conn, "food_entries", uid):
            entry_id = int(row["id"])
            ts = row_updated_at(row)
            jsonl["food_entries"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("food_entries", SOURCE, entry_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=food_row_to_payload(row),
                )
            )
            exported_refs.append(_ref("food_entries", "id", entry_id))

        for row in load_active_rows(conn, "body_metrics", uid):
            key_col, entry_id = _body_metrics_key(row)
            ts = row_updated_at(row)
            jsonl["body_metrics"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("body_metrics", SOURCE, entry_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=body_row_to_payload(row),
                )
            )
            exported_refs.append(_ref("body_metrics", key_col, entry_id))

        conn.row_factory = sqlite3.Row
        session_rows = conn.execute(
            """SELECT date, workout_title FROM strength_workouts
               WHERE user_id = ? AND (deleted_at IS NULL OR deleted_at = '')
               GROUP BY date, workout_title""",
            (uid,),
        ).fetchall()
        for sess in session_rows:
            date_str = str(sess["date"])[:10]
            title = str(sess["workout_title"])
            set_rows = conn.execute(
                """SELECT * FROM strength_workouts
                   WHERE user_id = ? AND date = ? AND workout_title = ?
                     AND (deleted_at IS NULL OR deleted_at = '')""",
                (uid, date_str, title),
            ).fetchall()
            if not set_rows:
                continue
            ts = session_updated_at(set_rows)
            session_key = f"{date_str}|{title}"
            payload = aggregate_strength_session(conn, date_str, title, uid)
            jsonl["strength_workouts"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("strength_workouts", SOURCE, session_key),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=payload,
                )
            )
            for r in set_rows:
                exported_refs.append(_ref("strength_workouts", "id", int(r["id"])))

        for row in load_active_rows(conn, "stretching_log", uid):
            log_id = int(row["id"])
            ts = row_updated_at(row)
            jsonl["stretching_log"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("stretching_log", SOURCE, log_id),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=stretch_row_to_payload(row),
                )
            )
            exported_refs.append(_ref("stretching_log", "id", log_id))

        for row in load_active_rows(conn, "daily_bracelet_calories", uid):
            day = str(row["date"])[:10]
            ts = row_updated_at(row)
            jsonl["bracelet_calories"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("bracelet_calories", SOURCE, day),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=bracelet_row_to_payload(row),
                )
            )
            exported_refs.append(_ref("daily_bracelet_calories", "date", day))

        for row in load_active_rows(conn, "cardio_workouts", uid):
            workout_id = int(row["id"])
            ts = row_updated_at(row)
            jsonl["cardio_workouts"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("cardio_workouts", SOURCE, workout_id),
                    server_id=workout_id,
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=cardio_row_to_payload(row),
                )
            )
            exported_refs.append(_ref("cardio_workouts", "id", workout_id))

        product_ids: set[int] = set()
        for row in load_active_rows(conn, "food_entries", uid):
            try:
                product_ids.add(int(row["product_id"]))
            except (TypeError, ValueError, KeyError):
                pass
        if product_ids:
            try:
                conn.row_factory = sqlite3.Row
                placeholders = ",".join("?" * len(product_ids))
                prod_rows = conn.execute(
                    f"SELECT * FROM shared.food_products WHERE id IN ({placeholders})",
                    tuple(product_ids),
                ).fetchall()
                for prow in prod_rows:
                    pid = int(prow["id"])
                    ts = row_updated_at(prow, sync_meta.get_last_upload_at() or "")
                    jsonl["food_products"].append(
                        FormaSyncJsonlRow(
                            id=build_entity_id("food_products", SOURCE, pid),
                            server_id=pid,
                            updated_at=ts,
                            source=SOURCE,
                            device_id=device_id,
                            payload=product_row_to_payload(prow),
                        )
                    )
            except sqlite3.OperationalError as err:
                logger.warning("forma_sync baseline: skip food_products (%s)", err)

        for row in load_active_rows(conn, "workout_presets", uid):
            preset_id = int(row["id"])
            ts = row_updated_at(row)
            from backend.services import preset_service

            jsonl["strength_presets"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("strength_presets", SOURCE, preset_id),
                    server_id=preset_id,
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=preset_service.get_preset_by_id(preset_id),
                )
            )
            exported_refs.append(_ref("workout_presets", "id", preset_id))

        prefs = build_user_preferences_payload(conn)
        if prefs:
            from backend.services.forma_sync.entity_mappers import now_iso

            ts = now_iso()
            jsonl["user_preferences"].append(
                FormaSyncJsonlRow(
                    id=build_entity_id("user_preferences", SOURCE, "default"),
                    updated_at=ts,
                    source=SOURCE,
                    device_id=device_id,
                    payload=prefs,
                )
            )

        row_count = sum(len(v) for v in jsonl.values())
        return {"jsonl": jsonl, "exported_refs": exported_refs, "row_count": row_count}
    finally:
        if own_conn:
            conn.close()
