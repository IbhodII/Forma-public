# -*- coding: utf-8 -*-
"""Cross-session HR analytics for strength workouts."""
from __future__ import annotations

from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import strength_hr_analysis_service, strength_service
from backend.services.strength_hr_mapping_service import get_session_meta

MAX_HR_ANALYTICS_SESSIONS = 100
HR_SOURCE_STRENGTH = "strength"


def _confidence_passes(min_confidence: str | None, confidence: str | None) -> bool:
    if not min_confidence:
        return True
    rank = {"low": 0, "medium": 1, "high": 2}
    if confidence is None:
        return False
    return rank.get(str(confidence), -1) >= rank.get(min_confidence, 0)


def _sql_hr_session_rows(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    limit: int = MAX_HR_ANALYTICS_SESSIONS,
) -> tuple[list[dict[str, Any]], bool]:
    """HR sessions via SQL EXISTS (no full get_sessions scan)."""
    uid = get_current_user_id()
    clauses = ["sw.user_id = ?"]
    params: list[Any] = [uid]
    if date_from:
        clauses.append("sw.date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("sw.date <= ?")
        params.append(str(date_to)[:10])
    if workout_title:
        clauses.append("COALESCE(sw.workout_title, 'Без названия') = ?")
        params.append(workout_title)
    where = " AND ".join(clauses)
    conn = get_db()
    try:
        tables = {
            str(row[0])
            for row in conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        if "strength_workouts" not in tables or "workout_heart_rate" not in tables:
            return [], False
        hr_cols = {row[1] for row in conn.execute("PRAGMA table_info(workout_heart_rate)")}
        if "source_type" in hr_cols:
            hr_source_exists_sql = "AND COALESCE(h.source_type, 'cardio') = ?"
            hr_source_join_sql = "AND COALESCE(h.source_type, 'cardio') = ?"
            exists_params: tuple[Any, ...] = (*params, HR_SOURCE_STRENGTH)
            rows_params: tuple[Any, ...] = (HR_SOURCE_STRENGTH, *params, limit + 1)
        else:
            hr_source_exists_sql = ""
            hr_source_join_sql = ""
            exists_params = tuple(params)
            rows_params = (*params, limit + 1)
        count_row = conn.execute(
            f"""
            SELECT COUNT(*) FROM (
                SELECT DISTINCT sw.date, COALESCE(sw.workout_title, 'Без названия')
                FROM strength_workouts sw
                WHERE {where}
                  AND EXISTS (
                    SELECT 1 FROM workout_heart_rate h
                    WHERE h.cardio_workout_id = sw.id
                      {hr_source_exists_sql}
                  )
            )
            """,
            exists_params,
        ).fetchone()
        total = int(count_row[0] if count_row else 0)
        rows = conn.execute(
            f"""
            SELECT sw.date,
                   COALESCE(sw.workout_title, 'Без названия') AS workout_title,
                   MIN(sw.id) AS hr_workout_id,
                   ROUND(AVG(h.heart_rate)) AS avg_hr,
                   MAX(h.elapsed_sec) + 1 AS duration_sec
            FROM strength_workouts sw
            INNER JOIN workout_heart_rate h
              ON h.cardio_workout_id = sw.id
             {hr_source_join_sql}
            WHERE {where}
            GROUP BY sw.date, sw.workout_title
            ORDER BY sw.date DESC, workout_title ASC
            LIMIT ?
            """,
            rows_params,
        ).fetchall()
    finally:
        conn.close()
    truncated = len(rows) > limit
    items: list[dict[str, Any]] = []
    for row in rows[:limit]:
        items.append(
            {
                "date": str(row["date"])[:10],
                "workout_title": str(row["workout_title"]),
                "has_hr": True,
                "avg_hr": int(row["avg_hr"]) if row["avg_hr"] is not None else None,
                "duration_sec": int(row["duration_sec"])
                if row["duration_sec"] is not None
                else None,
                "hr_workout_id": int(row["hr_workout_id"]),
            }
        )
    return items, truncated or total > limit


def _light_session_summary(sess: dict[str, Any]) -> dict[str, Any]:
    date = str(sess["date"])[:10]
    title = str(sess.get("workout_title") or "")
    meta = get_session_meta(date, title) or {}
    mapping_status = str(meta.get("mapping_status") or "auto")
    avg_hr = sess.get("avg_hr")
    return {
        "date": date,
        "workout_title": title,
        "duration_sec": sess.get("duration_sec"),
        "detected_blocks_count": 0,
        "verified_blocks_count": 0,
        "avg_peak_hr": avg_hr,
        "max_hr": avg_hr,
        "avg_recovery_drop": None,
        "avg_recovery_time": None,
        "high_intensity_blocks": 0,
        "confidence": "medium" if mapping_status == "verified" else "low",
        "mapping_status": mapping_status,
        "has_verified_mapping": mapping_status == "verified",
        "has_manual_mapping": mapping_status == "manual",
        "overrides_applied": False,
        "summary_mode": "light",
    }


def _scan_hr_summaries_light(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    verified_only: bool = False,
    max_sessions: int = MAX_HR_ANALYTICS_SESSIONS,
) -> tuple[list[dict[str, Any]], bool]:
    sessions, truncated = _sql_hr_session_rows(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        limit=max_sessions,
    )
    summaries: list[dict[str, Any]] = []
    for sess in sessions:
        summary = _light_session_summary(sess)
        if verified_only and summary.get("mapping_status") != "verified":
            continue
        summaries.append(summary)
    return summaries, truncated


def _collect_hr_session_rows(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    max_sessions: int = MAX_HR_ANALYTICS_SESSIONS,
) -> tuple[list[dict[str, Any]], bool]:
    """Load HR sessions (newest first), capped for performance."""
    session_rows, _total = strength_service.get_sessions(
        limit=500,
        offset=0,
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
    )
    hr_sessions = [s for s in session_rows if s.get("has_hr")]
    truncated = len(hr_sessions) > max_sessions
    return hr_sessions[:max_sessions], truncated


def _scan_hr_analyses(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    exercise: str | None = None,
    verified_only: bool = False,
    min_confidence: str | None = None,
    max_sessions: int = MAX_HR_ANALYTICS_SESSIONS,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], bool]:
    """
    Single pass: return list of {sess, analysis, summary} and exercise row seeds.
    """
    hr_sessions, truncated = _collect_hr_session_rows(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        max_sessions=max_sessions,
    )
    scanned: list[dict[str, Any]] = []
    exercise_rows: list[dict[str, Any]] = []

    for sess in hr_sessions:
        date = str(sess["date"])[:10]
        title = str(sess.get("workout_title") or "")
        analysis = strength_hr_analysis_service.get_strength_hr_analysis(
            date, title, _skip_comparison=True
        )
        if not analysis.get("hr_available"):
            continue
        summary = _session_summary_from_analysis(
            date, title, analysis, duration_sec=sess.get("duration_sec")
        )
        if exercise:
            ex_names = {e.get("exercise") for e in analysis.get("exercises") or []}
            if exercise not in ex_names:
                continue
        if verified_only and summary.get("mapping_status") != "verified":
            continue
        if not _confidence_passes(min_confidence, summary.get("confidence")):
            continue

        scanned.append({"sess": sess, "analysis": analysis, "summary": summary})

        for ex in analysis.get("exercises") or []:
            name = str(ex.get("exercise") or "")
            if not name:
                continue
            exercise_rows.append(
                {
                    "exercise": name,
                    "date": date,
                    "workout_title": title,
                    "avg_peak_hr": ex.get("avg_peak_hr"),
                    "avg_recovery_delta": ex.get("avg_recovery_delta"),
                    "sets_count": ex.get("sets_count") or 0,
                }
            )

    return scanned, exercise_rows, truncated


def _aggregates_from_exercise_rows(exercise_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_exercise: dict[str, list[dict[str, Any]]] = {}
    for row in exercise_rows:
        by_exercise.setdefault(row["exercise"], []).append(row)

    aggregates: list[dict[str, Any]] = []
    for exercise, rows in sorted(by_exercise.items()):
        rows_sorted = sorted(rows, key=lambda r: r["date"])
        peaks = [r["avg_peak_hr"] for r in rows_sorted if r.get("avg_peak_hr") is not None]
        recoveries = [
            r["avg_recovery_delta"]
            for r in rows_sorted
            if r.get("avg_recovery_delta") is not None
        ]
        sessions_count = len({(r["date"], r["workout_title"]) for r in rows})
        sets_count = sum(int(r.get("sets_count") or 0) for r in rows)
        recent_peaks = [float(p) for p in peaks[-3:]]
        prior_peaks = [float(p) for p in peaks[-6:-3]] if len(peaks) >= 4 else []
        recent_rec = [float(r) for r in recoveries[-3:]]
        prior_rec = [float(r) for r in recoveries[-6:-3]] if len(recoveries) >= 4 else []

        trend = _trend_direction(recent_peaks, prior_peaks)
        recovery_trend = _trend_direction(recent_rec, prior_rec)
        latest_vs_previous: int | None = None
        if len(peaks) >= 2:
            latest_vs_previous = int(peaks[-1] - peaks[-2])

        aggregates.append(
            {
                "exercise": exercise,
                "sessions_count": sessions_count,
                "sets_count": sets_count,
                "avg_peak_hr": int(round(sum(peaks) / len(peaks))) if peaks else None,
                "max_peak_hr": max(peaks) if peaks else None,
                "avg_recovery_drop": int(round(sum(recoveries) / len(recoveries)))
                if recoveries
                else None,
                "trend_direction": trend,
                "recovery_trend_direction": recovery_trend,
                "latest_vs_previous": latest_vs_previous,
                "insight": _insight_for_exercise(exercise, trend, recovery_trend),
            }
        )
    return aggregates


def _trends_from_summaries(summaries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    points = [
        {
            "date": s["date"],
            "workout_title": s["workout_title"],
            "avg_peak_hr": s.get("avg_peak_hr"),
            "max_hr": s.get("max_hr"),
            "avg_recovery_drop": s.get("avg_recovery_drop"),
            "block_count": s.get("detected_blocks_count"),
            "mapping_status": s.get("mapping_status"),
            "confidence": s.get("confidence"),
        }
        for s in summaries
    ]
    return sorted(points, key=lambda p: (p["date"], p["workout_title"]))


def build_hr_analytics_overview(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    exercise: str | None = None,
    verified_only: bool = False,
    min_confidence: str | None = None,
    sessions_limit: int = 200,
    sessions_offset: int = 0,
) -> dict[str, Any]:
    if not exercise and not min_confidence:
        probe, _ = _sql_hr_session_rows(
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
            limit=1,
        )
        if not probe:
            return {
                "sessions": [],
                "sessions_total": 0,
                "sessions_limit": sessions_limit,
                "sessions_offset": sessions_offset,
                "exercises": [],
                "trends": [],
                "truncated": False,
            }
    if exercise or min_confidence:
        scanned, exercise_rows, truncated = _scan_hr_analyses(
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
            exercise=exercise,
            verified_only=verified_only,
            min_confidence=min_confidence,
        )
        summaries = [item["summary"] for item in scanned]
    else:
        summaries, truncated = _scan_hr_summaries_light(
            date_from=date_from,
            date_to=date_to,
            workout_title=workout_title,
            verified_only=verified_only,
            max_sessions=MAX_HR_ANALYTICS_SESSIONS,
        )
        exercise_rows = []
    total = len(summaries)
    page = summaries[sessions_offset : sessions_offset + sessions_limit]

    return {
        "sessions": page,
        "sessions_total": total,
        "sessions_limit": sessions_limit,
        "sessions_offset": sessions_offset,
        "exercises": _aggregates_from_exercise_rows(exercise_rows),
        "trends": _trends_from_summaries(summaries),
        "truncated": truncated,
    }


def _session_summary_from_analysis(
    date: str,
    workout_title: str,
    analysis: dict[str, Any],
    *,
    duration_sec: int | None = None,
) -> dict[str, Any]:
    blocks = analysis.get("detected_blocks") or []
    working = [
        b
        for b in blocks
        if b.get("kind", "set") == "set" and not b.get("is_warmup")
    ]
    peaks = [b.get("peak_hr") for b in working if b.get("peak_hr") is not None]
    recoveries = [
        b.get("recovery_drop")
        for b in working
        if b.get("recovery_drop") is not None and b.get("recovery_drop") > 0
    ]
    rec_times = [
        b.get("recovery_time")
        for b in working
        if b.get("recovery_time") is not None and b.get("recovery_time") > 0
    ]

    avg_peak = int(round(sum(peaks) / len(peaks))) if peaks else None
    max_hr = max(peaks) if peaks else None
    avg_recovery = int(round(sum(recoveries) / len(recoveries))) if recoveries else None
    avg_recovery_time = int(round(sum(rec_times) / len(rec_times))) if rec_times else None

    high_intensity = 0
    if peaks:
        threshold = sorted(peaks)[max(0, (len(peaks) * 3) // 4 - 1)]
        high_intensity = sum(1 for p in peaks if p >= threshold)

    meta = get_session_meta(date, workout_title)
    mapping_status = analysis.get("mapping_status") or (
        (meta or {}).get("mapping_status") or "auto"
    )

    verified_blocks = sum(1 for b in blocks if analysis.get("has_verified_mapping"))
    if not verified_blocks and analysis.get("has_verified_mapping"):
        verified_blocks = len(blocks)

    return {
        "date": date,
        "workout_title": workout_title,
        "duration_sec": duration_sec or analysis.get("duration_sec"),
        "detected_blocks_count": len(blocks),
        "verified_blocks_count": verified_blocks if mapping_status == "verified" else 0,
        "avg_peak_hr": avg_peak,
        "max_hr": max_hr,
        "avg_recovery_drop": avg_recovery,
        "avg_recovery_time": avg_recovery_time,
        "high_intensity_blocks": high_intensity,
        "confidence": analysis.get("confidence"),
        "mapping_status": mapping_status,
        "has_verified_mapping": bool(analysis.get("has_verified_mapping")),
        "has_manual_mapping": bool(analysis.get("has_manual_mapping")),
        "overrides_applied": bool(analysis.get("overrides_applied")),
    }


def list_hr_sessions(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    exercise: str | None = None,
    verified_only: bool = False,
    min_confidence: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> dict[str, Any]:
    overview = build_hr_analytics_overview(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        exercise=exercise,
        verified_only=verified_only,
        min_confidence=min_confidence,
        sessions_limit=limit,
        sessions_offset=offset,
    )
    return {
        "items": overview["sessions"],
        "total": overview["sessions_total"],
        "limit": limit,
        "offset": offset,
    }


def get_hr_session_detail(date: str, workout_title: str) -> dict[str, Any]:
    analysis = strength_hr_analysis_service.get_strength_hr_analysis(date, workout_title)
    mappings = []
    from backend.services.strength_hr_mapping_service import get_mappings

    mappings = get_mappings(date, workout_title)
    meta = get_session_meta(date, workout_title)
    summary = _session_summary_from_analysis(date, workout_title, analysis)
    return {
        "summary": summary,
        "analysis": analysis,
        "mappings": mappings,
        "meta": meta,
    }


def _trend_direction(recent: list[float], prior: list[float]) -> str:
    if not recent or not prior:
        return "stable"
    r = sum(recent) / len(recent)
    p = sum(prior) / len(prior)
    delta = r - p
    if delta > 3:
        return "up"
    if delta < -3:
        return "down"
    return "stable"


def _insight_for_exercise(
    exercise: str,
    trend: str,
    recovery_trend: str,
) -> str | None:
    if recovery_trend == "down":
        return f"{exercise}: восстановление пульса ухудшается за последние сессии"
    if trend == "up":
        return f"{exercise}: пиковый пульс растёт в последних сессиях"
    if trend == "down":
        return f"{exercise}: пиковый пульс снижается в последних сессиях"
    return None


def list_exercise_aggregates(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    verified_only: bool = False,
    min_confidence: str | None = None,
) -> list[dict[str, Any]]:
    overview = build_hr_analytics_overview(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        verified_only=verified_only,
        min_confidence=min_confidence,
    )
    return overview["exercises"]


def get_hr_trends(
    *,
    date_from: str | None = None,
    date_to: str | None = None,
    workout_title: str | None = None,
    verified_only: bool = False,
    min_confidence: str | None = None,
) -> list[dict[str, Any]]:
    overview = build_hr_analytics_overview(
        date_from=date_from,
        date_to=date_to,
        workout_title=workout_title,
        verified_only=verified_only,
        min_confidence=min_confidence,
    )
    return overview["trends"]
