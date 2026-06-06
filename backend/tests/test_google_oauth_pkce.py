# -*- coding: utf-8 -*-
"""Google OAuth PKCE state handling."""
from __future__ import annotations

import asyncio

import pytest

from backend.services import google_drive_service as gds


@pytest.fixture(autouse=True)
def _clear_pending():
    with gds._pending_pkce_lock:
        gds._pending_google_oauth.clear()
    yield
    with gds._pending_pkce_lock:
        gds._pending_google_oauth.clear()


def test_exchange_uses_pkce_verifier_from_pending_state(monkeypatch):
    state = "test-oauth-state"
    verifier = "test-code-verifier-value"
    redirect = "http://127.0.0.1:8000/api/cloud/callback/google"

    gds._remember_oauth_state(state, verifier, link_user_id=7, redirect_uri=redirect)

    captured: dict[str, object] = {}

    class FakeCreds:
        token = "access"
        refresh_token = "refresh"
        expiry = None

    class FakeFlow:
        code_verifier = None

        def fetch_token(self, code: str) -> None:
            captured["code"] = code
            captured["verifier"] = self.code_verifier

        @property
        def credentials(self):
            return FakeCreds()

    def fake_build_flow(redirect_uri: str | None = None):
        captured["redirect_uri"] = redirect_uri
        return FakeFlow()

    monkeypatch.setattr(gds, "_build_flow", fake_build_flow)

    out = asyncio.run(
        gds.GoogleDriveService().exchange_code_for_token(
            "auth-code",
            state=state,
            persist=False,
        )
    )

    assert captured["verifier"] == verifier
    assert captured["redirect_uri"] == redirect
    assert captured["code"] == "auth-code"
    assert out["link_user_id"] == 7


def test_take_oauth_state_is_single_use():
    gds._remember_oauth_state("s1", "v1", redirect_uri="http://127.0.0.1:8000/cb")
    first = gds._take_oauth_state("s1")
    second = gds._take_oauth_state("s1")
    assert first is not None
    assert first["verifier"] == "v1"
    assert second is None
