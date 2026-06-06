# -*- coding: utf-8 -*-
"""Unified source resolver — contributions, priorities, conflicts (v1)."""
from __future__ import annotations

import json
import sqlite3
from datetime import datetime
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.source_taxonomy import (
    CONFIDENCE_HIGH,
    METRIC_CALORIES,
    METRIC_DISTANCE,
    METRIC_DURATION,
    METRIC_GPS,
    METRIC_HR,
    METRIC_METADATA,
    METRIC_SENSORS,
    METRICS_ALL,
    PROTECTED_METADATA_SOURCES,
    SOURCE_HEALTH_CONNECT,
    SOURCE_MANUAL,
    contribution_snapshot,
    default_priority_prefs,
    map_legacy_data_source,
    parse_priority_prefs,
    serialize_priority_prefs,
    source_type_label,
)
from utils.constants import (
    CARDIO_SOURCE_EXCEL,
    CARDIO_SOURCE_FIT,
    CARDIO_SOURCE_MANUAL,
    CARDIO_SOURCE_POLAR,
)

CALORIES_CONFLICT_THRESHOLD = 25


def _now_iso() -> str:
    return datetime.now().isoformat(timespec="seconds")


def get_user_priority_prefs(conn: sqlite3.Connection | None = None) -> dict[str, list[str]]:
    own = conn is None
    if own:
        conn = get_db()
    try:
        uid = get_current_user_id()
        row = conn.execute(
            "SELECT source_priority_prefs FROM user_profile WHERE id = ?",
            (uid,),
        ).fetchone()
        raw = row[0] if row else None
    finally:
        if own:
            conn.close()
    return parse_priority_prefs(raw)


def save_user_priority_prefs(prefs: dict[str, list[str]]) -> dict[str, list[str]]:
    merged = parse_priority_prefs(serialize_priority_prefs(prefs))
    uid = get_current_user_id()
    conn = get_db()
    try:
        conn.execute(
            "UPDATE user_profile SET source_priority_prefs = ? WHERE id = ?",
            (serialize_priority_prefs(merged), uid),
        )
        conn.commit()
    finally:
        conn.close()
    return merged


def _prefs_key_for_metric(metric: str) -> str:
    if metric == "calories":
        return "workout_calories"
    return metric


def _pick_effective_source(
    metric: str,
    contributions: list[dict[str, Any]],
    prefs: dict[str, list[str]],
) -> str | None:
    prefs_key = _prefs_key_for_metric(metric)
    order = prefs.get(prefs_key) or default_priority_prefs().get(prefs_key, [])
    by_type = {str(c["source_type"]): c for c in contributions if c.get("metric") == metric}
    for src in order:
        if src in by_type:
            return src
    if by_type:
        return next(iter(by_type.keys()))
    return None


def register_contribution(
    workout_id: int,
    metric: str,
    *,
    source_type: str,
    source_provider: str | None = None,
    origin: str = "imported",
    confidence: str | None = None,
    external_ref: str | None = None,
    value_snapshot: dict[str, Any] | None = None,
    conn: sqlite3.Connection | None = None,
) -> None:
    if metric not in METRICS_ALL:
        return
    uid = get_current_user_id()
    snap = json.dumps(value_snapshot, ensure_ascii=False) if value_snapshot else None
    ext = external_ref or ""
    own = conn is None
    if own:
        conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO workout_source_contributions (
                user_id, cardio_workout_id, metric, source_type, source_provider,
                origin, confidence, external_ref, value_snapshot_json, is_effective, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)
            ON CONFLICT(cardio_workout_id, metric, source_type, external_ref) DO UPDATE SET
                source_provider = excluded.source_provider,
                origin = excluded.origin,
                confidence = COALESCE(excluded.confidence, confidence),
                value_snapshot_json = COALESCE(excluded.value_snapshot_json, value_snapshot_json),
                created_at = excluded.created_at
            """,
            (
                uid,
                int(workout_id),
                metric,
                source_type,
                source_provider,
                origin,
                confidence,
                ext,
                snap,
                _now_iso(),
            ),
        )
        _refresh_effective_flags(conn, int(workout_id))
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


def _refresh_effective_flags(conn: sqlite3.Connection, workout_id: int) -> None:
    uid = get_current_user_id()
    prefs = get_user_priority_prefs(conn)
    rows = conn.execute(
        """
        SELECT id, metric, source_type FROM workout_source_contributions
        WHERE user_id = ? AND cardio_workout_id = ?
        """,
        (uid, workout_id),
    ).fetchall()
    by_metric: dict[str, list[dict[str, Any]]] = {}
    for r in rows:
        by_metric.setdefault(str(r[1]), []).append(
            {"id": int(r[0]), "metric": str(r[1]), "source_type": str(r[2])}
        )
    for metric, contribs in by_metric.items():
        winner = _pick_effective_source(metric, contribs, prefs)
        for c in contribs:
            conn.execute(
                "UPDATE workout_source_contributions SET is_effective = ? WHERE id = ?",
                (1 if c["source_type"] == winner else 0, c["id"]),
            )


def contribution_exists_for_ref(workout_id: int, external_ref: str) -> bool:
    if not external_ref:
        return False
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT 1 FROM workout_source_contributions
            WHERE user_id = ? AND cardio_workout_id = ? AND external_ref = ?
            LIMIT 1
            """,
            (uid, int(workout_id), external_ref),
        ).fetchone()
    finally:
        conn.close()
    return row is not None


