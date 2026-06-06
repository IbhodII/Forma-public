# -*- coding: utf-8 -*-
"""Pre-backup, rollback, and atomic file swap for database import/restore."""
from __future__ import annotations

import gc
import logging
import os
import shutil
import sqlite3
import uuid
from pathlib import Path

import database.connection as db_conn

logger = logging.getLogger(__name__)


def _checkpoint_sqlite(path: Path) -> None:
    if not path.is_file():
        return
    conn = sqlite3.connect(path, timeout=30.0)
    try:
        conn.execute("PRAGMA wal_checkpoint(FULL)")
        conn.commit()
    finally:
        conn.close()


def backup_current_db_files(
    user_id: int,
    *,
    suffix: str = "pre-db-import",
) -> tuple[str | None, str | None]:
    """Copy workouts.db and shared.db before destructive import."""
    ts = uuid.uuid4().hex[:8]
    workout_bak = None
    shared_bak = None
    workouts_path = db_conn.WORKOUTS_DB_PATH
    shared_path = db_conn.SHARED_DB_PATH
    if workouts_path.exists():
        _checkpoint_sqlite(workouts_path)
        workout_bak = str(workouts_path.with_suffix(f".{suffix}-{ts}.bak"))
        shutil.copy2(workouts_path, workout_bak)
    if shared_path.exists():
        _checkpoint_sqlite(shared_path)
        shared_bak = str(shared_path.with_suffix(f".{suffix}-{ts}.bak"))
        shutil.copy2(shared_path, shared_bak)
    logger.info(
        "db_import_safety pre-backup user_id=%s workout=%s shared=%s",
        user_id,
        workout_bak,
        shared_bak,
    )
    return workout_bak, shared_bak


def restore_db_files(workout_bak: str | None, shared_bak: str | None) -> None:
    workouts_path = db_conn.WORKOUTS_DB_PATH
    shared_path = db_conn.SHARED_DB_PATH
    if workout_bak and os.path.exists(workout_bak):
        for suffix in ("-wal", "-shm"):
            wal = workouts_path.with_name(workouts_path.name + suffix)
            if wal.exists():
                try:
                    wal.unlink()
                except OSError:
                    pass
        shutil.copy2(workout_bak, workouts_path)
        _checkpoint_sqlite(workouts_path)
    if shared_bak and os.path.exists(shared_bak):
        for suffix in ("-wal", "-shm"):
            wal = shared_path.with_name(shared_path.name + suffix)
            if wal.exists():
                try:
                    wal.unlink()
                except OSError:
                    pass
        shutil.copy2(shared_bak, shared_path)
        _checkpoint_sqlite(shared_path)


def quick_check_sqlite(path: Path) -> None:
    if path.stat().st_size < 16:
        raise ValueError(f"Файл слишком маленький: {path.name}")
    conn = sqlite3.connect(f"file:{path}?mode=ro", uri=True)
    try:
        row = conn.execute("PRAGMA quick_check").fetchone()
        check = str(row[0]) if row else "ok"
        if check.lower() != "ok":
            raise RuntimeError(f"PRAGMA quick_check ({path.name}): {check}")
    finally:
        conn.close()


def release_live_sqlite_handles() -> None:
    """Best-effort flush of open handles before swapping live DB files."""
    workouts_path = db_conn.WORKOUTS_DB_PATH
    shared_path = db_conn.SHARED_DB_PATH
    for path in (workouts_path, shared_path):
        if path.is_file():
            _checkpoint_sqlite(path)
    gc.collect()


def prepare_for_db_swap() -> None:
    """Checkpoint WAL and release handles before atomic replace of live databases."""
    release_live_sqlite_handles()


def replace_both_databases(staging_workouts: Path, staging_shared: Path) -> None:
    """Atomically replace workouts.db and shared.db from staged copies."""
    prepare_for_db_swap()
    atomic_replace_file(staging_workouts, db_conn.WORKOUTS_DB_PATH)
    atomic_replace_file(staging_shared, db_conn.SHARED_DB_PATH)
    _checkpoint_sqlite(db_conn.WORKOUTS_DB_PATH)
    if db_conn.SHARED_DB_PATH.is_file():
        _checkpoint_sqlite(db_conn.SHARED_DB_PATH)


def atomic_replace_file(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    for suffix in ("-wal", "-shm"):
        wal = dest.with_name(dest.name + suffix)
        if wal.exists():
            try:
                wal.unlink()
            except OSError:
                pass
    tmp = dest.with_suffix(dest.suffix + ".replacing")
    if tmp.exists():
        tmp.unlink()
    shutil.copy2(src, tmp)
    os.replace(tmp, dest)
    for suffix in ("-wal", "-shm"):
        wal = dest.with_name(dest.name + suffix)
        if wal.exists():
            try:
                wal.unlink()
            except OSError:
                pass
    _checkpoint_sqlite(dest)


def db_bytes_total() -> int:
    """Combined size of live DB files (for large-import heuristics)."""
    total = 0
    for path in (db_conn.WORKOUTS_DB_PATH, db_conn.SHARED_DB_PATH):
        if path.is_file():
            total += path.stat().st_size
    return total
