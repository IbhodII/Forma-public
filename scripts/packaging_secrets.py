# -*- coding: utf-8 -*-
"""Shared rules for desktop packaging: forbidden secret keys and env sanitization."""
from __future__ import annotations

import re
from pathlib import Path

# Keys that must never appear with a non-empty value in packaged resources.
FORBIDDEN_SECRET_KEYS: frozenset[str] = frozenset(
    {
        "YANDEX_CLIENT_SECRET",
        "GOOGLE_CLIENT_SECRET",
        "POLAR_CLIENT_SECRET",
        "OFF_PASSWORD",
        "OFF_USER_ID",
    }
)

# Additional patterns for tokens and backup artifacts in packaged trees.
FORBIDDEN_VALUE_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"(?i)(access|refresh)[-_]?token\s*=", re.MULTILINE),
    re.compile(r"(?i)authorization:\s*bearer\s+", re.MULTILINE),
)

FORBIDDEN_PACKAGED_FILENAMES: frozenset[str] = frozenset(
    {
        ".env",
        ".env.local",
        ".env.production",
    }
)

# Root dev databases above this size must not be bundled (user data leak risk).
MAX_PACKAGED_DB_BYTES = 100 * 1024 * 1024

# OAuth client ids required in .env.desktop.public for desktop release builds.
REQUIRED_PUBLIC_OAUTH_CLIENT_IDS: tuple[str, ...] = (
    "YANDEX_CLIENT_ID",
    "GOOGLE_CLIENT_ID",
)


def missing_required_public_oauth_ids(assignments: dict[str, str]) -> list[str]:
    return [
        key
        for key in REQUIRED_PUBLIC_OAUTH_CLIENT_IDS
        if not str(assignments.get(key, "")).strip()
    ]


PUBLIC_ENV_KEYS: frozenset[str] = frozenset(
    {
        "POLAR_CLIENT_ID",
        "POLAR_API_REDIRECT_URI",
        "POLAR_REDIRECT_URI",
        "POLAR_SCOPE",
        "YANDEX_CLIENT_ID",
        "YANDEX_REDIRECT_URI",
        "YANDEX_EXTRA_SCOPES",
        "YANDEX_OAUTH_MODE",
        "YANDEX_SCOPES",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_REDIRECT_URI",
        "PUBLIC_API_BASE_URL",
        "FRONTEND_URL",
    }
)


def parse_env_assignments(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key:
            out[key] = value
    return out


def forbidden_keys_with_values(assignments: dict[str, str]) -> list[str]:
    found: list[str] = []
    for key in FORBIDDEN_SECRET_KEYS:
        if assignments.get(key, "").strip():
            found.append(key)
    return sorted(found)


def sanitize_env_lines(lines: list[str]) -> tuple[list[str], list[str]]:
    """Drop forbidden secret keys from env file lines. Returns (sanitized, removed_keys)."""
    removed: list[str] = []
    out: list[str] = []
    for line in lines:
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            out.append(line)
            continue
        body = stripped
        if body.lower().startswith("export "):
            body = body[7:].strip()
        if "=" not in body:
            out.append(line)
            continue
        key = body.partition("=")[0].strip()
        if key in FORBIDDEN_SECRET_KEYS:
            if key not in removed:
                removed.append(key)
            continue
        out.append(line)
    return out, removed


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8", errors="replace")