def link_workouts(
    canonical_id: int,
    linked_id: int,
    reason: str,
    confidence: str = CONFIDENCE_HIGH,
    conn: sqlite3.Connection | None = None,
) -> None:
    if canonical_id == linked_id:
        return
    uid = get_current_user_id()
    own = conn is None
    if own:
        conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO workout_source_links (
                user_id, canonical_workout_id, linked_workout_id, link_reason, confidence, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(canonical_workout_id, linked_workout_id) DO UPDATE SET
                link_reason = excluded.link_reason,
                confidence = excluded.confidence
            """,
            (uid, int(canonical_id), int(linked_id), reason, confidence, _now_iso()),
        )
        if own:
            conn.commit()
    finally:
        if own:
            conn.close()


def is_linked_duplicate(workout_id: int) -> bool:
    uid = get_current_user_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT 1 FROM workout_source_links
            WHERE user_id = ? AND linked_workout_id = ?
            LIMIT 1
            """,
            (uid, int(workout_id)),
        ).fetchone()
    finally:
        conn.close()
    return row is not None


def should_block_hc_write(
    date: str,
    workout_type: str,
    metric: str = METRIC_METADATA,
) -> tuple[bool, int | None, str | None]:
    """Return (blocked, existing_workout_id, reason)."""
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id, data_source FROM cardio_workouts
            WHERE user_id = ? AND date = ? AND type = ?
            ORDER BY id DESC
            """,
            (uid, str(date)[:10], workout_type),
        ).fetchall()
    finally:
        conn.close()

    protected_legacy = frozenset({
        CARDIO_SOURCE_FIT,
        CARDIO_SOURCE_POLAR,
        CARDIO_SOURCE_MANUAL,
        CARDIO_SOURCE_EXCEL,
    })

    for row in rows:
        wid = int(row[0])
        src = str(row[1] or CARDIO_SOURCE_MANUAL)
        stype, _, _ = map_legacy_data_source(src)
        if metric == METRIC_METADATA and (stype in PROTECTED_METADATA_SOURCES or src in protected_legacy):
            return True, wid, f"protected_source={src}"
        if src == SOURCE_HEALTH_CONNECT or src == "health_connect":
            return True, wid, "existing_health_connect"

    return False, None, None


def _load_contributions(
    workout_id: int,
    conn: sqlite3.Connection | None = None,
) -> list[dict[str, Any]]:
    uid = get_current_user_id()
    own_conn = conn is None
    if own_conn:
        conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT metric, source_type, source_provider, origin, confidence,
                   external_ref, value_snapshot_json, is_effective
            FROM workout_source_contributions
            WHERE user_id = ? AND cardio_workout_id = ?
            ORDER BY metric, is_effective DESC, id ASC
            """,
            (uid, int(workout_id)),
        ).fetchall()
    finally:
        if own_conn:
            conn.close()
    out: list[dict[str, Any]] = []
    for r in rows:
        snap = None
        if r[6]:
            try:
                snap = json.loads(r[6])
            except json.JSONDecodeError:
                snap = None
        out.append(
            {
                "metric": str(r[0]),
                "source_type": str(r[1]),
                "source_provider": r[2],
                "origin": str(r[3]),
                "confidence": r[4],
                "external_ref": r[5],
                "value_snapshot": snap,
                "is_effective": bool(r[7]),
            }
        )
    return out


