# -*- coding: utf-8 -*-
"""Создание папок на Яндекс.Диске (включая app:/ и disk:/)."""
from __future__ import annotations

import logging
from typing import Iterable

import requests

from backend.services.cloud_account_service import STORAGE_YANDEX, load_cloud_account_tokens

logger = logging.getLogger(__name__)

DISK_API = "https://cloud-api.yandex.net/v1/disk"


def _access_token(user_id: int) -> str:
    tokens = load_cloud_account_tokens(STORAGE_YANDEX, user_id)
    if not tokens or not tokens[0]:
        raise RuntimeError("Яндекс.Диск не подключён")
    return str(tokens[0])


def iter_parent_paths(cloud_path: str) -> list[str]:
    """Все префиксы-папки для пути (без файла в конце, если передан файл — включая его родителя)."""
    path = cloud_path.strip().replace("\\", "/").rstrip("/")
    if not path:
        return []

    if path.startswith("app:/"):
        rest = path[5:]
        parts = [p for p in rest.split("/") if p]
        return ["app:/" + "/".join(parts[: i + 1]) for i in range(len(parts))]

    if path.startswith("disk:/"):
        rest = path[6:]
        parts = [p for p in rest.split("/") if p]
        return ["disk:/" + "/".join(parts[: i + 1]) for i in range(len(parts))]

    if not path.startswith("/"):
        path = f"/{path}"
    parts = [p for p in path.split("/") if p]
    return ["/" + "/".join(parts[: i + 1]) for i in range(len(parts))]


_NOT_FOUND_MARKERS = (
    "no item with that key",
    "disknotfounderror",
    "diskpathdoesntexist",
    "resource not found",
    "not found",
)


def _api_error_message(resp: requests.Response) -> str:
    try:
        data = resp.json()
        if isinstance(data, dict):
            parts = [
                str(data.get("error") or ""),
                str(data.get("message") or ""),
                str(data.get("description") or ""),
            ]
            joined = " ".join(p for p in parts if p).strip()
            if joined:
                return joined
            return str(data)
    except Exception:
        pass
    return (resp.text or "").strip() or f"HTTP {resp.status_code}"


def is_disk_not_found(resp: requests.Response) -> bool:
    """Яндекс.Диск: 404 или типичные ответы для отсутствующего app:/ или disk:/ ресурса."""
    if resp.status_code == 404:
        return True
    blob = _api_error_message(resp).lower()
    return any(marker in blob for marker in _NOT_FOUND_MARKERS)


def raise_disk_api_error(resp: requests.Response, *, context: str = "") -> None:
    msg = _api_error_message(resp)
    prefix = f"{context}: " if context else ""
    if is_disk_not_found(resp):
        raise RuntimeError(f"{prefix}ресурс не найден на Диске ({msg})")
    raise RuntimeError(f"{prefix}{msg}")


def mkdir_path_sync(user_id: int, path: str) -> None:
    """Создать одну папку (201) или игнорировать 409 «уже существует»."""
    token = _access_token(user_id)
    resp = requests.put(
        f"{DISK_API}/resources",
        params={"path": path},
        headers={"Authorization": f"OAuth {token}"},
        timeout=30,
    )
    if resp.status_code in (201, 409):
        return
    raise_disk_api_error(resp, context=f"mkdir {path}")


def upload_file_sync(user_id: int, local_path: str, cloud_path: str) -> None:
    """Загрузка файла через REST (как manifest), с созданием родительских папок."""
    parent = cloud_path.rsplit("/", 1)[0] if "/" in cloud_path.split(":", 1)[-1] else ""
    if parent:
        ensure_yandex_dirs_sync(user_id, [parent])
    token = _access_token(user_id)
    resp = requests.get(
        f"{DISK_API}/resources/upload",
        params={"path": cloud_path, "overwrite": "true"},
        headers={"Authorization": f"OAuth {token}"},
        timeout=60,
    )
    if resp.status_code not in (200, 201):
        raise_disk_api_error(resp, context=f"upload url {cloud_path}")
    href = resp.json().get("href")
    if not href:
        raise RuntimeError("Яндекс.Диск не вернул URL для загрузки файла")
    with open(local_path, "rb") as body:
        put = requests.put(href, data=body, timeout=600)
    if put.status_code not in (200, 201, 202):
        raise RuntimeError(
            put.text.strip() or f"Ошибка PUT загрузки ({put.status_code})"
        )
    logger.info("Yandex upload ok: %s -> %s", local_path, cloud_path)


def ensure_yandex_dirs_sync(user_id: int, paths: Iterable[str]) -> None:
    """Создать цепочку папок для каждого пути (обычно один каталог или дерево FormaSync)."""
    seen: set[str] = set()
    for raw in paths:
        for parent in iter_parent_paths(raw):
            if parent in seen:
                continue
            seen.add(parent)
            mkdir_path_sync(user_id, parent)
            logger.debug("Yandex folder ok: %s", parent)
