# -*- coding: utf-8 -*-
"""OAuth redirect URI resolution and debug snapshot."""
from __future__ import annotations

import pytest

from backend.services import oauth_redirect


@pytest.fixture(autouse=True)
def _clear_env(monkeypatch):
    for key in (
        "YANDEX_REDIRECT_URI",
        "GOOGLE_REDIRECT_URI",
        "PUBLIC_API_BASE_URL",
        "YANDEX_CLIENT_ID",
        "YANDEX_CLIENT_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
    ):
        monkeypatch.delenv(key, raising=False)
    monkeypatch.setattr(oauth_redirect, "_load_env", lambda: None)


def test_registered_packaged_port_uses_runtime_redirect(monkeypatch):
    monkeypatch.setenv(
        "YANDEX_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/yandex",
    )
    resolution = oauth_redirect.resolve_redirect_uri(
        "yandex",
        request_base="http://127.0.0.1:8003",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8003/api/cloud/callback/yandex"
    assert resolution.source == "request"
    assert any("порт" in w for w in resolution.warnings)


def test_port_mismatch_uses_request_redirect(monkeypatch):
    monkeypatch.setenv(
        "YANDEX_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/yandex",
    )
    resolution = oauth_redirect.resolve_redirect_uri(
        "yandex",
        redirect_base_query="http://127.0.0.1:8000",
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8000/api/cloud/callback/yandex"
    assert resolution.source == "request"
    assert any("порт" in w for w in resolution.warnings)


def test_env_wins_when_ports_match(monkeypatch):
    monkeypatch.setenv(
        "YANDEX_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/yandex",
    )
    resolution = oauth_redirect.resolve_redirect_uri(
        "yandex",
        request_base="http://127.0.0.1:8002",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8002/api/cloud/callback/yandex"
    assert resolution.source == "env"


def test_public_api_base_when_no_env_redirect(monkeypatch):
    monkeypatch.setenv("PUBLIC_API_BASE_URL", "http://127.0.0.1:8002")
    resolution = oauth_redirect.resolve_redirect_uri(
        "google",
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8002/api/cloud/callback/google"
    assert resolution.source == "public_base"


def test_request_base_fallback(monkeypatch):
    resolution = oauth_redirect.resolve_redirect_uri(
        "yandex",
        request_base="http://127.0.0.1:8000/",
    )
    assert resolution.redirect_uri == "http://127.0.0.1:8000/api/cloud/callback/yandex"
    assert resolution.source == "request"


def test_redirect_base_query_over_request_base(monkeypatch):
    resolution = oauth_redirect.resolve_redirect_uri(
        "google",
        redirect_base_query="http://192.168.1.10:8002",
        request_base="http://127.0.0.1:8000",
    )
    assert resolution.redirect_uri == "http://192.168.1.10:8002/api/cloud/callback/google"
    assert resolution.source == "request"


def test_mask_client_id():
    assert oauth_redirect.mask_client_id("abcdefghij") == "abcd…ghij"
    assert oauth_redirect.mask_client_id("short") == "…"


def test_debug_snapshot_masks_secrets(monkeypatch):
    monkeypatch.setenv("YANDEX_CLIENT_ID", "yandex-client-id-123456")
    monkeypatch.setenv("YANDEX_CLIENT_SECRET", "secret-value")
    monkeypatch.setenv(
        "YANDEX_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/yandex",
    )
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client-id-abcdef")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "google-secret")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/google",
    )

    snapshot = oauth_redirect.build_oauth_debug_snapshot(
        request_base="http://127.0.0.1:8002",
    )
    assert snapshot["yandex"]["redirect_uri"] == (
        "http://127.0.0.1:8002/api/cloud/callback/yandex"
    )
    assert snapshot["google"]["redirect_uri"] == (
        "http://127.0.0.1:8002/api/cloud/callback/google"
    )
    assert snapshot["polar"]["callback_path"] == "/api/polar/callback"
    assert "secret" not in (snapshot["yandex"]["auth_url_preview"] or "").lower()
    assert "…" in snapshot["yandex"]["client_id_preview"]
    assert snapshot["yandex"]["client_secret_present"] is True
    assert ":8000" in snapshot["alternate_redirect_uris"][0]


def test_google_build_flow_uses_effective_redirect(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "cid")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "sec")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8000/api/cloud/callback/google",
    )
    from backend.services.google_drive_service import _build_flow

    flow = _build_flow("http://127.0.0.1:8002/api/cloud/callback/google")
    assert flow.redirect_uri == "http://127.0.0.1:8002/api/cloud/callback/google"


def test_google_pkce_connectable_without_secret(monkeypatch):
    monkeypatch.setattr(oauth_redirect, "_load_env", lambda: None)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-cid")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/google",
    )
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_FLOW", raising=False)
    monkeypatch.setattr("backend.core.env.load_project_env", lambda: None)
    status = oauth_redirect._provider_env_status("google")
    assert status["client_id_present"] is True
    assert status["client_secret_present"] is False
    assert status["configured"] is True
    assert status["setup_required"] is False
    assert status["oauth_flow_mode"] == "pkce"
    assert status["secret_required"] is False
    assert status["pkce_available"] is True


def test_google_debug_snapshot_pkce_warning(monkeypatch):
    monkeypatch.setattr(oauth_redirect, "_load_env", lambda: None)
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-client-id-abcdef")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/google",
    )
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_FLOW", raising=False)
    monkeypatch.setattr("backend.core.env.load_project_env", lambda: None)

    snapshot = oauth_redirect.build_oauth_debug_snapshot(
        request_base="http://127.0.0.1:8002",
    )
    assert snapshot["google"]["oauth_flow_mode"] == "pkce"
    assert snapshot["google"]["pkce_available"] is True
    assert snapshot["google"]["secret_required"] is False
    assert any("PKCE" in w for w in snapshot["warnings"])
    assert not any("GOOGLE_CLIENT_SECRET не задан" in w for w in snapshot["warnings"])