def _parse_snapshot_calories(snap: dict[str, Any] | None) -> int | None:
    if not snap:
        return None
    for key in ("calories", "calories_chest", "calories_watch"):
        val = snap.get(key)
        if val is not None:
            try:
                return int(val)
            except (TypeError, ValueError):
                continue
    return None


def detect_conflicts(workout_id: int) -> list[dict[str, Any]]:
    contribs = _load_contributions(workout_id)
    conflicts: list[dict[str, Any]] = []
    by_metric: dict[str, list[dict[str, Any]]] = {}
    for c in contribs:
        by_metric.setdefault(c["metric"], []).append(c)

    for metric, items in by_metric.items():
        if metric != METRIC_CALORIES or len(items) < 2:
            continue
        values: list[tuple[str, int]] = []
        for it in items:
            cal = _parse_snapshot_calories(it.get("value_snapshot"))
            if cal is not None:
                values.append((it["source_type"], cal))
        if len(values) < 2:
            continue
        vals = [v for _, v in values]
        if max(vals) - min(vals) >= CALORIES_CONFLICT_THRESHOLD:
            conflicts.append(
                {
                    "metric": metric,
                    "message": "Калории различаются между источниками",
                    "values": [
                        {"source_type": st, "label": source_type_label(st), "value": v}
                        for st, v in values
                    ],
                }
            )
    return conflicts


def resolve_workout_view(workout_id: int) -> dict[str, Any]:
    conn = get_db()
    try:
        uid = get_current_user_id()
        row = conn.execute(
            """
            SELECT id, data_source FROM cardio_workouts WHERE id = ? AND user_id = ?
            """,
            (int(workout_id), uid),
        ).fetchone()
        if not row:
            return {}
        primary_type, primary_provider, _ = map_legacy_data_source(row[1])
        contribs = _load_contributions(workout_id, conn=conn)
        prefs = get_user_priority_prefs(conn)

        metrics_out: list[dict[str, Any]] = []
        for metric in METRICS_ALL:
            metric_items = [c for c in contribs if c["metric"] == metric]
            if not metric_items:
                continue
            effective = _pick_effective_source(metric, metric_items, prefs)
            fallbacks = [
                c["source_type"]
                for c in metric_items
                if c["source_type"] != effective
            ]
            effective_row = next(
                (c for c in metric_items if c["source_type"] == effective),
                metric_items[0],
            )
            metrics_out.append(
                {
                    "metric": metric,
                    "effective_source": effective,
                    "effective_label": source_type_label(effective or ""),
                    "fallback_sources": fallbacks,
                    "fallback_labels": [source_type_label(s) for s in fallbacks],
                    "is_fallback": len(fallbacks) > 0,
                    "source_provider": effective_row.get("source_provider"),
                }
            )

        links = conn.execute(
            """
            SELECT linked_workout_id, link_reason, confidence
            FROM workout_source_links
            WHERE user_id = ? AND canonical_workout_id = ?
            """,
            (uid, int(workout_id)),
        ).fetchall()
        linked_sources = [
            {
                "workout_id": int(l[0]),
                "link_reason": str(l[1]),
                "confidence": l[2],
            }
            for l in links
        ]

        conflicts = detect_conflicts(workout_id)
        return {
            "workout_id": int(workout_id),
            "primary_source_type": primary_type,
            "primary_provider": primary_provider,
            "primary_label": source_type_label(primary_type),
            "metrics": metrics_out,
            "linked_sources": linked_sources,
            "conflicts": conflicts,
            "has_conflicts": len(conflicts) > 0,
        }
    finally:
        conn.close()


