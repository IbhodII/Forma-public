# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
import tempfile
import zipfile
from dataclasses import dataclass
from typing import Any

from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.entity_mappers import PackageMeta, rows_to_jsonl, sha256_file
from backend.services.forma_sync.entity_types import ENTITY_FILES, FormaSyncEntityType
from backend.services.forma_sync.export_changes import export_baseline_changes, export_pending_changes


@dataclass
class BuildPackageResult:
    zip_path: str
    sha256: str
    entities_summary: dict[str, int]
    row_count: int
    exported_refs: list[Any]


def _assemble_package(
    exported: dict,
    base_revision: int,
    *,
    baseline: bool = False,
) -> BuildPackageResult | None:
    if exported["row_count"] == 0:
        return None

    device_id = sync_meta.get_or_create_device_id()
    jsonl = exported["jsonl"]
    entities_summary = {entity: len(jsonl[entity]) for entity in ENTITY_FILES}

    tmp = tempfile.NamedTemporaryFile(suffix=".zip", delete=False)
    tmp_path = tmp.name
    tmp.close()

    from backend.services.forma_sync.entity_mappers import now_iso

    meta = PackageMeta(
        schema_version=1,
        device_id=device_id,
        source="desktop",
        created_at=now_iso(),
        base_revision=base_revision,
    )

    with zipfile.ZipFile(tmp_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("meta.json", json.dumps(meta.to_dict(), indent=2, ensure_ascii=False))
        for entity in ENTITY_FILES:
            content = rows_to_jsonl(jsonl[entity])
            if content:
                zf.writestr(f"changes/{entity}.jsonl", content)

    digest = sha256_file(tmp_path)
    return BuildPackageResult(
        zip_path=tmp_path,
        sha256=digest,
        entities_summary=entities_summary,
        row_count=exported["row_count"],
        exported_refs=exported["exported_refs"],
    )


def build_forma_sync_package(base_revision: int) -> BuildPackageResult | None:
    exported = export_pending_changes()
    return _assemble_package(exported, base_revision, baseline=False)


def build_forma_sync_baseline_package(base_revision: int = 0) -> BuildPackageResult | None:
    exported = export_baseline_changes()
    return _assemble_package(exported, base_revision, baseline=True)
