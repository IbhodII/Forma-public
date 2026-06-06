# -*- coding: utf-8 -*-
"""Structured audit for Health Connect sync (received / saved / skipped)."""
from __future__ import annotations

import json
from typing import Any

# Skip reason codes (mobile may also send permission_missing)
SKIP_PERMISSION_MISSING = "permission_missing"
SKIP_NO_RECORDS = "no_records"
SKIP_UNSUPPORTED_TYPE = "unsupported_type"
SKIP_INVALID_MAPPING = "invalid_mapping"
SKIP_MISSING_REQUIRED_FIELDS = "missing_required_fields"
SKIP_DUPLICATE = "duplicate"
SKIP_PROTECTED_EXISTING = "protected_existing"
SKIP_NEGATIVE_VALUE = "negative_value"
SKIP_HR_WITHOUT_WORKOUT = "hr_without_workout"
SKIP_EXISTING_HEALTH_CONNECT = "existing_health_connect"

ACTION_SAVED = "saved"
ACTION_SKIPPED = "skipped"
ACTION_UPDATED = "updated"

WARNING_SYNC_LOG_TABLE_MISSING = "sync_log_table_missing"
WARNING_PERMISSION_MISSING = "permission_missing"
WARNING_NO_RECORDS = "no_records"
WARNING_RECORDS_SKIPPED = "records_skipped"
WARNING_ACCEPTED_SAVED_ZERO = "backend_accepted_but_saved_0"


def skip_entry(field: str, reason: str, detail: str | None = None) -> dict[str, Any]:
    row: dict[str, Any] = {"field": field, "reason": reason}
    if detail:
        row["detail"] = detail
    return row


def summarize_received(item: dict[str, Any]) -> dict[str, Any]:
    """Keys present in POST body for one day."""
    out: dict[str, Any] = {"date": str(item.get("date") or "")[:10]}
    if item.get("steps") is not None:
        out["steps"] = item["steps"]
    if item.get("total_calories") is not None:
        out["total_calories"] = item["total_calories"]
    elif item.get("active_calories") is not None:
        out["active_calories"] = item["active_calories"]
    if item.get("weight_kg") is not None:
        out["weight_kg"] = item["weight_kg"]
    if item.get("sleep"):
        out["sleep"] = 1
    workouts = item.get("workouts") or []
    if workouts:
        out["workouts"] = len([w for w in workouts if isinstance(w, dict)])
    hr = item.get("heart_rate_samples") or []
    if hr:
        out["heart_rate_samples"] = len(hr)
    return out


def _count_saved_fields(saved: dict[str, Any]) -> int:
    n = 0
    for key in ("steps", "total_calories", "active_calories", "weight_kg", "sleep"):
        if key in saved:
            n += 1
    if saved.get("workout_ids"):
        n += len(saved["workout_ids"])
    hr_saved = saved.get("heart_rate_samples")
    if isinstance(hr_saved, dict) and int(hr_saved.get("inserted") or 0) > 0:
        n += 1
    return n


def aggregate_batch_audit(
    items: list[dict[str, Any]],
    day_results: list[dict[str, Any]],
    errors: list[dict[str, str]],
) -> dict[str, Any]:
    received_totals: dict[str, Any] = {"days": len(items)}
    saved_totals: dict[str, Any] = {"days": len(day_results), "fields": 0}
    by_reason: dict[str, int] = {}
    warnings: list[str] = []

    for raw in items:
        rec = summarize_received(raw)
        if rec.get("steps") is not None:
            received_totals["steps_days"] = received_totals.get("steps_days", 0) + 1
        if rec.get("total_calories") is not None or rec.get("active_calories") is not None:
            received_totals["calories_days"] = received_totals.get("calories_days", 0) + 1
        if rec.get("weight_kg") is not None:
            received_totals["weight_days"] = received_totals.get("weight_days", 0) + 1
        if rec.get("sleep"):
            received_totals["sleep_days"] = received_totals.get("sleep_days", 0) + 1
        received_totals["workouts"] = received_totals.get("workouts", 0) + int(rec.get("workouts") or 0)
        received_totals["heart_rate_samples"] = received_totals.get("heart_rate_samples", 0) + int(
            rec.get("heart_rate_samples") or 0
        )

    for day in day_results:
        saved_inner = day.get("saved") or {}
        saved_totals["fields"] = int(saved_totals.get("fields", 0)) + _count_saved_fields(saved_inner)
        if day.get("workout_ids"):
            saved_totals["workouts"] = saved_totals.get("workouts", 0) + len(day["workout_ids"])
        hr_outcome = saved_inner.get("heart_rate_samples")
        if isinstance(hr_outcome, dict):
            saved_totals["heart_rate_samples_inserted"] = int(
                saved_totals.get("heart_rate_samples_inserted", 0)
            ) + int(hr_outcome.get("inserted") or 0)
        for sk in day.get("skipped") or []:
            reason = str(sk.get("reason") or "unknown")
            by_reason[reason] = by_reason.get(reason, 0) + 1

    skipped_totals = {"by_reason": by_reason, "total": sum(by_reason.values())}
    if skipped_totals["total"] > 0:
        warnings.append(WARNING_RECORDS_SKIPPED)

    received_field_days = sum(
        1
        for k in ("steps_days", "calories_days", "weight_days", "sleep_days")
        if received_totals.get(k, 0) > 0
    ) + (1 if received_totals.get("workouts", 0) > 0 else 0)
    if len(items) > 0 and received_field_days == 0 and received_totals.get("workouts", 0) == 0:
        warnings.append(WARNING_NO_RECORDS)

    if len(items) > 0 and saved_totals.get("fields", 0) == 0 and not errors:
        warnings.append(WARNING_ACCEPTED_SAVED_ZERO)

    day_summaries = [
        {
            "date": d.get("date"),
            "received": d.get("received"),
            "saved_keys": list((d.get("saved") or {}).keys()),
            "skipped_count": len(d.get("skipped") or []),
        }
        for d in day_results[:10]
    ]

    return {
        "received_totals": received_totals,
        "saved_totals": saved_totals,
        "skipped_totals": skipped_totals,
        "warnings": warnings,
        "day_summaries": day_summaries,
        "errors_count": len(errors),
    }


def truncate_json(data: Any, max_len: int = 16000) -> str:
    try:
        text = json.dumps(data, ensure_ascii=False)
    except (TypeError, ValueError):
        text = str(data)
    if len(text) <= max_len:
        return text
    return text[: max_len - 20] + "…[truncated]"


def build_analytics_usage() -> dict[str, Any]:
    from backend.services.health_connect_mapping import get_field_catalog
    from backend.services.hc_analytics_service import analytics_usage_for_field

    out: dict[str, Any] = {}
    for row in get_field_catalog():
        field = str(row.get("hc_field") or "")
        usage = analytics_usage_for_field(field)
        note = usage.get("note")
        if not note and not usage["used"]:
            note = "toggle off or stale — not used in analytics"
        out[field] = {
            "used": usage["used"],
            "enabled": usage.get("enabled", False),
            "fresh": usage.get("fresh", False),
            "note": note,
            "saved_by_backend": bool(row.get("saved_by_backend", True)),
        }
    return out
