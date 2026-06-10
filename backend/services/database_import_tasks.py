# -*- coding: utf-8 -*-
"""Background SQLite database import (workouts.db + shared.db) from staged job directory."""
from __future__ import annotations

import json
import logging
import os
import re
import shutil
import sqlite3
import sys
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable, Literal

from backend.services.auth_user_service import get_user_by_id
from backend.services.backup_json_service import TABLE_IMPORT_ORDER
from backend.services.db_import_safety import (
    backup_current_db_files as _backup_current_db_files,
    db_bytes_total,
    quick_check_sqlite as _quick_check_sqlite,
    replace_both_databases,
    restore_db_files as _restore_db_files,
)
from backend.services.import_user_reconciliation import (
    detect_import_user_id as _detect_import_user_id,
    reassign_user_ids_to_target as _reassign_user_ids_to_target,
    reconcile_after_db_import,
)
from backend.services.db_import_natural_merge import (
    assert_safe_main_table_import,
    is_catalog_merge_table,
    is_cloud_auth_table,
    is_natural_key_table,
    merge_catalog_from_staging,
    merge_table_from_staging,
    post_import_dedupe_table,
)
from backend.services.db_import_preflight import ImportPreflightError, run_import_preflight
from database.connection import (
    DATA_ROOT,
    MEAL_PLAN_TABLES,
    SHARED_DB_PATH,
    SHARED_TABLES,
    WORKOUTS_DB_PATH,
)
from database.meal_plans_storage import meal_plans_in_workouts

ImportMode = Literal["merge", "replace"]

_JOB_ID_RE = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$",
    re.I,
)

logger = logging.getLogger("database_import")

# Heuristic: skip full ANALYZE / heavy domain smoke on very large imports.
LARGE_DB_BYTES_THRESHOLD = 150 * 1024 * 1024
LARGE_DB_ANALYZE_TABLES: tuple[str, ...] = (
    "strength_workouts",
    "cardio_workouts",
    "food_entries",
    "body_metrics",
)
MERGE_BUSY_TIMEOUT_MS = 120_000
META_DEDUPE_ROW_LIMIT = 20_000

_lock = threading.Lock()


def _post_import_natural_key_dedupe(user_id: int) -> dict[str, Any]:
    """Dedupe natural-key tables after replace/merge + reconcile."""
    from backend.services.db_import_natural_merge import NATURAL_KEY_HANDLERS
    from database.connection import open_db

    out: dict[str, Any] = {}
    conn_d = open_db(attach=False)
    try:
        for table in NATURAL_KEY_HANDLERS:
            removed = post_import_dedupe_table(
                conn_d, table, user_id=user_id, row_limit=META_DEDUPE_ROW_LIMIT
            )
            if removed:
                out[f"{table}_deduped"] = removed
        conn_d.commit()
    finally:
        conn_d.close()
    if out:
        logger.info("post_import_natural_key_dedupe user_id=%s %s", user_id, out)
    return out
_tasks: dict[str, DatabaseImportTaskState] = {}
_running_by_user: dict[int, str] = {}


class DatabaseImportAlreadyRunningError(Exception):
    def __init__(self, task_id: str, message: str = "Импорт базы уже выполняется") -> None:
        self.task_id = task_id
        super().__init__(message)


@dataclass
class DatabaseImportTaskState:
    task_id: str
    user_id: int
    mode: ImportMode
    status: str  # pending | running | completed | failed
    stage: str = "validating"
    progressPercent: int = 0
    processed: int = 0
    total: int = 1
    message: str = "Подготовка…"
    error: str | None = None
    report: dict[str, Any] | None = field(default=None, repr=False)
    started_at: str | None = None
    last_progress_at: str | None = None
    recommended_mode: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "job_id": self.task_id,
            "task_id": self.task_id,
            "status": self.status,
            "stage": self.stage,
            "progressPercent": self.progressPercent,
            "processed": self.processed,
            "total": self.total,
            "message": self.message,
            "error": self.error,
            "started_at": self.started_at,
            "last_progress_at": self.last_progress_at,
            "recommended_mode": self.recommended_mode,
        }
        if self.report is not None:
            out["report"] = self.report
        return out


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _is_large_import_context(workouts_bytes: int | None = None) -> bool:
    if workouts_bytes is not None and workouts_bytes >= LARGE_DB_BYTES_THRESHOLD:
        return True
    return db_bytes_total() >= LARGE_DB_BYTES_THRESHOLD


