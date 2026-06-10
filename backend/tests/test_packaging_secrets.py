# -*- coding: utf-8 -*-
"""Packaging secret guardrails."""
from __future__ import annotations

import json
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent.parent


def test_public_desktop_env_has_no_secrets():
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    from packaging_secrets import (
        forbidden_keys_with_values,
        missing_required_public_oauth_ids,
        parse_env_assignments,
    )

    path = ROOT / ".env.desktop.public"
    assert path.is_file()
    assignments = parse_env_assignments(path.read_text(encoding="utf-8"))
    assert forbidden_keys_with_values(assignments) == []
    assert missing_required_public_oauth_ids(assignments) == []


def test_backend_spec_bundles_httpx_for_yadisk_oauth():
    spec = (ROOT / "backend.spec").read_text(encoding="utf-8")
    assert "httpx" in spec
    assert "collect_submodules" in spec


def test_yandex_pkce_runtime_deps_available():
    import httpx  # noqa: F401
    from yadisk.sessions.async_httpx_session import AsyncHTTPXSession  # noqa: F401

    assert AsyncHTTPXSession is not None


def test_missing_required_oauth_ids_detected():
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    from packaging_secrets import missing_required_public_oauth_ids, parse_env_assignments

    assignments = parse_env_assignments("YANDEX_CLIENT_ID=\nGOOGLE_CLIENT_ID=gid\n")
    assert missing_required_public_oauth_ids(assignments) == ["YANDEX_CLIENT_ID"]


def test_package_json_uses_public_env_template():
    pkg = json.loads((ROOT / "frontend" / "package.json").read_text(encoding="utf-8"))
    extras = (pkg.get("build") or {}).get("extraResources") or []
    env_sources = [str(item.get("from", "")) for item in extras if isinstance(item, dict)]
    assert "../.env.desktop.public" in env_sources
    assert "../.env" not in env_sources


def test_forbidden_key_detection():
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    from packaging_secrets import forbidden_keys_with_values, parse_env_assignments

    assignments = parse_env_assignments("YANDEX_CLIENT_SECRET=abc\nGOOGLE_CLIENT_ID=id\n")
    assert forbidden_keys_with_values(assignments) == ["YANDEX_CLIENT_SECRET"]


def test_sanitize_env_lines():
    import sys

    sys.path.insert(0, str(ROOT / "scripts"))
    from packaging_secrets import sanitize_env_lines

    lines = [
        "# comment",
        "YANDEX_CLIENT_ID=public",
        "YANDEX_CLIENT_SECRET=secret",
        "PUBLIC_API_BASE_URL=http://127.0.0.1:8002",
    ]
    sanitized, removed = sanitize_env_lines(lines)
    assert removed == ["YANDEX_CLIENT_SECRET"]
    assert any("YANDEX_CLIENT_ID=public" in line for line in sanitized)
    assert not any("CLIENT_SECRET" in line for line in sanitized)


def test_oauth_pkce_connectable_without_secret(monkeypatch):
    from backend.services import oauth_redirect

    monkeypatch.setattr(oauth_redirect, "_load_env", lambda: None)
    monkeypatch.setattr("backend.core.env.load_project_env", lambda: None)

    monkeypatch.setenv("YANDEX_CLIENT_ID", "cid")
    monkeypatch.setenv("YANDEX_REDIRECT_URI", "http://127.0.0.1:8002/api/cloud/callback/yandex")
    monkeypatch.delenv("YANDEX_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("YANDEX_OAUTH_FLOW", raising=False)
    status = oauth_redirect._provider_env_status("yandex")
    assert status["client_id_present"] is True
    assert status["client_secret_present"] is False
    assert status["configured"] is True
    assert status["setup_required"] is False
    assert status["oauth_flow_mode"] == "pkce"
    assert status["secret_required"] is False
    assert status["pkce_available"] is True

    monkeypatch.setenv("GOOGLE_CLIENT_ID", "gid")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/google",
    )
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_FLOW", raising=False)
    gstatus = oauth_redirect._provider_env_status("google")
    assert gstatus["client_id_present"] is True
    assert gstatus["client_secret_present"] is False
    assert gstatus["configured"] is True
    assert gstatus["setup_required"] is False
    assert gstatus["oauth_flow_mode"] == "pkce"
    assert gstatus["secret_required"] is False
    assert gstatus["pkce_available"] is True
