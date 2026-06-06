# -*- coding: utf-8 -*-
"""
Импорт Health Connect из mobile debug JSON (LocalHcDebugSnapshot).

Формат: JSON с телефона «Скопировать debug JSON» (HC диагностика) или файл с ключом items.

Запуск из корня проекта:
    .\\venv\\Scripts\\python.exe scripts/import_hc_mobile_snapshot.py data/imports/hc_snapshot.json
    .\\venv\\Scripts\\python.exe scripts/import_hc_mobile_snapshot.py snapshot.json --user-id 1 --dry-run
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.database.request_context import set_current_user_id
from backend.services.health_connect_sync_service import sync_health_connect_batch


def _items_from_snapshot(data: dict[str, Any]) -> list[dict[str, Any]]:
    if "items" in data and isinstance(data["items"], list):
        return [dict(x) for x in data["items"] if isinstance(x, dict)]

    prepared = data.get("prepared_summary") or {}
    preview = prepared.get("preview_days")
    if isinstance(preview, list) and preview:
        return [dict(day) for day in preview if isinstance(day, dict) and day.get("date")]

    raise ValueError(
        "Не найдены данные для импорта: нужен items[] или prepared_summary.preview_days[]"
    )


def _build_mobile_audit(data: dict[str, Any]) -> dict[str, Any] | None:
    if data.get("permissions_detail") or data.get("raw_summary"):
        return {
            "permissions": (data.get("permissions_detail") or {}).get("permissions"),
            "permissions_detail": data.get("permissions_detail"),
            "raw_summary": data.get("raw_summary"),
            "prepared_summary": data.get("prepared_summary"),
            "probed_at": data.get("probed_at"),
            "range": data.get("range"),
            "import_source": "scripts/import_hc_mobile_snapshot.py",
        }
    return None


def main() -> int:
    parser = argparse.ArgumentParser(description="Import Health Connect mobile debug JSON into workouts.db")
    parser.add_argument("json_path", type=Path, help="Path to mobile HC debug JSON file")
    parser.add_argument("--user-id", type=int, default=1, help="User id (default: 1)")
    parser.add_argument("--dry-run", action="store_true", help="Print payload only, do not save")
    args = parser.parse_args()

    path = args.json_path
    if not path.is_file():
        print(f"File not found: {path}", file=sys.stderr)
        return 1

    raw_text = path.read_text(encoding="utf-8")
    data = json.loads(raw_text)
    if not isinstance(data, dict):
        print("JSON root must be an object", file=sys.stderr)
        return 1

    items = _items_from_snapshot(data)
    if not items:
        print("Empty items list", file=sys.stderr)
        return 1

    mobile_audit = _build_mobile_audit(data)
    device_label = str(data.get("device") or "mobile_snapshot_import")

    print(f"Days to import: {len(items)}")
    for day in items:
        keys = [k for k in day.keys() if k != "date"]
        print(f"  {day.get('date')}: {', '.join(keys) or '(empty)'}")

    if args.dry_run:
        print(json.dumps({"items": items, "device_label": device_label}, ensure_ascii=False, indent=2))
        return 0

    set_current_user_id(args.user_id)
    result = sync_health_connect_batch(
        items,
        mobile_audit=mobile_audit,
        device_label=device_label,
    )

    print(json.dumps(
        {
            "ok": result.get("ok"),
            "status": result.get("status"),
            "received_days": result.get("received_days"),
            "saved": result.get("saved"),
            "skipped": result.get("skipped"),
            "warnings": result.get("warnings"),
            "sync_log_id": result.get("sync_log_id"),
            "errors": result.get("errors"),
        },
        ensure_ascii=False,
        indent=2,
    ))
    return 0 if result.get("ok") else 2


if __name__ == "__main__":
    raise SystemExit(main())
