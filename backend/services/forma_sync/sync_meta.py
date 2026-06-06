# -*- coding: utf-8 -*-
from __future__ import annotations

import uuid

from backend.database.app_meta import meta_get, meta_set

KEYS = {
    "last_seen_revision": "forma_sync:last_seen_revision",
    "last_upload_at": "forma_sync:last_upload_at",
    "last_download_at": "forma_sync:last_download_at",
    "device_id": "forma_sync:device_id",
    "last_error": "forma_sync:last_error",
    "auto_enabled": "forma_sync:auto_enabled",
}


def get_last_seen_revision() -> int:
    raw = meta_get(KEYS["last_seen_revision"])
    if not raw:
        return 0
    try:
        return int(raw)
    except ValueError:
        return 0


def set_last_seen_revision(revision: int) -> None:
    meta_set(KEYS["last_seen_revision"], str(revision))


def get_last_upload_at() -> str | None:
    raw = meta_get(KEYS["last_upload_at"])
    return raw if raw else None


def set_last_upload_at(iso: str) -> None:
    meta_set(KEYS["last_upload_at"], iso)


def get_last_download_at() -> str | None:
    raw = meta_get(KEYS["last_download_at"])
    return raw if raw else None


def set_last_download_at(iso: str) -> None:
    meta_set(KEYS["last_download_at"], iso)


def get_last_error() -> str | None:
    raw = meta_get(KEYS["last_error"])
    return raw if raw and raw.strip() else None


def set_last_error(message: str | None) -> None:
    meta_set(KEYS["last_error"], message or "")


def get_or_create_device_id() -> str:
    existing = meta_get(KEYS["device_id"])
    if existing:
        return existing
    new_id = str(uuid.uuid4())
    meta_set(KEYS["device_id"], new_id)
    return new_id


def is_auto_enabled() -> bool:
    raw = meta_get(KEYS["auto_enabled"])
    return raw != "0"


def set_auto_enabled(enabled: bool) -> None:
    meta_set(KEYS["auto_enabled"], "1" if enabled else "0")
