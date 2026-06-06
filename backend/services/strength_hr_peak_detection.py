# -*- coding: utf-8 -*-
"""Peak/valley detection on strength HR timeline for set/block estimation."""
from __future__ import annotations

from dataclasses import dataclass, field
from statistics import median
from typing import Any

SMOOTH_WINDOW_SEC = 7
MIN_PROMINENCE_BPM = 5

# Anti-over-segmentation defaults (v2 spec)
MINIMUM_RECOVERY_DROP_BPM = 10
MIN_VALLEY_DURATION_SEC = 20
MIN_BLOCK_DURATION_SEC = 30
MIN_PEAK_SEPARATION_SEC = 45
OVERSEGMENTATION_SET_RATIO = 1.3
MAX_ADAPTIVE_PASSES = 2

# Back-compat aliases used in tests
MIN_PEAK_DROP_BPM = MINIMUM_RECOVERY_DROP_BPM

HrPoint = dict[str, Any]

CONFIDENCE_REASON_MERGED_SMALL_VALLEYS = "merged_small_valleys"
CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED = "oversegmentation_corrected"
CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH = "block_count_mismatch"
CONFIDENCE_REASON_SUPERSET_DETECTED = "superset_detected"
CONFIDENCE_REASON_NO_ORDERED_SETS = "no_ordered_sets"
CONFIDENCE_REASON_NOISY_SIGNAL = "noisy_signal"
CONFIDENCE_REASON_SHORT_SESSION = "short_session"
CONFIDENCE_REASON_ADAPTIVE_THRESHOLD = "adaptive_threshold_raised"


@dataclass
class PeakInfo:
    sec: int
    hr: int


@dataclass
class ValleyInfo:
    sec: int
    hr: int
    start_sec: int
    end_sec: int
    drop_bpm: int
    duration_sec: int


@dataclass
class DetectedBlock:
    block_index: int
    start_sec: int
    end_sec: int
    peak_sec: int
    peak_hr: int


@dataclass
class DetectionThresholds:
    minimum_recovery_drop_bpm: int = MINIMUM_RECOVERY_DROP_BPM
    minimum_valley_duration_sec: int = MIN_VALLEY_DURATION_SEC
    min_block_duration_sec: int = MIN_BLOCK_DURATION_SEC
    min_peak_distance_sec: int = MIN_PEAK_SEPARATION_SEC
    min_prominence_bpm: int = MIN_PROMINENCE_BPM


@dataclass
class DetectionMeta:
    raw_peak_count: int = 0
    consolidated_peak_count: int = 0
    raw_blocks_count: int = 0
    merged_blocks_count: int = 0
    oversegmentation_corrected: bool = False
    confidence_reason: str | None = None
    confidence_reasons: list[str] = field(default_factory=list)
    thresholds_used: DetectionThresholds = field(default_factory=DetectionThresholds)
    merge_reasons: list[str] = field(default_factory=list)
    adaptive_passes_used: int = 0


def normalize_series(points: list[HrPoint]) -> list[tuple[int, int]]:
    """Sort and dedupe HR samples; keep last value per second."""
    by_sec: dict[int, int] = {}
    for p in points:
        try:
            sec = int(p.get("seconds") or 0)
            hr = int(p["heart_rate"])
        except (KeyError, TypeError, ValueError):
            continue
        if sec < 0 or hr <= 0:
            continue
        by_sec[sec] = hr
    return sorted(by_sec.items())


def smooth_hr_median(
    series: list[tuple[int, int]],
    window_sec: int = SMOOTH_WINDOW_SEC,
) -> list[tuple[int, int]]:
    if not series:
        return []
    window = max(3, window_sec | 1)  # odd window
    half = window // 2
    out: list[tuple[int, int]] = []
    for i, (sec, _hr) in enumerate(series):
        lo = max(0, i - half)
        hi = min(len(series), i + half + 1)
        vals = [series[j][1] for j in range(lo, hi)]
        out.append((sec, int(round(median(vals)))))
    return out


