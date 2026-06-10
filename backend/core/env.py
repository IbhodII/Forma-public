# -*- coding: utf-8 -*-
"""Загрузка .env из корня репозитория (один раз, override=True)."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Literal

OAuthFlowMode = Literal["pkce", "confidential"]
YandexOAuthFlowMode = OAuthFlowMode
GoogleOAuthFlowMode = OAuthFlowMode

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


def _env_nonempty(key: str) -> bool:
    load_project_env()
    return bool(os.getenv(key, "").strip())


def yandex_oauth_configured() -> bool:
    """Public OAuth client id present (safe to ship in desktop installer)."""
    return _env_nonempty("YANDEX_CLIENT_ID")


def google_oauth_configured() -> bool:
    """Public OAuth client id present (safe to ship in desktop installer)."""
    return _env_nonempty("GOOGLE_CLIENT_ID")


def yandex_oauth_flow_mode() -> YandexOAuthFlowMode:
    """Default pkce — YANDEX_CLIENT_SECRET is ignored unless flow is confidential."""
    load_project_env()
    raw = os.getenv("YANDEX_OAUTH_FLOW", "").strip().lower()
    if raw in ("confidential", "secret", "legacy"):
        return "confidential"
    return "pkce"


def yandex_oauth_redirect_configured() -> bool:
    load_project_env()
    if os.getenv("YANDEX_REDIRECT_URI", "").strip():
        return True
    return bool(os.getenv("PUBLIC_API_BASE_URL", "").strip())


def yandex_oauth_connectable() -> bool:
    """Public desktop PKCE: client_id + resolvable redirect (no secret)."""
    return yandex_oauth_configured() and yandex_oauth_redirect_configured()


def yandex_oauth_ready() -> bool:
    """Yandex sign-in can complete on this server."""
    if yandex_oauth_flow_mode() == "confidential":
        load_project_env()
        return (
            yandex_oauth_connectable()
            and bool(os.getenv("YANDEX_CLIENT_SECRET", "").strip())
        )
    return yandex_oauth_connectable()


def google_oauth_flow_mode() -> GoogleOAuthFlowMode:
    """Default pkce — GOOGLE_CLIENT_SECRET is ignored unless flow is confidential."""
    load_project_env()
    raw = os.getenv("GOOGLE_OAUTH_FLOW", "").strip().lower()
    if raw in ("confidential", "secret", "legacy"):
        return "confidential"
    return "pkce"


def google_oauth_redirect_configured() -> bool:
    load_project_env()
    if os.getenv("GOOGLE_REDIRECT_URI", "").strip():
        return True
    return bool(os.getenv("PUBLIC_API_BASE_URL", "").strip())


def google_oauth_connectable() -> bool:
    """Public desktop PKCE: client_id + resolvable redirect (no secret)."""
    return google_oauth_configured() and google_oauth_redirect_configured()


def google_oauth_ready() -> bool:
    """Google sign-in can complete on this server."""
    if google_oauth_flow_mode() == "confidential":
        load_project_env()
        return (
            google_oauth_connectable()
            and bool(os.getenv("GOOGLE_CLIENT_SECRET", "").strip())
        )
    return google_oauth_connectable()


def polar_oauth_configured() -> bool:
    return _env_nonempty("POLAR_CLIENT_ID")


def polar_oauth_ready() -> bool:
    load_project_env()
    return bool(os.getenv("POLAR_CLIENT_ID", "").strip()) and bool(
        os.getenv("POLAR_CLIENT_SECRET", "").strip()
    )


def off_contribute_ready() -> bool:
    load_project_env()
    return bool(os.getenv("OFF_USER_ID", "").strip()) and bool(
        os.getenv("OFF_PASSWORD", "").strip()
    )