def _job_status_path(job_id: str) -> Path:
    return import_jobs_root() / job_id / "status.json"


def _persist_job_status(task: DatabaseImportTaskState) -> None:
    try:
        path = _job_status_path(task.task_id)
        path.parent.mkdir(parents=True, exist_ok=True)
        payload = task.to_dict()
        payload["user_id"] = task.user_id
        payload["mode"] = task.mode
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except OSError as err:
        logger.warning("database_import status persist failed job=%s: %s", task.task_id, err)


def _load_persisted_task(job_id: str) -> DatabaseImportTaskState | None:
    path = _job_status_path(job_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return DatabaseImportTaskState(
        task_id=job_id,
        user_id=int(data.get("user_id") or 1),
        mode=data.get("mode") or "replace",
        status=str(data.get("status") or "failed"),
        stage=str(data.get("stage") or "error"),
        progressPercent=int(data.get("progressPercent") or 0),
        processed=int(data.get("processed") or 0),
        total=int(data.get("total") or 1),
        message=str(data.get("message") or ""),
        error=data.get("error"),
        report=data.get("report"),
        started_at=data.get("started_at"),
        last_progress_at=data.get("last_progress_at"),
        recommended_mode=data.get("recommended_mode"),
    )


def _staging_bytes(manifest: dict[str, Any]) -> tuple[int, int]:
    w = manifest.get("workouts_path")
    s = manifest.get("shared_path")
    wb = int(Path(w).stat().st_size) if w and Path(w).is_file() else 0
    sb = int(Path(s).stat().st_size) if s and Path(s).is_file() else 0
    return wb, sb


def _recommended_import_mode(workouts_bytes: int, shared_bytes: int) -> str:
    if workouts_bytes + shared_bytes >= LARGE_DB_BYTES_THRESHOLD:
        return "replace"
    return "merge"


_STAGE_PERCENT: dict[str, int] = {
    "validating": 8,
    "backup_current": 16,
    "importing": 22,
    "activating": 55,
    "migrating": 65,
    "integrity_check": 82,
    "indexes": 88,
    "analyze": 92,
    "verifying": 95,
    "warmup": 97,
    "done": 100,
    "error": 0,
}


def import_jobs_root() -> Path:
    return DATA_ROOT / "import-jobs"


def import_lock_path() -> Path:
    return DATA_ROOT / ".db-import.lock"


def _process_pid_alive(pid: int) -> bool:
    """Return True if a process with ``pid`` is running (POSIX signal 0 / Win32 OpenProcess)."""
    if pid <= 0:
        return False
    if sys.platform == "win32":
        import ctypes

        kernel32 = ctypes.windll.kernel32
        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        STILL_ACTIVE = 259
        handle = kernel32.OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, False, pid)
        if not handle:
            return False
        try:
            exit_code = ctypes.c_ulong()
            if not kernel32.GetExitCodeProcess(handle, ctypes.byref(exit_code)):
                return False
            return exit_code.value == STILL_ACTIVE
        finally:
            kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
    except (OSError, SystemError):
        return False
    return True


def _import_lock_pid_alive(lock: Path) -> bool | None:
    """True if lock holder process exists; False if stale; None if lock has no pid."""
    if not lock.is_file():
        return None
    try:
        raw = lock.read_text(encoding="utf-8").strip()
        if not raw.startswith("{"):
            return None
        data = json.loads(raw)
        pid = int(data.get("pid") or 0)
    except (OSError, json.JSONDecodeError, TypeError, ValueError):
        return None
    if pid <= 0:
        return None
    try:
        return _process_pid_alive(pid)
    except Exception as err:
        logger.warning("[import] could not verify lock pid %s: %s", pid, err)
        return None


