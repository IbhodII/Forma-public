# -*- coding: utf-8 -*-
"""CLI: run ensure_db_schema and exit non-zero if version is behind."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.connection import open_db
from database.migrations import SCHEMA_VERSION, ensure_db_schema, get_schema_version


def main() -> int:
    ensure_db_schema()
    conn = open_db(attach=False)
    try:
        version = get_schema_version(conn)
    finally:
        conn.close()
    if version < SCHEMA_VERSION:
        print(
            f"schema version {version} < {SCHEMA_VERSION}",
            file=sys.stderr,
        )
        return 1
    print(f"schema ok v{version}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