def resolve_source_summary(workout_id: int) -> dict[str, Any]:
    view = resolve_workout_view(workout_id)
    if not view:
        return {}
    hr = next((m for m in view.get("metrics", []) if m["metric"] == METRIC_HR), None)
    cal = next((m for m in view.get("metrics", []) if m["metric"] == METRIC_CALORIES), None)
    gps = next((m for m in view.get("metrics", []) if m["metric"] == METRIC_GPS), None)
    return {
        "primary_label": view.get("primary_label"),
        "primary_source_type": view.get("primary_source_type"),
        "hr_label": hr.get("effective_label") if hr else None,
        "hr_fallback": hr.get("is_fallback") if hr else False,
        "calories_label": cal.get("effective_label") if cal else None,
        "calories_fallback": cal.get("is_fallback") if cal else False,
        "gps_label": gps.get("effective_label") if gps else None,
        "has_conflicts": view.get("has_conflicts", False),
    }


def register_contribution_from_legacy_row(
    conn: sqlite3.Connection,
    workout_id: int,
) -> None:
    """Backfill-style registration from cardio_workouts row."""
    uid = get_current_user_id()
    row = conn.execute(
        """
        SELECT date, type, distance_km, duration_sec, avg_hr, max_hr,
               calories, calories_chest, calories_watch, data_source, start_time
        FROM cardio_workouts WHERE id = ? AND user_id = ?
        """,
        (int(workout_id), uid),
    ).fetchone()
    if not row:
        return

    stype, provider, origin = map_legacy_data_source(row[9])
    snap_base = {
        "date": row[0],
        "type": row[1],
        "distance_km": row[2],
        "duration_sec": row[3],
        "avg_hr": row[4],
        "max_hr": row[5],
        "calories": row[6],
        "calories_chest": row[7],
        "calories_watch": row[8],
        "start_time": row[10],
    }

    register_contribution(
        workout_id,
        METRIC_METADATA,
        source_type=stype,
        source_provider=provider,
        origin=origin,
        value_snapshot=snap_base,
        conn=conn,
    )

    hr_row = conn.execute(
        "SELECT 1 FROM workout_heart_rate WHERE cardio_workout_id = ? LIMIT 1",
        (int(workout_id),),
    ).fetchone()
    if hr_row:
        gps_src = conn.execute(
            "SELECT source FROM gps_tracks WHERE cardio_workout_id = ? LIMIT 1",
            (int(workout_id),),
        ).fetchone()
        hr_type = stype
        if gps_src:
            from backend.services.source_taxonomy import gps_track_source_to_type

            hr_type = gps_track_source_to_type(gps_src[0])
        register_contribution(
            workout_id,
            METRIC_HR,
            source_type=hr_type,
            source_provider=provider,
            origin=origin,
            value_snapshot={"avg_hr": row[4], "max_hr": row[5]},
            conn=conn,
        )

    if row[2] is not None:
        register_contribution(
            workout_id,
            METRIC_DISTANCE,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            value_snapshot={"distance_km": row[2]},
            conn=conn,
        )
    if row[3] is not None:
        register_contribution(
            workout_id,
            METRIC_DURATION,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            value_snapshot={"duration_sec": row[3]},
            conn=conn,
        )
    cal = row[7] or row[8] or row[6]
    if cal is not None:
        register_contribution(
            workout_id,
            METRIC_CALORIES,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            value_snapshot={
                "calories": cal,
                "calories_chest": row[7],
                "calories_watch": row[8],
            },
            conn=conn,
        )

    gps_row = conn.execute(
        "SELECT source FROM gps_tracks WHERE cardio_workout_id = ? LIMIT 1",
        (int(workout_id),),
    ).fetchone()
    if gps_row:
        from backend.services.source_taxonomy import gps_track_source_to_type

        gtype = gps_track_source_to_type(gps_row[0])
        register_contribution(
            workout_id,
            METRIC_GPS,
            source_type=gtype,
            source_provider=provider,
            origin=origin,
            value_snapshot={"gps_source": gps_row[0]},
            conn=conn,
        )

    sensor_row = conn.execute(
        "SELECT 1 FROM workout_sensors WHERE cardio_workout_id = ? LIMIT 1",
        (int(workout_id),),
    ).fetchone()
    if sensor_row:
        register_contribution(
            workout_id,
            METRIC_SENSORS,
            source_type=SOURCE_MANUAL if stype == SOURCE_MANUAL else stype,
            source_provider=provider,
            origin=origin,
            conn=conn,
        )


