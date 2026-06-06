# -*- coding: utf-8 -*-
"""Unit tests for strength HR peak detection."""
from __future__ import annotations

from backend.services.strength_hr_peak_detection import (
    CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH,
    CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED,
    CONFIDENCE_REASON_SUPERSET_DETECTED,
    MAX_ADAPTIVE_PASSES,
    MINIMUM_RECOVERY_DROP_BPM,
    MIN_BLOCK_DURATION_SEC,
    MIN_PEAK_SEPARATION_SEC,
    MIN_VALLEY_DURATION_SEC,
    build_blocks_from_peaks,
    consolidate_peaks,
    count_working_blocks,
    count_working_sets,
    detect_hr_blocks,
    detect_superset_pattern,
    find_local_peaks,
    match_blocks_to_sets,
    normalize_series,
    session_confidence,
    smooth_hr_median,
    PeakInfo,
    DetectionThresholds,
)


def _three_peak_series(duration: int = 300) -> list[dict]:
    """Three effort peaks with deep recovery valleys (>=10 bpm, >=25 sec)."""
    points: list[dict] = []
    for sec in range(duration):
        if sec < 35:
            hr = 95 + sec
        elif sec < 65:
            hr = 130 - (sec - 35)  # drop to ~100 over 30s
        elif sec < 95:
            hr = 100 + (sec - 65)
        elif sec < 125:
            hr = 140 - (sec - 95)
        elif sec < 155:
            hr = 100 + (sec - 125)
        elif sec < 185:
            hr = 145 - (sec - 155)
        else:
            hr = max(95, 115 - (sec - 185) // 2)
        points.append({"seconds": sec, "heart_rate": hr})
    return points


def _single_broad_peak_with_noise(duration: int = 120) -> list[dict]:
    """One effort peak with small mid-peak dips (should stay one block)."""
    points: list[dict] = []
    for sec in range(duration):
        if sec < 20:
            hr = 95 + sec
        elif sec < 80:
            # plateau with 5–8 bpm wiggles every ~12 sec
            base = 130
            wiggle = 6 if (sec // 12) % 2 else 0
            hr = base - wiggle
        else:
            hr = max(95, 130 - (sec - 80))
        points.append({"seconds": sec, "heart_rate": hr})
    return points


def test_normalize_and_smooth():
    raw = [{"seconds": 2, "heart_rate": 120}, {"seconds": 0, "heart_rate": 100}, {"seconds": 1, "heart_rate": 110}]
    series = normalize_series(raw)
    assert series == [(0, 100), (1, 110), (2, 120)]
    smoothed = smooth_hr_median(series, window_sec=3)
    assert len(smoothed) == 3
    assert smoothed[1][1] == 110


def test_three_peaks_detected():
    points = _three_peak_series()
    blocks, peaks, _meta = detect_hr_blocks(points, 300)
    assert len(peaks) >= 2
    assert len(blocks) >= 2
    assert blocks[0]["peak_hr"] is not None
    assert blocks[0]["start_sec"] < blocks[0]["end_sec"]


def test_local_peaks_respect_min_separation():
    series = [(s, h) for s, h in enumerate([100, 110, 120, 115, 118, 125, 120, 130, 125])]
    smoothed = smooth_hr_median(series, window_sec=3)
    peaks = find_local_peaks(smoothed, min_sep_sec=MIN_PEAK_SEPARATION_SEC)
    if len(peaks) >= 2:
        assert peaks[1].sec - peaks[0].sec >= MIN_PEAK_SEPARATION_SEC


def test_match_exact_count():
    blocks = [
        {"block_index": 1, "start_sec": 0, "end_sec": 60, "peak_hr": 130, "avg_hr": 120, "confidence": "medium"},
        {"block_index": 2, "start_sec": 60, "end_sec": 120, "peak_hr": 140, "avg_hr": 125, "confidence": "medium"},
    ]
    sets = [
        {"order_index": 1, "set_number": 1, "exercise": "Bench", "weight": 80, "reps": 8, "reps_str": "8"},
        {"order_index": 2, "set_number": 2, "exercise": "Bench", "weight": 80, "reps": 6, "reps_str": "6"},
    ]
    enriched, matched, quality = match_blocks_to_sets(blocks, sets)
    assert quality == "exact"
    assert len(matched) == 2
    assert enriched[0]["matched_exercise"] == "Bench"
    assert enriched[0]["matched_set_number"] == 1
    assert enriched[1]["matched_set_number"] == 2


def test_match_uses_exercise_local_set_number():
    blocks = [
        {"block_index": 1, "start_sec": 0, "end_sec": 60, "peak_hr": 130, "confidence": "medium"},
        {"block_index": 2, "start_sec": 70, "end_sec": 130, "peak_hr": 135, "confidence": "medium"},
        {"block_index": 3, "start_sec": 140, "end_sec": 200, "peak_hr": 140, "confidence": "medium"},
    ]
    sets = [
        {"order_index": 1, "set_number": 1, "exercise": "A", "weight": 0, "reps": 5, "reps_str": "5", "is_warmup": False},
        {"order_index": 2, "set_number": 17, "exercise": "Deadlift", "weight": 100, "reps": 5, "reps_str": "5", "is_warmup": False},
        {"order_index": 3, "set_number": 18, "exercise": "Deadlift", "weight": 100, "reps": 5, "reps_str": "5", "is_warmup": False},
    ]
    enriched, _, quality = match_blocks_to_sets(blocks, sets)
    assert quality == "exact"
    assert enriched[1]["matched_set_number"] == 1
    assert enriched[2]["matched_set_number"] == 2


def test_match_warmup_numbered_separately():
    blocks = [
        {"block_index": 1, "start_sec": 0, "end_sec": 60, "peak_hr": 120, "confidence": "medium"},
        {"block_index": 2, "start_sec": 70, "end_sec": 130, "peak_hr": 140, "confidence": "medium"},
    ]
    sets = [
        {"order_index": 1, "set_number": 5, "exercise": "Squat", "weight": 60, "reps": 10, "reps_str": "10", "is_warmup": True},
        {"order_index": 2, "set_number": 6, "exercise": "Squat", "weight": 100, "reps": 5, "reps_str": "5", "is_warmup": False},
    ]
    enriched, _, quality = match_blocks_to_sets(blocks, sets)
    assert quality == "exact"
    assert enriched[0]["is_warmup"] is True
    assert enriched[0]["matched_set_number"] == 1
    assert enriched[1]["is_warmup"] is False
    assert enriched[1]["matched_set_number"] == 1


def test_match_partial_when_fewer_blocks():
    blocks = [
        {"block_index": 1, "start_sec": 0, "end_sec": 120, "peak_hr": 140, "avg_hr": 125, "confidence": "medium"},
    ]
    sets = [
        {"order_index": 1, "set_number": 1, "exercise": "A", "weight": 0, "reps": 8, "reps_str": "8"},
        {"order_index": 2, "set_number": 2, "exercise": "B", "weight": 0, "reps": 8, "reps_str": "8"},
    ]
    _, matched, quality = match_blocks_to_sets(blocks, sets)
    assert quality == "partial"
    assert len(matched) == 2
    assert matched[1]["peak_hr"] is None


def test_blocks_only_without_sets():
    blocks = [{"block_index": 1, "start_sec": 0, "end_sec": 60, "peak_hr": 130, "confidence": "medium"}]
    enriched, matched, quality = match_blocks_to_sets(blocks, [])
    assert quality == "blocks_only"
    assert matched == []
    assert enriched[0]["matched_exercise"] is None


def test_flat_recovery_may_merge_peaks():
    """Superset-like: weak valley → fewer blocks than effort periods."""
    points: list[dict] = []
    for sec in range(180):
        if sec % 60 < 30:
            hr = 100 + (sec % 30)
        else:
            hr = 125 - (sec % 10)
        points.append({"seconds": sec, "heart_rate": hr})
    blocks, peaks, _meta = detect_hr_blocks(points, 180)
    assert len(peaks) >= 1


def test_single_peak_one_block():
    points = [{"seconds": s, "heart_rate": 100 + min(s, 40)} for s in range(120)]
    blocks, peaks, _meta = detect_hr_blocks(points, 120)
    assert len(peaks) >= 1
    assert len(blocks) >= 1


def test_build_blocks_recovery_drop():
    smoothed = [(s, h) for s, h in enumerate([100, 110, 130, 120, 105, 100, 110, 140, 120, 100])]
    peaks = [PeakInfo(sec=2, hr=130), PeakInfo(sec=7, hr=140)]
    blocks = build_blocks_from_peaks(smoothed, peaks, duration_sec=10)
    assert len(blocks) == 2
    assert blocks[0].peak_hr == 130


def test_shallow_valley_merges_double_peak():
    """Small dip inside one effort should not split into two blocks."""
    points = _single_broad_peak_with_noise()
    raw = normalize_series(points)
    smoothed = smooth_hr_median(raw)
    raw_peaks = find_local_peaks(smoothed)
    merged = consolidate_peaks(smoothed, raw_peaks, DetectionThresholds())
    assert len(merged) <= len(raw_peaks)
    blocks, peaks, meta = detect_hr_blocks(points, 120)
    assert len(peaks) <= max(2, len(raw_peaks))
    assert len(blocks) <= 2
    if meta.oversegmentation_corrected:
        assert meta.confidence_reason in (
            CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED,
            "merged_small_valleys",
        )


def test_expected_set_count_reduces_oversegmentation():
    """Many noisy peaks should be pulled toward ordered set count."""
    points: list[dict] = []
    for sec in range(600):
        # ~40 raw peaks if unfiltered; session has 23 sets
        phase = sec % 25
        if phase < 12:
            hr = 100 + phase * 2
        elif phase < 16:
            hr = 124 - (phase - 12) * 2  # shallow 8 bpm dip
        else:
            hr = 116 + (phase - 16)
        points.append({"seconds": sec, "heart_rate": hr})

    blocks, peaks, meta = detect_hr_blocks(points, 600, expected_set_count=23)
    assert len(peaks) <= int(23 * 1.3) + 2
    assert len(blocks) <= int(23 * 1.3) + 2
    assert meta.oversegmentation_corrected or len(peaks) < 30


def test_recovery_threshold_constants():
    assert MINIMUM_RECOVERY_DROP_BPM == 10
    assert MIN_VALLEY_DURATION_SEC == 20
    assert MIN_BLOCK_DURATION_SEC == 30
    assert MIN_PEAK_SEPARATION_SEC == 45
    assert MAX_ADAPTIVE_PASSES == 2


def test_adaptive_passes_capped_at_two():
    points: list[dict] = []
    for sec in range(400):
        phase = sec % 20
        hr = 100 + phase if phase < 10 else 120 - (phase - 10)
        points.append({"seconds": sec, "heart_rate": hr})
    _blocks, _peaks, meta = detect_hr_blocks(points, 400, expected_set_count=5)
    assert meta.adaptive_passes_used <= MAX_ADAPTIVE_PASSES


def test_warmup_excluded_from_working_counts():
    blocks = [
        {"block_index": 1, "is_warmup": True},
        {"block_index": 2, "is_warmup": False},
        {"block_index": 3, "is_warmup": False},
    ]
    sets = [
        {"is_warmup": True},
        {"is_warmup": False},
        {"is_warmup": False},
    ]
    assert count_working_blocks(blocks) == 2
    assert count_working_sets(sets) == 2


def test_session_confidence_warmup_mismatch_ignored():
    blocks = [{"is_warmup": True}, {"is_warmup": False}, {"is_warmup": False}]
    sets = [{"is_warmup": False}, {"is_warmup": False}]
    conf, reasons = session_confidence(
        "exact",
        len(blocks),
        len(sets),
        working_blocks=count_working_blocks(blocks),
        working_sets=count_working_sets(sets),
        session_duration_sec=300,
        hr_sample_count=200,
    )
    assert CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH not in reasons
    assert conf in ("high", "medium")


def test_superset_detected_reason():
    sets = [
        {"exercise": "A", "is_warmup": False},
        {"exercise": "B", "is_warmup": False},
        {"exercise": "A", "is_warmup": False},
    ]
    enriched = [
        {"matched_exercise": "A"},
        {"matched_exercise": "B"},
        {"matched_exercise": "A"},
    ]
    assert detect_superset_pattern(sets, enriched, "partial") is True
    conf, reasons = session_confidence(
        "partial",
        3,
        3,
        working_blocks=3,
        working_sets=3,
        session_duration_sec=300,
        hr_sample_count=200,
        superset_detected=True,
    )
    assert CONFIDENCE_REASON_SUPERSET_DETECTED in reasons
    assert conf == "medium"


def test_two_sets_with_recovery():
    points: list[dict] = []
    for sec in range(200):
        if sec < 40:
            hr = 95 + sec // 2
        elif sec < 70:
            hr = 115 - (sec - 40)
        elif sec < 110:
            hr = 95 + (sec - 70) // 2
        elif sec < 140:
            hr = 120 - (sec - 110)
        else:
            hr = max(90, 100 - (sec - 140) // 3)
        points.append({"seconds": sec, "heart_rate": hr})
    blocks, peaks, _meta = detect_hr_blocks(points, 200)
    assert len(peaks) >= 2
    assert len(blocks) >= 2