def clear_stale_import_lock(*, log: logging.Logger | None = None) -> bool:
    """Remove .db-import.lock when the recorded PID is no longer running."""
    lock = import_lock_path()
    alive = _import_lock_pid_alive(lock)
    if alive is not False:
        return False
    try:
        lock.unlink(missing_ok=True)
    except OSError as err:
        if log:
            log.warning("[import] could not remove stale lock %s: %s", lock, err)
        return False
    if log:
        log.warning("[import] removed stale db import lock: %s", lock)
    return True


def _has_active_import_worker() -> bool:
    with _lock:
        for task in _tasks.values():
            if task.status in ("pending", "running"):
                return True
    return False


def _is_import_worker_active(task_id: str) -> bool:
    with _lock:
        task = _tasks.get(task_id)
        return task is not None and task.status in ("pending", "running")


def _clear_orphan_import_lock(*, log: logging.Logger | None = None) -> bool:
    """Drop lock file when no import worker is running (crashed thread / API reload)."""
    lock = import_lock_path()
    if not lock.is_file():
        return False
    task_id = _read_lock_task_id(lock)
    if task_id:
        _release_import_lock(task_id)
    else:
        try:
            lock.unlink(missing_ok=True)
        except OSError as err:
            if log:
                log.warning("[import] could not remove orphan lock %s: %s", lock, err)
            return False
    if log:
        log.warning(
            "[import] cleared orphan db import lock (task_id=%s, no active worker)",
            task_id,
        )
    return True


def is_database_import_in_progress() -> bool:
    if _has_active_import_worker():
        return True
    lock = import_lock_path()
    if not lock.is_file():
        return False
    if _import_lock_pid_alive(lock) is False:
        clear_stale_import_lock(log=logger)
        return False
    _clear_orphan_import_lock(log=logger)
    return False


def _percent_for(stage: str, processed: int, total: int) -> int:
    base = _STAGE_PERCENT.get(stage, 10)
    if stage == "importing" and total > 0:
        span = 30
        return min(52, base + int((processed / total) * span))
    if stage == "done":
        return 100
    return base


def _update_task(
    task_id: str,
    *,
    stage: str,
    processed: int = 0,
    total: int = 1,
    message: str | None = None,
) -> None:
    with _lock:
        task = _tasks.get(task_id)
        if not task or task.status not in ("pending", "running"):
            return
        task.stage = stage
        task.processed = processed
        task.total = max(total, 1)
        task.progressPercent = _percent_for(stage, processed, total)
        if message:
            task.message = message
        elif stage == "validating":
            task.message = "Проверка файлов…"
        elif stage == "backup_current":
            task.message = "Резервная копия текущей базы…"
        elif stage == "importing":
            task.message = f"Импорт {processed}/{total}…"
        elif stage == "activating":
            task.message = "Переключение активной базы…"
        elif stage == "migrating":
            task.message = "Миграции схемы…"
        elif stage == "integrity_check":
            task.message = "Проверка целостности…"
        elif stage == "indexes":
            task.message = "Индексы…"
        elif stage == "analyze":
            task.message = "ANALYZE…"
        elif stage == "verifying":
            task.message = "Проверка работоспособности базы…"
        elif stage == "warmup":
            task.message = "Подготовка разделов…"
        elif stage == "done":
            task.message = "Импорт завершён"
        task.last_progress_at = _utc_now_iso()
        _persist_job_status(task)


def _validate_job_id(job_id: str) -> None:
    if not _JOB_ID_RE.match(job_id):
        raise ValueError("Некорректный job_id")


def _resolve_staged_path(job_dir: Path, rel_path: str) -> Path:
    rel = Path(rel_path)
    if rel.is_absolute():
        raise ValueError("Путь в manifest должен быть относительным")
    resolved = (job_dir / rel).resolve()
    job_resolved = job_dir.resolve()
    if not str(resolved).startswith(str(job_resolved)):
        raise ValueError("Путь выходит за пределы каталога задачи")
    return resolved


