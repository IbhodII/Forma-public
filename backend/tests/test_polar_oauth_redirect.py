# -*- coding: utf-8 -*-
"""Polar OAuth redirect URI resolution."""
from __future__ import annotations

import pytest

from backend.services import polar_oauth_service as polar_oauth


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for key in (
        "POLAR_API_REDIRECT_URI",
        "POLAR_REDIRECT_URI",
        "PUBLIC_API_BASE_URL",
        "POLAR_CLIENT_ID",
        "POLAR_CLIENT_SECRET",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(polar_oauth, "_load_env", lambda: None)


def test_legacy_8080_redirect_ignored(monkeypatch):
    monkeypatch.setenv("POLAR_REDIRECT_URI", "http://localhost:8080/callback")
    resolution = polar_oauth.resolve_polar_redirect_uri(
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8000/api/polar/callback"
    assert resolution.source == "request"
    assert resolution.legacy_redirect_ignored is True
    assert any("игнорирован" in w for w in resolution.warnings)


def test_api_env_redirect_used_when_port_matches(monkeypatch):
    monkeypatch.setenv(
        "POLAR_API_REDIRECT_URI",
        "http://127.0.0.1:8000/api/polar/callback",
    )
    resolution = polar_oauth.resolve_polar_redirect_uri(
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8000/api/polar/callback"
    assert resolution.source == "env"
    assert resolution.legacy_redirect_ignored is False


def test_port_mismatch_uses_runtime_override(monkeypatch):
    monkeypatch.setenv(
        "POLAR_API_REDIRECT_URI",
        "http://127.0.0.1:8002/api/polar/callback",
    )
    resolution = polar_oauth.resolve_polar_redirect_uri(
        redirect_base_query="http://127.0.0.1:8000",
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8000/api/polar/callback"
    assert resolution.source == "request"
    assert any("порт" in w for w in resolution.warnings)


def test_oauth_state_stores_redirect_uri(monkeypatch):
    monkeypatch.setenv(
        "POLAR_API_REDIRECT_URI",
        "http://127.0.0.1:8000/api/polar/callback",
    )
    state = polar_oauth._store_oauth_state(1, "http://127.0.0.1:8000/api/polar/callback")
    user_id, redirect_uri = polar_oauth._take_oauth_state(state)
    assert user_id == 1
    assert redirect_uri == "http://127.0.0.1:8000/api/polar/callback"
