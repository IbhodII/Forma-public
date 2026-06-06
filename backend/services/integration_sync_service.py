# -*- coding: utf-8 -*-
"""Запуск внешних интеграций (FIT, Polar) по запросу из UI."""
from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

logger = logging.getLogger(__name__)


def _run_fit(
    *,
    reimport: bool = False,
    folder_path: str | None = None,
) -> dict[str, Any]:
    from fit_importer import FitImportError

    from backend.services.fit_import_runner import (
        build_fit_import_message,
        fit_import_status_from_stats,
        run_fit_import,
    )

    try:
        stats, folder = run_fit_import(folder_path, reimport=reimport)
    except FitImportError:
        raise
    status = fit_import_status_from_stats(stats)
    return {
        "id": "fit",
        "name": "FIT (Coospo)",
        "status": status,
        "message": build_fit_import_message(stats, include_folder=True),
        "folder": folder,
        "stats": stats,
    }


def _run_polar() -> dict[str, Any]:
    from sync_polar import sync_new_workouts

    new_count = int(sync_new_workouts() or 0)
    if new_count > 0:
        message = f"новых в очереди: {new_count}"
    else:
        message = "нет новых тренировок"
    return {
        "id": "polar",
        "name": "Polar AccessLink",
        "status": "ok",
        "message": message,
        "folder": None,
        "stats": {"new_count": new_count},
    }


_INTEGRATIONS: list[tuple[str, str, Callable[..., dict[str, Any]]]] = [
    ("fit", "FIT (Coospo)", _run_fit),
    ("polar", "Polar AccessLink", _run_polar),
]


def run_all_integrations(
    *,
    reimport_fit: bool = False,
    fit_folder_path: str | None = None,
) -> dict[str, Any]:
    """Последовательно запускает FIT-импорт и Polar fetch."""
    items: list[dict[str, Any]] = []
    errors = 0

    for integration_id, name, runner in _INTEGRATIONS:
        try:
            if integration_id == "fit":
                item = runner(reimport=reimport_fit, folder_path=fit_folder_path)
            else:
                item = runner()
        except Exception as exc:
            logger.exception("Integration %s failed", integration_id)
            item = {
                "id": integration_id,
                "name": name,
                "status": "error",
                "message": str(exc),
                "stats": None,
            }
        if item.get("status") == "error":
            errors += 1
        items.append(item)

    if errors:
        status = "error" if errors == len(items) else "partial"
        message = f"Завершено с ошибками: {errors} из {len(items)}"
    else:
        status = "ok"
        message = "Все интеграции выполнены"

    return {"status": status, "message": message, "items": items}
