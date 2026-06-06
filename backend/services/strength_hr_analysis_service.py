# -*- coding: utf-8 -*-
"""Анализ пульса по подходам/блокам силовой тренировки (peak detection, read-only)."""
from __future__ import annotations

from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import strength_service
from backend.services.strength_hr_block_override_service import (
    build_effective_blocks_from_overrides,
    get_overrides,
)
from backend.services.strength_hr_mapping_service import (
    get_mappings,
    get_session_meta,
    mappings_as_overrides,
)
from backend.services.strength_hr_peak_detection import (
    count_working_blocks,
    count_working_sets,
    detect_hr_blocks,
    detect_superset_pattern,
    match_blocks_to_sets,
    session_confidence,
)
from backend.services.strength_service import HR_SOURCE_STRENGTH
from backend.services.user_service import get_effective_max_heart_rate
from utils.hr_profile import accumulate_zone_seconds

PEAK_DISCLAIMER = (
    "Подходы определены автоматически по пикам пульса (приблизительная аналитика). "
    "Возможны ошибки при суперсетах/коротком отдыхе."
)
WARNING_NO_HR = "Нет данных пульса"
WARNING_NO_ORDER = "Нет порядка подходов — показаны только авто-блоки"
WARNING_NO_DURATION = "Недостаточно данных для анализа пульса"
WARNING_NO_PEAKS = "Не удалось выделить пики пульса"
WARNING_COUNT_MISMATCH = "Обнаружено {n_blocks} блоков, записано {n_sets} рабочих подходов — сопоставление приблизительное"
WARNING_OVERSEGMENTATION = (
    "Слишком много мелких пиков ({raw} → {final}) — блоки объединены по восстановлению пульса"
)
WARNING_SUPERSET = "Возможен супerset — привязка блоков к подходам приблизительная"
WARNING_MANUAL_OVERRIDE = "Применена ручная разметка HR-блоков"
WARNING_VERIFIED_MAPPING = "Применена подтверждённая разметка HR-блоков"


def _load_display_from_block(block: dict[str, Any]) -> str:
    return str(block.get("matched_load_display") or "")


