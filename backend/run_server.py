# -*- coding: utf-8 -*-
"""Desktop entrypoint for packaged backend process."""
from __future__ import annotations

import os
import shutil
import sys
from pathlib import Path

import uvicorn

from backend.main import app

def _resolve_static_dir() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys._MEIPASS) / "frontend" / "dist"
    return Path(__file__).resolve().parent.parent / "frontend" / "dist"


def _resolve_data_dir() -> Path:
    env_dir = os.environ.get("FORMA_DATA_DIR", "").strip()
    if env_dir:
        return Path(env_dir).expanduser()
    return Path(__file__).resolve().parent.parent


def _ensure_seed_databases(data_dir: Path) -> None:
    data_dir.mkdir(parents=True, exist_ok=True)
    candidates_root = []
    if getattr(sys, "frozen", False):
        candidates_root.append(Path(sys._MEIPASS) / "seed")
    candidates_root.append(Path(__file__).resolve().parent.parent)

    for db_name in ("workouts.db", "shared.db"):
        target = data_dir / db_name
        if target.exists():
            continue
        for root in candidates_root:
            src = root / db_name
            if src.exists():
                shutil.copy2(src, target)
                break


if __name__ == "__main__":
    data_dir = _resolve_data_dir()
    _ensure_seed_databases(data_dir)
    os.environ.setdefault("FORMA_DATA_DIR", str(data_dir))
    static_dir = _resolve_static_dir()
    os.environ.setdefault("FORMA_STATIC_DIR", str(static_dir))
    os.environ.setdefault("FORMA_SERVE_STATIC", "1")
    host = os.environ.get("FORMA_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)
