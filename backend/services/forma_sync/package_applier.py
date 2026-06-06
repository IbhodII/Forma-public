# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import logging
import sqlite3
import tempfile
import zipfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.change_tracker import (
    enqueue_conflict,
    mark_entity_conflict,
    mark_row_pending_on_insert,
)
from backend.services.forma_sync.entity_mappers import (
    is_newer,
    parse_jsonl,
    payload_equal,
)
from backend.services.forma_sync.entity_types import (
    ENTITY_FILES,
    FormaSyncJsonlRow,
    is_cross_origin,
    parse_entity_id,
)

logger = logging.getLogger(__name__)


@dataclass
class ApplyPackageResult:
    applied: int
    conflicts: int
    skipped: bool


def _parse_row(data: dict[str, Any]) -> FormaSyncJsonlRow:
    return FormaSyncJsonlRow(
        id=str(data["id"]),
        updated_at=str(data["updated_at"]),
        source=str(data.get("source") or ""),
        device_id=str(data.get("device_id") or ""),
        payload=data.get("payload"),
        server_id=data.get("server_id"),
        deleted_at=data.get("deleted_at"),
    )


def _record_conflict(
    conn: sqlite3.Connection,
    *,
    entity_type: str,
    entity_label: str,
    local_payload: Any,
    server_payload: Any,
    remote_updated_at: str,
    table: str,
    key_column: str,
    key_value: str | int,
) -> None:
    enqueue_conflict(
        conn,
        entity_type=entity_type,
        entity_label=entity_label,
        local_payload=local_payload,
        server_payload=server_payload,
        previous_payload=local_payload,
        remote_updated_at=remote_updated_at,
        winner="remote",
    )
    mark_entity_conflict(conn, table, key_column, key_value)


def _mark_imported(
    conn: sqlite3.Connection,
    table: str,
    key_column: str,
    key_value: str | int,
    revision: int,
) -> None:
    conn.execute(
        f"""UPDATE {table}
            SET sync_status = 'synced', last_synced_revision = ?
            WHERE {key_column} = ?""",
        (revision, key_value),
    )


