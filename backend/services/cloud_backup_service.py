# -*- coding: utf-8 -*-
"""Бэкап БД и синхронизация FIT/GPX/TCX с облачными хранилищами."""
from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import datetime
from pathlib import Path

import shutil

from backend.database import DB_PATH
from backend.database.db_utils import get_current_user_id
from backend.services.auth_user_service import touch_last_sync
from backend.services.cloud_storage_service import YandexDiskService
from backend.services.google_drive_service import GoogleDriveService
from backend.services.user_service import get_integration_settings

logger = logging.getLogger(__name__)

CLOUD_BACKUP_FOLDER = "/MyHealthDashboard/Backups"
CLOUD_WORKOUTS_FOLDER = "/Health_Dashboard_Workouts"
GOOGLE_BACKUP_FOLDER = "MyHealthDashboard/Backups"
GOOGLE_WORKOUTS_FOLDER = "Health_Dashboard_Workouts"
WORKOUT_SUFFIXES = {".fit", ".gpx", ".tcx"}
BACKUP_NAME_RE = re.compile(r"^backup_(\d{8}T\d{6})_(\d+)\.db$", re.IGNORECASE)


def _backup_filename(user_id: int) -> str:
    ts = datetime.now().strftime("%Y%m%dT%H%M%S")
    return f"backup_{ts}_{int(user_id)}.db"


def _yandex_backup_path(filename: str) -> str:
    return f"{CLOUD_BACKUP_FOLDER}/{filename}"


def _is_workout_file(filename: str) -> bool:
    return Path(filename).suffix.lower() in WORKOUT_SUFFIXES


def _cloud_workout_path(cloud_folder: str, filename: str) -> str:
    base = cloud_folder.rstrip("/")
    return f"{base}/{filename}"