def register_manual_workout(workout_id: int, payload: dict[str, Any]) -> None:
    register_contribution(
        workout_id,
        METRIC_METADATA,
        source_type=SOURCE_MANUAL,
        source_provider="manual_form",
        origin="manual",
        value_snapshot={
            "date": payload.get("date"),
            "type": payload.get("type"),
            "distance_km": payload.get("distance_km"),
            "duration_sec": payload.get("duration_sec"),
        },
    )
    cal = payload.get("calories_chest") or payload.get("calories_watch")
    if cal is not None:
        register_contribution(
            workout_id,
            METRIC_CALORIES,
            source_type=SOURCE_MANUAL,
            source_provider="manual_form",
            origin="manual",
            value_snapshot={
                "calories": cal,
                "calories_chest": payload.get("calories_chest"),
                "calories_watch": payload.get("calories_watch"),
            },
        )


def register_polar_attach(
    workout_id: int,
    *,
    avg_hr: int | None,
    max_hr: int | None,
    calories: int | None,
    gps_saved: bool,
    external_ref: str | None = None,
) -> None:
    snap_hr = {"avg_hr": avg_hr, "max_hr": max_hr}
    register_contribution(
        workout_id,
        METRIC_HR,
        source_type="polar",
        source_provider="polar_flow",
        origin="synced",
        external_ref=external_ref,
        value_snapshot=snap_hr,
    )
    if calories is not None:
        register_contribution(
            workout_id,
            METRIC_CALORIES,
            source_type="polar",
            source_provider="polar_flow",
            origin="synced",
            external_ref=external_ref,
            value_snapshot={"calories": calories, "calories_chest": calories},
        )
    if gps_saved:
        register_contribution(
            workout_id,
            METRIC_GPS,
            source_type="polar",
            source_provider="polar_flow",
            origin="synced",
            external_ref=external_ref,
            value_snapshot={"gps_source": "polar_historical"},
        )


def register_fit_import(
    workout_id: int,
    metadata: dict[str, Any],
    *,
    has_hr: bool,
    has_gps: bool,
    has_sensors: bool,
    file_name: str | None = None,
) -> None:
    stype, provider, origin = map_legacy_data_source("fit_coospo")
    ext = file_name or metadata.get("start_time")
    register_contribution(
        workout_id,
        METRIC_METADATA,
        source_type=stype,
        source_provider=provider,
        origin=origin,
        external_ref=ext,
        value_snapshot=metadata,
    )
    if has_hr:
        register_contribution(
            workout_id,
            METRIC_HR,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            external_ref=ext,
            value_snapshot={"avg_hr": metadata.get("avg_hr"), "max_hr": metadata.get("max_hr")},
        )
    if has_gps:
        register_contribution(
            workout_id,
            METRIC_GPS,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            external_ref=ext,
            value_snapshot={"gps_source": "fit_coospo"},
        )
    cal = metadata.get("calories_chest") or metadata.get("calories_watch")
    if cal is not None:
        register_contribution(
            workout_id,
            METRIC_CALORIES,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            external_ref=ext,
            value_snapshot={"calories": cal},
        )
    if has_sensors:
        register_contribution(
            workout_id,
            METRIC_SENSORS,
            source_type=stype,
            source_provider=provider,
            origin=origin,
            external_ref=ext,
        )


def register_health_connect_workout(
    workout_id: int,
    workout: dict[str, Any],
    *,
    external_ref: str | None = None,
) -> None:
    register_contribution(
        workout_id,
        METRIC_METADATA,
        source_type=SOURCE_HEALTH_CONNECT,
        source_provider="health_connect",
        origin="synced",
        external_ref=external_ref,
        value_snapshot={
            "date": workout.get("date"),
            "duration_sec": workout.get("duration_sec"),
            "distance_m": workout.get("distance_m"),
        },
    )
    cal = workout.get("calories_kcal")
    if cal is not None:
        register_contribution(
            workout_id,
            METRIC_CALORIES,
            source_type=SOURCE_HEALTH_CONNECT,
            source_provider="health_connect",
            origin="synced",
            external_ref=external_ref,
            value_snapshot={"calories": int(cal)},
        )
    if workout.get("avg_hr") or workout.get("heart_rate_samples"):
        register_contribution(
            workout_id,
            METRIC_HR,
            source_type=SOURCE_HEALTH_CONNECT,
            source_provider="health_connect",
            origin="synced",
            external_ref=external_ref,
            value_snapshot={
                "avg_hr": workout.get("avg_hr"),
                "max_hr": workout.get("max_hr"),
            },
        )


