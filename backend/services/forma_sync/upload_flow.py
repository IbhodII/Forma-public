# -*- coding: utf-8 -*-
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from backend.database.db_utils import get_current_user_id
from backend.services.forma_sync import sync_meta
from backend.services.forma_sync.baseline import local_has_syncable_data, needs_baseline_upload
from backend.services.forma_sync.change_tracker import (
    clear_preference_touch,
    mark_exported,
    count_pending_changes,
)
from backend.services.forma_sync.entity_mappers import now_iso
from backend.services.forma_sync.manifest import FormaSyncManifest, next_revision
from backend.services.forma_sync.package_builder import (
    build_forma_sync_baseline_package,
    build_forma_sync_package,
)
from backend.services.forma_sync.paths import forma_sync_package_relative_path
from backend.services.forma_sync.sync_plan import build_sync_plan, enrich_plan_with_package
from backend.services.forma_sync.yandex_api import (
    fetch_remote_manifest,
    fetch_yandex_uid,
    is_yandex_connected,
    upload_manifest,
    upload_package,
)

logger = logging.getLogger("health_api")


@dataclass
class UploadFlowResult:
    uploaded: bool
    revision: int | None
    message: str


async def run_upload_flow(user_id: int | None = None, *, force: bool = False) -> UploadFlowResult:
    from backend.database import get_db

    uid = user_id if user_id is not None else get_current_user_id()
    if not is_yandex_connected(uid):
        raise RuntimeError(
            "Подключите Яндекс.Диск: Настройки → Синхронизация → FormaSync → «Подключить Яндекс.Диск»"
        )

    current_last_seen = sync_meta.get_last_seen_revision()
    yandex_uid = fetch_yandex_uid(uid)
    remote_manifest = await fetch_remote_manifest(uid, yandex_uid)
    remote_rev = remote_manifest.revision if remote_manifest else 0

    conn = get_db()
    try:
        pending = count_pending_changes(conn, uid)
        has_data = local_has_syncable_data(conn, uid)
    finally:
        conn.close()

    baseline = needs_baseline_upload(
        remote_manifest,
        current_last_seen,
        sync_meta.get_last_upload_at(),
        has_data,
    )

    plan = build_sync_plan(uid, remote_manifest=remote_manifest, yandex_uid=yandex_uid)
    plan["baseline_required"] = baseline
    logger.info("forma_sync upload plan: %s", plan)

    if baseline:
        built = build_forma_sync_baseline_package(0)
        if not built:
            return UploadFlowResult(
                uploaded=False,
                revision=None,
                message="Нет данных для первичной отправки в облако",
            )
        new_revision = 1 if remote_rev < 1 else next_revision(current_last_seen, remote_rev)
    else:
        if pending == 0 and not force:
            return UploadFlowResult(
                uploaded=False, revision=None, message="Нет локальных изменений для отправки"
            )
        built = build_forma_sync_package(current_last_seen)
        if not built:
            if not has_data:
                return UploadFlowResult(
                    uploaded=False,
                    revision=None,
                    message="Нет данных для отправки",
                )
            return UploadFlowResult(
                uploaded=False, revision=None, message="Нет локальных изменений для отправки"
            )
        new_revision = next_revision(current_last_seen, remote_rev)

    enrich_plan_with_package(plan, built.zip_path)
    logger.info("forma_sync upload package: %s", plan)

    device_id = sync_meta.get_or_create_device_id()
    manifest = FormaSyncManifest(
        schema_version=1,
        revision=new_revision,
        updated_at=now_iso(),
        source_device="desktop",
        source_device_id=device_id,
        package=forma_sync_package_relative_path(new_revision, "desktop"),
        package_sha256=built.sha256,
        entities_summary=built.entities_summary,
    )

    try:
        await upload_package(uid, yandex_uid, new_revision, built.zip_path)
        await upload_manifest(uid, yandex_uid, manifest, remote_manifest)

        conn = get_db()
        try:
            mark_exported(conn, built.exported_refs, new_revision)
            clear_preference_touch(conn)
            conn.commit()
        finally:
            conn.close()

        sync_meta.set_last_seen_revision(new_revision)
        sync_meta.set_last_upload_at(now_iso())
        sync_meta.set_last_error(None)
    finally:
        try:
            os.unlink(built.zip_path)
        except OSError:
            pass

    prefix = "Первичная отправка" if baseline else "Отправлено"
    return UploadFlowResult(
        uploaded=True,
        revision=new_revision,
        message=f"{prefix} rev {new_revision} ({built.row_count} записей)",
    )
