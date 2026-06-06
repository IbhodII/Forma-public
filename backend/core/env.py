# -*- coding: utf-8 -*-
"""Загрузка .env из корня репозитория (один раз, override=True)."""
from __future__ import annotations

import os
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
_ENV_LOADED = False
_ENV_PATH: Path | None = None


def _resolve_env_candidates() -> list[Path]:
    candidates: list[Path] = []

    explicit = os.getenv("FORMA_ENV_PATH", "").strip()
    if explicit:
        candidates.append(Path(explicit))

    data_dir = os.getenv("FORMA_DATA_DIR", "").strip()
    if data_dir:
        candidates.append(Path(data_dir) / ".env")

    candidates.append(ROOT / ".env")
    candidates.append(Path.cwd() / ".env")

    unique: list[Path] = []
    seen: set[str] = set()
    for path in candidates:
        key = str(path.resolve()) if path.exists() else str(path)
        if key in seen:
            continue
        seen.add(key)
        unique.append(path)
    return unique


def load_project_env() -> Path | None:
    """
    Читает ROOT/.env в os.environ.
    override=True — значения из файла перекрывают пустые переменные в shell.
  """
    global _ENV_LOADED, _ENV_PATH
    if _ENV_LOADED and _ENV_PATH and _ENV_PATH.is_file():
        return _ENV_PATH

    env_path: Path | None = None
    for candidate in _resolve_env_candidates():
        if candidate.is_file():
            env_path = candidate
            break
    if env_path is None:
        return None
    try:
        from dotenv import load_dotenv

        load_dotenv(env_path, override=True, encoding="utf-8")
    except ImportError:
        pass
    except TypeError:
        from dotenv import load_dotenv

        load_dotenv(env_path, override=True)
    _ENV_LOADED = True
    _ENV_PATH = env_path
    return env_path


def yandex_oauth_configured() -> bool:
    load_project_env()
    return bool(os.getenv("YANDEX_CLIENT_ID", "").strip())


def google_oauth_configured() -> bool:
    load_project_env()
    return bool(os.getenv("GOOGLE_CLIENT_ID", "").strip())
