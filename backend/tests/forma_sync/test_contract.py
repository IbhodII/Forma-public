# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import tempfile
import zipfile

import pytest

from backend.services.forma_sync.entity_mappers import parse_jsonl, payload_equal, sha256_file
from backend.services.forma_sync.entity_types import build_entity_id, parse_entity_id
from backend.services.forma_sync.manifest import next_revision, parse_manifest


def test_parse_entity_id_food():
    parsed = parse_entity_id("food:mobile:15")
    assert parsed is not None
    assert parsed.entity == "food_entries"
    assert parsed.origin == "mobile"
    assert parsed.local_key == "15"


def test_build_entity_id_strength_session():
    eid = build_entity_id("strength_workouts", "desktop", "2026-05-30|Push")
    assert eid == "strength:desktop:2026-05-30|Push"


def test_parse_manifest_v1():
    raw = json.dumps(
        {
            "schema_version": 1,
            "revision": 3,
            "updated_at": "2026-05-30T12:00:00Z",
            "source_device": "mobile",
            "source_device_id": "abc",
            "package": "packages/000003-mobile.zip",
            "package_sha256": "deadbeef",
            "entities_summary": {"food_entries": 1},
        }
    )
    m = parse_manifest(raw)
    assert m is not None
    assert m.revision == 3
    assert m.schema_version == 1


def test_parse_manifest_rejects_v2():
    m = parse_manifest(json.dumps({"schema_version": 2, "revision": 1}))
    assert m is None


def test_next_revision():
    assert next_revision(2, 5) == 6
    assert next_revision(7, 3) == 8


def test_needs_baseline_upload():
    from backend.services.forma_sync.baseline import needs_baseline_upload

    assert needs_baseline_upload(None, 0, None, True) is True
    assert needs_baseline_upload(None, 0, None, False) is False
    assert needs_baseline_upload(None, 1, None, True) is False
    assert needs_baseline_upload(None, 0, "2026-01-01T00:00:00Z", True) is False
    m = parse_manifest(
        json.dumps(
            {
                "schema_version": 1,
                "revision": 1,
                "updated_at": "2026-05-30T12:00:00Z",
                "source_device": "mobile",
                "source_device_id": "x",
                "package": "packages/000001-mobile.zip",
                "package_sha256": "ab",
                "entities_summary": {},
            }
        )
    )
    assert needs_baseline_upload(m, 0, None, True) is False


def test_jsonl_roundtrip():
    row = {
        "id": "food:mobile:1",
        "updated_at": "2026-05-30T12:00:00Z",
        "source": "mobile",
        "device_id": "dev",
        "payload": {"date": "2026-05-30", "product_id": 1, "quantity": 100},
        "deleted_at": None,
    }
    content = json.dumps(row) + "\n"
    parsed = parse_jsonl(content)
    assert len(parsed) == 1
    assert parsed[0]["id"] == "food:mobile:1"


def test_payload_equal():
    assert payload_equal({"a": 1}, {"a": 1})
    assert not payload_equal({"a": 1}, {"a": 2})


def test_package_builder_and_sha256():
    from backend.services.forma_sync.entity_mappers import rows_to_jsonl
    from backend.services.forma_sync.entity_types import FormaSyncJsonlRow

    rows = [
        FormaSyncJsonlRow(
            id="food:desktop:1",
            updated_at="2026-05-30T12:00:00Z",
            source="desktop",
            device_id="d1",
            payload={"date": "2026-05-30"},
        )
    ]
    content = rows_to_jsonl(rows)
    assert "food:desktop:1" in content

    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
        path = tmp.name
    with zipfile.ZipFile(path, "w") as zf:
        zf.writestr("meta.json", json.dumps({"schema_version": 1}))
        zf.writestr("changes/food_entries.jsonl", content)
    digest = sha256_file(path)
    assert len(digest) == 64


def test_apply_rejects_schema_v2(tmp_path):
    from backend.services.forma_sync.package_applier import apply_forma_sync_package

    zip_path = tmp_path / "pkg.zip"
    with zipfile.ZipFile(zip_path, "w") as zf:
        zf.writestr("meta.json", json.dumps({"schema_version": 2}))
    digest = sha256_file(str(zip_path))
    with pytest.raises(ValueError, match="schema_version"):
        apply_forma_sync_package(str(zip_path), digest, 1)