def load_job_manifest(job_id: str) -> dict[str, Any]:
    _validate_job_id(job_id)
    job_dir = import_jobs_root() / job_id
    manifest_path = job_dir / "manifest.json"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"manifest.json не найден для job {job_id}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    workouts_rel = manifest.get("workoutsPath") or manifest.get("workouts_path")
    shared_rel = manifest.get("sharedPath") or manifest.get("shared_path")
    if not workouts_rel or not shared_rel:
        raise ValueError("manifest должен содержать workoutsPath и sharedPath")
    mode = manifest.get("mode", "replace")
    if mode not in ("merge", "replace"):
        raise ValueError("mode должен быть merge или replace")
    workouts = _resolve_staged_path(job_dir, str(workouts_rel))
    shared = _resolve_staged_path(job_dir, str(shared_rel))
    if not workouts.is_file():
        raise FileNotFoundError(f"workouts.db не найден: {workouts}")
    if not shared.is_file():
        raise FileNotFoundError(f"shared.db не найден: {shared}")
    return {
        "job_id": job_id,
        "mode": mode,
        "workouts_path": workouts,
        "shared_path": shared,
        "job_dir": job_dir,
    }


def _read_lock_task_id(lock: Path) -> str | None:
    if not lock.is_file():
        return None
    try:
        raw = lock.read_text(encoding="utf-8").strip()
        if not raw:
            return None
        if raw.startswith("{"):
            data = json.loads(raw)
            return str(data.get("task_id") or "")
        return raw
    except (OSError, json.JSONDecodeError):
        return None