def _matched_set_nested(block: dict[str, Any], ordered_sets: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not block.get("matched_exercise"):
        return None
    order_idx = block.get("matched_order_index")
    weight = 0.0
    reps_str = ""
    for s in ordered_sets:
        if int(s.get("order_index") or 0) == int(order_idx or -1):
            weight = float(s.get("weight") or 0)
            reps_str = s.get("reps_str") or str(s.get("reps") or "")
            break
    return {
        "exercise": str(block.get("matched_exercise") or ""),
        "set_number": int(block.get("matched_set_number") or 0),
        "weight": weight,
        "reps_str": reps_str,
        "load_display": _load_display_from_block(block),
        "is_warmup": bool(block.get("is_warmup")),
    }


def _enrich_block_for_api(block: dict[str, Any], ordered_sets: list[dict[str, Any]]) -> dict[str, Any]:
    out = dict(block)
    out["matched_set"] = _matched_set_nested(block, ordered_sets)
    return out


def _thresholds_dict(meta_thresholds) -> dict[str, int]:
    return {
        "minimum_recovery_drop_bpm": meta_thresholds.minimum_recovery_drop_bpm,
        "minimum_valley_duration_sec": meta_thresholds.minimum_valley_duration_sec,
        "min_block_duration_sec": meta_thresholds.min_block_duration_sec,
        "min_peak_distance_sec": meta_thresholds.min_peak_distance_sec,
        "min_prominence_bpm": meta_thresholds.min_prominence_bpm,
    }


def _empty_response(
    date: str,
    workout_title: str,
    *,
    warnings: list[str],
    duration_sec: int | None = None,
) -> dict[str, Any]:
    return {
        "date": date,
        "workout_title": workout_title,
        "confidence": None,
        "disclaimer": None,
        "warnings": warnings,
        "duration_sec": duration_sec,
        "detection_mode": "peak",
        "match_quality": "blocks_only",
        "detected_count": 0,
        "expected_count": None,
        "confidence_reason": None,
        "confidence_reasons": [],
        "detected_blocks": [],
        "sets": [],
        "exercises": [],
        "comparison": [],
        "comparison_available": False,
        "hr_available": False,
        "hr_samples_count": 0,
        "ordered_sets_count": 0,
        "detected_blocks_count": 0,
        "thresholds_used": None,
        "debug": None,
        "overrides_applied": False,
        "auto_detected_blocks": None,
        "mapping_status": "auto",
        "has_verified_mapping": False,
        "has_manual_mapping": False,
    }


def _compute_strain_score(zone_seconds: dict[str, float], window_len: int) -> float:
    wl = max(1, window_len)
    raw = (
        zone_seconds.get("z3", 0.0) * 1.0
        + zone_seconds.get("z4", 0.0) * 2.0
        + zone_seconds.get("z5", 0.0) * 3.0
    ) / wl
    return round(min(100.0, raw / 3.0 * 100.0), 1)


def _enrich_sets_with_zones(
    set_metrics: list[dict[str, Any]],
    hr_points: list[dict[str, Any]],
    max_hr: int,
) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for row in set_metrics:
        enriched = dict(row)
        start = int(row.get("start_sec") or 0)
        end = int(row.get("end_sec") or 0)
        if end <= start:
            out.append(enriched)
            continue
        window_pts = [
            p for p in hr_points if start <= int(p.get("seconds") or 0) < end
        ]
        window_len = max(1, end - start)
        zone_seconds = accumulate_zone_seconds(
            window_pts, max_hr, duration_sec=window_len
        )
        enriched["zone_seconds"] = {k: round(v, 1) for k, v in zone_seconds.items()}
        enriched["strain_score"] = _compute_strain_score(zone_seconds, window_len)
        out.append(enriched)
    return out


def _aggregate_exercises(set_metrics: list[dict[str, Any]]) -> list[dict[str, Any]]:
    by_ex: dict[str, list[dict[str, Any]]] = {}
    for row in set_metrics:
        ex = row.get("exercise") or ""
        if not ex:
            continue
        by_ex.setdefault(ex, []).append(row)
    exercises: list[dict[str, Any]] = []
    for exercise, rows in by_ex.items():
        peaks = [
            r.get("peak_hr") or r.get("max_hr")
            for r in rows
            if (r.get("peak_hr") or r.get("max_hr")) is not None
        ]
        strains = [r["strain_score"] for r in rows if r.get("strain_score") is not None]
        recoveries = [
            r.get("recovery_drop") or r.get("recovery_delta_bpm")
            for r in rows
            if (r.get("recovery_drop") or r.get("recovery_delta_bpm")) is not None
        ]
        highest = max(rows, key=lambda r: (r.get("peak_hr") or r.get("max_hr") or 0))
        exercises.append(
            {
                "exercise": exercise,
                "sets_count": len(rows),
                "avg_peak_hr": int(round(sum(peaks) / len(peaks))) if peaks else None,
                "highest_hr_set": {
                    "order_index": highest.get("order_index"),
                    "max_hr": highest.get("peak_hr") or highest.get("max_hr"),
                },
                "avg_recovery_delta": (
                    int(round(sum(recoveries) / len(recoveries))) if recoveries else None
                ),
                "cardiovascular_load_estimate": (
                    round(sum(strains) / len(strains), 1) if strains else None
                ),
            }
        )
    exercises.sort(key=lambda e: e["exercise"])
    return exercises


def _prior_session_keys(
    conn,
    date_str: str,
    exercise: str,
    *,
    limit: int = 3,
) -> list[tuple[str, str]]:
    uid = get_current_user_id()
    rows = conn.execute(
        """
        SELECT DISTINCT sw.date, COALESCE(sw.workout_title, 'Без названия') AS workout_title
        FROM strength_workouts sw
        WHERE sw.user_id = ?
          AND sw.date < ?
          AND sw.exercise = ?
          AND COALESCE(sw.order_index, 0) > 0
          AND EXISTS (
            SELECT 1
            FROM strength_workouts sw2
            JOIN workout_heart_rate h ON h.cardio_workout_id = sw2.id
            WHERE sw2.user_id = sw.user_id
              AND sw2.date = sw.date
              AND COALESCE(sw2.workout_title, 'Без названия')
                  = COALESCE(sw.workout_title, 'Без названия')
              AND COALESCE(h.source_type, 'cardio') = ?
            LIMIT 1
          )
        ORDER BY sw.date DESC
        LIMIT ?
        """,
        (uid, date_str, exercise, HR_SOURCE_STRENGTH, limit),
    ).fetchall()
    return [(str(r[0])[:10], str(r[1])) for r in rows]


def _exercise_peak_from_analysis(analysis: dict[str, Any], exercise: str) -> int | None:
    peaks = [
        s.get("peak_hr") or s.get("max_hr")
        for s in analysis.get("sets") or []
        if s.get("exercise") == exercise
        and (s.get("peak_hr") or s.get("max_hr")) is not None
    ]
    return max(peaks) if peaks else None


def _build_comparison(
    date_str: str,
    workout_title: str,
    exercise_metrics: list[dict[str, Any]],
    confidence: str | None,
) -> tuple[list[dict[str, Any]], bool]:
    if confidence not in ("medium", "high"):
        return [], False
    conn = get_db()
    try:
        comparison: list[dict[str, Any]] = []
        for ex_row in exercise_metrics:
            exercise = ex_row["exercise"]
            current_peak = ex_row.get("avg_peak_hr")
            if current_peak is None:
                continue
            prior_keys = _prior_session_keys(conn, date_str, exercise)
            prior_peaks: list[int] = []
            for p_date, p_title in prior_keys:
                if p_date == date_str and p_title == workout_title:
                    continue
                prior = get_strength_hr_analysis(
                    p_date,
                    p_title,
                    _skip_comparison=True,
                )
                peak = _exercise_peak_from_analysis(prior, exercise)
                if peak is not None:
                    prior_peaks.append(peak)
            if not prior_peaks:
                comparison.append(
                    {
                        "exercise": exercise,
                        "current_peak_hr": current_peak,
                        "previous_peak_hr": None,
                        "delta_bpm": None,
                        "prior_sessions_count": 0,
                    }
                )
                continue
            prev_avg = int(round(sum(prior_peaks) / len(prior_peaks)))
            comparison.append(
                {
                    "exercise": exercise,
                    "current_peak_hr": current_peak,
                    "previous_peak_hr": prev_avg,
                    "delta_bpm": current_peak - prev_avg,
                    "prior_sessions_count": len(prior_peaks),
                }
            )
    finally:
        conn.close()
    available = any(c.get("prior_sessions_count", 0) >= 1 for c in comparison)
    return comparison, available


def get_strength_hr_analysis(
    date: str,
    workout_title: str,
    *,
    _skip_comparison: bool = False,
    _ignore_saved_mappings: bool = False,
) -> dict[str, Any]:
    """Peak-based HR analysis for a strength session."""
    date_str = str(date)[:10]
    detail = strength_service.get_session_detail(date_str, workout_title)
    duration_sec = detail.get("duration_sec")
    ordered_sets = list(detail.get("ordered_sets") or [])
    uses_ordered = bool(detail.get("uses_ordered_sets"))

    hr_workout_id = detail.get("hr_workout_id")
    if not hr_workout_id:
        return _empty_response(date_str, workout_title, warnings=[WARNING_NO_HR])

    hr_points = strength_service.get_strength_heart_rate_data(int(hr_workout_id))
    if not hr_points:
        return _empty_response(date_str, workout_title, warnings=[WARNING_NO_HR])

    if not duration_sec or int(duration_sec) <= 0:
        return _empty_response(
            date_str,
            workout_title,
            warnings=[WARNING_NO_DURATION],
            duration_sec=duration_sec,
        )

    duration_sec = int(duration_sec)
    max_hr = get_effective_max_heart_rate()
    warnings: list[str] = []

    if not uses_ordered or not ordered_sets:
        warnings.append(WARNING_NO_ORDER)

    if not ordered_sets:
        ordered_sets = strength_service.ordered_sets_for_hr_analysis(
            date_str, workout_title
        )
    has_set_order = bool(ordered_sets)
    if has_set_order and (not uses_ordered or not detail.get("ordered_sets")):
        # Fallback построен — не считаем это «нет порядка»
        warnings = [w for w in warnings if w != WARNING_NO_ORDER]

    detected_blocks, peaks, detection_meta = detect_hr_blocks(
        hr_points,
        duration_sec,
        expected_set_count=len(ordered_sets) if ordered_sets else None,
    )
    if not peaks:
        warnings.append(WARNING_NO_PEAKS)

    if detection_meta.oversegmentation_corrected:
        warnings.append(
            WARNING_OVERSEGMENTATION.format(
                raw=detection_meta.raw_peak_count,
                final=detection_meta.consolidated_peak_count,
            )
        )

    if has_set_order and ordered_sets:
        enriched_blocks, matched_sets, match_quality = match_blocks_to_sets(
            detected_blocks, ordered_sets
        )
    else:
        enriched_blocks = [
            {
                **b,
                "matched_order_index": None,
                "matched_exercise": None,
                "matched_set_number": None,
                "matched_load_display": None,
                "is_warmup": False,
                "confidence": "low",
                "matched_set": None,
            }
            for b in detected_blocks
        ]
        matched_sets = []
        match_quality = "blocks_only"

    working_blocks = count_working_blocks(enriched_blocks)
    working_sets = count_working_sets(ordered_sets) if ordered_sets else 0

    if has_set_order and ordered_sets and detected_blocks:
        if working_blocks != working_sets:
            warnings.append(
                WARNING_COUNT_MISMATCH.format(
                    n_blocks=working_blocks, n_sets=working_sets
                )
            )

    superset_detected = detect_superset_pattern(
        ordered_sets, enriched_blocks, match_quality
    )
    if superset_detected:
        warnings.append(WARNING_SUPERSET)

    confidence, confidence_reasons = session_confidence(
        match_quality,
        len(detected_blocks),
        len(ordered_sets),
        oversegmentation_corrected=detection_meta.oversegmentation_corrected,
        working_blocks=working_blocks,
        working_sets=working_sets,
        session_duration_sec=duration_sec,
        hr_sample_count=len(hr_points),
        merge_reasons=list(detection_meta.confidence_reasons),
        superset_detected=superset_detected,
    )

    api_blocks = [
        _enrich_block_for_api(b, ordered_sets) for b in enriched_blocks
    ]
    auto_detected_blocks = list(api_blocks)
    overrides_applied = False
    mapping_status = "auto"
    has_verified_mapping = False
    has_manual_mapping = False

    saved_rows: list[dict[str, Any]] = []
    if not _ignore_saved_mappings:
        saved_mappings = get_mappings(date_str, workout_title)
        if saved_mappings:
            saved_rows = mappings_as_overrides(saved_mappings)
            meta = get_session_meta(date_str, workout_title)
            mapping_status = str((meta or {}).get("mapping_status") or "auto")
            has_verified_mapping = mapping_status == "verified"
            has_manual_mapping = mapping_status == "manual"
        else:
            saved_rows = get_overrides(date_str, workout_title)
            if saved_rows:
                mapping_status = "manual"
                has_manual_mapping = True

    if saved_rows:
        override_blocks = build_effective_blocks_from_overrides(
            hr_points, saved_rows, ordered_sets
        )
        api_blocks = [
            _enrich_block_for_api(b, ordered_sets) for b in override_blocks
        ]
        overrides_applied = True
        if has_verified_mapping:
            warnings.append(WARNING_VERIFIED_MAPPING)
            if "verified_mapping" not in confidence_reasons:
                confidence_reasons = ["verified_mapping", *confidence_reasons]
        else:
            warnings.append(WARNING_MANUAL_OVERRIDE)
            confidence = "medium"
            confidence_reasons = ["manual_override"]
        match_quality = "partial" if has_set_order else "blocks_only"

        matched_sets = []
        for b in override_blocks:
            if b.get("kind") in ("noise", "rest"):
                continue
            if b.get("matched_order_index") is None:
                continue
            matched_sets.append(
                {
                    "order_index": int(b.get("matched_order_index") or 0),
                    "set_number": int(b.get("matched_set_number") or 0),
                    "exercise": str(b.get("matched_exercise") or ""),
                    "weight": 0.0,
                    "reps_str": "",
                    "load_display": b.get("matched_load_display") or "",
                    "is_warmup": bool(b.get("is_warmup")),
                    "start_sec": b["start_sec"],
                    "end_sec": b["end_sec"],
                    "peak_hr": b.get("peak_hr"),
                    "avg_hr": b.get("avg_hr"),
                    "max_hr": b.get("peak_hr"),
                    "min_hr": b.get("min_hr"),
                    "hr_rise": b.get("hr_rise"),
                    "recovery_drop": b.get("recovery_drop"),
                    "recovery_time": b.get("recovery_time"),
                    "recovery_delta_bpm": b.get("recovery_drop"),
                    "zone_seconds": None,
                    "strain_score": None,
                    "confidence": b.get("confidence", "medium"),
                    "confidence_reason": b.get("confidence_reason"),
                }
            )

    set_metrics = _enrich_sets_with_zones(matched_sets, hr_points, max_hr)
    exercise_metrics = _aggregate_exercises(set_metrics)

    comparison: list[dict[str, Any]] = []
    comparison_available = False
    if not _skip_comparison:
        comparison, comparison_available = _build_comparison(
            date_str,
            workout_title,
            exercise_metrics,
            confidence,
        )

    debug = {
        "raw_peaks_count": detection_meta.raw_peak_count,
        "raw_blocks_count": detection_meta.raw_blocks_count,
        "merged_blocks_count": detection_meta.merged_blocks_count,
        "expected_set_count": len(ordered_sets) if ordered_sets else None,
        "merge_reasons": list(detection_meta.merge_reasons),
        "adaptive_passes_used": detection_meta.adaptive_passes_used,
    }

    return {
        "date": date_str,
        "workout_title": workout_title,
        "confidence": confidence if detected_blocks else None,
        "confidence_reason": confidence_reasons[0] if confidence_reasons else detection_meta.confidence_reason,
        "confidence_reasons": confidence_reasons,
        "disclaimer": PEAK_DISCLAIMER if detected_blocks else None,
        "warnings": warnings,
        "duration_sec": duration_sec,
        "detection_mode": "peak",
        "match_quality": match_quality,
        "detected_count": len(api_blocks),
        "expected_count": len(ordered_sets) if ordered_sets else None,
        "detected_blocks": api_blocks,
        "sets": set_metrics,
        "exercises": exercise_metrics,
        "comparison": comparison,
        "comparison_available": comparison_available,
        "hr_available": True,
        "hr_samples_count": len(hr_points),
        "ordered_sets_count": len(ordered_sets),
        "detected_blocks_count": len(api_blocks),
        "thresholds_used": _thresholds_dict(detection_meta.thresholds_used),
        "debug": debug,
        "overrides_applied": overrides_applied,
        "auto_detected_blocks": auto_detected_blocks if overrides_applied else None,
        "manual_blocks": api_blocks if overrides_applied else None,
        "mapping_status": mapping_status,
        "has_verified_mapping": has_verified_mapping,
        "has_manual_mapping": has_manual_mapping,
    }
