# -*- coding: utf-8 -*-
"""Google desktop OAuth PKCE (no client_secret by default)."""
from __future__ import annotations

import asyncio
from unittest.mock import MagicMock, patch

import pytest

from backend.services import google_drive_service as gds


@pytest.fixture(autouse=True)
def _clear_pending():
    with gds._pending_pkce_lock:
        gds._pending_google_oauth.clear()
    yield
    with gds._pending_pkce_lock:
        gds._pending_google_oauth.clear()


@pytest.fixture(autouse=True)
def _pkce_env(monkeypatch):
    monkeypatch.setenv("GOOGLE_CLIENT_ID", "google-test-client")
    monkeypatch.setenv(
        "GOOGLE_REDIRECT_URI",
        "http://127.0.0.1:8002/api/cloud/callback/google",
    )
    monkeypatch.delenv("GOOGLE_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("GOOGLE_OAUTH_FLOW", raising=False)


def test_exchange_uses_pkce_verifier_from_pending_state(monkeypatch):
    state = "test-oauth-state"
    verifier = "test-code-verifier-value"
    redirect = "http://127.0.0.1:8002/api/cloud/callback/google"

    gds._remember_oauth_state(
        state,
        verifier,
        link_user_id=7,
        redirect_uri=redirect,
        flow="pkce",
    )

    captured: dict[str, object] = {}

    def fake_exchange(code, *, client_id, redirect_uri, code_verifier):
        captured["code"] = code
        captured["client_id"] = client_id
        captured["redirect_uri"] = redirect_uri
        captured["code_verifier"] = code_verifier
        return {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_in": 3600,
        }

    monkeypatch.setattr(gds, "_exchange_google_code_pkce", fake_exchange)

    out = asyncio.run(
        gds.GoogleDriveService().exchange_code_for_token(
            "auth-code",
            state=state,
            persist=False,
        )
    )

    assert captured["code_verifier"] == verifier
    assert captured["redirect_uri"] == redirect
    assert captured["code"] == "auth-code"
    assert out["link_user_id"] == 7
    assert out["flow"] == "pkce"


def test_take_oauth_state_is_single_use():
    gds._remember_oauth_state(
        "s1",
        "v1",
        redirect_uri="http://127.0.0.1:8000/cb",
        flow="pkce",
    )
    first = gds._take_oauth_state("s1")
    second = gds._take_oauth_state("s1")
    assert first is not None
    assert first["verifier"] == "v1"
    assert second is None


def test_pkce_authorize_stores_verifier(monkeypatch):
    captured: dict[str, object] = {}

    class FakeFlow:
        code_verifier = "generated-verifier"

        def authorization_url(self, **kwargs):
            captured.update(kwargs)
            return "https://accounts.google.com/o/oauth2/auth?test=1", "state-abc"

    monkeypatch.setattr(gds, "_build_pkce_flow", lambda ru: FakeFlow())

    url = asyncio.run(
        gds.GoogleDriveService().get_authorization_url(
            redirect_uri="http://127.0.0.1:8002/api/cloud/callback/google",
            client_mode="desktop_app",
        )
    )
    assert "accounts.google.com" in url
    pending = gds._peek_google_oauth_pending("state-abc")
    assert pending is not None
    assert pending.get("flow") == "pkce"
    assert pending.get("verifier") == "generated-verifier"


def test_missing_secret_does_not_block_pkce_auth_start(monkeypatch):
    class FakeFlow:
        code_verifier = "verifier"

        def authorization_url(self, **kwargs):
            return "https://accounts.google.com/o/oauth2/auth?ok=1", "st"

    monkeypatch.setattr(gds, "_build_pkce_flow", lambda ru: FakeFlow())
    url = asyncio.run(
        gds.GoogleDriveService().get_authorization_url(
            redirect_uri="http://127.0.0.1:8002/api/cloud/callback/google",
        )
    )
    assert url.startswith("https://accounts.google.com/")


def test_confidential_mode_requires_secret(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_FLOW", "confidential")
    with pytest.raises(RuntimeError, match="GOOGLE_CLIENT_SECRET"):
        gds._google_confidential_env()


def test_confidential_mode_uses_secret_when_configured(monkeypatch):
    monkeypatch.setenv("GOOGLE_OAUTH_FLOW", "confidential")
    monkeypatch.setenv("GOOGLE_CLIENT_SECRET", "legacy-secret")
    cid, secret, redirect = gds._google_confidential_env()
    assert cid == "google-test-client"
    assert secret == "legacy-secret"
    assert "callback/google" in redirect


def test_failed_exchange_does_not_save_tokens(monkeypatch):
    state = "oauth-state-fail"
    gds._remember_oauth_state(
        state,
        "verifier-value",
        redirect_uri="http://127.0.0.1:8002/api/cloud/callback/google",
        flow="pkce",
    )

    def boom(*args, **kwargs):
        raise RuntimeError("invalid_grant")

    monkeypatch.setattr(gds, "_exchange_google_code_pkce", boom)
    save_mock = MagicMock()
    monkeypatch.setattr(gds, "_save_tokens_sync", save_mock)

    with pytest.raises(RuntimeError, match="invalid_grant"):
        asyncio.run(
            gds.GoogleDriveService().exchange_code_for_token(
                "bad-code",
                state=state,
                persist=False,
            )
        )
    save_mock.assert_not_called()


def test_pkce_refresh_without_secret(monkeypatch):
    from datetime import datetime, timedelta, timezone

    from google.oauth2.credentials import Credentials

    monkeypatch.setattr(
        gds,
        "_refresh_google_token_pkce",
        lambda client_id, refresh_token: {
            "access_token": "refreshed",
            "expires_in": 3600,
        },
    )
    save_mock = MagicMock()
    monkeypatch.setattr(gds, "_save_tokens_sync", save_mock)

    expired = Credentials(
        token="old",
        refresh_token="refresh-token",
        token_uri=gds._GOOGLE_TOKEN_URI,
        client_id="google-test-client",
        client_secret=None,
        scopes=gds.SCOPES,
    )
    expired.expiry = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(hours=1)

    monkeypatch.setattr(
        gds,
        "_load_tokens_sync",
        lambda **_: ("old", "refresh-token", "2000-01-01T00:00:00"),
    )
    monkeypatch.setattr(gds, "_credentials_from_row", lambda *args, **kwargs: expired)

    creds = gds._get_credentials_sync(user_id=1)
    assert creds is not None
    assert creds.token == "refreshed"
    save_mock.assert_called_once()
