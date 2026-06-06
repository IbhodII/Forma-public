# -*- coding: utf-8 -*-
"""Единый источник пути к папке FIT (user_profile → дефолт → ./fit_files)."""
from __future__ import annotations

from pathlib import Path
from typing import Callable

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_FIT_FOLDER = Path(r"E:\fit activity")
FALLBACK_FIT_FOLDER = PROJECT_ROOT / "fit_files"


def resolve_fit_folder(raw: str) -> Path:
    p = Path(raw.strip())
    if not p.is_absolute():
        p = PROJECT_ROOT / p
    return p.resolve()


def get_fit_folder_from_profile() -> str | None:
    """
    Сырой путь из user_profile.fit_folder_path (без fallback).
  Использует user_service; при недоступности backend — прямой SQL.
    """
    try:
        from backend.services import settings_service, user_service

        settings_service.ensure_settings_columns()
        return user_service.get_fit_folder_path_setting()
    except Exception:
        pass

    try:
        from database.connection import open_db

        conn = open_db()
        try:
            row = conn.execute(
                "SELECT fit_folder_path FROM user_profile ORDER BY id LIMIT 1"
            ).fetchone()
        finally:
            conn.close()
        if not row or row[0] is None:
            return None
        text = str(row[0]).strip()
        return text or None
    except Exception:
        return None


def get_fit_folder_path(
    folder_path: Path | str | None = None,
    *,
    on_default: Callable[[str], None] | None = None,
) -> Path:
    """
    Каталог FIT для импорта.

    Приоритет:
    1. Явный override (CLI --folder / API)
    2. user_profile.fit_folder_path
    3. DEFAULT_FIT_FOLDER, если существует
    4. ./fit_files относительно корня проекта
    """
    if folder_path is not None:
        text = str(folder_path).strip()
        if text:
            return resolve_fit_folder(text)

    stored = get_fit_folder_from_profile()
    if stored:
        return resolve_fit_folder(stored)

    if DEFAULT_FIT_FOLDER.is_dir():
        if on_default:
            on_default(
                "fit_folder_path не задан в user_profile; "
                f"используется папка по умолчанию: {DEFAULT_FIT_FOLDER}"
            )
        return DEFAULT_FIT_FOLDER.resolve()

    if on_default:
        on_default(
            f"fit_folder_path не задан, {DEFAULT_FIT_FOLDER} недоступна; "
            f"используется: {FALLBACK_FIT_FOLDER}"
        )
    return FALLBACK_FIT_FOLDER.resolve()
