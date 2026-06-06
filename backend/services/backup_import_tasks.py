# -*- coding: utf-8 -*-
"""Background JSON backup import with staged progress."""
from __future__ import annotations

import json
import logging
import os
import shutil
import threading
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from backend.services.backup_json_service import SCHEMA_VERSION, import_full_backup
from database.connection import SHARED_DB_PATH, WORKOUTS_DB_PATH, open_db

ImportMode = Literal["merge", "replace"]


class BackupImportAlreadyRunningError(Exception):
    def __init__(self, task_id: str, message: str = "Импорт уже выполняется") -> None:
        self.task_id = task_id
        super().__init__(message)


@dataclass
class BackupImportTaskState:
    task_id: str
    user_id: int
    mode: ImportMode
    status: str  # running | completed | failed
    phase: str = "uploading"
    current: int = 0
    total: int = 1
    table: str = ""
    percent: int = 0
    message: str = "Загрузка…"
    error: str | None = None
    report: dict[str, Any] | None = field(default=None, repr=False)

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "task_id": self.task_id,
            "status": self.status,
            "phase": self.phase,
            "current": self.current,
            "total": self.total,
            "table": self.table,
            "percent": self.percent,
            "message": self.message,
            "error": self.error,
        }
        if self.report is not None:
            out["report"] = self.report
        return out


_lock = threading.Lock()
_tasks: dict[str, BackupImportTaskState] = {}
_running_by_user: dict[int, str] = {}
logger = logging.getLogger("backup_import")

_PHASE_PERCENT: dict[str, int] = {
    "uploading": 5,
    "parsing": 12,
    "validating": 18,
    "backup_current": 24,
    "merging": 30,
    "integrity_check": 88,
    "indexes": 91,
    "analyze": 94,
    "warmup": 97,
    "saving": 98,
    "done": 100,
    "error": 0,
}


def _percent_for(phase: str, current: int, total: int) -> int:
    base = _PHASE_PERCENT.get(phase, 10)
    if phase == "merging" and total > 0:
        span = 65
        return min(84, base + int((current / total) * span))
    if phase == "saving":
        return 92
    if phase == "done":
        return 100
    return base


def _update_task(
    task_id: str,
    *,
    phase: str,
    current: int = 0,
    total: int = 1,
    table: str = "",
    message: str | None = None,
) -> None:
    with _lock:
        task = _tasks.get(task_id)
        if not task or task.status != "running":
            return
        task.phase = phase
        task.current = current
        task.total = max(total, 1)
        task.table = table
        task.percent = _percent_for(phase, current, total)
        if message:
            task.message = message
        elif phase == "merging" and table:
            task.message = f"Импорт {current}/{total}: {table}"
        elif phase == "parsing":
            task.message = "Разбор JSON…"
        elif phase == "validating":
            task.message = "Проверка схемы…"
        elif phase == "backup_current":
            task.message = "Создание резервной копии текущей базы…"
        elif phase == "integrity_check":
            task.message = "Проверка целостности базы…"
        elif phase == "indexes":
            task.message = "Проверка индексов…"
        elif phase == "analyze":
            task.message = "ANALYZE SQLite…"
        elif phase == "warmup":
            task.message = "Подготовка разделов…"
        elif phase == "saving":
            task.message = "Сохранение…"
        elif phase == "done":
            task.message = "Готово"


def _backup_current_db_files(user_id: int) -> tuple[str | None, str | None]:
    from backend.services.db_import_safety import backup_current_db_files

    workout_bak, shared_bak = backup_current_db_files(user_id, suffix="pre-import")
    logger.info(
        "backup_import pre-backup created user_id=%s workout=%s shared=%s",
        user_id,
        workout_bak,
        shared_bak,
    )
    return workout_bak, shared_bak


def _restore_db_files(workout_bak: str | None, shared_bak: str | None) -> None:
    from backend.services.db_import_safety import restore_db_files

    restore_db_files(workout_bak, shared_bak)


def _post_import_integrity() -> tuple[str, int]:
    conn = open_db(attach=True)
    try:
        row = conn.execute("PRAGMA quick_check").fetchone()
        check = str(row[0]) if row else "ok"
        if check.lower() != "ok":
            raise RuntimeError(f"PRAGMA quick_check failed: {check}")
        tables = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
        ).fetchone()[0]
        return check, int(tables or 0)
    finally:
        conn.close()


