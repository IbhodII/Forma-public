# -*- coding: utf-8 -*-
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

FormaSyncEntityType = Literal[
    "food_entries",
    "body_metrics",
    "strength_workouts",
    "stretching_log",
    "bracelet_calories",
    "hc_days",
    "cardio_workouts",
    "food_products",
    "strength_presets",
    "user_preferences",
]

ENTITY_PREFIX: dict[str, str] = {
    "food_entries": "food",
    "body_metrics": "body",
    "strength_workouts": "strength",
    "stretching_log": "stretching",
    "bracelet_calories": "bracelet",
    "hc_days": "hc",
    "cardio_workouts": "cardio",
    "food_products": "product",
    "strength_presets": "preset",
    "user_preferences": "prefs",
}

PREFIX_TO_ENTITY: dict[str, FormaSyncEntityType] = {
    "food": "food_entries",
    "body": "body_metrics",
    "strength": "strength_workouts",
    "stretching": "stretching_log",
    "bracelet": "bracelet_calories",
    "cardio": "cardio_workouts",
    "product": "food_products",
    "preset": "strength_presets",
    "prefs": "user_preferences",
}

ENTITY_FILES: list[FormaSyncEntityType] = [
    "food_entries",
    "body_metrics",
    "strength_workouts",
    "stretching_log",
    "bracelet_calories",
    "hc_days",
    "cardio_workouts",
    "food_products",
    "strength_presets",
    "user_preferences",
]


@dataclass
class FormaSyncJsonlRow:
    id: str
    updated_at: str
    source: str
    device_id: str
    payload: Any | None
    server_id: int | None = None
    deleted_at: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "updated_at": self.updated_at,
            "source": self.source,
            "device_id": self.device_id,
            "payload": self.payload,
        }
        if self.server_id is not None:
            out["server_id"] = self.server_id
        if self.deleted_at is not None:
            out["deleted_at"] = self.deleted_at
        else:
            out["deleted_at"] = None
        return out


@dataclass
class ParsedEntityId:
    entity: FormaSyncEntityType
    origin: str
    local_key: str


def build_entity_id(entity: FormaSyncEntityType, origin: str, local_key: str | int) -> str:
    if entity == "hc_days":
        return f"hc:health_connect:{local_key}"
    prefix = ENTITY_PREFIX[entity]
    return f"{prefix}:{origin}:{local_key}"


def parse_entity_id(entity_id: str) -> ParsedEntityId | None:
    parts = entity_id.split(":")
    if len(parts) < 3:
        return None
    kind, origin = parts[0], parts[1]
    local_key = ":".join(parts[2:])
    if kind == "hc":
        return ParsedEntityId(entity="hc_days", origin=origin, local_key=local_key)
    entity = PREFIX_TO_ENTITY.get(kind)
    if not entity:
        return None
    return ParsedEntityId(entity=entity, origin=origin, local_key=local_key)


def is_cross_origin(origin: str) -> bool:
    return origin in ("mobile", "remote")
