# -*- coding: utf-8 -*-
"""Фоновый импорт FIT с отслеживанием прогресса (in-memory задачи)."""
from __future__ import annotations

import threading
import uuid
from dataclasses import dataclass, field
from typing import Any

from fit_importer import FitImportError, get_fit_folder_path

from backend.services.fit_import_runner import build_fit_import_message, run_fit_import


class FitImportAlreadyRunningError(Exception):
    """Импорт FIT уже выполняется."""

    def __init__(self, task_id: str, message: str = "Импорт FIT уже выполняется") -> None:
        self.task_id = task_id
        super().__init__(message)


@dataclass
class FitImportTaskState:
    task_id: str
    status: str  # running | completed | failed
    files_total: int = 0
    files_processed: int = 0
    imported: int = 0
    repaired: int = 0
    skipped: int = 0
    errors: int = 0
    files_seen: int = 0
    skipped_by_filename_date: int = 0
    parsed_files: int = 0
    imported_files: int = 0
    duplicates_skipped: int = 0
    folder: str | None = None
    message: str = ""
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "task_id": self.task_id,
            "status": self.status,
            "files_total": self.files_total,
            "files_processed": self.files_processed,
            "imported": self.imported,
            "repaired": self.repaired,
            "skipped": self.skipped,
            "errors": self.errors,
            "files_seen": self.files_seen,
            "skipped_by_filename_date": self.skipped_by_filename_date,
            "parsed_files": self.parsed_files,
            "imported_files": self.imported_files,
            "duplicates_skipped": self.duplicates_skipped,
            "folder": self.folder,
            "message": self.message,
            "error": self.error,
        }


_lock = threading.Lock()
_tasks: dict[str, FitImportTaskState] = {}
_running_task_id: str | None = None


def _worker(task_id: str, folder_override: str | None, reimport: bool) -> None:
    global _running_task_id
    try:
        folder_str = str(get_fit_folder_path(folder_override))

        def on_progress(snapshot: dict[str, int]) -> None:
            with _lock:
                task = _tasks.get(task_id)
                if not task:
                    return
                task.files_total = int(snapshot.get("files_total") or 0)
                task.files_processed = int(snapshot.get("files_processed") or 0)
                task.imported = int(snapshot.get("imported") or 0)
                task.repaired = int(snapshot.get("repaired") or 0)
                task.skipped = int(snapshot.get("skipped") or 0)
                task.errors = int(snapshot.get("errors") or 0)
                task.files_seen = int(snapshot.get("files_seen") or task.files_processed)
                task.skipped_by_filename_date = int(
                    snapshot.get("skipped_by_filename_date") or 0
                )
                task.parsed_files = int(snapshot.get("parsed_files") or 0)
                task.imported_files = int(snapshot.get("imported_files") or 0)
                task.duplicates_skipped = int(snapshot.get("duplicates_skipped") or 0)
                task.folder = folder_str

        stats, folder_str = run_fit_import(
            folder_override,
            reimport=reimport,
            on_progress=on_progress,
        )
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.folder = folder_str
        message = build_fit_import_message(stats)
        with _lock:
            task = _tasks[task_id]
            imported = int(stats.get("imported") or 0)
            repaired = int(stats.get("repaired") or 0)
            errors = int(stats.get("errors") or 0)
            if imported + repaired > 0:
                task.status = "completed"
            elif errors > 0:
                task.status = "failed"
            else:
                task.status = "completed"
            task.files_total = int(stats.get("files") or task.files_total)
            task.files_processed = task.files_total
            task.imported = int(stats.get("imported") or 0)
            task.repaired = int(stats.get("repaired") or 0)
            task.skipped = int(stats.get("skipped") or 0)
            task.errors = int(stats.get("errors") or 0)
            task.files_seen = int(stats.get("files_seen") or task.files_processed)
            task.skipped_by_filename_date = int(stats.get("skipped_by_filename_date") or 0)
            task.parsed_files = int(stats.get("parsed_files") or 0)
            task.imported_files = int(stats.get("imported_files") or 0)
            task.duplicates_skipped = int(stats.get("duplicates_skipped") or 0)
            task.folder = folder_str
            task.message = message
    except FitImportError as exc:
        with _lock:
            task = _tasks[task_id]
            task.status = "failed"
            task.error = str(exc)
            task.message = str(exc)
    except Exception as exc:
        with _lock:
            task = _tasks[task_id]
            task.status = "failed"
            task.error = str(exc)
            task.message = "Ошибка импорта FIT"
    finally:
        with _lock:
            if _running_task_id == task_id:
                _running_task_id = None


def start_background_fit_import(
    folder_override: str | None = None,
    *,
    reimport: bool = False,
) -> FitImportTaskState:
    """Запускает импорт в daemon-потоке. Возвращает задачу со status=running."""
    global _running_task_id
    with _lock:
        if _running_task_id:
            running = _tasks.get(_running_task_id)
            if running and running.status == "running":
                raise FitImportAlreadyRunningError(_running_task_id)
        task_id = str(uuid.uuid4())
        task = FitImportTaskState(
            task_id=task_id,
            status="running",
            message="Импорт FIT выполняется…",
        )
        _tasks[task_id] = task
        _running_task_id = task_id

    thread = threading.Thread(
        target=_worker,
        args=(task_id, folder_override, reimport),
        name=f"fit-import-{task_id[:8]}",
        daemon=True,
    )
    thread.start()
    return task


def get_fit_import_task(task_id: str) -> FitImportTaskState | None:
    with _lock:
        return _tasks.get(task_id)


def is_fit_import_running() -> bool:
    with _lock:
        if not _running_task_id:
            return False
        task = _tasks.get(_running_task_id)
        return bool(task and task.status == "running")