def _worker(task_id: str, user_id: int, payload: dict[str, Any], mode: ImportMode) -> None:
    from backend.database.request_context import clear_current_user_id, set_current_user_id

    global _running_by_user
    set_current_user_id(user_id)
    workout_bak: str | None = None
    shared_bak: str | None = None
    try:
        _update_task(task_id, phase="validating", message="Проверка схемы…")
        if payload.get("schema_version") != SCHEMA_VERSION:
            raise ValueError(f"Unsupported backup schema: {payload.get('schema_version')}")

        data = payload.get("data") or {}
        if not isinstance(data, dict):
            raise ValueError("Invalid backup: missing data section")

        tables = [t for t in data if isinstance(data.get(t), list)]
        total = max(len(tables), 1)
        logger.info(
            "backup_import start user_id=%s mode=%s tables=%s",
            user_id,
            mode,
            len(tables),
        )

        _update_task(task_id, phase="backup_current")
        workout_bak, shared_bak = _backup_current_db_files(user_id)

        from backend.services.auth_user_service import get_user_by_id
        from backend.services.import_user_reconciliation import ensure_target_user_row

        pre_user = get_user_by_id(user_id)
        ensure_target_user_row(user_id, pre_user)

        def on_progress(phase: str, current: int, t_total: int, detail: str) -> None:
            _update_task(
                task_id,
                phase=phase,
                current=current,
                total=t_total,
                table=detail,
            )

        _update_task(task_id, phase="merging", current=0, total=total, message="Слияние данных…")
        report = import_full_backup(
            payload,
            mode=mode,
            target_user_id=user_id,
            on_progress=on_progress,
        )

        from backend.services.import_user_reconciliation import (
            detect_import_user_id,
            reconcile_user_profile,
        )

        import_source = detect_import_user_id(WORKOUTS_DB_PATH)
        profile_payload = (payload.get("data") or {}).get("user_profile")
        profile_row = None
        if isinstance(profile_payload, list) and profile_payload:
            profile_row = profile_payload[0] if isinstance(profile_payload[0], dict) else None
        reconcile_user_profile(
            user_id,
            import_source,
            profile_row=profile_row,
        )

        _update_task(task_id, phase="integrity_check")
        check, table_count = _post_import_integrity()
        logger.info(
            "backup_import integrity user_id=%s check=%s tables=%s",
            user_id,
            check,
            table_count,
        )

        _update_task(task_id, phase="indexes")
        from database.migrations import ensure_performance_indexes
        conn_idx = open_db(attach=True)
        try:
            ensure_performance_indexes(conn_idx)
            conn_idx.commit()
        finally:
            conn_idx.close()

        _update_task(task_id, phase="analyze")
        conn_an = open_db(attach=True)
        try:
            conn_an.execute("ANALYZE")
            shared_tables = conn_an.execute(
                "SELECT name FROM shared.sqlite_master WHERE type='table'"
            ).fetchall()
            for row in shared_tables:
                conn_an.execute(f"ANALYZE shared.{row[0]}")
        finally:
            conn_an.close()

        with _lock:
            task = _tasks[task_id]
            if not task:
                return
            task.report = report
            if report.get("fatal_error"):
                task.status = "failed"
                task.error = str(report["fatal_error"])
                task.phase = "error"
                task.message = task.error
                _restore_db_files(workout_bak, shared_bak)
            else:
                _update_task(task_id, phase="verifying", message="Проверка работоспособности базы…")
                from backend.services.database_post_verify import (
                    PostDbVerifyError,
                    assert_post_db_verification,
                )

                verify_report = assert_post_db_verification(user_id)
                if isinstance(report, dict):
                    report["verification"] = verify_report.to_dict()
                task.report = report
                task.status = "completed"
                _update_task(task_id, phase="warmup", message="Подготовка разделов…")
                _update_task(task_id, phase="done", message="Импорт завершён")
                if isinstance(report, dict):
                    report["warmup_recommended"] = True
                    light_task_id: str | None = None
                    try:
                        from backend.services.account_warmup_tasks import start_account_warmup

                        light_task = start_account_warmup(user_id, mode="light")
                        light_task_id = light_task.task_id
                        report["warmup_task_id"] = light_task_id
                    except Exception as warm_err:
                        report["warmup_auto_error"] = str(warm_err)
    except Exception as exc:
        from backend.services.database_post_verify import PostDbVerifyError

        if isinstance(exc, PostDbVerifyError):
            logger.error(
                "backup_import verify failed task_id=%s: %s report=%s",
                task_id,
                exc,
                exc.report.to_dict(),
            )
        _restore_db_files(workout_bak, shared_bak)
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = str(exc)
                task.phase = "error"
                task.message = str(exc)
                if isinstance(exc, PostDbVerifyError):
                    task.report = {"verification": exc.report.to_dict()}
    finally:
        clear_current_user_id()
        with _lock:
            if _running_by_user.get(user_id) == task_id:
                del _running_by_user[user_id]


