# -*- coding: utf-8 -*-
"""Unified workout data source taxonomy for resolver v1."""
from __future__ import annotations

import json
from typing import Any

from utils.constants import (
    CARDIO_SOURCE_EXCEL,
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_HEALTH_CONNECT,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_POLAR,
)

# Metric slots tracked per canonical workout
METRIC_HR = "hr"
METRIC_GPS = "gps"
METRIC_CALORIES = "calories"
METRIC_DISTANCE = "distance"
METRIC_DURATION = "duration"
METRIC_SENSORS = "sensors"
METRIC_METADATA = "metadata"

METRICS_ALL = (
    METRIC_HR,
    METRIC_GPS,
    METRIC_CALORIES,
    METRIC_DISTANCE,
    METRIC_DURATION,
    METRIC_SENSORS,
    METRIC_METADATA,
)

SOURCE_MANUAL = "manual"
SOURCE_POLAR = "polar"
SOURCE_HEALTH_CONNECT = "health_connect"
SOURCE_FIT_IMPORT = "fit_import"
SOURCE_TCX_IMPORT = "tcx_import"
SOURCE_GPX_IMPORT = "gpx_import"
SOURCE_GARMIN = "garmin"
SOURCE_PHONE = "phone"
SOURCE_WATCH = "watch"
SOURCE_EXCEL = "excel"
SOURCE_GENERATED = "generated"

PROVIDER_POLAR_FLOW = "polar_flow"
PROVIDER_HC = "health_connect"
PROVIDER_COOSPO_FIT = "coospo_fit"
PROVIDER_GARMIN_EXPORT = "garmin_export"
PROVIDER_MI_FITNESS = "mi_fitness"
PROVIDER_XIAOMI = "xiaomi"
PROVIDER_MANUAL_FORM = "manual_form"
PROVIDER_UNKNOWN = "unknown"

ORIGIN_MANUAL = "manual"
ORIGIN_IMPORTED = "imported"
ORIGIN_SYNCED = "synced"
ORIGIN_GENERATED = "generated"

CONFIDENCE_HIGH = "high"
CONFIDENCE_MEDIUM = "medium"
CONFIDENCE_LOW = "low"

DEFAULT_SOURCE_PRIORITY_PREFS: dict[str, list[str]] = {
    "hr": [SOURCE_POLAR, SOURCE_FIT_IMPORT, SOURCE_TCX_IMPORT, SOURCE_GPX_IMPORT, SOURCE_HEALTH_CONNECT, SOURCE_WATCH],
    "workout_calories": [SOURCE_POLAR, SOURCE_FIT_IMPORT, SOURCE_HEALTH_CONNECT, SOURCE_WATCH],
    "steps": [SOURCE_HEALTH_CONNECT, SOURCE_PHONE],
    "weight": [SOURCE_MANUAL, SOURCE_HEALTH_CONNECT],
    "gps": [SOURCE_FIT_IMPORT, SOURCE_POLAR, SOURCE_GPX_IMPORT, SOURCE_TCX_IMPORT],
    "metadata": [SOURCE_MANUAL, SOURCE_FIT_IMPORT, SOURCE_POLAR, SOURCE_HEALTH_CONNECT, SOURCE_EXCEL],
}

PROTECTED_METADATA_SOURCES = frozenset({
    SOURCE_MANUAL,
    SOURCE_FIT_IMPORT,
    SOURCE_POLAR,
    SOURCE_EXCEL,
})


def default_priority_prefs() -> dict[str, list[str]]:
    return {k: list(v) for k, v in DEFAULT_SOURCE_PRIORITY_PREFS.items()}


def parse_priority_prefs(raw: str | None) -> dict[str, list[str]]:
    base = default_priority_prefs()
    if not raw:
        return base
    try:
        data = json.loads(raw)
    except (json.JSONDecodeError, TypeError):
        return base
    if not isinstance(data, dict):
        return base
    out = dict(base)
    for key, val in data.items():
        if key in out and isinstance(val, list):
            cleaned = [str(v) for v in val if str(v)]
            if cleaned:
                out[key] = cleaned
    return out


def serialize_priority_prefs(prefs: dict[str, list[str]]) -> str:
    merged = default_priority_prefs()
    for key, val in prefs.items():
        if key in merged and isinstance(val, list) and val:
            merged[key] = [str(v) for v in val]
    return json.dumps(merged, ensure_ascii=False)


def map_legacy_data_source(data_source: str | None) -> tuple[str, str, str]:
    """Map cardio_workouts.data_source → (source_type, source_provider, origin)."""
    src = str(data_source or CARDIO_SOURCE_MANUAL).strip().lower()
    mapping: dict[str, tuple[str, str, str]] = {
        CARDIO_SOURCE_MANUAL: (SOURCE_MANUAL, PROVIDER_MANUAL_FORM, ORIGIN_MANUAL),
        CARDIO_SOURCE_FIT: (SOURCE_FIT_IMPORT, PROVIDER_COOSPO_FIT, ORIGIN_IMPORTED),
        "import_fit": (SOURCE_FIT_IMPORT, PROVIDER_COOSPO_FIT, ORIGIN_IMPORTED),
        CARDIO_SOURCE_POLAR: (SOURCE_POLAR, PROVIDER_POLAR_FLOW, ORIGIN_SYNCED),
        CARDIO_SOURCE_HEALTH_CONNECT: (SOURCE_HEALTH_CONNECT, PROVIDER_HC, ORIGIN_SYNCED),
        CARDIO_SOURCE_EXCEL: (SOURCE_EXCEL, PROVIDER_UNKNOWN, ORIGIN_IMPORTED),
        "import_tcx": (SOURCE_TCX_IMPORT, PROVIDER_GARMIN_EXPORT, ORIGIN_IMPORTED),
        "import_gpx": (SOURCE_GPX_IMPORT, PROVIDER_GARMIN_EXPORT, ORIGIN_IMPORTED),
    }
    return mapping.get(src, (SOURCE_MANUAL, PROVIDER_UNKNOWN, ORIGIN_MANUAL))


def gps_track_source_to_type(gps_source: str | None) -> str:
    src = str(gps_source or "").strip().lower()
    if src in ("fit_coospo", "import_fit"):
        return SOURCE_FIT_IMPORT
    if src in ("polar_historical", "polar"):
        return SOURCE_POLAR
    if src == "import_tcx":
        return SOURCE_TCX_IMPORT
    if src == "import_gpx":
        return SOURCE_GPX_IMPORT
    return SOURCE_POLAR if "polar" in src else SOURCE_FIT_IMPORT if "fit" in src else SOURCE_MANUAL


def source_type_label(source_type: str) -> str:
    labels = {
        SOURCE_MANUAL: "Manual",
        SOURCE_POLAR: "Polar",
        SOURCE_HEALTH_CONNECT: "HC",
        SOURCE_FIT_IMPORT: "FIT",
        SOURCE_TCX_IMPORT: "TCX",
        SOURCE_GPX_IMPORT: "GPX",
        SOURCE_GARMIN: "Garmin",
        SOURCE_PHONE: "Phone",
        SOURCE_WATCH: "Watch",
        SOURCE_EXCEL: "Excel",
        SOURCE_GENERATED: "Generated",
    }
    return labels.get(source_type, source_type)


def contribution_snapshot(**kwargs: Any) -> str:
    clean = {k: v for k, v in kwargs.items() if v is not None}
    return json.dumps(clean, ensure_ascii=False)
