# -*- coding: utf-8 -*-
"""
Build a clean workouts.db packaging seed from schema migrations only.

Never reads repository-root workouts.db (developer personal data).
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = ROOT / "packaging" / "seed-template"
BUILD_DIR = TEMPLATE_DIR / "_build"

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from packaging_seed_common import audit_workouts_seed, sanitize_workouts_seed


def _resolve_shared_source() -> Path:
    template_shared = TEMPLATE_DIR / "shared.db"
    if template_shared.is_file():
        return template_shared
    root_shared = ROOT / "shared.db"
    if root_shared.is_file():
        return root_shared
    raise FileNotFoundError(
        "Missing sanitized shared.db. Run: python scripts/build_public_shared_db.py"
    )


def main() -> int:
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    if BUILD_DIR.exists():
        shutil.rmtree(BUILD_DIR)
    BUILD_DIR.mkdir(parents=True)

    shared_src = _resolve_shared_source()
    workouts_path = BUILD_DIR / "workouts.db"
    shared_path = BUILD_DIR / "shared.db"
    sqlite3.connect(workouts_path).close()
    shutil.copy2(shared_src, shared_path)

    os.environ["FORMA_DATA_DIR"] = str(BUILD_DIR.resolve())

    import database.connection as db_conn

    db_conn.DATA_ROOT = BUILD_DIR
    db_conn.WORKOUTS_DB_PATH = workouts_path
    db_conn.SHARED_DB_PATH = shared_path

    from database.migrations import SCHEMA_VERSION, ensure_db_schema, get_schema_version

    ensure_db_schema()

    conn = sqlite3.connect(workouts_path)
    try:
        sanitize_workouts_seed(conn)
        version = get_schema_version(conn)
        if version < SCHEMA_VERSION:
            print(
                f"ERROR: seed schema v{version} < {SCHEMA_VERSION}",
                file=sys.stderr,
            )
            return 1
    finally:
        conn.close()

    out_path = TEMPLATE_DIR / "workouts.db"
    if out_path.exists():
        out_path.unlink()
    shutil.copy2(workouts_path, out_path)
    shutil.rmtree(BUILD_DIR, ignore_errors=True)

    errors = audit_workouts_seed(out_path)
    if errors:
        print("ERROR: workouts seed audit failed:", file=sys.stderr)
        for err in errors:
            print(f"  - {err}", file=sys.stderr)
        return 1

    print(f"Ready {out_path} ({out_path.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
