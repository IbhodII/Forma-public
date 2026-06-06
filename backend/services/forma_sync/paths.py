# -*- coding: utf-8 -*-
from __future__ import annotations

FORMA_SYNC_ROOT = "FormaSync"


def forma_sync_root_path(yandex_uid: str) -> str:
    """
    Корень FormaSync на Яндекс.Диске (как /MyHealthDashboard/Backups для бэкапов).

    Путь от корня Диска: /FormaSync/{uid}. Префиксы app:/ и disk:/ для mkdir/upload
    через REST часто дают «No item with that key» без disk.app_folder.
    """
    return f"/{FORMA_SYNC_ROOT}/{yandex_uid}"


def legacy_app_forma_sync_root_path(yandex_uid: str) -> str:
    """Старый путь (app:/) — только для чтения при миграции."""
    return f"app:/{FORMA_SYNC_ROOT}/{yandex_uid}"


def forma_sync_manifest_path(yandex_uid: str) -> str:
    return f"{forma_sync_root_path(yandex_uid)}/manifest.json"


def forma_sync_packages_dir(yandex_uid: str) -> str:
    return f"{forma_sync_root_path(yandex_uid)}/packages"


def forma_sync_history_dir(yandex_uid: str) -> str:
    return f"{forma_sync_root_path(yandex_uid)}/history"


def package_filename(revision: int, source_device: str = "desktop") -> str:
    return f"{revision:06d}-{source_device}.zip"


def forma_sync_package_path(yandex_uid: str, revision: int, source_device: str = "desktop") -> str:
    return f"{forma_sync_packages_dir(yandex_uid)}/{package_filename(revision, source_device)}"


def forma_sync_package_relative_path(revision: int, source_device: str = "desktop") -> str:
    return f"packages/{package_filename(revision, source_device)}"


def forma_sync_history_manifest_path(yandex_uid: str, revision: int) -> str:
    return f"{forma_sync_history_dir(yandex_uid)}/manifest-{revision}.json"