def find_local_peaks(
    smoothed: list[tuple[int, int]],
    *,
    min_sep_sec: int = MIN_PEAK_SEPARATION_SEC,
    min_prominence_bpm: int = MIN_PROMINENCE_BPM,
) -> list[PeakInfo]:
    if len(smoothed) < 3:
        if smoothed:
            sec, hr = max(smoothed, key=lambda x: x[1])
            return [PeakInfo(sec=sec, hr=hr)]
        return []

    candidates: list[PeakInfo] = []
    for i in range(1, len(smoothed) - 1):
        sec, hr = smoothed[i]
        prev_hr = smoothed[i - 1][1]
        next_hr = smoothed[i + 1][1]
        if hr >= prev_hr and hr >= next_hr:
            left_min = min(x[1] for x in smoothed[: i + 1])
            right_min = min(x[1] for x in smoothed[i:])
            prominence = hr - max(left_min, right_min)
            if prominence >= min_prominence_bpm:
                candidates.append(PeakInfo(sec=sec, hr=hr))

    if not candidates:
        sec, hr = max(smoothed, key=lambda x: x[1])
        return [PeakInfo(sec=sec, hr=hr)]

    filtered: list[PeakInfo] = []
    for peak in sorted(candidates, key=lambda p: p.sec):
        if not filtered:
            filtered.append(peak)
            continue
        last = filtered[-1]
        if peak.sec - last.sec < min_sep_sec:
            if peak.hr > last.hr:
                filtered[-1] = peak
        else:
            filtered.append(peak)
    return filtered


def _longest_contiguous_below(
    segment: list[tuple[int, int]],
    hr_ceiling: int,
) -> int:
    """Longest run of seconds with HR at or below ceiling."""
    best = 0
    run_start: int | None = None
    prev_sec: int | None = None
    for sec, hr in segment:
        if hr <= hr_ceiling:
            if run_start is None:
                run_start = sec
            elif prev_sec is not None and sec - prev_sec > 1:
                run_start = sec
            if run_start is not None:
                best = max(best, sec - run_start + 1)
        else:
            run_start = None
        prev_sec = sec
    return best


def _valley_between_peaks(
    smoothed: list[tuple[int, int]],
    left: PeakInfo,
    right: PeakInfo,
    *,
    minimum_recovery_drop_bpm: int = MINIMUM_RECOVERY_DROP_BPM,
) -> ValleyInfo:
    sec_to_hr = dict(smoothed)
    secs = [s for s, _ in smoothed if left.sec <= s <= right.sec]
    if not secs:
        mid = (left.sec + right.sec) // 2
        ref = min(left.hr, right.hr)
        return ValleyInfo(
            sec=mid,
            hr=ref,
            start_sec=left.sec,
            end_sec=right.sec,
            drop_bpm=0,
            duration_sec=0,
        )

    segment = [(s, sec_to_hr[s]) for s in secs]
    min_sec, min_hr = min(segment, key=lambda x: x[1])
    drop = min(left.hr, right.hr) - min_hr

    recovery_ceiling = min(left.hr, right.hr) - minimum_recovery_drop_bpm
    duration_sec = _longest_contiguous_below(segment, recovery_ceiling + 2)
    if duration_sec <= 0:
        tol = 2
        v_start = min_sec
        v_end = min_sec
        for s, h in segment:
            if h <= min_hr + tol:
                v_start = min(v_start, s)
                v_end = max(v_end, s)
        duration_sec = max(0, v_end - v_start)

    return ValleyInfo(
        sec=min_sec,
        hr=min_hr,
        start_sec=min_sec,
        end_sec=min_sec + duration_sec,
        drop_bpm=max(0, int(drop)),
        duration_sec=max(0, int(duration_sec)),
    )


def _should_merge_peaks(
    left: PeakInfo,
    right: PeakInfo,
    valley: ValleyInfo,
    thresholds: DetectionThresholds,
) -> bool:
    distance = right.sec - left.sec
    if distance < thresholds.min_peak_distance_sec:
        return True
    if valley.drop_bpm < thresholds.minimum_recovery_drop_bpm:
        return True
    if valley.duration_sec < thresholds.minimum_valley_duration_sec:
        return True
    return False


def _merge_peak_pair(left: PeakInfo, right: PeakInfo) -> PeakInfo:
    return left if left.hr >= right.hr else right


