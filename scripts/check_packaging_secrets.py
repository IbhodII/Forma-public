# -*- coding: utf-8 -*-
"""
Pre-packaging guard: fail if forbidden secrets would ship in the desktop installer.

Usage (from MyHealthDashboard/frontend):
  python ../scripts/check_packaging_secrets.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT / "scripts"))

from audit_packaging_seed import audit_packaging_seed_dir
from packaging_secrets import (
    FORBIDDEN_VALUE_PATTERNS,
    MAX_PACKAGED_DB_BYTES,
    forbidden_keys_with_values,
    missing_required_public_oauth_ids,
    parse_env_assignments,
    read_text,
)

FRONTEND = ROOT / "frontend"
PACKAGE_JSON = FRONTEND / "package.json"
PUBLIC_ENV = ROOT / ".env.desktop.public"
SEED_DIR = ROOT / "packaging" / "seed"
DEV_ENV = ROOT / ".env"


def _fail(messages: list[str]) -> int:
    print("Packaging secret check FAILED:", file=sys.stderr)
    for msg in messages:
        print(f"  - {msg}", file=sys.stderr)
    return 1


def _warn(messages: list[str]) -> None:
    for msg in messages:
        print(f"WARNING: {msg}", file=sys.stderr)


def check_package_json_extra_resources() -> list[str]:
    errors: list[str] = []
    if not PACKAGE_JSON.is_file():
        return [f"Missing {PACKAGE_JSON}"]
    data = json.loads(PACKAGE_JSON.read_text(encoding="utf-8"))
    extras = (data.get("build") or {}).get("extraResources") or []
    for item in extras:
        if not isinstance(item, dict):
            continue
        src = str(item.get("from", "")).replace("\\", "/")
        if src.endswith("/.env") or src == "../.env" or src == ".env":
            errors.append(
                f"package.json extraResources must not copy developer .env (found from={item.get('from')!r}). "
                "Use ../.env.desktop.public instead."
            )
    return errors


def check_public_env_file() -> list[str]:
    errors: list[str] = []
    if not PUBLIC_ENV.is_file():
        return [f"Missing public desktop env template: {PUBLIC_ENV}"]
    text = read_text(PUBLIC_ENV)
    assignments = parse_env_assignments(text)
    forbidden = forbidden_keys_with_values(assignments)
    if forbidden:
        errors.append(
            f"{PUBLIC_ENV.name} contains forbidden secret keys with values: {', '.join(forbidden)}"
        )
    missing_oauth = missing_required_public_oauth_ids(assignments)
    if missing_oauth:
        errors.append(
            f"{PUBLIC_ENV.name} missing required public OAuth client ids: {', '.join(missing_oauth)}"
        )
    for pattern in FORBIDDEN_VALUE_PATTERNS:
        if pattern.search(text):
            errors.append(f"{PUBLIC_ENV.name} matches forbidden token pattern: {pattern.pattern}")
    return errors


def check_dev_env_not_referenced() -> list[str]:
    warnings: list[str] = []
    if DEV_ENV.is_file():
        forbidden = forbidden_keys_with_values(parse_env_assignments(read_text(DEV_ENV)))
        if forbidden:
            warnings.append(
                f"Developer {DEV_ENV.name} contains secrets ({', '.join(forbidden)}) — "
                "ensure desktop build uses .env.desktop.public only."
            )
    return warnings


def check_backend_spec_uses_seed() -> list[str]:
    errors: list[str] = []
    spec_path = ROOT / "backend.spec"
    if not spec_path.is_file():
        return [f"Missing {spec_path}"]
    text = spec_path.read_text(encoding="utf-8")
    if 'ROOT / "workouts.db"' in text or "workouts.db\").resolve()" in text.replace("'", '"'):
        if "packaging" not in text or "seed" not in text:
            errors.append(
                "backend.spec must bundle packaging/seed/*.db, not repository workouts.db"
            )
    if "packaging" not in text or "seed" not in text:
        errors.append("backend.spec must reference packaging/seed for database files")
    if "httpx" not in text:
        errors.append(
            "backend.spec must bundle httpx (yadisk AsyncClient OAuth requires httpx sessions)"
        )
    return errors


def check_yandex_pkce_runtime_deps() -> list[str]:
    """yadisk.AsyncClient OAuth uses httpx when no custom session is provided."""
    errors: list[str] = []
    try:
        import httpx  # noqa: F401
    except ImportError:
        errors.append(
            "httpx is not installed in the build venv. "
            "Run: pip install -r backend/requirements.txt"
        )
        return errors
    try:
        from yadisk.sessions.async_httpx_session import AsyncHTTPXSession  # noqa: F401
    except ModuleNotFoundError as exc:
        errors.append(f"yadisk httpx session unavailable: {exc}")
    return errors


def check_backend_exe_bundles_httpx() -> list[str]:
    """After PyInstaller build, confirm httpx/httpcore landed in the frozen archive."""
    errors: list[str] = []
    exe = FRONTEND / "backend_bin" / "backend.exe"
    if not exe.is_file():
        return errors

    toc_candidates = (
        FRONTEND / "build" / "backend_py" / "backend" / "Analysis-00.toc",
        FRONTEND / "build" / "backend_py" / "backend" / "PYZ-00.toc",
        FRONTEND / "build" / "backend_py" / "backend" / "PKG-00.toc",
    )
    toc_text = ""
    for toc_path in toc_candidates:
        if toc_path.is_file():
            toc_text += toc_path.read_text(encoding="utf-8", errors="replace")
    if not toc_text:
        errors.append(
            "backend.exe exists but PyInstaller toc files are missing — "
            "cannot verify httpx bundle; rerun desktop:build:backend"
        )
        return errors
    if "httpx" not in toc_text:
        errors.append("PyInstaller bundle missing httpx modules (check backend.spec hiddenimports)")
    if "httpcore" not in toc_text:
        errors.append("PyInstaller bundle missing httpcore modules (check backend.spec hiddenimports)")
    return errors


def check_seed_databases() -> list[str]:
    errors: list[str] = []
    for name in ("workouts.db", "shared.db"):
        path = SEED_DIR / name
        if not path.is_file():
            errors.append(
                f"Missing packaging seed DB {path}. Run: python scripts/prepare_packaging_seed.py"
            )
            continue
        size = path.stat().st_size
        if size > MAX_PACKAGED_DB_BYTES:
            errors.append(
                f"{path} is {size} bytes (max {MAX_PACKAGED_DB_BYTES}). "
                "Do not bundle developer workouts.db — regenerate packaging/seed."
            )
    if SEED_DIR.is_dir() and (SEED_DIR / "workouts.db").is_file():
        errors.extend(audit_packaging_seed_dir(SEED_DIR))
    return errors


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    errors.extend(check_package_json_extra_resources())
    errors.extend(check_public_env_file())
    errors.extend(check_backend_spec_uses_seed())
    errors.extend(check_yandex_pkce_runtime_deps())
    errors.extend(check_backend_exe_bundles_httpx())
    errors.extend(check_seed_databases())
    warnings.extend(check_dev_env_not_referenced())

    if warnings:
        _warn(warnings)
    if errors:
        return _fail(errors)

    print("Packaging secret check OK.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
