# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.change_tracker import (
    count_pending_changes,
    count_unresolved_conflicts,
    list_unresolved_conflicts,
    resolve_conflict,
)
from backend.services.forma_sync.baseline import local_has_syncable_data, needs_baseline_upload
from backend.services.forma_sync.download_flow import DownloadFlowResult, run_download_flow
from backend.services.forma_sync.sync_plan import build_sync_plan
from backend.services.forma_sync.sync_state import is_sync_in_flight, sync_lock
from backend.services.forma_sync.upload_flow import run_upload_flow
from backend.database.client_context import is_admin_browser_client
from backend.services.forma_sync.yandex_api import (
    fetch_remote_manifest,
    fetch_yandex_uid,
    is_yandex_connected,
)

logger = logging.getLogger(__name__)


@dataclass
class FormaSyncStatus:
    yandex_connected: bool
    yandex_uid: str | None
    local_revision: int
    remote_revision: int | None
    pending_changes: int
    conflict_count: int
    last_upload_at: str | None
    last_download_at: str | None
    last_error: str | None
    sync_in_flight: bool
    auto_enabled: bool
    baseline_required: bool = False
    cloud_folder_web: str | None = None
    debug_plan: dict[str, Any] | None = None


@dataclass
class FormaSyncSyncResult:
    uploaded: bool
    downloaded: bool
    message: str


async def get_forma_sync_status(
    user_id: int | None = None,
    *,
    include_debug: bool | None = None,
    fetch_remote: bool = True,
) -> FormaSyncStatus:
    uid = user_id if user_id is not None else get_current_user_id()
    connected = is_yandex_connected(uid)
    yandex_uid: str | None = None
    remote_revision: int | None = None
    remote = None

    if connected and fetch_remote:
        try:
            yandex_uid = fetch_yandex_uid(uid)
            remote = await fetch_remote_manifest(uid, yandex_uid)
            remote_revision = remote.revision if remote else None
        except Exception as err:
            logger.debug("forma_sync status remote manifest: %s", err)
    elif connected:
        try:
            yandex_uid = fetch_yandex_uid(uid)
        except Exception as err:
            logger.debug("forma_sync status yandex uid: %s", err)

    conn = get_db()
    try:
        pending = count_pending_changes(conn, uid)
        conflicts = count_unresolved_conflicts(conn)
        has_data = local_has_syncable_data(conn, uid)
    finally:
        conn.close()

    local_revision = sync_meta.get_last_seen_revision()
    baseline_required = needs_baseline_upload(
        remote,
        local_revision,
        sync_meta.get_last_upload_at(),
        has_data,
    )
    show_debug = include_debug if include_debug is not None else is_admin_browser_client()
    debug_plan = None
    if show_debug:
        debug_plan = build_sync_plan(
            uid,
            remote_manifest=remote,
            yandex_uid=yandex_uid,
        )
        debug_plan["baseline_required"] = baseline_required

    cloud_folder_web = f"/FormaSync/{yandex_uid}" if yandex_uid else None

    return FormaSyncStatus(
        yandex_connected=connected,
        yandex_uid=yandex_uid,
        local_revision=local_revision,
        remote_revision=remote_revision,
        pending_changes=pending,
        conflict_count=conflicts,
        last_upload_at=sync_meta.get_last_upload_at(),
        last_download_at=sync_meta.get_last_download_at(),
        last_error=sync_meta.get_last_error(),
        sync_in_flight=is_sync_in_flight(),
        auto_enabled=sync_meta.is_auto_enabled(),
        baseline_required=baseline_required,
        cloud_folder_web=cloud_folder_web,
        debug_plan=debug_plan,
    )


async def sync_forma_sync(user_id: int | None = None, *, force_upload: bool = False) -> FormaSyncSyncResult:
    with sync_lock():
        parts: list[str] = []
        downloaded = False
        uploaded = False
        try:
            try:
                dl = await run_download_flow(user_id)
            except RuntimeError as err:
                msg = str(err)
                if "отсутствует на Диске" in msg or "manifest отсутствует" in msg:
                    dl = DownloadFlowResult(
                        downloaded=False,
                        applied=0,
                        conflicts=0,
                        message=msg,
                    )
                else:
                    raise
            if dl.downloaded:
                downloaded = True
            parts.append(dl.message)

            up = await run_upload_flow(user_id, force=force_upload)
            if up.uploaded:
                uploaded = True
                parts.append(up.message)
            elif force_upload or not up.message.startswith("Нет локальных"):
                parts.append(up.message)

            sync_meta.set_last_error(None)
            return FormaSyncSyncResult(
                uploaded=uploaded,
                downloaded=downloaded,
                message=". ".join(p for p in parts if p) or "Синхронизация завершена",
            )
        except Exception as err:
            message = str(err).strip() or err.__class__.__name__
            sync_meta.set_last_error(message)
            if not isinstance(err, RuntimeError):
                raise RuntimeError(message) from err
            raise


async def upload_forma_sync_only(user_id: int | None = None, *, force: bool = False) -> FormaSyncSyncResult:
    with sync_lock():
        try:
            up = await run_upload_flow(user_id, force=force)
            sync_meta.set_last_error(None)
            return FormaSyncSyncResult(uploaded=up.uploaded, downloaded=False, message=up.message)
        except Exception as err:
            message = str(err).strip() or err.__class__.__name__
            sync_meta.set_last_error(message)
            if not isinstance(err, RuntimeError):
                raise RuntimeError(message) from err
            raise


async def download_forma_sync_only(user_id: int | None = None) -> FormaSyncSyncResult:
    with sync_lock():
        try:
            dl = await run_download_flow(user_id)
            sync_meta.set_last_error(None)
            return FormaSyncSyncResult(uploaded=False, downloaded=dl.downloaded, message=dl.message)
        except Exception as err:
            message = str(err).strip() or err.__class__.__name__
            sync_meta.set_last_error(message)
            if not isinstance(err, RuntimeError):
                raise RuntimeError(message) from err
            raise


def list_conflicts() -> list[dict[str, Any]]:
    conn = get_db()
    try:
        return list_unresolved_conflicts(conn)
    finally:
        conn.close()


def resolve_conflict_by_id(conflict_id: int) -> None:
    conn = get_db()
    try:
        resolve_conflict(conn, conflict_id)
        conn.commit()
    finally:
        conn.close()
