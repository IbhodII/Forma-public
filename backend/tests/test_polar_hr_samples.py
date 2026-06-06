# -*- coding: utf-8 -*-
"""Polar AccessLink: догрузка samples пульса."""
from __future__ import annotations

from backend.services.polar_attach_service import extract_hr_samples
from sync_polar import (
    _detail_has_inline_hr_samples,
    _is_hr_sample_block,
    _merge_hr_sample_blocks,
    _parse_sample_type_ids_from_list_payload,
    ensure_polar_exercise_hr_samples,
)

BEAT_STRENGTH_SUMMARY = {
    "id": 488338200,
    "transaction-id": 332767381,
    "heart-rate": {"average": 109, "maximum": 151},
    "duration": "PT52M38.189S",
    "sport": "OTHER",
    "detailed-sport-info": "STRENGTH_TRAINING",
}

HR_SAMPLE_BLOCK = {
    "recording-rate": 1,
    "sample-type": "1",
    "data": "90,91,92,93,94",
}

HR_SAMPLE_BLOCK_TYPE_0 = {
    "recording-rate": 1,
    "sample-type": 0,
    "data": "84,85,86,86,87,0,,999,87",
}

UNKNOWN_HR_LIKE_SAMPLE_BLOCK = {
    "recording-rate": 2,
    "sample-type": "unexpected",
    "data": "84,85,86,86,87",
}


def test_detail_without_samples_not_inline():
    assert not _detail_has_inline_hr_samples(BEAT_STRENGTH_SUMMARY)
    assert extract_hr_samples(BEAT_STRENGTH_SUMMARY) == []


def test_merge_samples_enables_extraction():
    merged = _merge_hr_sample_blocks(BEAT_STRENGTH_SUMMARY, [HR_SAMPLE_BLOCK])
    assert _detail_has_inline_hr_samples(merged)
    pts = extract_hr_samples(merged)
    assert len(pts) == 5
    assert pts[0] == (0, 90)


def test_accesslink_sample_type_zero_hr_csv_extracts_points():
    payload = {**BEAT_STRENGTH_SUMMARY, "samples": [HR_SAMPLE_BLOCK_TYPE_0]}

    pts = extract_hr_samples(payload)

    assert pts[:5] == [(0, 84), (1, 85), (2, 86), (3, 86), (4, 87)]
    assert pts[-1] == (8, 87)
    assert len(pts) == 6
    assert _detail_has_inline_hr_samples(payload)


def test_unknown_sample_type_with_hr_summary_and_hr_like_csv_extracts_points():
    payload = {**BEAT_STRENGTH_SUMMARY, "samples": [UNKNOWN_HR_LIKE_SAMPLE_BLOCK]}

    pts = extract_hr_samples(payload)

    assert pts == [(0, 84), (2, 85), (4, 86), (6, 86), (8, 87)]


def test_sample_type_one_filters_garbage_values():
    payload = {
        **BEAT_STRENGTH_SUMMARY,
        "samples": [
            {
                "recording-rate": 1,
                "sample-type": "1",
                "data": "84,0,,999,-5,null,85",
            }
        ],
    }

    pts = extract_hr_samples(payload)

    assert pts == [(0, 84), (6, 85)]


def test_recording_rate_controls_elapsed_seconds():
    payload = {
        **BEAT_STRENGTH_SUMMARY,
        "samples": [
            {
                "recording-rate": 5,
                "sample-type": "1",
                "data": "90,91,92",
            }
        ],
    }

    pts = extract_hr_samples(payload)

    assert pts == [(0, 90), (5, 91), (10, 92)]


def test_parse_sample_type_ids_from_urls():
    payload = {
        "samples": [
            "https://www.polaraccesslink.com/v3/users/1/exercise-transactions/2/exercises/3/samples/1",
            "https://www.polaraccesslink.com/v3/users/1/exercise-transactions/2/exercises/3/samples/3",
        ]
    }
    assert _parse_sample_type_ids_from_list_payload(payload) == ["1", "3"]


def test_is_hr_sample_block():
    assert _is_hr_sample_block(HR_SAMPLE_BLOCK)


NON_HR_SAMPLE_BLOCK = {
    "recording-rate": 1,
    "sample-type": "3",
    "data": "1.2,1.3,1.4",
}


def test_non_hr_block_not_inline_hr():
    """Non-HR sample block with data string must not block ensure_polar fetch."""
    payload = {**BEAT_STRENGTH_SUMMARY, "samples": [NON_HR_SAMPLE_BLOCK]}
    assert not _detail_has_inline_hr_samples(payload)
    assert extract_hr_samples(payload) == []


def test_sample_type_zero_without_hr_summary_is_not_treated_as_hr():
    payload = {"samples": [HR_SAMPLE_BLOCK_TYPE_0]}
    assert extract_hr_samples(payload) == []


def test_ensure_polar_fetches_missing_samples(monkeypatch):
    calls: list[str] = []

    def fake_list(access_token, user_id, transaction_id, exercise_id):
        calls.append("list")
        return ["1"]

    def fake_fetch(access_token, user_id, transaction_id, exercise_id, type_id):
        calls.append(f"fetch:{type_id}")
        return HR_SAMPLE_BLOCK if type_id == "1" else None

    monkeypatch.setattr(
        "sync_polar._list_exercise_sample_type_ids", fake_list
    )
    monkeypatch.setattr(
        "sync_polar._fetch_exercise_sample_block", fake_fetch
    )

    out = ensure_polar_exercise_hr_samples(
        "token", "59344711", "332767381", "488338200", dict(BEAT_STRENGTH_SUMMARY)
    )
    assert "list" in calls
    assert extract_hr_samples(out)
