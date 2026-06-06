# -*- coding: utf-8 -*-
"""Shared FIT import runner and human-readable result messages."""
from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fit_importer import FitImportError, get_fit_folder_path, run_import


def build_fit_import_message(stats: dict[str, Any], *, include_folder: bool = False) -> str:
    """Build a short Russian summary from fit_importer stats."""
    folder = str(stats.get("folder") or "")
    files = int(stats.get("files") or 0)
    imported = int(stats.get("imported") or 0)
    repaired = int(stats.get("repaired") or 0)
    skipped = int(stats.get("skipped") or 0)
    filename_skipped = int(stats.get("skipped_by_filename_date") or 0)
    parsed_files = int(stats.get("parsed_files") or 0)
    errors = int(stats.get("errors") or 0)
    parts: list[str] = []
    if include_folder and folder:
        parts.append(f"папка: {folder}")
    parts.append(f"файлов: {files}")
    if imported:
        parts.append(f"добавлено: {imported}" if not include_folder else f"новых: {imported}")
    if repaired:
        parts.append(f"обновлено: {repaired}" if not include_folder else f"восстановлено: {repaired}")
    if skipped:
        parts.append(f"пропущено: {skipped}" if not include_folder else f"без изменений: {skipped}")
    if filename_skipped:
        parts.append(f"быстро пропущено: {filename_skipped}")
    if parsed_files and parsed_files != files:
        parts.append(f"прочитано FIT: {parsed_files}")
    if errors:
        parts.append(f"ошибок: {errors}")
    if files == 0:
        parts.append("нет .fit-файлов в папке")
    elif imported == 0 and repaired == 0 and errors == 0:
        parts.append("все файлы уже в базе")
    return ", ".join(parts)


def run_fit_import(
    folder_override: str | None,
    *,
    reimport: bool = False,
    on_progress: Callable[[dict[str, int]], None] | None = None,
) -> tuple[dict[str, Any], str]:
    """
    Run FIT import and return (stats, folder_path_str).
    Raises FitImportError on user-facing failures.
    """
    folder = get_fit_folder_path(folder_override)
    stats = run_import(folder_override, reimport=reimport, on_progress=on_progress)
    stats = dict(stats)
    stats["folder"] = str(folder)
    return stats, str(folder)


def fit_import_status_from_stats(stats: dict[str, Any]) -> str:
    imported = int(stats.get("imported") or 0)
    repaired = int(stats.get("repaired") or 0)
    errors = int(stats.get("errors") or 0)
    if imported + repaired > 0:
        return "ok"
    return "error" if errors > 0 else "ok"