# --- Duplicate detection (used by tests and future resolver linking) ---

DURATION_TOLERANCE_SEC = 120
DISTANCE_TOLERANCE_KM = 0.15
DISTANCE_TOLERANCE_RATIO = 0.03
HR_TOLERANCE_BPM = 5


def _distance_close(a: float | None, b: float | None) -> bool:
    if a is None or b is None:
        return False
    tol = max(DISTANCE_TOLERANCE_KM, abs(a) * DISTANCE_TOLERANCE_RATIO)
    return abs(float(a) - float(b)) <= tol


def find_duplicate_candidates(
    *,
    date: str,
    workout_type: str,
    start_time: str | None = None,
    duration_sec: int | None = None,
    distance_km: float | None = None,
    avg_hr: int | None = None,
    external_ref: str | None = None,
) -> list[dict[str, Any]]:
    """Return existing cardio rows that may match the incoming workout."""
    from backend.services.source_taxonomy import (
        CONFIDENCE_HIGH,
        CONFIDENCE_LOW,
        CONFIDENCE_MEDIUM,
    )

    uid = get_current_user_id()
    date_str = str(date)[:10]
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT id, date, type, start_time, duration_sec, distance_km, avg_hr, data_source
            FROM cardio_workouts
            WHERE user_id = ? AND date = ? AND type = ?
            ORDER BY id ASC
            """,
            (uid, date_str, workout_type),
        ).fetchall()
    finally:
        conn.close()

    candidates: list[dict[str, Any]] = []
    for row in rows:
        reasons: list[str] = []
        confidence = CONFIDENCE_LOW
        wid = int(row[0])
        row_start = row[3]
        row_dur = int(row[4] or 0)
        row_dist = float(row[5]) if row[5] is not None else None
        row_hr = int(row[6]) if row[6] is not None else None

        if external_ref:
            conn = get_db()
            try:
                dup = conn.execute(
                    """
                    SELECT 1 FROM workout_source_contributions
                    WHERE user_id = ? AND cardio_workout_id = ? AND external_ref = ?
                    LIMIT 1
                    """,
                    (uid, wid, external_ref),
                ).fetchone()
            finally:
                conn.close()
            if dup:
                reasons.append("same_external_ref")
                confidence = CONFIDENCE_HIGH

        if start_time and row_start and str(start_time) == str(row_start):
            reasons.append("same_start_time")
            confidence = CONFIDENCE_HIGH

        if duration_sec and row_dur and abs(int(duration_sec) - row_dur) <= DURATION_TOLERANCE_SEC:
            reasons.append("same_duration")
            if confidence != CONFIDENCE_HIGH:
                confidence = CONFIDENCE_MEDIUM

        if _distance_close(distance_km, row_dist):
            reasons.append("same_distance")
            if confidence != CONFIDENCE_HIGH:
                confidence = CONFIDENCE_MEDIUM

        if (
            avg_hr
            and row_hr
            and abs(int(avg_hr) - row_hr) <= HR_TOLERANCE_BPM
            and duration_sec
            and row_dur
            and abs(int(duration_sec) - row_dur) <= DURATION_TOLERANCE_SEC
        ):
            reasons.append("similar_hr_pattern")
            if confidence == CONFIDENCE_LOW:
                confidence = CONFIDENCE_MEDIUM

        if not reasons:
            continue

        candidates.append(
            {
                "workout_id": wid,
                "date": str(row[1])[:10],
                "type": str(row[2]),
                "start_time": row_start,
                "duration_sec": row_dur,
                "distance_km": row_dist,
                "avg_hr": row_hr,
                "data_source": row[7],
                "confidence": confidence,
                "reasons": reasons,
            }
        )

    order = {CONFIDENCE_HIGH: 0, CONFIDENCE_MEDIUM: 1, CONFIDENCE_LOW: 2}
    candidates.sort(key=lambda c: order.get(str(c.get("confidence")), 9))
    return candidates