def _parse_spooled_json_worker(
    task_id: str,
    user_id: int,
    json_path: Path,
    mode: ImportMode,
) -> None:
    try:
        _update_task(task_id, phase="parsing", message="Разбор JSON…")
        payload = json.loads(json_path.read_text(encoding="utf-8"))
        _worker(task_id, user_id, payload, mode)
    except UnicodeDecodeError:
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = "Файл должен быть в кодировке UTF-8"
                task.phase = "error"
                task.message = task.error
    except json.JSONDecodeError:
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = "Некорректный JSON"
                task.phase = "error"
                task.message = task.error
    except Exception as exc:
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = str(exc)
                task.phase = "error"
                task.message = str(exc)
    finally:
        with _lock:
            if _running_by_user.get(user_id) == task_id:
                del _running_by_user[user_id]
        try:
            if json_path.is_file():
                json_path.unlink()
            parent = json_path.parent
            if parent.is_dir() and not any(parent.iterdir()):
                parent.rmdir()
        except OSError:
            pass


def start_backup_import_from_spooled_file(
    user_id: int,
    json_path: Path,
    mode: ImportMode,
    task_id: str | None = None,
) -> BackupImportTaskState:
    uid = int(user_id)
    with _lock:
        existing_id = _running_by_user.get(uid)
        if existing_id:
            existing = _tasks.get(existing_id)
            if existing and existing.status == "running":
                raise BackupImportAlreadyRunningError(existing_id)

    task_id = task_id or str(uuid.uuid4())
    task = BackupImportTaskState(
        task_id=task_id,
        user_id=uid,
        mode=mode,
        status="running",
        phase="parsing",
        message="Разбор JSON…",
    )
    with _lock:
        _tasks[task_id] = task
        _running_by_user[uid] = task_id

    thread = threading.Thread(
        target=_parse_spooled_json_worker,
        args=(task_id, uid, json_path, mode),
        name=f"backup-import-json-{task_id[:8]}",
        daemon=True,
    )
    thread.start()
    return task


def start_backup_import(
    user_id: int,
    raw_bytes: bytes,
    mode: ImportMode,
) -> BackupImportTaskState:
    uid = int(user_id)
    with _lock:
        existing_id = _running_by_user.get(uid)
        if existing_id:
            existing = _tasks.get(existing_id)
            if existing and existing.status == "running":
                raise BackupImportAlreadyRunningError(existing_id)

    task_id = str(uuid.uuid4())
    task = BackupImportTaskState(
        task_id=task_id,
        user_id=uid,
        mode=mode,
        status="running",
        phase="parsing",
        message="Разбор JSON…",
    )
    with _lock:
        _tasks[task_id] = task
        _running_by_user[uid] = task_id

    try:
        payload = json.loads(raw_bytes.decode("utf-8"))
    except UnicodeDecodeError as err:
        with _lock:
            task.status = "failed"
            task.error = "Файл должен быть в кодировке UTF-8"
            task.phase = "error"
            task.message = task.error
            del _running_by_user[uid]
        return task
    except json.JSONDecodeError as err:
        with _lock:
            task.status = "failed"
            task.error = "Некорректный JSON"
            task.phase = "error"
            task.message = task.error
            del _running_by_user[uid]
        return task

    thread = threading.Thread(
        target=_worker,
        args=(task_id, uid, payload, mode),
        name=f"backup-import-{task_id[:8]}",
        daemon=True,
    )
    thread.start()
    return task


def get_backup_import_task(task_id: str) -> BackupImportTaskState | None:
    with _lock:
        return _tasks.get(task_id)