def _acquire_import_lock(task_id: str) -> None:
    lock = import_lock_path()
    lock.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(
        {
            "task_id": task_id,
            "pid": os.getpid(),
            "started_at": _utc_now_iso(),
        },
        ensure_ascii=False,
    )
    try:
        fd = os.open(str(lock), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        try:
            os.write(fd, payload.encode("utf-8"))
        finally:
            os.close(fd)
    except FileExistsError:
        existing = _read_lock_task_id(lock)
        if existing and existing != task_id:
            raise RuntimeError("Другой импорт базы уже выполняется")
        raise


def _release_import_lock(task_id: str) -> None:
    lock = import_lock_path()
    try:
        if lock.is_file():
            existing = _read_lock_task_id(lock)
            if existing in (task_id, None, ""):
                lock.unlink(missing_ok=True)
    except OSError:
        pass


def _table_exists_on_connection(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=?",
            (table,),
        ).fetchone()
    return row is not None


def _pragma_columns(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    if schema == "main":
        rows = conn.execute(f"PRAGMA table_info({table})").fetchall()
    else:
        rows = conn.execute(f"PRAGMA {schema}.table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


def _replace_activate(staging_workouts: Path, staging_shared: Path) -> None:
    replace_both_databases(staging_workouts, staging_shared)


def _merge_from_staging(
    staging_workouts: Path,
    staging_shared: Path,
    target_user_id: int,
    on_progress: Callable[[int, int, str], None],
) -> dict[str, Any]:
    import_uid = _detect_import_user_id(staging_workouts)
    tables = (
        list(TABLE_IMPORT_ORDER)
        + list(MEAL_PLAN_TABLES)
        + [t for t in SHARED_TABLES if t not in TABLE_IMPORT_ORDER]
    )
    total = len(tables)
    stats: dict[str, Any] = {}

    conn = sqlite3.connect(WORKOUTS_DB_PATH, timeout=MERGE_BUSY_TIMEOUT_MS / 1000.0)
    conn.execute(f"PRAGMA busy_timeout = {MERGE_BUSY_TIMEOUT_MS}")
    try:
        conn.execute(f"ATTACH DATABASE ? AS import_main", (str(staging_workouts.resolve()),))
        conn.execute(f"ATTACH DATABASE ? AS import_shared", (str(staging_shared.resolve()),))
        if SHARED_DB_PATH.exists():
            conn.execute(f"ATTACH DATABASE ? AS shared", (str(SHARED_DB_PATH.resolve()),))
        else:
            conn.execute(f"ATTACH DATABASE ? AS shared", (str(staging_shared.resolve()),))

        for idx, table in enumerate(tables, start=1):
            on_progress(idx, total, table)
            if table in MEAL_PLAN_TABLES:
                target_schema = "main" if meal_plans_in_workouts(conn) else "shared"
                import_schema = None
                if _table_exists_on_connection(conn, "import_shared", table):
                    import_schema = "import_shared"
                elif _table_exists_on_connection(conn, "import_main", table):
                    import_schema = "import_main"
                if import_schema is None:
                    continue
                if not _table_exists_on_connection(conn, target_schema, table):
                    live_cols = _pragma_columns(conn, import_schema, table)
                    conn.execute(
                        f"CREATE TABLE {target_schema}.{table} AS "
                        f"SELECT * FROM {import_schema}.{table} WHERE 0"
                    )
                live_cols = _pragma_columns(conn, target_schema, table)
                imp_cols = _pragma_columns(conn, import_schema, table)
                common = [c for c in imp_cols if c in live_cols]
                if not common:
                    continue
                col_sql = ", ".join(common)
                conn.execute(
                    f"INSERT OR REPLACE INTO {target_schema}.{table} ({col_sql}) "
                    f"SELECT {col_sql} FROM {import_schema}.{table}"
                )
                stats[table] = conn.total_changes
                conn.commit()
                continue

            if table in SHARED_TABLES:
                if not _table_exists_on_connection(conn, "import_shared", table):
                    continue
                if not _table_exists_on_connection(conn, "shared", table):
                    live_cols = _pragma_columns(conn, "import_shared", table)
                    col_list = ", ".join(live_cols)
                    conn.execute(
                        f"CREATE TABLE shared.{table} AS "
                        f"SELECT * FROM import_shared.{table} WHERE 0"
                    )
                if is_catalog_merge_table(table):
                    detail = merge_catalog_from_staging(
                        conn,
                        table,
                        target_user_id=int(target_user_id),
                        import_uid=int(import_uid),
                    )
                    if detail is not None:
                        stats[table] = (
                            detail.get("imported", 0)
                            + detail.get("updated", 0)
                            + detail.get("merged", 0)
                        )
                        natural_key = stats.setdefault("natural_key", {})
                        natural_key[table] = detail
                    conn.commit()
                    continue
                live_cols = _pragma_columns(conn, "shared", table)
                imp_cols = _pragma_columns(conn, "import_shared", table)
                common = [c for c in imp_cols if c in live_cols]
                if not common:
                    continue
                col_sql = ", ".join(common)
                conn.execute(
                    f"INSERT OR REPLACE INTO shared.{table} ({col_sql}) "
                    f"SELECT {col_sql} FROM import_shared.{table}"
                )
                stats[table] = conn.total_changes
                conn.commit()
                continue

            if not _table_exists_on_connection(conn, "import_main", table):
                continue
            if not _table_exists_on_connection(conn, "main", table):
                continue

            if is_cloud_auth_table(table):
                conn.commit()
                continue

            if is_natural_key_table(table):
                detail = merge_table_from_staging(
                    conn,
                    table,
                    target_user_id=int(target_user_id),
                    import_uid=int(import_uid),
                )
                if detail is not None:
                    stats[table] = (
                        detail.get("imported", 0)
                        + detail.get("updated", 0)
                        + detail.get("merged", 0)
                    )
                    stats[f"{table}_detail"] = detail
                    natural_key = stats.setdefault("natural_key", {})
                    natural_key[table] = detail
                    conn.commit()
                    continue

            assert_safe_main_table_import(table)
            live_cols = _pragma_columns(conn, "main", table)
            imp_cols = _pragma_columns(conn, "import_main", table)
            common = [c for c in imp_cols if c in live_cols]
            if not common:
                continue
            col_sql = ", ".join(common)
            if "user_id" in common:
                select_parts = []
                for c in common:
                    if c == "user_id":
                        select_parts.append(str(int(target_user_id)))
                    else:
                        select_parts.append(c)
                sel = ", ".join(select_parts)
                conn.execute(
                    f"INSERT OR REPLACE INTO main.{table} ({col_sql}) "
                    f"SELECT {sel} FROM import_main.{table} WHERE user_id = ?",
                    (import_uid,),
                )
            else:
                conn.execute(
                    f"INSERT OR REPLACE INTO main.{table} ({col_sql}) "
                    f"SELECT {col_sql} FROM import_main.{table}"
                )
            stats[table] = conn.total_changes
            conn.commit()
    finally:
        try:
            conn.execute("DETACH import_main")
        except sqlite3.Error:
            pass
        try:
            conn.execute("DETACH import_shared")
        except sqlite3.Error:
            pass
        conn.close()
    return stats


def _post_import_integrity() -> tuple[str, int]:
    from database.connection import is_shared_attached, open_db

    conn = open_db(attach=True)
    try:
        row = conn.execute("PRAGMA quick_check").fetchone()
        check = str(row[0]) if row else "ok"
        if check.lower() != "ok":
            raise RuntimeError(f"PRAGMA quick_check failed: {check}")
        if is_shared_attached(conn):
            srow = conn.execute("PRAGMA shared.quick_check").fetchone()
            scheck = str(srow[0]) if srow else "ok"
            if scheck.lower() != "ok":
                raise RuntimeError(f"PRAGMA shared.quick_check failed: {scheck}")
        tables = conn.execute(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table'"
        ).fetchone()[0]
        return check, int(tables or 0)
    finally:
        conn.close()


def _finalize_post_import(
    task_id: str,
    user_id: int,
    *,
    stage_timings: dict[str, float] | None = None,
    large_import: bool = False,
) -> dict[str, Any]:
    timings = stage_timings if stage_timings is not None else {}
    from database.connection import open_db
    from database.migrations import ensure_db_schema, get_schema_version

    _update_task(task_id, stage="migrating", message="Миграции схемы…")

    t0 = time.perf_counter()
    conn_m = open_db(attach=False)
    try:
        schema_before = get_schema_version(conn_m)
    finally:
        conn_m.close()
    ensure_db_schema()
    conn_m2 = open_db(attach=False)
    try:
        schema_after = get_schema_version(conn_m2)
    finally:
        conn_m2.close()
    timings["migrations_sec"] = round(time.perf_counter() - t0, 2)

    _update_task(task_id, stage="integrity_check")
    t0 = time.perf_counter()
    check, table_count = _post_import_integrity()
    timings["integrity_sec"] = round(time.perf_counter() - t0, 2)

    _update_task(task_id, stage="indexes")
    from database.migrations import ensure_performance_indexes

    t0 = time.perf_counter()
    conn_idx = open_db(attach=True)
    try:
        ensure_performance_indexes(conn_idx)
        conn_idx.commit()
    finally:
        conn_idx.close()
    timings["indexes_sec"] = round(time.perf_counter() - t0, 2)

    _update_task(task_id, stage="analyze")
    t0 = time.perf_counter()
    conn_an = open_db(attach=True)
    try:
        if large_import:
            for table in LARGE_DB_ANALYZE_TABLES:
                try:
                    conn_an.execute(f"ANALYZE {table}")
                except sqlite3.Error:
                    pass
        else:
            conn_an.execute("ANALYZE")
            shared_tables = conn_an.execute(
                "SELECT name FROM shared.sqlite_master WHERE type='table'"
            ).fetchall()
            for row in shared_tables:
                conn_an.execute(f"ANALYZE shared.{row[0]}")
        conn_an.commit()
    finally:
        conn_an.close()
    timings["analyze_sec"] = round(time.perf_counter() - t0, 2)

    workouts_bytes = WORKOUTS_DB_PATH.stat().st_size if WORKOUTS_DB_PATH.exists() else 0
    shared_bytes = SHARED_DB_PATH.stat().st_size if SHARED_DB_PATH.exists() else 0
    report: dict[str, Any] = {
        "integrity": check,
        "tables": table_count,
        "workouts_bytes": workouts_bytes,
        "shared_bytes": shared_bytes,
        "large_import": large_import,
        "schema_version_before": schema_before,
        "schema_version_after": schema_after,
        "stage_timings": timings,
        "warmup_recommended": True,
        "warmup_note": (
            "Фоновый прогрев запущен; первые экраны могут открываться медленнее."
            if large_import
            else None
        ),
    }
    try:
        from backend.services.account_warmup_tasks import start_account_warmup

        light = start_account_warmup(user_id, mode="light")
        report["warmup_task_id"] = light.task_id
    except Exception as warm_err:
        report["warmup_auto_error"] = str(warm_err)
    return report


def _worker(task_id: str, user_id: int, mode: ImportMode, manifest: dict[str, Any]) -> None:
    from backend.database.request_context import clear_current_user_id, set_current_user_id

    set_current_user_id(user_id)
    pre_user: dict[str, Any] | None = None
    try:
        pre_user = get_user_by_id(user_id)
    except sqlite3.OperationalError:
        pre_user = None
    workout_bak: str | None = None
    shared_bak: str | None = None
    staging_workouts: Path = manifest["workouts_path"]
    staging_shared: Path = manifest["shared_path"]
    stage_timings: dict[str, float] = {}
    t_worker = time.perf_counter()
    wb, sb = _staging_bytes(manifest)
    large_import = _is_large_import_context(wb)
    import_preflight: dict[str, Any] = {}
    try:
        _acquire_import_lock(task_id)
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "running"
                _persist_job_status(task)

        _update_task(task_id, stage="validating", message="Проверка staging…")
        _quick_check_sqlite(staging_workouts)
        _quick_check_sqlite(staging_shared)

        import_preflight = run_import_preflight(
            staging_workouts,
            staging_shared,
            target_user_id=user_id,
            mode=mode,
            live_workouts=WORKOUTS_DB_PATH if mode == "merge" else None,
            live_shared=SHARED_DB_PATH if mode == "merge" and SHARED_DB_PATH.is_file() else None,
        )

        _update_task(task_id, stage="backup_current")
        t_backup = time.perf_counter()
        workout_bak, shared_bak = _backup_current_db_files(user_id)
        stage_timings["backup_sec"] = round(time.perf_counter() - t_backup, 2)
        merge_stats: dict[str, Any] | None = None

        if mode == "replace":
            _update_task(task_id, stage="importing", processed=1, total=2, message="Проверка перед заменой…")
            _quick_check_sqlite(staging_workouts)
            _quick_check_sqlite(staging_shared)
            _update_task(task_id, stage="activating", message="Замена активной базы…")
            _replace_activate(staging_workouts, staging_shared)
            from database.migrations import ensure_db_schema

            ensure_db_schema()
            reconcile_report = reconcile_after_db_import(
                user_id,
                staging_workouts,
                pre_user,
            )
            user_remap = reconcile_report.get("user_id_remap")
            hr_dedupe = _post_import_natural_key_dedupe(user_id)
        else:
            user_remap = None
            reconcile_report = None

            def on_merge_progress(current: int, total: int, table: str) -> None:
                _update_task(
                    task_id,
                    stage="importing",
                    processed=current,
                    total=total,
                    message=f"Слияние: {table}",
                )

            merge_stats = _merge_from_staging(
                staging_workouts,
                staging_shared,
                user_id,
                on_merge_progress,
            )
            from database.migrations import ensure_db_schema

            ensure_db_schema()
            reconcile_report = reconcile_after_db_import(
                user_id,
                staging_workouts,
                pre_user,
            )
            user_remap = reconcile_report.get("user_id_remap")
            hr_dedupe = _post_import_natural_key_dedupe(user_id)

        stage_timings["import_activate_sec"] = round(time.perf_counter() - t_worker, 2)
        report = _finalize_post_import(
            task_id,
            user_id,
            stage_timings=stage_timings,
            large_import=large_import,
        )
        report["duration_sec"] = round(time.perf_counter() - t_worker, 2)
        report["mode"] = mode
        report["import_preflight"] = import_preflight
        if mode == "merge" and reconcile_report is not None:
            report["user_reconcile"] = reconcile_report
        if mode == "merge" and merge_stats is not None:
            report["merge_stats"] = merge_stats
        if user_remap is not None:
            report["user_id_remap"] = user_remap
        if mode == "replace" and reconcile_report is not None and "user_reconcile" not in report:
            report["user_reconcile"] = reconcile_report
        if hr_dedupe:
            report["natural_key_dedupe"] = hr_dedupe

        _update_task(task_id, stage="verifying", message="Проверка работоспособности базы…")
        from backend.services.database_post_verify import (
            PostDbVerifyError,
            assert_post_db_verification,
        )

        verify_report = assert_post_db_verification(user_id, light_verify=large_import)
        report["verification"] = verify_report.to_dict()
        if verify_report.workout_visibility is not None:
            report["workout_visibility"] = verify_report.workout_visibility

        _update_task(task_id, stage="warmup", message="Подготовка разделов…")
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.report = report
        _update_task(task_id, stage="done", message="Импорт завершён")
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "completed"
                _persist_job_status(task)
        logger.info("database_import completed job_id=%s user_id=%s mode=%s", task_id, user_id, mode)
    except ImportPreflightError as exc:
        logger.error("database_import preflight blocked job_id=%s: %s", task_id, exc)
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = str(exc)
                task.stage = "error"
                task.message = str(exc)
                task.progressPercent = 0
                task.report = {"import_preflight": exc.report}
                _persist_job_status(task)
    except Exception as exc:
        from backend.services.database_post_verify import PostDbVerifyError

        if isinstance(exc, PostDbVerifyError):
            logger.error(
                "database_import verify failed job_id=%s: %s report=%s",
                task_id,
                exc,
                exc.report.to_dict(),
            )
        else:
            logger.exception("database_import failed job_id=%s: %s", task_id, exc)
        _restore_db_files(workout_bak, shared_bak)
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = str(exc)
                task.stage = "error"
                task.message = str(exc)
                task.progressPercent = 0
                if isinstance(exc, PostDbVerifyError):
                    task.report = {
                        "verification": exc.report.to_dict(),
                    }
                _persist_job_status(task)
    finally:
        clear_current_user_id()
        _release_import_lock(task_id)
        with _lock:
            if _running_by_user.get(user_id) == task_id:
                del _running_by_user[user_id]


def start_database_import(job_id: str, user_id: int, mode: ImportMode | None = None) -> DatabaseImportTaskState:
    _validate_job_id(job_id)
    uid = int(user_id)
    manifest_data = load_job_manifest(job_id)
    effective_mode: ImportMode = mode or manifest_data["mode"]

    with _lock:
        existing_id = _running_by_user.get(uid)
        if existing_id:
            existing = _tasks.get(existing_id)
            if existing and existing.status in ("pending", "running"):
                raise DatabaseImportAlreadyRunningError(existing_id)
        if is_database_import_in_progress():
            lock_tid = import_lock_path().read_text(encoding="utf-8").strip()
            if lock_tid:
                raise DatabaseImportAlreadyRunningError(lock_tid)

    wb, sb = _staging_bytes(manifest_data)
    task = DatabaseImportTaskState(
        task_id=job_id,
        user_id=uid,
        mode=effective_mode,
        status="pending",
        stage="validating",
        message="Запуск импорта…",
        started_at=_utc_now_iso(),
        last_progress_at=_utc_now_iso(),
        recommended_mode=_recommended_import_mode(wb, sb),
    )
    with _lock:
        _tasks[job_id] = task
        _running_by_user[uid] = job_id
    _persist_job_status(task)

    thread = threading.Thread(
        target=_worker,
        args=(job_id, uid, effective_mode, manifest_data),
        name=f"db-import-{job_id[:8]}",
        daemon=True,
    )
    thread.start()
    return task


def get_database_import_task(task_id: str) -> DatabaseImportTaskState | None:
    with _lock:
        task = _tasks.get(task_id)
    if task is not None:
        return task
    persisted = _load_persisted_task(task_id)
    if persisted is not None:
        if persisted.status in ("pending", "running") and not _is_import_worker_active(task_id):
            persisted.status = "failed"
            persisted.stage = "error"
            persisted.error = "Импорт прерван (перезапуск API или сбой процесса)."
            persisted.message = persisted.error
            persisted.progressPercent = 0
            _persist_job_status(persisted)
            _release_import_lock(task_id)
        with _lock:
            _tasks[task_id] = persisted
    return persisted
