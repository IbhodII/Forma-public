# -*- coding: utf-8 -*-
"""Stage database import files into import-jobs/{job_id} (browser upload or desktop)."""
from __future__ import annotations

import json
import os
import shutil
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO, Literal

from backend.services.database_import_tasks import import_jobs_root

ImportMode = Literal["merge", "replace"]

# Soft limit for browser ZIP upload (override via FORMA_DB_IMPORT_MAX_ZIP_BYTES).
_DEFAULT_MAX_ZIP_BYTES = 4 * 1024 * 1024 * 1024
STREAM_CHUNK_BYTES = 1024 * 1024


def max_zip_upload_bytes() -> int:
    raw = os.environ.get("FORMA_DB_IMPORT_MAX_ZIP_BYTES", "").strip()
    if raw.isdigit():
        return int(raw)
    return _DEFAULT_MAX_ZIP_BYTES


def _find_db_files_recursive(root: Path, name: str) -> list[Path]:
    matches: list[Path] = []
    if not root.is_dir():
        return matches
    for path in root.rglob(name):
        if path.is_file() and path.name.lower() == name.lower():
            matches.append(path)
    return matches


def _copy_to_staging(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(src, dest)


def _write_manifest(job_dir: Path, job_id: str, mode: ImportMode) -> None:
    manifest = {
        "jobId": job_id,
        "mode": mode,
        "workoutsPath": "staging/workouts.db",
        "sharedPath": "staging/shared.db",
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    (job_dir / "manifest.json").write_text(
        json.dumps(manifest, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def stage_import_from_paths(
    *,
    workouts_src: Path,
    shared_src: Path,
    mode: ImportMode = "replace",
    job_id: str | None = None,
) -> str:
    if not workouts_src.is_file():
        raise FileNotFoundError(f"workouts.db не найден: {workouts_src}")
    if not shared_src.is_file():
        raise FileNotFoundError(f"shared.db не найден: {shared_src}")

    job_id = job_id or str(uuid.uuid4())
    job_dir = import_jobs_root() / job_id
    staging_dir = job_dir / "staging"
    staging_dir.mkdir(parents=True, exist_ok=True)

    _copy_to_staging(workouts_src.resolve(), staging_dir / "workouts.db")
    _copy_to_staging(shared_src.resolve(), staging_dir / "shared.db")
    _write_manifest(job_dir, job_id, mode)
    return job_id


def _extract_zip_to_dir(zip_path: Path, extract_dir: Path) -> None:
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        bad = zf.testzip()
        if bad is not None:
            raise ValueError(f"ZIP-архив повреждён: {bad}")
        zf.extractall(extract_dir)


def stage_import_from_zip_path(zip_path: Path, mode: ImportMode = "replace") -> str:
    if not zip_path.is_file():
        raise FileNotFoundError(f"ZIP не найден: {zip_path}")

    job_id = str(uuid.uuid4())
    job_dir = import_jobs_root() / job_id
    extract_dir = job_dir / "extracted"
    _extract_zip_to_dir(zip_path.resolve(), extract_dir)

    workouts_matches = _find_db_files_recursive(extract_dir, "workouts.db")
    shared_matches = _find_db_files_recursive(extract_dir, "shared.db")
    if not workouts_matches:
        raise FileNotFoundError("В архиве не найден workouts.db")
    if not shared_matches:
        raise FileNotFoundError("В архиве не найден shared.db")

    return stage_import_from_paths(
        workouts_src=workouts_matches[0],
        shared_src=shared_matches[0],
        mode=mode,
        job_id=job_id,
    )


def stage_import_from_zip_stream(
    stream: BinaryIO,
    mode: ImportMode = "replace",
    *,
    max_bytes: int | None = None,
) -> str:
    """Write upload stream to a temp ZIP on disk, then extract (low RAM)."""
    limit = max_bytes if max_bytes is not None else max_zip_upload_bytes()
    job_id = str(uuid.uuid4())
    job_dir = import_jobs_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    zip_path = job_dir / "upload.zip"
    total = 0
    with open(zip_path, "wb") as out:
        while True:
            chunk = stream.read(STREAM_CHUNK_BYTES)
            if not chunk:
                break
            total += len(chunk)
            if total > limit:
                try:
                    zip_path.unlink(missing_ok=True)
                    shutil.rmtree(job_dir, ignore_errors=True)
                except OSError:
                    pass
                raise ValueError(
                    f"ZIP слишком большой (>{limit // (1024 * 1024)} МБ). "
                    "Используйте desktop-импорт или уменьшите архив."
                )
            out.write(chunk)
    return stage_import_from_zip_path(zip_path, mode=mode)


def stage_import_from_zip_bytes(zip_bytes: bytes, mode: ImportMode = "replace") -> str:
    if not zip_bytes:
        raise ValueError("Пустой ZIP-файл")
    if len(zip_bytes) > max_zip_upload_bytes():
        raise ValueError("ZIP слишком большой для загрузки через браузер")
    job_id = str(uuid.uuid4())
    job_dir = import_jobs_root() / job_id
    job_dir.mkdir(parents=True, exist_ok=True)
    zip_path = job_dir / "upload.zip"
    zip_path.write_bytes(zip_bytes)
    return stage_import_from_zip_path(zip_path, mode=mode)