def consolidate_peaks(
    smoothed: list[tuple[int, int]],
    peaks: list[PeakInfo],
    thresholds: DetectionThresholds,
) -> list[PeakInfo]:
    """Merge peaks separated by shallow or short valleys, or too close together."""
    if len(peaks) <= 1:
        return list(peaks)

    ordered = sorted(peaks, key=lambda p: p.sec)
    merged: list[PeakInfo] = [ordered[0]]
    for peak in ordered[1:]:
        last = merged[-1]
        valley = _valley_between_peaks(smoothed, last, peak)
        if _should_merge_peaks(last, peak, valley, thresholds):
            merged[-1] = _merge_peak_pair(last, peak)
        else:
            merged.append(peak)
    return merged


def _weakest_adjacent_pair_index(
    peaks: list[PeakInfo],
    smoothed: list[tuple[int, int]],
) -> int:
    """Index of left peak in weakest adjacent pair (lowest recovery score)."""
    best_i = 0
    best_score = float("inf")
    for i in range(len(peaks) - 1):
        valley = _valley_between_peaks(smoothed, peaks[i], peaks[i + 1])
        score = valley.drop_bpm + valley.duration_sec * 0.25
        if score < best_score:
            best_score = score
            best_i = i
    return best_i


def apply_expected_set_guidance(
    smoothed: list[tuple[int, int]],
    peaks: list[PeakInfo],
    expected_set_count: int,
    thresholds: DetectionThresholds,
) -> tuple[list[PeakInfo], bool]:
    """Iteratively merge weakest splits while block count exceeds soft prior."""
    if expected_set_count <= 0 or len(peaks) <= 1:
        return peaks, False

    target_max = max(1, int(expected_set_count * OVERSEGMENTATION_SET_RATIO))
    corrected = False
    current = list(peaks)

    while len(current) > target_max and len(current) > 1:
        idx = _weakest_adjacent_pair_index(current, smoothed)
        merged_peak = _merge_peak_pair(current[idx], current[idx + 1])
        current = current[:idx] + [merged_peak] + current[idx + 2 :]
        corrected = True

    return current, corrected


def _raise_thresholds(thresholds: DetectionThresholds) -> DetectionThresholds:
    return DetectionThresholds(
        minimum_recovery_drop_bpm=thresholds.minimum_recovery_drop_bpm + 5,
        minimum_valley_duration_sec=thresholds.minimum_valley_duration_sec + 10,
        min_block_duration_sec=thresholds.min_block_duration_sec,
        min_peak_distance_sec=thresholds.min_peak_distance_sec + 15,
        min_prominence_bpm=thresholds.min_prominence_bpm,
    )


def adaptive_peak_consolidation(
    smoothed: list[tuple[int, int]],
    raw_peaks: list[PeakInfo],
    expected_set_count: int,
    thresholds: DetectionThresholds,
) -> tuple[list[PeakInfo], DetectionThresholds, list[str], int]:
    """Pass 1: raise thresholds and reconsolidate when peak count exceeds soft prior."""
    merge_reasons: list[str] = []
    peaks = consolidate_peaks(smoothed, raw_peaks, thresholds)
    passes_used = 0

    if expected_set_count <= 0:
        return peaks, thresholds, merge_reasons, passes_used

    target_max = max(1, int(expected_set_count * OVERSEGMENTATION_SET_RATIO))
    if len(peaks) > target_max and passes_used < MAX_ADAPTIVE_PASSES:
        raised = _raise_thresholds(thresholds)
        peaks = consolidate_peaks(smoothed, raw_peaks, raised)
        thresholds = raised
        merge_reasons.append(CONFIDENCE_REASON_ADAPTIVE_THRESHOLD)
        passes_used += 1

    return peaks, thresholds, merge_reasons, passes_used


def _weakest_adjacent_block_pair_index(blocks: list[DetectedBlock]) -> int:
    best_i = 0
    best_score = float("inf")
    for i in range(len(blocks) - 1):
        a, b = blocks[i], blocks[i + 1]
        duration = (a.end_sec - a.start_sec) + (b.end_sec - b.start_sec)
        score = min(a.peak_hr, b.peak_hr) - duration * 0.05
        if score < best_score:
            best_score = score
            best_i = i
    return best_i


