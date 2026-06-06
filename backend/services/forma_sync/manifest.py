# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any


@dataclass
class FormaSyncManifest:
    schema_version: int
    revision: int
    updated_at: str
    source_device: str
    source_device_id: str
    package: str
    package_sha256: str
    entities_summary: dict[str, int] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> FormaSyncManifest | None:
        if data.get("schema_version") != 1:
            return None
        rev = data.get("revision")
        if not isinstance(rev, int):
            return None
        return cls(
            schema_version=1,
            revision=rev,
            updated_at=str(data.get("updated_at") or ""),
            source_device=str(data.get("source_device") or ""),
            source_device_id=str(data.get("source_device_id") or ""),
            package=str(data.get("package") or ""),
            package_sha256=str(data.get("package_sha256") or ""),
            entities_summary=dict(data.get("entities_summary") or {}),
        )

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema_version": self.schema_version,
            "revision": self.revision,
            "updated_at": self.updated_at,
            "source_device": self.source_device,
            "source_device_id": self.source_device_id,
            "package": self.package,
            "package_sha256": self.package_sha256,
            "entities_summary": self.entities_summary,
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), indent=2, ensure_ascii=False)


def parse_manifest(raw: str) -> FormaSyncManifest | None:
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return FormaSyncManifest.from_dict(data)
    except json.JSONDecodeError:
        return None


def next_revision(local_last_seen: int, remote_revision: int | None) -> int:
    base = max(local_last_seen, remote_revision or 0)
    return base + 1
