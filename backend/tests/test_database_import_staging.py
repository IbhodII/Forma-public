# -*- coding: utf-8 -*-
"""Browser staging for database import."""
from __future__ import annotations

import io
import json
import sqlite3
import zipfile
from pathlib import Path

import pytest

from backend.services.database_import_staging import stage_import_from_zip_bytes
from backend.services.database_import_tasks import load_job_manifest


def _minimal_db(path: Path) -> None:
    conn = sqlite3.connect(path)
    conn.execute("CREATE TABLE user_profile (user_id INTEGER PRIMARY KEY)")
    conn.execute("INSERT INTO user_profile (user_id) VALUES (7)")
    conn.commit()
    conn.close()


def test_stage_import_from_zip_bytes(tmp_path, monkeypatch):
    import backend.services.database_import_staging as staging_mod
    import backend.services.database_import_tasks as tasks_mod

    jobs_root = tmp_path / "import-jobs"
    jobs_root.mkdir()
    monkeypatch.setattr(staging_mod, "import_jobs_root", lambda: jobs_root)
    monkeypatch.setattr(tasks_mod, "import_jobs_root", lambda: jobs_root)

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        w = tmp_path / "w.db"
        s = tmp_path / "s.db"
        _minimal_db(w)
        _minimal_db(s)
        zf.write(w, "subdir/workouts.db")
        zf.write(s, "shared.db")

    job_id = stage_import_from_zip_bytes(buf.getvalue(), mode="merge")
    manifest = load_job_manifest(job_id)
    assert manifest["mode"] == "merge"
    assert manifest["workouts_path"].is_file()
    assert manifest["shared_path"].is_file()

    meta = json.loads((jobs_root / job_id / "manifest.json").read_text(encoding="utf-8"))
    assert meta["workoutsPath"] == "staging/workouts.db"