def merge_excess_blocks(
    blocks: list[DetectedBlock],
    expected_set_count: int,
    *,
    passes_already_used: int,
) -> tuple[list[DetectedBlock], list[str], int]:
    """Pass 2: merge weakest adjacent blocks when count still exceeds soft prior."""
    merge_reasons: list[str] = []
    passes_used = passes_already_used
    if expected_set_count <= 0 or passes_used >= MAX_ADAPTIVE_PASSES:
        return blocks, merge_reasons, passes_used

    target_max = max(1, int(expected_set_count * OVERSEGMENTATION_SET_RATIO))
    current = list(blocks)
    if len(current) <= target_max:
        return current, merge_reasons, passes_used

    while len(current) > target_max and len(current) > 1:
        idx = _weakest_adjacent_block_pair_index(current)
        merged = _merge_two_blocks(current[idx], current[idx + 1])
        current = current[:idx] + [merged] + current[idx + 2 :]

    for i, block in enumerate(current, start=1):
        block.block_index = i

    merge_reasons.append(CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED)
    passes_used += 1
    return current, merge_reasons, passes_used


def find_valleys_between_peaks(
    smoothed: list[tuple[int, int]],
    peaks: list[PeakInfo],
) -> list[ValleyInfo]:
    if not peaks or not smoothed:
        return []
    valleys: list[ValleyInfo] = []
    for i in range(len(peaks) - 1):
        valleys.append(_valley_between_peaks(smoothed, peaks[i], peaks[i + 1]))
    return valleys


def _valley_after_peak(
    smoothed: list[tuple[int, int]],
    peak: PeakInfo,
    session_end: int,
    next_peak_sec: int | None,
    *,
    minimum_recovery_drop_bpm: int = MINIMUM_RECOVERY_DROP_BPM,
    minimum_valley_duration_sec: int = MIN_VALLEY_DURATION_SEC,
) -> tuple[int, int, int]:
    del minimum_recovery_drop_bpm, minimum_valley_duration_sec
    upper = next_peak_sec if next_peak_sec is not None else session_end
    segment = [(s, h) for s, h in smoothed if peak.sec <= s <= upper]
    if not segment:
        end = min(peak.sec + 30, session_end)
        return end, end, peak.hr

    min_sec, min_hr = min(segment, key=lambda x: x[1])
    tol = 2
    v_start = min_sec
    v_end = min_sec
    for s, h in segment:
        if h <= min_hr + tol:
            v_start = min(v_start, s)
            v_end = max(v_end, s)
    return min_sec, v_end, min_hr


def build_blocks_from_peaks(
    smoothed: list[tuple[int, int]],
    peaks: list[PeakInfo],
    duration_sec: int,
    *,
    thresholds: DetectionThresholds | None = None,
) -> list[DetectedBlock]:
    cfg = thresholds or DetectionThresholds()
    if not smoothed:
        return []
    session_start = smoothed[0][0]
    session_end = max(duration_sec - 1, smoothed[-1][0])

    if not peaks:
        return []

    blocks: list[DetectedBlock] = []
    for i, peak in enumerate(peaks):
        next_peak_sec = peaks[i + 1].sec if i + 1 < len(peaks) else None
        start_sec = session_start if i == 0 else blocks[-1].end_sec

        _v_sec, v_end, v_hr = _valley_after_peak(
            smoothed,
            peak,
            session_end,
            next_peak_sec,
        )
        drop = peak.hr - v_hr
        valley_len = max(0, v_end - peak.sec)

        if i < len(peaks) - 1:
            end_sec = (
                v_end
                if drop >= cfg.minimum_recovery_drop_bpm
                and valley_len >= cfg.minimum_valley_duration_sec
                else peaks[i + 1].sec
            )
            if next_peak_sec is not None:
                end_sec = min(end_sec, next_peak_sec)
        else:
            end_sec = session_end + 1

        end_sec = max(start_sec + 1, end_sec)
        blocks.append(
            DetectedBlock(
                block_index=i + 1,
                start_sec=start_sec,
                end_sec=end_sec,
                peak_sec=peak.sec,
                peak_hr=peak.hr,
            )
        )
    return blocks


def _merge_two_blocks(a: DetectedBlock, b: DetectedBlock) -> DetectedBlock:
    dominant = a if a.peak_hr >= b.peak_hr else b
    return DetectedBlock(
        block_index=0,
        start_sec=min(a.start_sec, b.start_sec),
        end_sec=max(a.end_sec, b.end_sec),
        peak_sec=dominant.peak_sec,
        peak_hr=dominant.peak_hr,
    )


