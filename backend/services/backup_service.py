# -*- coding: utf-8 -*-
"""Локальное резервное копирование workouts.db + shared.db (ZIP) в папку пользователя."""
from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from backend.database import get_db
from backend.services import settings_service
from backend.services.database_export_service import build_database_zip
from backend.services.user_service import _profile_id

logger = logging.getLogger(__name__)

AUTO_BACKUP_INTERVAL_DAYS = 28


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _normalize_folder(path: str | None) -> str | None:
    if path is None:
        return None
    text = str(path).strip()
    if not text:
        return None
    if any(ch in text for ch in ("\0", "\n", "\r")):
        raise ValueError("backup_folder_path содержит недопустимые символы")
    return text


def get_backup_settings() -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT backup_folder_path, last_backup_date
            FROM user_profile WHERE id = ?
            """,
            (_profile_id(),),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return {"backup_folder_path": None, "last_backup_date": None}
    return {
        "backup_folder_path": row[0],
        "last_backup_date": row[1],
    }


def save_backup_settings(backup_folder_path: str | None) -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    folder = _normalize_folder(backup_folder_path)
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ?",
            (_profile_id(),),
        ).fetchone()
        if row is None:
            conn.execute(
                "INSERT INTO user_profile (id, updated_at) VALUES (?, ?)",
                (_profile_id(), _now_iso()),
            )
        conn.execute(
            """
            UPDATE user_profile
            SET backup_folder_path = ?, updated_at = ?
            WHERE id = ?
            """,
            (folder, _now_iso(), _profile_id()),
        )
        conn.commit()
    finally:
        conn.close()
    return get_backup_settings()


def perform_backup(backup_folder: str | None = None) -> dict[str, Any]:
    """Копирует workouts.db + shared.db в ZIP forma_db_YYYY-MM-DD.zip."""
    settings_service.ensure_settings_columns()
    folder = _normalize_folder(backup_folder)
    if folder is None:
        settings = get_backup_settings()
        folder = _normalize_folder(settings.get("backup_folder_path"))

    if not folder:
        return {
            "success": False,
            "error": "Папка для бэкапов не указана в настройках",
        }

    folder_path = Path(folder).expanduser()
    if not folder_path.is_dir():
        return {
            "success": False,
            "error": f"Папка для бэкапов не существует: {folder_path}",
        }

    timestamp = datetime.now().strftime("%Y-%m-%d")
    backup_name = f"forma_db_{timestamp}.zip"
    backup_path = folder_path / backup_name

    try:
        stats = build_database_zip(backup_path, user_id=_profile_id())
        conn = get_db()
        try:
            conn.execute(
                """
                UPDATE user_profile
                SET last_backup_date = ?, updated_at = ?
                WHERE id = ?
                """,
                (_now_iso(), _now_iso(), _profile_id()),
            )
            conn.commit()
        finally:
            conn.close()
        logger.info("[backup] saved %s", backup_path)
        return {
            "success": True,
            "backup_path": str(backup_path.resolve()),
            "backup_name": backup_name,
            "workouts_bytes": stats.get("workouts_bytes"),
            "shared_bytes": stats.get("shared_bytes"),
            "zip_bytes": stats.get("zip_bytes"),
        }
    except FileNotFoundError as err:
        return {"success": False, "error": str(err)}
    except OSError as err:
        logger.exception("[backup] failed: %s", err)
        return {"success": False, "error": str(err)}
    except Exception as err:
        logger.exception("[backup] unexpected error: %s", err)
        return {"success": False, "error": str(err)}


def check_and_auto_backup() -> dict[str, Any] | None:
    """
    Если прошло >= 28 дней с last_backup_date (или бэкапа ещё не было),
    создаёт новый ZIP в backup_folder_path.
    """
    settings = get_backup_settings()
    folder = settings.get("backup_folder_path")
    if not folder or not str(folder).strip():
        return None

    last_backup = settings.get("last_backup_date")
    if last_backup:
        try:
            last_text = str(last_backup).replace("Z", "+00:00")
            last_date = datetime.fromisoformat(last_text)
            if last_date.tzinfo is None:
                last_date = last_date.replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_since = (now - last_date).days
            if days_since < AUTO_BACKUP_INTERVAL_DAYS:
                return None
        except ValueError:
            logger.warning("[backup] invalid last_backup_date: %s", last_backup)

    result = perform_backup(str(folder))
    if result.get("success"):
        logger.info("[backup] auto backup completed: %s", result.get("backup_path"))
    else:
        logger.warning("[backup] auto backup failed: %s", result.get("error"))
    return result
