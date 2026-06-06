# -*- coding: utf-8 -*-
from __future__ import annotations

import asyncio
import logging
import os
import tempfile
from pathlib import Path

import requests

from backend.services.cloud_account_service import load_cloud_account_tokens, STORAGE_YANDEX
from backend.services.forma_sync.manifest import FormaSyncManifest, parse_manifest
from backend.services.forma_sync.paths import (
    FORMA_SYNC_ROOT,
    forma_sync_manifest_path,
    forma_sync_package_path,
    forma_sync_root_path,
    legacy_app_forma_sync_root_path,
)
from backend.services.yandex_disk_fs import (
    ensure_yandex_dirs_sync,
    is_disk_not_found,
    raise_disk_api_error,
    upload_file_sync,
)

logger = logging.getLogger("health_api")

DISK_API = "https://cloud-api.yandex.net/v1/disk"


def _get_access_token(user_id: int) -> str:
    tokens = load_cloud_account_tokens(STORAGE_YANDEX, user_id)
    if not tokens or not tokens[0]:
        raise RuntimeError("Яндекс.Диск не подключён")
    return str(tokens[0])


def is_yandex_connected(user_id: int) -> bool:
    try:
        _get_access_token(user_id)
        return True
    except RuntimeError:
        return False


def fetch_yandex_uid(user_id: int) -> str:
    token = _get_access_token(user_id)
    resp = requests.get(
        f"{DISK_API}/",
        headers={"Authorization": f"OAuth {token}"},
        timeout=15,
    )
    resp.raise_for_status()
    user = resp.json().get("user") or {}
    uid = str(user.get("uid") or "").strip()
    if not uid:
        raise RuntimeError("yandex_uid не найден")
    return uid


async def _ensure_forma_sync_tree(user_id: int, yandex_uid: str) -> None:
    """Папки FormaSync на Диске (/FormaSync/…) через REST API (как /MyHealthDashboard/Backups)."""
    root = forma_sync_root_path(yandex_uid)
    await asyncio.to_thread(
        ensure_yandex_dirs_sync,
        user_id,
        [f"/{FORMA_SYNC_ROOT}", root, f"{root}/packages", f"{root}/history"],
    )


async def _upload_file_to_disk(user_id: int, local_path: str, cloud_path: str) -> None:
    parent = str(Path(cloud_path).parent).replace("\\", "/")
    if parent and parent not in ("", "/"):
        await asyncio.to_thread(ensure_yandex_dirs_sync, user_id, [parent])
    await asyncio.to_thread(upload_file_sync, user_id, local_path, cloud_path)


def _fetch_manifest_at_path(user_id: int, manifest_path: str) -> FormaSyncManifest | None:
    token = _get_access_token(user_id)
    resp = requests.get(
        f"{DISK_API}/resources/download",
        params={"path": manifest_path},
        headers={"Authorization": f"OAuth {token}"},
        timeout=30,
    )
    if is_disk_not_found(resp):
        logger.debug(
            "forma_sync manifest missing: path=%s status=%s msg=%s",
            manifest_path,
            resp.status_code,
            resp.text[:200] if resp.text else "",
        )
        return None
    if not resp.ok:
        raise_disk_api_error(resp, context=f"manifest download meta {manifest_path}")
    href = resp.json().get("href")
    if not href:
        return None
    text_resp = requests.get(href, timeout=60)
    text_resp.raise_for_status()
    return parse_manifest(text_resp.text)


def _fetch_legacy_app_manifest(user_id: int, yandex_uid: str) -> FormaSyncManifest | None:
    """Старый app:/ путь — только если есть данные; иначе «No item with that key»."""
    legacy = f"{legacy_app_forma_sync_root_path(yandex_uid)}/manifest.json"
    try:
        return _fetch_manifest_at_path(user_id, legacy)
    except RuntimeError as err:
        logger.debug("forma_sync legacy manifest skipped: %s", err)
        return None


async def fetch_remote_manifest(user_id: int, yandex_uid: str) -> FormaSyncManifest | None:
    import asyncio

    primary = forma_sync_manifest_path(yandex_uid)
    found = await asyncio.to_thread(_fetch_manifest_at_path, user_id, primary)
    if found is not None:
        return found
    legacy = f"{legacy_app_forma_sync_root_path(yandex_uid)}/manifest.json"
    if legacy != primary:
        return await asyncio.to_thread(_fetch_legacy_app_manifest, user_id, yandex_uid)
    return None


async def download_package(
    user_id: int,
    yandex_uid: str,
    manifest: FormaSyncManifest,
    dest_path: str,
) -> None:
    token = _get_access_token(user_id)
    disk_path = f"{forma_sync_root_path(yandex_uid)}/{manifest.package}"
    resp = requests.get(
        f"{DISK_API}/resources/download",
        params={"path": disk_path},
        headers={"Authorization": f"OAuth {token}"},
        timeout=30,
    )
    if is_disk_not_found(resp):
        raise RuntimeError(
            f"Пакет rev {manifest.revision} отсутствует на Диске ({disk_path})"
        )
    if not resp.ok:
        raise_disk_api_error(resp, context=f"package download meta {disk_path}")
    href = resp.json().get("href")
    if not href:
        raise RuntimeError("Не удалось получить ссылку на пакет")
    dl = requests.get(href, timeout=120)
    dl.raise_for_status()
    Path(dest_path).parent.mkdir(parents=True, exist_ok=True)
    Path(dest_path).write_bytes(dl.content)


async def upload_package(
    user_id: int,
    yandex_uid: str,
    revision: int,
    local_zip: str,
) -> None:
    await _ensure_forma_sync_tree(user_id, yandex_uid)
    cloud_path = forma_sync_package_path(yandex_uid, revision, "desktop")
    try:
        await _upload_file_to_disk(user_id, local_zip, cloud_path)
    except Exception as exc:
        msg = str(exc).strip() or "неизвестная ошибка"
        logger.warning(
            "forma_sync upload_package failed: path=%s revision=%s error=%s",
            cloud_path,
            revision,
            msg,
        )
        raise RuntimeError(
            f"Не удалось отправить данные на Диск ({msg}). "
            "Проверьте: 1) Яндекс.Диск подключён в FormaSync; 2) в oauth.yandex.ru у приложения "
            "включены права «Яндекс.Диск» (чтение и запись); 3) перезапустите бэкенд и нажмите "
            "«Синхронизировать» снова. Папка FormaSync на disk.yandex.ru появится после первой "
            "успешной отправки."
        ) from exc


async def upload_manifest_text(
    user_id: int,
    path: str,
    content: str,
) -> None:
    tmp_path: str | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            suffix=".json",
            prefix="forma-manifest-",
            delete=False,
            encoding="utf-8",
        ) as handle:
            handle.write(content)
            tmp_path = handle.name
        await _upload_file_to_disk(user_id, tmp_path, path)
    finally:
        if tmp_path:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


async def upload_manifest(
    user_id: int,
    yandex_uid: str,
    manifest: FormaSyncManifest,
    previous: FormaSyncManifest | None,
) -> None:
    await _ensure_forma_sync_tree(user_id, yandex_uid)
    if previous:
        hist_path = f"{forma_sync_root_path(yandex_uid)}/history/manifest-{previous.revision}.json"
        await upload_manifest_text(user_id, hist_path, previous.to_json())
    await upload_manifest_text(
        user_id,
        forma_sync_manifest_path(yandex_uid),
        manifest.to_json(),
    )