def merge_short_blocks(
    blocks: list[DetectedBlock],
    min_duration_sec: int,
) -> tuple[list[DetectedBlock], bool]:
    """Merge blocks shorter than min_duration with an adjacent neighbor."""
    if len(blocks) <= 1:
        return blocks, False

    current = list(blocks)
    changed = False

    while True:
        short_idx = next(
            (
                i
                for i, b in enumerate(current)
                if (b.end_sec - b.start_sec) < min_duration_sec
            ),
            None,
        )
        if short_idx is None:
            break

        if short_idx == 0:
            merge_with = 1
        elif short_idx == len(current) - 1:
            merge_with = short_idx - 1
        else:
            left = current[short_idx - 1]
            right = current[short_idx + 1]
            merge_with = short_idx - 1 if left.peak_hr >= right.peak_hr else short_idx + 1

        a_idx, b_idx = sorted((short_idx, merge_with))
        merged = _merge_two_blocks(current[a_idx], current[b_idx])
        current = current[:a_idx] + [merged] + current[b_idx + 1 :]
        changed = True

    for i, block in enumerate(current, start=1):
        block.block_index = i
    return current, changed


def _slice_raw(
    raw: list[tuple[int, int]],
    start_sec: int,
    end_sec: int,
) -> list[tuple[int, int]]:
    return [(s, h) for s, h in raw if start_sec <= s < end_sec]


def _recovery_time_sec(
    raw: list[tuple[int, int]],
    peak_sec: int,
    peak_hr: int,
    cap_sec: int,
    *,
    minimum_recovery_drop_bpm: int = MINIMUM_RECOVERY_DROP_BPM,
) -> int | None:
    target = peak_hr - minimum_recovery_drop_bpm
    for sec, hr in raw:
        if sec <= peak_sec:
            continue
        if sec > cap_sec:
            break
        if hr <= target:
            return sec - peak_sec
    return None


def compute_block_metrics(
    raw_series: list[tuple[int, int]],
    block: DetectedBlock,
    *,
    next_block_start: int | None = None,
    confidence_reason: str | None = None,
    match_quality: str = "blocks_only",
    matched: bool = False,
) -> dict[str, Any]:
    duration_sec = max(0, block.end_sec - block.start_sec)
    window = _slice_raw(raw_series, block.start_sec, block.end_sec)
    if not window:
        conf, reason = block_confidence(
            {
                "recovery_drop": None,
                "hr_rise": None,
                "matched_exercise": "x" if matched else None,
            },
            match_quality,
            confidence_reason,
        )
        return {
            "block_index": block.block_index,
            "block_id": block.block_index,
            "start_sec": block.start_sec,
            "end_sec": block.end_sec,
            "duration_sec": duration_sec,
            "peak_hr": block.peak_hr,
            "avg_hr": None,
            "min_hr": None,
            "hr_rise": None,
            "recovery_drop": None,
            "recovery_time": None,
            "confidence": conf,
            "confidence_reason": reason,
        }

    hrs = [h for _, h in window]
    min_hr = min(hrs)
    avg_hr = int(round(sum(hrs) / len(hrs)))
    peak_hr = block.peak_hr

    cap = (next_block_start if next_block_start is not None else block.end_sec) - 1
    post_peak = [(s, h) for s, h in raw_series if block.peak_sec <= s <= cap]
    recovery_drop: int | None = None
    if post_peak:
        post_min = min(h for _, h in post_peak)
        recovery_drop = int(peak_hr - post_min)

    recovery_time = _recovery_time_sec(raw_series, block.peak_sec, peak_hr, cap)

    metrics = {
        "block_index": block.block_index,
        "block_id": block.block_index,
        "start_sec": block.start_sec,
        "end_sec": block.end_sec,
        "duration_sec": duration_sec,
        "peak_hr": peak_hr,
        "avg_hr": avg_hr,
        "min_hr": min_hr,
        "hr_rise": peak_hr - min_hr,
        "recovery_drop": recovery_drop,
        "recovery_time": recovery_time,
    }
    conf, reason = block_confidence(
        {**metrics, "matched_exercise": "x" if matched else None},
        match_quality,
        confidence_reason,
    )
    metrics["confidence"] = conf
    metrics["confidence_reason"] = reason
    return metrics