def _apply_food(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    uid = get_current_user_id()
    cross = is_cross_origin(parsed.origin)
    local = None
    target_id: int | None = None
    if not cross:
        cur = conn.execute(
            "SELECT * FROM food_entries WHERE id = ? AND user_id = ?",
            (int(parsed.local_key), uid),
        )
        local = cur.fetchone()
    if local:
        target_id = int(local["id"])
        local_payload = {
            "date": local["date"],
            "phase": local["phase"],
            "product_id": local["product_id"],
            "quantity": local["quantity"],
            "meal_type": local["meal_type"],
            "notes": local["notes"],
        }
        local_ts = str(local["updated_at"] or "")
        if row.deleted_at and is_newer(str(row.deleted_at), local_ts):
            conn.execute(
                """UPDATE food_entries SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE id = ?""",
                (row.deleted_at, row.deleted_at, revision, target_id),
            )
            return "applied"
        if row.deleted_at:
            return "skipped"
        incoming = row.payload
        if is_newer(row.updated_at, local_ts):
            if not isinstance(incoming, dict):
                return "skipped"
            conn.execute(
                """UPDATE food_entries SET date = ?, phase = ?, product_id = ?, quantity = ?,
                   meal_type = ?, notes = ?, protein_per100 = ?, fat_per100 = ?, carbs_per100 = ?,
                   calories_per100 = ?, updated_at = ?, sync_status = 'synced', last_synced_revision = ?
                   WHERE id = ?""",
                (
                    str(incoming.get("date", local["date"]))[:10],
                    incoming.get("phase", local["phase"]),
                    int(incoming.get("product_id", local["product_id"])),
                    float(incoming.get("quantity", local["quantity"])),
                    incoming.get("meal_type", local["meal_type"]),
                    incoming.get("notes", local["notes"]),
                    incoming.get("protein_per100", local["protein_per100"]),
                    incoming.get("fat_per100", local["fat_per100"]),
                    incoming.get("carbs_per100", local["carbs_per100"]),
                    incoming.get("calories_per100", local["calories_per100"]),
                    row.updated_at,
                    revision,
                    target_id,
                ),
            )
            return "applied"
        if row.updated_at == local_ts and not payload_equal(incoming, local_payload):
            _record_conflict(
                conn,
                entity_type="food_entries",
                entity_label=row.id,
                local_payload=local_payload,
                server_payload=incoming,
                remote_updated_at=row.updated_at,
                table="food_entries",
                key_column="id",
                key_value=target_id,
            )
            return "conflict"
        return "skipped"

    if row.deleted_at or not row.payload or not isinstance(row.payload, dict):
        return "skipped"
    p = row.payload
    cur = conn.execute(
        """INSERT INTO food_entries
           (date, phase, product_id, quantity, meal_type, notes,
            protein_per100, fat_per100, carbs_per100, calories_per100, user_id,
            updated_at, sync_status, last_synced_revision)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?)""",
        (
            str(p.get("date", ""))[:10],
            p.get("phase", "cut"),
            int(p.get("product_id", 0)),
            float(p.get("quantity", 100)),
            p.get("meal_type", "lunch"),
            p.get("notes"),
            p.get("protein_per100", 0),
            p.get("fat_per100", 0),
            p.get("carbs_per100", 0),
            p.get("calories_per100", 0),
            uid,
            row.updated_at,
            revision,
        ),
    )
    new_id = int(cur.lastrowid)
    _mark_imported(conn, "food_entries", "id", new_id, revision)
    return "applied"


def _apply_body(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    uid = get_current_user_id()
    cross = is_cross_origin(parsed.origin)
    local = None
    target_id: int | None = None
    if cross:
        date_key = str(parsed.local_key)[:10]
        cur = conn.execute(
            "SELECT * FROM body_metrics WHERE user_id = ? AND date = ? ORDER BY id DESC LIMIT 1",
            (uid, date_key),
        )
        local = cur.fetchone()
    else:
        cur = conn.execute(
            "SELECT * FROM body_metrics WHERE id = ? AND user_id = ?",
            (int(parsed.local_key), uid),
        )
        local = cur.fetchone()
    incoming = row.payload if isinstance(row.payload, dict) else None

    if local:
        target_id = int(local["id"])
        skip_cols = {"id", "updated_at", "deleted_at", "sync_status", "device_id", "last_synced_revision"}
        local_payload = {k: local[k] for k in local.keys() if k not in skip_cols}
        local_ts = str(local["updated_at"] or "")
        if row.deleted_at and is_newer(str(row.deleted_at), local_ts):
            conn.execute(
                """UPDATE body_metrics SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE id = ?""",
                (row.deleted_at, row.deleted_at, revision, target_id),
            )
            return "applied"
        if row.deleted_at:
            return "skipped"
        if incoming and is_newer(row.updated_at, local_ts):
            measure_date = str(incoming.get("date", local["date"]))[:10]
            cols = [c for c in incoming.keys() if c != "date"]
            if cols:
                set_sql = ", ".join(f"{c} = ?" for c in cols)
                conn.execute(
                    f"UPDATE body_metrics SET {set_sql}, updated_at = ?, sync_status = 'synced', "
                    f"last_synced_revision = ? WHERE id = ?",
                    (*[incoming[c] for c in cols], row.updated_at, revision, target_id),
                )
            else:
                conn.execute(
                    """UPDATE body_metrics SET updated_at = ?, sync_status = 'synced',
                       last_synced_revision = ? WHERE id = ?""",
                    (row.updated_at, revision, target_id),
                )
            return "applied"
        if incoming and row.updated_at == local_ts and not payload_equal(incoming, local_payload):
            _record_conflict(
                conn,
                entity_type="body_metrics",
                entity_label=row.id,
                local_payload=local_payload,
                server_payload=incoming,
                remote_updated_at=row.updated_at,
                table="body_metrics",
                key_column="id",
                key_value=target_id,
            )
            return "conflict"
        return "skipped"

    if row.deleted_at or not incoming:
        return "skipped"
    measure_date = str(incoming.get("date", parsed.local_key))[:10]
    cols = [c for c in incoming.keys() if c != "date"]
    col_list = ", ".join(("user_id", "date", *cols, "updated_at", "sync_status", "last_synced_revision"))
    placeholders = ", ".join("?" * (2 + len(cols) + 3))
    cur = conn.execute(
        f"INSERT INTO body_metrics ({col_list}) VALUES ({placeholders})",
        (
            uid,
            measure_date,
            *[incoming[c] for c in cols],
            row.updated_at,
            "synced",
            revision,
        ),
    )
    _mark_imported(conn, "body_metrics", "id", int(cur.lastrowid), revision)
    return "applied"


def _apply_strength(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    if not isinstance(row.payload, dict) and not row.deleted_at:
        return "skipped"
    payload = row.payload if isinstance(row.payload, dict) else {}
    date_str = str(payload.get("date") or parsed.local_key.split("|")[0])[:10]
    title = str(payload.get("workout_title") or (parsed.local_key.split("|")[1] if "|" in parsed.local_key else ""))
    uid = get_current_user_id()
    local = conn.execute(
        """SELECT MAX(updated_at) AS updated_at FROM strength_workouts
           WHERE user_id = ? AND date = ? AND workout_title = ?""",
        (uid, date_str, title),
    ).fetchone()
    local_ts = str(local["updated_at"] or "") if local and local["updated_at"] else ""

    if row.deleted_at and local_ts:
        if is_newer(str(row.deleted_at), local_ts):
            conn.execute(
                """UPDATE strength_workouts SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE user_id = ? AND date = ? AND workout_title = ?""",
                (row.deleted_at, row.deleted_at, revision, uid, date_str, title),
            )
            return "applied"
        return "skipped"

    if local_ts and not is_newer(row.updated_at, local_ts):
        if row.updated_at == local_ts and payload and local_ts:
            return "skipped"
        if row.updated_at == local_ts and payload:
            return "conflict"
        return "skipped"

    if not payload:
        return "skipped"

    from backend.services import strength_service

    conn.execute(
        "DELETE FROM strength_workouts WHERE user_id = ? AND date = ? AND workout_title = ?",
        (uid, date_str, title),
    )
    conn.commit()
    strength_service.create_workout(payload)
    conn.execute(
        """UPDATE strength_workouts SET updated_at = ?, sync_status = 'synced', last_synced_revision = ?
           WHERE user_id = ? AND date = ? AND workout_title = ?""",
        (row.updated_at, revision, uid, date_str, title),
    )
    return "applied"


def _apply_stretch(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    uid = get_current_user_id()
    local = conn.execute(
        "SELECT * FROM stretching_log WHERE id = ? AND user_id = ?",
        (int(parsed.local_key), uid),
    ).fetchone()
    incoming = row.payload if isinstance(row.payload, dict) else None
    if local:
        target_id = int(local["id"])
        local_ts = str(local["updated_at"] or "")
        local_payload = {
            "date": local["date"],
            "preset_id": local["preset_id"],
            "duration_minutes": local["duration_minutes"],
            "notes": local["notes"],
        }
        if row.deleted_at and is_newer(str(row.deleted_at), local_ts):
            conn.execute(
                """UPDATE stretching_log SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE id = ?""",
                (row.deleted_at, row.deleted_at, revision, target_id),
            )
            return "applied"
        if incoming and is_newer(row.updated_at, local_ts):
            conn.execute(
                """UPDATE stretching_log SET date = ?, preset_id = ?, duration_minutes = ?, notes = ?,
                   updated_at = ?, sync_status = 'synced', last_synced_revision = ? WHERE id = ?""",
                (
                    incoming.get("date", local["date"]),
                    incoming.get("preset_id", local["preset_id"]),
                    incoming.get("duration_minutes", local["duration_minutes"]),
                    incoming.get("notes", local["notes"]),
                    row.updated_at,
                    revision,
                    target_id,
                ),
            )
            return "applied"
        if incoming and row.updated_at == local_ts and not payload_equal(incoming, local_payload):
            _record_conflict(
                conn,
                entity_type="stretching_log",
                entity_label=row.id,
                local_payload=local_payload,
                server_payload=incoming,
                remote_updated_at=row.updated_at,
                table="stretching_log",
                key_column="id",
                key_value=target_id,
            )
            return "conflict"
        return "skipped"
    if row.deleted_at or not incoming:
        return "skipped"
    cur = conn.execute(
        """INSERT INTO stretching_log (user_id, date, preset_id, duration_minutes, notes,
           updated_at, sync_status, last_synced_revision)
           VALUES (?, ?, ?, ?, ?, ?, 'synced', ?)""",
        (
            uid,
            str(incoming.get("date", ""))[:10],
            int(incoming.get("preset_id", 0)),
            incoming.get("duration_minutes"),
            incoming.get("notes"),
            row.updated_at,
            revision,
        ),
    )
    _mark_imported(conn, "stretching_log", "id", int(cur.lastrowid), revision)
    return "applied"


def _apply_bracelet(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    day = parsed.local_key[:10]
    local = conn.execute("SELECT * FROM daily_bracelet_calories WHERE date = ?", (day,)).fetchone()
    incoming = row.payload if isinstance(row.payload, dict) else None
    if local:
        local_ts = str(local["updated_at"] or "")
        local_payload = {"date": local["date"], "total_calories": local["total_calories"]}
        if incoming and is_newer(row.updated_at, local_ts):
            conn.execute(
                """UPDATE daily_bracelet_calories SET total_calories = ?, updated_at = ?,
                   sync_status = 'synced', last_synced_revision = ? WHERE date = ?""",
                (int(incoming.get("total_calories", 0)), row.updated_at, revision, day),
            )
            return "applied"
        if incoming and row.updated_at == local_ts and not payload_equal(incoming, local_payload):
            _record_conflict(
                conn,
                entity_type="bracelet_calories",
                entity_label=row.id,
                local_payload=local_payload,
                server_payload=incoming,
                remote_updated_at=row.updated_at,
                table="daily_bracelet_calories",
                key_column="date",
                key_value=day,
            )
            return "conflict"
        return "skipped"
    if not incoming:
        return "skipped"
    conn.execute(
        """INSERT INTO daily_bracelet_calories (date, total_calories, source, updated_at,
           sync_status, last_synced_revision)
           VALUES (?, ?, 'forma_sync', ?, 'synced', ?)""",
        (day, int(incoming.get("total_calories", 0)), row.updated_at, revision),
    )
    return "applied"


def _apply_hc_day(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    incoming = row.payload if isinstance(row.payload, dict) else None
    if not incoming or incoming.get("source") != "health_connect":
        return "skipped"
    day = str(incoming.get("date") or parsed.local_key)[:10]
    from backend.services.health_connect_sync_service import upsert_steps_for_day
    from backend.services.analytics_service import save_daily_bracelet_calories

    if incoming.get("steps") is not None:
        upsert_steps_for_day(day, int(incoming["steps"]), source="health_connect")
    total_cal = incoming.get("total_calories") or incoming.get("active_calories")
    if total_cal is not None:
        save_daily_bracelet_calories(day, int(total_cal), source="health_connect")
    return "applied"


def _apply_cardio(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    uid = get_current_user_id()
    cross = is_cross_origin(parsed.origin)
    local = None
    if cross and row.server_id:
        cur = conn.execute(
            "SELECT * FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (int(row.server_id), uid),
        )
        local = cur.fetchone()
    elif not cross:
        cur = conn.execute(
            "SELECT * FROM cardio_workouts WHERE id = ? AND user_id = ?",
            (int(parsed.local_key), uid),
        )
        local = cur.fetchone()
    incoming = row.payload if isinstance(row.payload, dict) else None

    if local:
        target_id = int(local["id"])
        local_ts = str(local["updated_at"] or "")
        if row.deleted_at and is_newer(str(row.deleted_at), local_ts):
            conn.execute(
                """UPDATE cardio_workouts SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE id = ?""",
                (row.deleted_at, row.deleted_at, revision, target_id),
            )
            return "applied"
        if incoming and is_newer(row.updated_at, local_ts):
            from backend.services import cardio_service

            cardio_service.update_workout(target_id, incoming)
            conn.execute(
                """UPDATE cardio_workouts SET updated_at = ?, sync_status = 'synced',
                   last_synced_revision = ? WHERE id = ?""",
                (row.updated_at, revision, target_id),
            )
            return "applied"
        return "skipped"

    if row.deleted_at or not incoming:
        return "skipped"
    from backend.services import cardio_service

    new_id = cardio_service.create_workout(incoming)
    if new_id:
        conn.execute(
            """UPDATE cardio_workouts SET updated_at = ?, sync_status = 'synced',
               last_synced_revision = ? WHERE id = ?""",
            (row.updated_at, revision, new_id),
        )
        return "applied"
    return "skipped"


def _apply_product(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    if not isinstance(row.payload, dict) or row.deleted_at:
        return "skipped"
    pid = int(parsed.local_key) if not is_cross_origin(parsed.origin) else int(row.server_id or 0)
    if not pid and is_cross_origin(parsed.origin):
        pid = 0
    existing = conn.execute("SELECT id FROM shared.food_products WHERE id = ?", (pid,)).fetchone() if pid else None
    p = row.payload
    name = str(p.get("name") or p.get("product_name") or "Product")
    if existing:
        try:
            conn.execute(
                """UPDATE shared.food_products SET name = ?, protein = ?, fat = ?, carbs = ?,
                   calories = ?, brand = ?, barcode = ?
                   WHERE id = ?""",
                (
                    name,
                    p.get("protein"),
                    p.get("fat"),
                    p.get("carbs"),
                    p.get("calories"),
                    p.get("brand"),
                    p.get("barcode"),
                    pid,
                ),
            )
        except sqlite3.IntegrityError:
            logger.warning("food_products conflict for id=%s — skipped", pid)
            return "skipped"
        return "applied"
    try:
        conn.execute(
            """INSERT INTO shared.food_products (name, protein, fat, carbs, calories, brand, barcode)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (
                name,
                p.get("protein", 0),
                p.get("fat", 0),
                p.get("carbs", 0),
                p.get("calories", 0),
                p.get("brand"),
                p.get("barcode"),
            ),
        )
    except sqlite3.IntegrityError as err:
        logger.warning("food_products insert skipped: %s", err)
        return "skipped"
    return "applied"


def _apply_preset(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    if not isinstance(row.payload, dict):
        return "skipped"
    uid = get_current_user_id()
    preset_id = int(parsed.local_key) if not is_cross_origin(parsed.origin) else int(row.server_id or 0)
    local = conn.execute(
        "SELECT * FROM workout_presets WHERE id = ? AND user_id = ?",
        (preset_id, uid),
    ).fetchone() if preset_id else None
    incoming = row.payload
    local_ts = str(local["updated_at"] or "") if local else ""

    if local and row.deleted_at and is_newer(str(row.deleted_at), local_ts):
        conn.execute(
            """UPDATE workout_presets SET deleted_at = ?, updated_at = ?, sync_status = 'synced',
               last_synced_revision = ? WHERE id = ?""",
            (row.deleted_at, row.deleted_at, revision, preset_id),
        )
        return "applied"

    if local and is_newer(row.updated_at, local_ts):
        from backend.services import preset_service

        exercises = incoming.get("exercises") or []
        preset_service.update_preset(
            preset_id,
            name=str(incoming.get("name") or local["name"]),
            exercises=exercises,
        )
        conn.execute(
            """UPDATE workout_presets SET updated_at = ?, sync_status = 'synced',
               last_synced_revision = ? WHERE id = ?""",
            (row.updated_at, revision, preset_id),
        )
        return "applied"

    if local:
        return "skipped"

    if row.deleted_at:
        return "skipped"

    from backend.services import preset_service

    name = str(incoming.get("name") or "Preset")
    exercises = incoming.get("exercises") or []
    try:
        created = preset_service.create_preset(name, exercises)
        new_id = int(created["id"])
        conn.execute(
            """UPDATE workout_presets SET updated_at = ?, sync_status = 'synced',
               last_synced_revision = ? WHERE id = ?""",
            (row.updated_at, revision, new_id),
        )
        return "applied"
    except ValueError:
        return "skipped"


def _apply_preferences(conn: sqlite3.Connection, row: FormaSyncJsonlRow, parsed: Any, revision: int) -> str:
    if not isinstance(row.payload, dict) or row.deleted_at:
        return "skipped"
    from backend.services import user_service

    incoming = row.payload
    if incoming.get("nutrition"):
        user_service.save_nutrition_settings(incoming["nutrition"])
    if incoming.get("analytics"):
        user_service.update_analytics_settings(incoming["analytics"])
    return "applied"


def _apply_row(conn: sqlite3.Connection, row: FormaSyncJsonlRow, revision: int) -> str:
    parsed = parse_entity_id(row.id)
    if not parsed:
        return "skipped"
    handlers = {
        "food_entries": _apply_food,
        "body_metrics": _apply_body,
        "strength_workouts": _apply_strength,
        "stretching_log": _apply_stretch,
        "bracelet_calories": _apply_bracelet,
        "hc_days": _apply_hc_day,
        "cardio_workouts": _apply_cardio,
        "food_products": _apply_product,
        "strength_presets": _apply_preset,
        "user_preferences": _apply_preferences,
    }
    handler = handlers.get(parsed.entity)
    if not handler:
        return "skipped"
    return handler(conn, row, parsed, revision)


def apply_forma_sync_package(
    zip_path: str,
    expected_sha256: str,
    manifest_revision: int,
) -> ApplyPackageResult:
    from backend.services.forma_sync.entity_mappers import sha256_file

    actual = sha256_file(zip_path)
    if actual.lower() != expected_sha256.lower():
        raise ValueError("SHA256 пакета не совпадает с manifest")

    extract_dir = tempfile.mkdtemp(prefix="forma-sync-import-")
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(extract_dir)

    meta_path = Path(extract_dir) / "meta.json"
    if not meta_path.is_file():
        raise ValueError("meta.json отсутствует в пакете")
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    if meta.get("schema_version") != 1:
        raise ValueError("Неподдерживаемая schema_version пакета")

    local_device_id = sync_meta.get_or_create_device_id()
    last_seen = sync_meta.get_last_seen_revision()
    if (
        meta.get("source") == "desktop"
        and meta.get("device_id") == local_device_id
        and manifest_revision <= last_seen
    ):
        return ApplyPackageResult(applied=0, conflicts=0, skipped=True)

    applied = 0
    conflicts = 0
    conn = get_db()
    try:
        for entity in ENTITY_FILES:
            file_path = Path(extract_dir) / "changes" / f"{entity}.jsonl"
            if not file_path.is_file():
                continue
            rows = [_parse_row(r) for r in parse_jsonl(file_path.read_text(encoding="utf-8"))]
            for row in rows:
                result = _apply_row(conn, row, manifest_revision)
                if result == "applied":
                    applied += 1
                elif result == "conflict":
                    conflicts += 1
        conn.commit()
    finally:
        conn.close()

    return ApplyPackageResult(applied=applied, conflicts=conflicts, skipped=False)
