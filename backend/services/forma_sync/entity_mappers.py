# -*- coding: utf-8 -*-
from __future__ import annotations

import hashlib
import json
import sqlite3
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync.entity_types import (
    ENTITY_FILES,
    FormaSyncEntityType,
    FormaSyncJsonlRow,
    build_entity_id,
)

SOURCE = "desktop"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def rows_to_jsonl(rows: list[FormaSyncJsonlRow]) -> str:
    if not rows:
        return ""
    return (
        "\n".join(json.dumps(r.to_dict(), ensure_ascii=False, default=str) for r in rows) + "\n"
    )


def parse_jsonl(content: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for line in content.splitlines():
        line = line.strip()
        if not line:
            continue
        out.append(json.loads(line))
    return out


def payload_equal(a: Any, b: Any) -> bool:
    return json.dumps(a, sort_keys=True, ensure_ascii=False) == json.dumps(
        b, sort_keys=True, ensure_ascii=False
    )


def is_newer(incoming: str, local: str) -> bool:
    try:
        return datetime.fromisoformat(incoming.replace("Z", "+00:00")) > datetime.fromisoformat(
            local.replace("Z", "+00:00")
        )
    except ValueError:
        return incoming > local


def row_updated_at(row: sqlite3.Row, fallback: str | None = None) -> str:
    raw = row["updated_at"] if "updated_at" in row.keys() else None
    if raw:
        return str(raw)
    return fallback or now_iso()


def food_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "date": str(row["date"])[:10],
        "phase": str(row["phase"]),
        "product_id": int(row["product_id"]),
        "quantity": float(row["quantity"]),
        "meal_type": str(row["meal_type"]),
        "notes": row["notes"],
        "protein_per100": float(row["protein_per100"] or 0),
        "fat_per100": float(row["fat_per100"] or 0),
        "carbs_per100": float(row["carbs_per100"] or 0),
        "calories_per100": float(row["calories_per100"] or 0),
    }


def body_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    skip = {"id", "date", "updated_at", "deleted_at", "sync_status", "device_id", "last_synced_revision"}
    payload: dict[str, Any] = {"date": str(row["date"])[:10]}
    for key in row.keys():
        if key in skip:
            continue
        val = row[key]
        if val is not None:
            payload[key] = val
    return payload


def stretch_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "date": str(row["date"])[:10],
        "preset_id": int(row["preset_id"]),
        "duration_minutes": row["duration_minutes"],
        "notes": row["notes"],
    }


def cardio_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    payload: dict[str, Any] = {}
    for key in row.keys():
        if key in ("updated_at", "deleted_at", "sync_status", "device_id", "last_synced_revision"):
            continue
        val = row[key]
        if val is not None:
            payload[key] = val
    if "duration_sec" in payload and payload["duration_sec"] is not None:
        sec = int(payload["duration_sec"])
        payload["duration_min"] = sec // 60
        payload["duration_sec"] = sec % 60
    return payload


def bracelet_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "date": str(row["date"])[:10],
        "total_calories": int(row["total_calories"]),
    }


def aggregate_strength_session(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
    user_id: int,
) -> dict[str, Any]:
    rows = conn.execute(
        """SELECT * FROM strength_workouts
           WHERE user_id = ? AND date = ? AND workout_title = ?
           ORDER BY COALESCE(order_index, 0), set_number, id""",
        (user_id, date_str, workout_title),
    ).fetchall()
    if not rows:
        return {}
    is_circuit = bool(int(rows[0]["is_circuit"] or 0))
    avg_hr = rows[0]["avg_hr"]
    calories_chest = rows[0]["calories_chest"]
    calories_watch = rows[0]["calories_watch"]
    preset_id = rows[0]["preset_id"]
    payload: dict[str, Any] = {
        "date": date_str,
        "workout_title": workout_title,
        "is_circuit": is_circuit,
        "avg_hr": avg_hr,
        "calories_chest": calories_chest,
        "calories_watch": calories_watch,
        "preset_id": preset_id,
    }
    if is_circuit:
        payload["sets"] = [
            {
                "exercise": str(r["exercise"]),
                "weight": float(r["weight"]) if r["weight"] is not None else None,
                "reps": int(r["reps"] or 0),
                "is_warmup": bool(int(r["is_warmup"] or 0)),
                "is_bodyweight": bool(int(r["is_bodyweight"] or 0)),
                "duration_sec": r["duration_sec"],
            }
            for r in rows
        ]
    else:
        by_ex: dict[str, list[sqlite3.Row]] = {}
        for r in rows:
            ex = str(r["exercise"])
            by_ex.setdefault(ex, []).append(r)
        exercises: list[dict[str, Any]] = []
        for ex, sets in by_ex.items():
            working = [s for s in sets if not int(s["is_warmup"] or 0)]
            src = working or sets
            is_bw = bool(int(src[0]["is_bodyweight"] or 0))
            exercises.append(
                {
                    "exercise": ex,
                    "weight": float(src[0]["weight"]) if src[0]["weight"] is not None else None,
                    "reps_list": [int(s["reps"] or 0) for s in src if int(s["reps"] or 0) > 0],
                    "is_bodyweight": is_bw,
                }
            )
        payload["exercises"] = exercises
    return payload


def session_updated_at(rows: list[sqlite3.Row]) -> str:
    ts = ""
    for r in rows:
        val = row_updated_at(r)
        if not ts or is_newer(val, ts):
            ts = val
    return ts or now_iso()


def product_row_to_payload(row: sqlite3.Row) -> dict[str, Any]:
    skip = {"updated_at", "deleted_at", "sync_status", "device_id", "last_synced_revision"}
    return {k: row[k] for k in row.keys() if k not in skip and row[k] is not None}


def build_user_preferences_payload(conn: sqlite3.Connection) -> dict[str, Any]:
    from backend.services import user_service

    return {
        "nutrition": user_service.get_nutrition_settings(),
        "analytics": user_service.get_analytics_settings(),
    }


@dataclass
class PackageMeta:
    schema_version: int
    device_id: str
    source: str
    created_at: str
    base_revision: int

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "device_id": self.device_id,
            "source": self.source,
            "created_at": self.created_at,
            "base_revision": self.base_revision,
        }


def empty_jsonl_map() -> dict[FormaSyncEntityType, list[FormaSyncJsonlRow]]:
    return {entity: [] for entity in ENTITY_FILES}