def block_confidence(
    block: dict[str, Any],
    match_quality: str,
    session_reason: str | None = None,
) -> tuple[str, str | None]:
    recovery = block.get("recovery_drop") or 0
    hr_rise = block.get("hr_rise") or 0
    matched = block.get("matched_exercise") is not None

    if matched and match_quality == "exact" and recovery >= 10 and hr_rise >= 15:
        return "high", session_reason
    if matched and recovery >= 5 and hr_rise >= 8:
        return "medium", session_reason
    if recovery >= 10 and hr_rise >= 12:
        return "medium", session_reason
    return "low", session_reason


def detect_hr_blocks(
    points: list[HrPoint],
    duration_sec: int,
    *,
    expected_set_count: int | None = None,
) -> tuple[list[dict[str, Any]], list[PeakInfo], DetectionMeta]:
    """Full pipeline: normalize → smooth → peaks → consolidate → blocks → metrics."""
    meta = DetectionMeta()
    raw = normalize_series(points)
    if not raw:
        return [], [], meta

    thresholds = DetectionThresholds()
    meta.thresholds_used = thresholds
    smoothed = smooth_hr_median(raw)
    raw_peaks = find_local_peaks(
        smoothed,
        min_sep_sec=thresholds.min_peak_distance_sec,
        min_prominence_bpm=thresholds.min_prominence_bpm,
    )
    meta.raw_peak_count = len(raw_peaks)

    expected = expected_set_count or 0
    peaks, thresholds, peak_merge_reasons, passes_used = adaptive_peak_consolidation(
        smoothed, raw_peaks, expected, thresholds
    )
    meta.merge_reasons.extend(peak_merge_reasons)
    meta.adaptive_passes_used = passes_used

    if len(peaks) < len(raw_peaks):
        meta.oversegmentation_corrected = True
        if CONFIDENCE_REASON_MERGED_SMALL_VALLEYS not in meta.merge_reasons:
            meta.merge_reasons.append(CONFIDENCE_REASON_MERGED_SMALL_VALLEYS)

    if expected and len(peaks) > int(expected * OVERSEGMENTATION_SET_RATIO):
        peaks, guided = apply_expected_set_guidance(
            smoothed, peaks, expected, thresholds
        )
        if guided:
            meta.oversegmentation_corrected = True
            if CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED not in meta.merge_reasons:
                meta.merge_reasons.append(CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED)

    meta.consolidated_peak_count = len(peaks)
    meta.thresholds_used = thresholds

    blocks = build_blocks_from_peaks(smoothed, peaks, duration_sec, thresholds=thresholds)
    meta.raw_blocks_count = len(blocks)

    blocks, short_merged = merge_short_blocks(blocks, thresholds.min_block_duration_sec)
    if short_merged:
        meta.oversegmentation_corrected = True
        if CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED not in meta.merge_reasons:
            meta.merge_reasons.append(CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED)

    if expected:
        blocks, block_merge_reasons, passes_used = merge_excess_blocks(
            blocks, expected, passes_already_used=meta.adaptive_passes_used
        )
        meta.merge_reasons.extend(block_merge_reasons)
        meta.adaptive_passes_used = passes_used

    meta.merged_blocks_count = len(blocks)

    block_reason = (
        meta.merge_reasons[0] if meta.merge_reasons else None
    )
    if meta.oversegmentation_corrected and not block_reason:
        block_reason = CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED
    meta.confidence_reasons = list(dict.fromkeys(meta.merge_reasons))
    meta.confidence_reason = meta.confidence_reasons[0] if meta.confidence_reasons else None

    metrics: list[dict[str, Any]] = []
    for i, block in enumerate(blocks):
        next_start = blocks[i + 1].start_sec if i + 1 < len(blocks) else None
        metrics.append(
            compute_block_metrics(
                raw,
                block,
                next_block_start=next_start,
                confidence_reason=block_reason,
            )
        )

    return metrics, peaks, meta


def _load_display(set_row: dict[str, Any]) -> str:
    load_str = set_row.get("reps_str") or str(set_row.get("reps") or "")
    weight = float(set_row.get("weight") or 0)
    if weight > 0 and "сек" not in load_str:
        return f"{weight:g} × {load_str}"
    return load_str


