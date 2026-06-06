# -*- coding: utf-8 -*-
from __future__ import annotations

import os
from typing import Any

from backend.database import get_db
from database.connection import WORKOUTS_DB_PATH
from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.baseline import local_has_syncable_data, needs_baseline_upload
from backend.services.forma_sync.change_tracker import count_pending_changes
from backend.services.forma_sync.paths import forma_sync_manifest_path, forma_sync_root_path
from backend.services.forma_sync.yandex_api import is_yandex_connected


def build_sync_plan(
    user_id: int | None = None,
    *,
    client_type: str = "desktop",
    remote_manifest: Any | None = None,
    yandex_uid: str | None = None,
) -> dict[str, Any]:
    uid = user_id if user_id is not None else get_current_user_id()
    local_revision = sync_meta.get_last_seen_revision()
    last_upload_at = sync_meta.get_last_upload_at()
    connected = is_yandex_connected(uid)

    conn = get_db()
    try:
        pending = count_pending_changes(conn, uid)
        has_data = local_has_syncable_data(conn, uid)
    finally:
        conn.close()

    manifest_exists = remote_manifest is not None
    baseline_required = needs_baseline_upload(
        remote_manifest, local_revision, last_upload_at, has_data
    )
    cloud_path = forma_sync_root_path(yandex_uid) if yandex_uid else None
    upload_target = (
        f"{forma_sync_manifest_path(yandex_uid)} + packages/" if yandex_uid else None
    )
    download_target = forma_sync_manifest_path(yandex_uid) if yandex_uid else None

    return {
        "client_type": client_type,
        "db_path": str(WORKOUTS_DB_PATH),
        "current_user_id": uid,
        "yandex_uid": yandex_uid,
        "yandex_connected": connected,
        "cloud_path": cloud_path,
        "manifest_exists": manifest_exists,
        "local_revision": local_revision,
        "remote_revision": remote_manifest.revision if remote_manifest else None,
        "pending_entities_count": pending,
        "baseline_required": baseline_required,
        "local_has_data": has_data,
        "package_path": None,
        "package_size": None,
        "upload_target": upload_target,
        "download_target": download_target,
    }


def enrich_plan_with_package(plan: dict[str, Any], zip_path: str | None) -> dict[str, Any]:
    if not zip_path:
        return plan
    try:
        size = os.path.getsize(zip_path)
    except OSError:
        size = None
    plan = dict(plan)
    plan["package_path"] = zip_path
    plan["package_size"] = size
    return plan
