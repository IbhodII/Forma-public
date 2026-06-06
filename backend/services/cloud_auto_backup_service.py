# -*- coding: utf-8 -*-
"""Ежедневный автобэкап БД в Яндекс.Диск (asyncio, без APScheduler)."""
from __future__ import annotations

import asyncio
import logging
from typing import Optional

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.cloud_backup_service import backup_to_yandex
from backend.services.cloud_storage_service import yandex_status_sync
from backend.services import settings_service

logger = logging.getLogger(__name__)

BACKUP_INTERVAL_SEC = 24 * 60 * 60
_auto_task: Optional[asyncio.Task] = None


def _auto_backup_user_id_sync() -> int:
    """user_id профиля с включённым автобэкапом (иначе 1)."""
    settings_service.ensure_settings_columns()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT COALESCE(user_id, id) AS uid
            FROM user_profile
            WHERE cloud_auto_backup_enabled = 1
            ORDER BY updated_at DESC
            LIMIT 1
            """
        ).fetchone()
        if row and row["uid"]:
            return int(row["uid"])
    finally:
        conn.close()
    return get_current_user_id()


def _is_auto_backup_enabled_sync() -> bool:
    settings_service.ensure_settings_columns()
    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
        if "cloud_auto_backup_enabled" not in cols:
            return False
        uid = get_current_user_id()
        row = conn.execute(
            "SELECT cloud_auto_backup_enabled FROM user_profile WHERE id = ? OR user_id = ?",
            (uid, uid),
        ).fetchone()
    finally:
        conn.close()
    return bool(row and row[0])


def set_auto_backup_enabled_sync(enabled: bool) -> bool:
    settings_service.ensure_settings_columns()
    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
        if "cloud_auto_backup_enabled" not in cols:
            conn.execute(
                "ALTER TABLE user_profile ADD COLUMN cloud_auto_backup_enabled "
                "INTEGER NOT NULL DEFAULT 0"
            )
        uid = get_current_user_id()
        conn.execute(
            """
            UPDATE user_profile
            SET cloud_auto_backup_enabled = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? OR user_id = ?
            """,
            (1 if enabled else 0, uid, uid),
        )
        if conn.total_changes == 0:
            conn.execute(
                """
                INSERT INTO user_profile (id, user_id, cloud_auto_backup_enabled, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                """,
                (uid, uid, 1 if enabled else 0),
            )
        conn.commit()
    finally:
        conn.close()
    return enabled


async def _auto_backup_loop() -> None:
    while True:
        await asyncio.sleep(BACKUP_INTERVAL_SEC)
        try:
            uid = await asyncio.to_thread(_auto_backup_user_id_sync)
            status = yandex_status_sync(user_id=uid)
            if not status.get("connected"):
                continue
            logger.info("Автобэкап БД в Яндекс.Диск (user_id=%s)…", uid)
            await backup_to_yandex("database", user_id=uid)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.error("Ошибка автобэкапа: %s", exc)


def _stop_auto_backup_task() -> None:
    global _auto_task
    if _auto_task is not None and not _auto_task.done():
        _auto_task.cancel()
    _auto_task = None


async def configure_auto_backup(enabled: bool) -> dict[str, object]:
    """Включает/выключает суточный бэкап и при включении делает первый бэкап."""
    await asyncio.to_thread(set_auto_backup_enabled_sync, enabled)
    _stop_auto_backup_task()
    if not enabled:
        return {"status": "auto_backup_disabled", "enabled": False}

    global _auto_task
    _auto_task = asyncio.create_task(_auto_backup_loop(), name="cloud_auto_backup")
    uid = get_current_user_id()
    status = yandex_status_sync(user_id=uid)
    if status.get("connected"):
        await backup_to_yandex("database", user_id=uid)
    return {"status": "auto_backup_enabled", "enabled": True}


async def resume_auto_backup_if_enabled() -> None:
    """Поднимает суточный цикл после перезапуска API, если флаг включён."""
    enabled = await asyncio.to_thread(_is_auto_backup_enabled_sync)
    if not enabled:
        return
    global _auto_task
    if _auto_task is None or _auto_task.done():
        _auto_task = asyncio.create_task(_auto_backup_loop(), name="cloud_auto_backup")
        logger.info("Автобэкап Яндекс.Диска: фоновый цикл запущен")


async def get_auto_backup_status() -> dict[str, object]:
    enabled = await asyncio.to_thread(_is_auto_backup_enabled_sync)
    return {"enabled": enabled}