def _exercise_set_numbers(ordered_sets: list[dict[str, Any]]) -> list[int]:
    """Номер подхода внутри упражнения (разминка и рабочие считаются отдельно)."""
    counters: dict[tuple[str, bool], int] = {}
    out: list[int] = []
    for s in ordered_sets:
        key = (str(s.get("exercise") or ""), bool(s.get("is_warmup")))
        counters[key] = counters.get(key, 0) + 1
        out.append(counters[key])
    return out


def match_blocks_to_sets(
    detected_blocks: list[dict[str, Any]],
    ordered_sets: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], str]:
    """
    Match blocks to ordered sets 1:1 by index.
    Returns (enriched_blocks, matched_sets_view, match_quality).
    """
    n_blocks = len(detected_blocks)
    n_sets = len(ordered_sets)

    if n_sets == 0:
        enriched = []
        for block in detected_blocks:
            b = dict(block)
            b.update(
                {
                    "matched_order_index": None,
                    "matched_exercise": None,
                    "matched_set_number": None,
                    "matched_load_display": None,
                    "is_warmup": False,
                    "confidence": "low",
                }
            )
            enriched.append(b)
        return enriched, [], "blocks_only"

    if n_blocks == n_sets:
        quality = "exact"
    elif abs(n_blocks - n_sets) <= 1:
        quality = "partial"
    else:
        quality = "partial" if n_blocks > 0 else "blocks_only"

    enriched: list[dict[str, Any]] = []
    matched_sets: list[dict[str, Any]] = []
    match_count = min(n_blocks, n_sets)
    exercise_set_nums = _exercise_set_numbers(ordered_sets)

    for i in range(n_blocks):
        block = dict(detected_blocks[i])
        if i < match_count:
            s = ordered_sets[i]
            ex_set_num = exercise_set_nums[i]
            block.update(
                {
                    "matched_order_index": int(s.get("order_index") or 0),
                    "matched_exercise": str(s.get("exercise") or ""),
                    "matched_set_number": ex_set_num,
                    "matched_load_display": _load_display(s),
                    "is_warmup": bool(s.get("is_warmup")),
                }
            )
            conf, reason = block_confidence(block, quality, block.get("confidence_reason"))
            block["confidence"] = conf
            block["confidence_reason"] = reason
            matched_sets.append(
                {
                    "order_index": int(s.get("order_index") or 0),
                    "set_number": ex_set_num,
                    "exercise": str(s.get("exercise") or ""),
                    "weight": float(s.get("weight") or 0),
                    "reps_str": s.get("reps_str") or str(s.get("reps") or ""),
                    "load_display": _load_display(s),
                    "is_warmup": bool(s.get("is_warmup")),
                    "start_sec": block["start_sec"],
                    "end_sec": block["end_sec"],
                    "peak_hr": block.get("peak_hr"),
                    "avg_hr": block.get("avg_hr"),
                    "max_hr": block.get("peak_hr"),
                    "min_hr": block.get("min_hr"),
                    "hr_rise": block.get("hr_rise"),
                    "recovery_drop": block.get("recovery_drop"),
                    "recovery_time": block.get("recovery_time"),
                    "recovery_delta_bpm": block.get("recovery_drop"),
                    "zone_seconds": None,
                    "strain_score": None,
                    "confidence": block.get("confidence", "medium"),
                    "confidence_reason": block.get("confidence_reason"),
                }
            )
        else:
            block.update(
                {
                    "matched_order_index": None,
                    "matched_exercise": None,
                    "matched_set_number": None,
                    "matched_load_display": None,
                    "is_warmup": False,
                    "confidence": "low",
                }
            )
        enriched.append(block)

    for j in range(match_count, n_sets):
        s = ordered_sets[j]
        matched_sets.append(
            {
                "order_index": int(s.get("order_index") or 0),
                "set_number": exercise_set_nums[j],
                "exercise": str(s.get("exercise") or ""),
                "weight": float(s.get("weight") or 0),
                "reps_str": s.get("reps_str") or str(s.get("reps") or ""),
                "load_display": _load_display(s),
                "is_warmup": bool(s.get("is_warmup")),
                "start_sec": 0,
                "end_sec": 0,
                "peak_hr": None,
                "avg_hr": None,
                "max_hr": None,
                "min_hr": None,
                "hr_rise": None,
                "recovery_drop": None,
                "recovery_time": None,
                "recovery_delta_bpm": None,
                "zone_seconds": None,
                "strain_score": None,
                "confidence": "low",
                "confidence_reason": None,
            }
        )

    if n_sets == 0:
        quality = "blocks_only"
    elif n_blocks == 0:
        quality = "blocks_only"
    elif n_blocks != n_sets:
        quality = "partial"

    return enriched, matched_sets, quality


