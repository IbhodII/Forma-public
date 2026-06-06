# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from dataclasses import dataclass

from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.entity_mappers import now_iso
from backend.services.forma_sync.package_applier import apply_forma_sync_package
from backend.services.forma_sync.yandex_api import (
    download_package,
    fetch_remote_manifest,
    fetch_yandex_uid,
    is_yandex_connected,
)

logger = logging.getLogger(__name__)


@dataclass
class DownloadFlowResult:
    downloaded: bool
    applied: int
    conflicts: int
    message: str


async def run_download_flow(user_id: int | None = None) -> DownloadFlowResult:
    uid = user_id if user_id is not None else get_current_user_id()
    if not is_yandex_connected(uid):
        raise RuntimeError("Подключите Яндекс.Диск в настройках облака")

    yandex_uid = fetch_yandex_uid(uid)
    local_revision = sync_meta.get_last_seen_revision()
    remote_manifest = await fetch_remote_manifest(uid, yandex_uid)

    if not remote_manifest:
        return DownloadFlowResult(
            downloaded=False,
            applied=0,
            conflicts=0,
            message="Удалённый manifest отсутствует",
        )

    if remote_manifest.revision <= local_revision:
        return DownloadFlowResult(
            downloaded=False,
            applied=0,
            conflicts=0,
            message=f"Облако rev {remote_manifest.revision} — актуально",
        )

    fd, zip_dest = tempfile.mkstemp(suffix=".zip", prefix="forma-sync-dl-")
    os.close(fd)
    try:
        await download_package(uid, yandex_uid, remote_manifest, zip_dest)
        result = apply_forma_sync_package(
            zip_dest,
            remote_manifest.package_sha256,
            remote_manifest.revision,
        )
    finally:
        try:
            os.unlink(zip_dest)
        except OSError:
            pass

    if not result.skipped:
        sync_meta.set_last_seen_revision(remote_manifest.revision)
        sync_meta.set_last_download_at(now_iso())
        sync_meta.set_last_error(None)
        msg = f"Загружено rev {remote_manifest.revision}: {result.applied} записей"
        if result.conflicts:
            msg += f", конфликтов: {result.conflicts}"
        return DownloadFlowResult(
            downloaded=True,
            applied=result.applied,
            conflicts=result.conflicts,
            message=msg,
        )

    sync_meta.set_last_seen_revision(remote_manifest.revision)
    return DownloadFlowResult(
        downloaded=False,
        applied=0,
        conflicts=0,
        message=f"Пакет rev {remote_manifest.revision} пропущен (собственное устройство)",
    )