def _iter_local_workout_files(fit_folder: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = []
    for root, _, files in os.walk(fit_folder):
        for name in files:
            if not _is_workout_file(name):
                continue
            found.append((os.path.join(root, name), name))
    return found


def _effective_fit_folder() -> str | None:
    settings = get_integration_settings()
    path = settings.get("effective_fit_folder_path")
    if not path:
        return None
    text = str(path).strip()
    return text or None


def _parse_backup_entry(name: str, path: str | None = None) -> dict[str, object] | None:
    m = BACKUP_NAME_RE.match(name)
    if not m:
        return None
    ts_raw, uid_s = m.group(1), m.group(2)
    try:
        created = datetime.strptime(ts_raw, "%Y%m%dT%H%M%S").isoformat()
        source_user_id = int(uid_s)
    except (ValueError, TypeError):
        return None
    return {
        "filename": name,
        "cloud_path": path,
        "created_at": created,
        "source_user_id": source_user_id,
    }


async def backup_to_yandex(backup_type: str, user_id: int | None = None) -> dict[str, object]:
    """Фоновая задача: бэкап БД или папки с тренировками."""
    uid = int(user_id) if user_id is not None else get_current_user_id()
    logger.info("Яндекс.Диск бэкап: type=%s user_id=%s", backup_type, uid)
    yandex = YandexDiskService(user_id=uid)

    if backup_type == "database":
        if not DB_PATH.is_file():
            logger.warning("БД не найдена: %s (user_id=%s)", DB_PATH, uid)
            return {"status": "error", "message": "Локальная база не найдена"}
        await yandex.create_folder(CLOUD_BACKUP_FOLDER)
        filename = _backup_filename(uid)
        cloud_path = _yandex_backup_path(filename)
        size = DB_PATH.stat().st_size
        logger.info(
            "Загрузка БД в Яндекс.Диск: %s → %s (%s байт, user_id=%s)",
            DB_PATH,
            cloud_path,
            size,
            uid,
        )
        ok = await yandex.upload_file(str(DB_PATH), cloud_path)
        if not ok:
            logger.error("Не удалось загрузить бэкап в Яндекс.Диск (user_id=%s)", uid)
            return {"status": "error", "message": "Ошибка загрузки в Яндекс.Диск"}
        touch_last_sync(uid)
        logger.info("Бэкап БД загружен: %s", cloud_path)
        return {"status": "success", "filename": filename, "cloud_path": cloud_path, "bytes": size}

    if backup_type == "workouts":
        fit_folder = _effective_fit_folder()
        if not fit_folder or not os.path.isdir(fit_folder):
            logger.warning("Папка с FIT-файлами не найдена (user_id=%s)", uid)
            return {"status": "error", "message": "Папка тренировок не настроена"}
        await yandex.create_folder(CLOUD_WORKOUTS_FOLDER)
        uploaded = 0
        for local_path, basename in _iter_local_workout_files(fit_folder):
            cloud_path = _cloud_workout_path(CLOUD_WORKOUTS_FOLDER, basename)
            if await yandex.upload_file(local_path, cloud_path):
                uploaded += 1
        logger.info("Яндекс.Диск: загружено тренировок %s (user_id=%s)", uploaded, uid)
        return {"status": "success", "uploaded": uploaded}

    logger.warning("Неизвестный тип бэкапа: %s", backup_type)
    return {"status": "error", "message": f"Неизвестный тип: {backup_type}"}


async def backup_to_google(backup_type: str, user_id: int | None = None) -> dict[str, object]:
    """Фоновая задача: бэкап БД или тренировок в Google Drive."""
    uid = int(user_id) if user_id is not None else get_current_user_id()
    logger.info("Google Drive бэкап: type=%s user_id=%s", backup_type, uid)
    google = GoogleDriveService(user_id=uid)

    if backup_type == "database":
        if not DB_PATH.is_file():
            logger.warning("БД не найдена: %s (user_id=%s)", DB_PATH, uid)
            return {"status": "error", "message": "Локальная база не найдена"}
        folder_id = await google.ensure_folder_path(GOOGLE_BACKUP_FOLDER)
        if not folder_id:
            return {"status": "error", "message": "Не удалось создать папку бэкапов"}
        import tempfile

        filename = _backup_filename(uid)
        tmp_path = Path(tempfile.gettempdir()) / filename
        shutil.copy2(DB_PATH, tmp_path)
        size = tmp_path.stat().st_size
        try:
            logger.info(
                "Загрузка БД в Google Drive: %s (%s байт, user_id=%s)",
                filename,
                size,
                uid,
            )
            ok = await google.upload_file_to_folder(str(tmp_path), folder_id)
        finally:
            tmp_path.unlink(missing_ok=True)
        if not ok:
            logger.error("Не удалось загрузить бэкап в Google Drive (user_id=%s)", uid)
            return {"status": "error", "message": "Ошибка загрузки в Google Drive"}
        touch_last_sync(uid)
        return {"status": "success", "filename": filename, "bytes": size}

    if backup_type == "workouts":
        fit_folder = _effective_fit_folder()
        if not fit_folder or not os.path.isdir(fit_folder):
            return {"status": "error", "message": "Папка тренировок не настроена"}
        folder_id = await google.create_folder(GOOGLE_WORKOUTS_FOLDER)
        if not folder_id:
            return {"status": "error", "message": "Не удалось создать папку тренировок"}
        uploaded = 0
        for local_path, _basename in _iter_local_workout_files(fit_folder):
            if await google.upload_file_to_folder(local_path, folder_id):
                uploaded += 1
        return {"status": "success", "uploaded": uploaded}

    return {"status": "error", "message": f"Неизвестный тип: {backup_type}"}


async def sync_workouts_to_yandex(user_id: int | None = None) -> int:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    fit_folder = _effective_fit_folder()
    if not fit_folder or not os.path.isdir(fit_folder):
        logger.warning("Папка с FIT-файлами не найдена (user_id=%s)", uid)
        return 0

    yandex = YandexDiskService(user_id=uid)
    await yandex.create_folder(CLOUD_WORKOUTS_FOLDER)

    uploaded = 0
    for local_path, basename in _iter_local_workout_files(fit_folder):
        cloud_path = _cloud_workout_path(CLOUD_WORKOUTS_FOLDER, basename)
        if await yandex.file_exists(cloud_path):
            continue
        if await yandex.upload_file(local_path, cloud_path):
            uploaded += 1
    logger.info("Синхронизация в Яндекс.Диск: %s файлов (user_id=%s)", uploaded, uid)
    return uploaded


async def download_workouts_from_yandex(user_id: int | None = None) -> int:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    fit_folder = _effective_fit_folder()
    if not fit_folder:
        return 0

    Path(fit_folder).mkdir(parents=True, exist_ok=True)
    yandex = YandexDiskService(user_id=uid)
    items = await yandex.list_files(CLOUD_WORKOUTS_FOLDER)
    if not items:
        return 0

    downloaded = 0
    for item in items:
        if item.get("is_dir"):
            continue
        name = item.get("name")
        cloud_path = item.get("path")
        if not name or not cloud_path or not _is_workout_file(name):
            continue
        local_path = os.path.join(fit_folder, name)
        if await yandex.download_file(cloud_path, local_path):
            downloaded += 1

    if downloaded > 0:
        from backend.services.fit_import_runner import run_fit_import

        await asyncio.to_thread(
            lambda: run_fit_import(fit_folder, reimport=False),
        )

    return downloaded


async def list_cloud_backups(provider: str) -> list[dict[str, object]]:
    """Список бэкапов БД в облаке для текущего подключённого аккаунта."""
    provider = provider.strip().lower()
    uid = get_current_user_id()
    logger.info("Список бэкапов: provider=%s user_id=%s", provider, uid)
    backups: list[dict[str, object]] = []

    if provider == "yandex":
        yandex = YandexDiskService(user_id=uid)
        await yandex.create_folder(CLOUD_BACKUP_FOLDER)
        items = await yandex.list_files(CLOUD_BACKUP_FOLDER)
        seen_names: set[str] = set()
        for item in items or []:
            if item.get("is_dir"):
                continue
            name = item.get("name") or ""
            if name in seen_names:
                continue
            seen_names.add(name)
            entry = _parse_backup_entry(name, item.get("path"))
            if entry:
                backups.append(entry)
            elif name.startswith("workouts_backup_") and name.endswith(".db"):
                backups.append({
                    "filename": name,
                    "cloud_path": item.get("path"),
                    "created_at": None,
                    "source_user_id": None,
                    "legacy": True,
                })
        legacy_items = await yandex.list_files("/Health_Dashboard_Backups")
        for item in legacy_items or []:
            if item.get("is_dir"):
                continue
            name = str(item.get("name") or "")
            if name in seen_names:
                continue
            seen_names.add(name)
            entry = _parse_backup_entry(name, item.get("path"))
            if entry:
                backups.append(entry)
            elif name.startswith("workouts_backup_") and name.endswith(".db"):
                backups.append({
                    "filename": name,
                    "cloud_path": item.get("path"),
                    "created_at": None,
                    "source_user_id": None,
                    "legacy": True,
                })

    elif provider == "google":
        google = GoogleDriveService(user_id=uid)
        folder_id = await google.ensure_folder_path(GOOGLE_BACKUP_FOLDER)
        if folder_id:
            items = await google.list_files_in_folder_by_id(folder_id)
            for item in items or []:
                name = item.get("name") or ""
                entry = _parse_backup_entry(name)
                if entry:
                    entry["file_id"] = item.get("id")
                    backups.append(entry)
                elif name.startswith("workouts_backup_") and name.endswith(".db"):
                    backups.append({
                        "filename": name,
                        "file_id": item.get("id"),
                        "created_at": None,
                        "source_user_id": None,
                        "legacy": True,
                    })

    backups.sort(
        key=lambda b: str(b.get("created_at") or ""),
        reverse=True,
    )
    logger.info("Найдено бэкапов: %s (provider=%s)", len(backups), provider)
    return backups


async def get_remote_backup_status(provider: str) -> dict[str, object]:
    """Есть ли хотя бы один бэкап в облаке."""
    items = await list_cloud_backups(provider)
    latest = items[0] if items else None
    return {
        "found": bool(items),
        "count": len(items),
        "latest": latest,
        "provider": provider.strip().lower(),
    }


async def download_cloud_backup_file(
    provider: str,
    filename: str | None = None,
    user_id: int | None = None,
) -> tuple[Path, str, int]:
    """Download a cloud .db backup to a temp file (diagnostic; does not replace local DB)."""
    from fastapi import HTTPException

    provider = provider.strip().lower()
    uid = int(user_id if user_id is not None else get_current_user_id())
    tmp_path = DB_PATH.with_suffix(".download.tmp")

    if filename:
        target_name = filename.strip()
    else:
        backups = await list_cloud_backups(provider)
        if not backups:
            raise HTTPException(status_code=404, detail="Бэкапы в облаке не найдены")
        target_name = str(backups[0]["filename"])

    if provider == "yandex":
        yandex = YandexDiskService(user_id=uid)
        cloud_path = _yandex_backup_path(target_name)
        if not await yandex.file_exists(cloud_path):
            legacy = f"/Health_Dashboard_Backups/{target_name}"
            if await yandex.file_exists(legacy):
                cloud_path = legacy
            else:
                raise HTTPException(status_code=404, detail=f"Файл {target_name} не найден в облаке")
        ok = await yandex.download_file(cloud_path, str(tmp_path))
    elif provider == "google":
        google = GoogleDriveService(user_id=uid)
        folder_id = await google.ensure_folder_path(GOOGLE_BACKUP_FOLDER)
        file_id = None
        if folder_id:
            items = await google.list_files_in_folder_by_id(folder_id)
            for item in items or []:
                if item.get("name") == target_name:
                    file_id = item.get("id")
                    break
        if not file_id:
            items = await google.list_files_in_folder("Health_Dashboard_Backups")
            for item in items or []:
                if item.get("name") == target_name:
                    file_id = item.get("id")
                    break
        if not file_id:
            raise HTTPException(status_code=404, detail=f"Файл {target_name} не найден в Google Drive")
        ok = await google.download_file(str(file_id), str(tmp_path))
    else:
        raise HTTPException(status_code=400, detail="provider: yandex или google")

    if not ok or not tmp_path.is_file():
        raise HTTPException(status_code=502, detail="Не удалось скачать бэкап из облака")
    return tmp_path, target_name, tmp_path.stat().st_size


def _apply_cloud_restore_sync(
    tmp_path: Path,
    target_name: str,
    size: int,
    uid: int,
) -> dict[str, object]:
    """Replace workouts.db from downloaded temp file; reconcile to session user."""
    from fastapi import HTTPException

    from backend.services.auth_user_service import get_user_by_id
    from backend.services.db_import_safety import (
        atomic_replace_file,
        backup_current_db_files,
        quick_check_sqlite,
        restore_db_files,
    )
    from backend.services.database_post_verify import (
        PostDbVerifyError,
        assert_post_db_verification,
    )
    from backend.services.import_user_reconciliation import reconcile_after_db_import

    pre_user = get_user_by_id(uid)
    workout_bak: str | None = None
    shared_bak: str | None = None

    parsed = _parse_backup_entry(target_name)
    source_uid_hint = (
        int(parsed["source_user_id"]) if parsed and parsed.get("source_user_id") else None
    )

    try:
        quick_check_sqlite(tmp_path)
        workout_bak, shared_bak = backup_current_db_files(
            uid, suffix="pre-cloud-restore"
        )

        atomic_replace_file(tmp_path, DB_PATH)

        from database.migrations import ensure_db_schema

        ensure_db_schema()

        reconcile_report = reconcile_after_db_import(
            uid,
            DB_PATH,
            pre_user,
            source_user_id_from_filename=source_uid_hint,
        )

        assert_post_db_verification(uid)
        touch_last_sync(uid)

        logger.info(
            "БД восстановлена из %s (%s байт) session_user_id=%s remap=%s",
            target_name,
            size,
            uid,
            reconcile_report.get("user_id_remap"),
        )
        return {
            "status": "success",
            "message": (
                f"База восстановлена из {target_name} ({size} байт). "
                f"Данные привязаны к текущему профилю (user_id={uid})."
            ),
            "filename": target_name,
            "bytes": size,
            "session_user_id": uid,
            "user_id_remap": reconcile_report.get("user_id_remap"),
            "profile_reconciled": reconcile_report.get("profile_reconciled"),
        }
    except PostDbVerifyError as exc:
        restore_db_files(workout_bak, shared_bak)
        raise HTTPException(
            status_code=500,
            detail=f"Восстановление отменено: {exc}",
        ) from exc
    except HTTPException:
        restore_db_files(workout_bak, shared_bak)
        raise
    except Exception as exc:
        restore_db_files(workout_bak, shared_bak)
        logger.exception("cloud restore failed file=%s user_id=%s", target_name, uid)
        raise HTTPException(
            status_code=500,
            detail=f"Не удалось восстановить базу: {exc}",
        ) from exc


async def restore_database_from_cloud(
    provider: str,
    filename: str | None = None,
) -> dict[str, object]:
    """Скачивает выбранный бэкап, перезаписывает workouts.db с reconcile и rollback."""
    uid = get_current_user_id()
    tmp_path, target_name, size = await download_cloud_backup_file(
        provider, filename, user_id=uid
    )
    try:
        return await asyncio.to_thread(
            _apply_cloud_restore_sync,
            tmp_path,
            target_name,
            size,
            uid,
        )
    finally:
        tmp_path.unlink(missing_ok=True)


async def sync_workouts_to_google(user_id: int | None = None) -> int:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    fit_folder = _effective_fit_folder()
    if not fit_folder or not os.path.isdir(fit_folder):
        return 0

    google = GoogleDriveService(user_id=uid)
    folder_id = await google.create_folder(GOOGLE_WORKOUTS_FOLDER)
    if not folder_id:
        return 0

    uploaded = 0
    for local_path, basename in _iter_local_workout_files(fit_folder):
        if await google.file_exists_in_folder(GOOGLE_WORKOUTS_FOLDER, basename):
            continue
        if await google.upload_file_to_folder(local_path, folder_id):
            uploaded += 1
    logger.info("Синхронизация в Google Drive: %s файлов (user_id=%s)", uploaded, uid)
    return uploaded


async def download_workouts_from_google(user_id: int | None = None) -> int:
    uid = int(user_id) if user_id is not None else get_current_user_id()
    fit_folder = _effective_fit_folder()
    if not fit_folder:
        return 0

    Path(fit_folder).mkdir(parents=True, exist_ok=True)
    google = GoogleDriveService(user_id=uid)
    items = await google.list_files_in_folder(GOOGLE_WORKOUTS_FOLDER)
    if not items:
        return 0

    downloaded = 0
    for item in items:
        if item.get("is_dir"):
            continue
        name = item.get("name")
        file_id = item.get("id")
        if not name or not file_id or not _is_workout_file(name):
            continue
        local_path = os.path.join(fit_folder, name)
        if await google.download_file(file_id, local_path):
            downloaded += 1

    if downloaded > 0:
        from backend.services.fit_import_runner import run_fit_import

        await asyncio.to_thread(
            lambda: run_fit_import(fit_folder, reimport=False),
        )

    return downloaded