def count_working_sets(ordered_sets: list[dict[str, Any]]) -> int:
    return sum(1 for s in ordered_sets if not s.get("is_warmup"))


def count_working_blocks(blocks: list[dict[str, Any]]) -> int:
    return sum(1 for b in blocks if not b.get("is_warmup"))


def detect_superset_pattern(
    ordered_sets: list[dict[str, Any]],
    enriched_blocks: list[dict[str, Any]],
    match_quality: str,
) -> bool:
    if len(ordered_sets) < 2:
        return False
    working = [s for s in ordered_sets if not s.get("is_warmup")]
    if len(working) < 2:
        return False
    exercises = [str(s.get("exercise") or "") for s in working]
    unique = set(exercises)
    if len(unique) < 2:
        return False

    matched_exercises = {
        b.get("matched_exercise")
        for b in enriched_blocks
        if b.get("matched_exercise")
    }
    if len(matched_exercises) >= 2 and match_quality != "exact":
        return True

    alternating = all(
        exercises[i] != exercises[i + 1] for i in range(len(exercises) - 1)
    )
    if alternating and match_quality == "partial":
        return True
    if alternating and len(enriched_blocks) > len(working):
        return True
    return False


def session_confidence(
    match_quality: str,
    n_blocks: int,
    n_sets: int,
    *,
    oversegmentation_corrected: bool = False,
    working_blocks: int | None = None,
    working_sets: int | None = None,
    session_duration_sec: int = 0,
    hr_sample_count: int = 0,
    merge_reasons: list[str] | None = None,
    superset_detected: bool = False,
) -> tuple[str, list[str]]:
    """Session-level confidence; warmup blocks excluded from mismatch when counts provided."""
    reasons: list[str] = list(merge_reasons or [])
    wb = working_blocks if working_blocks is not None else n_blocks
    ws = working_sets if working_sets is not None else n_sets

    if match_quality == "blocks_only" or ws == 0:
        if CONFIDENCE_REASON_NO_ORDERED_SETS not in reasons:
            reasons.append(CONFIDENCE_REASON_NO_ORDERED_SETS)
        return "low", reasons

    if session_duration_sec > 0 and session_duration_sec < 120:
        if CONFIDENCE_REASON_SHORT_SESSION not in reasons:
            reasons.append(CONFIDENCE_REASON_SHORT_SESSION)

    if hr_sample_count > 0 and hr_sample_count < 30:
        if CONFIDENCE_REASON_NOISY_SIGNAL not in reasons:
            reasons.append(CONFIDENCE_REASON_NOISY_SIGNAL)

    if abs(wb - ws) > 1:
        if CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH not in reasons:
            reasons.append(CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH)

    if superset_detected:
        if CONFIDENCE_REASON_SUPERSET_DETECTED not in reasons:
            reasons.append(CONFIDENCE_REASON_SUPERSET_DETECTED)
        return "medium", reasons

    mismatch = CONFIDENCE_REASON_BLOCK_COUNT_MISMATCH in reasons
    noisy = CONFIDENCE_REASON_NOISY_SIGNAL in reasons
    short = CONFIDENCE_REASON_SHORT_SESSION in reasons
    corrected = oversegmentation_corrected or CONFIDENCE_REASON_OVERSEGMENTATION_CORRECTED in reasons

    if match_quality == "exact" and wb >= 2 and not mismatch and not noisy and not short:
        if not corrected:
            return "high", reasons
        return "medium", reasons

    if match_quality == "exact" and not mismatch:
        return "medium", reasons

    if oversegmentation_corrected and wb != ws:
        if abs(wb - ws) <= max(2, int(ws * 0.15)):
            return "medium", reasons
        return "low", reasons

    if abs(wb - ws) <= 1 and wb > 0:
        return "medium", reasons

    return "low", reasons
