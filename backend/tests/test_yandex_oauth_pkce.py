# -*- coding: utf-8 -*-
"""Yandex desktop OAuth PKCE (no client_secret by default)."""
from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from backend.core.pkce import code_challenge_s256, generate_pkce_pair
from backend.services import cloud_storage_service as yds


@pytest.fixture(autouse=True)
def _clear_pending():
    with yds._pending_yandex_lock:
        yds._pending_yandex_oauth.clear()
    yield
    with yds._pending_yandex_lock:
        yds._pending_yandex_oauth.clear()


@pytest.fixture(autouse=True)
def _pkce_env(monkeypatch):
    monkeypatch.setenv("YANDEX_CLIENT_ID", "yandex-test-client")
    monkeypatch.setenv("YANDEX_REDIRECT_URI", "http://127.0.0.1:8002/api/cloud/callback/yandex")
    monkeypatch.delenv("YANDEX_CLIENT_SECRET", raising=False)
    monkeypatch.delenv("YANDEX_OAUTH_FLOW", raising=False)


def test_generate_pkce_pair_s256():
    verifier, challenge = generate_pkce_pair()
    assert 43 <= len(verifier) <= 128
    assert challenge == code_challenge_s256(verifier)
    assert "=" not in challenge


def test_pkce_authorize_stores_verifier(monkeypatch):
    captured: dict[str, object] = {}

    class FakeClient:
        id = "cid"
        secret = ""

        def get_code_url(self, **kwargs):
            captured.update(kwargs)
            return "https://oauth.yandex.ru/authorize?test=1"

        async def close(self):
            return None

    monkeypatch.setattr(yds, "_oauth_client_for_flow", lambda _flow: FakeClient())

    url = asyncio.run(
        yds.YandexDiskService().get_authorization_url(
            redirect_uri="http://127.0.0.1:8002/api/cloud/callback/yandex",
            client_mode="desktop_app",
        )
    )
    assert "authorize" in url
    assert captured.get("code_challenge_method") == "S256"
    assert captured.get("code_challenge")
    state = str(captured.get("state"))
    pending = yds._peek_yandex_oauth_pending(state)
    assert pending is not None
    assert pending.get("flow") == "pkce"
    assert pending.get("code_verifier")


def test_authorize_logs_runtime_config_without_secrets(monkeypatch, caplog):
    class FakeClient:
        def get_code_url(self, **kwargs):
            return (
                "https://oauth.yandex.ru/authorize?"
                "client_id=yandex-test-client&scope=login%3Aemail+login%3Ainfo"
            )

        async def close(self):
            return None

    monkeypatch.setenv("YANDEX_OAUTH_MODE", "login")
    monkeypatch.setenv("YANDEX_CLIENT_SECRET", "do-not-log-secret")
    monkeypatch.setattr(yds, "_oauth_client_for_flow", lambda _flow: FakeClient())
    caplog.set_level(logging.INFO, logger=yds.logger.name)

    asyncio.run(
        yds.YandexDiskService().get_authorization_url(
            redirect_uri="http://127.0.0.1:8002/api/cloud/callback/yandex",
            client_mode="desktop_app",
        )
    )

    logs = caplog.text
    assert "YANDEX_CLIENT_ID=yandex-test-client" in logs
    assert "YANDEX_OAUTH_MODE=login" in logs
    assert "final_requested_scopes=login:email login:info" in logs
    assert "authorize_url=https://oauth.yandex.ru/authorize?" in logs
    assert "do-not-log-secret" not in logs


def test_exchange_uses_verifier_without_secret(monkeypatch):
    verifier, challenge = generate_pkce_pair()
    state = "oauth-state-1"
    yds._remember_yandex_oauth_state(
        state,
        link_user_id=3,
        redirect_uri="http://127.0.0.1:8002/api/cloud/callback/yandex",
        client_mode="desktop_app",
        flow="pkce",
        code_verifier=verifier,
    )

    class FakeToken:
        access_token = "new-access"
        refresh_token = "new-refresh"
        expires_in = 3600
        token_type = "bearer"

    class FakeClient:
        secret = ""

        async def get_token(self, code, redirect_uri=None, **kwargs):
            assert code == "auth-code"
            assert kwargs.get("code_verifier") == verifier
            assert self.secret == ""
            return FakeToken()

        async def close(self):
            return None

    monkeypatch.setattr(yds, "_oauth_client_for_flow", lambda _flow: FakeClient())
    save_mock = MagicMock()
    monkeypatch.setattr(yds, "_save_tokens_sync", save_mock)

    out = asyncio.run(
        yds.YandexDiskService().exchange_code_for_token(
            "auth-code",
            state=state,
            persist=True,
        )
    )
    assert out["access_token"] == "new-access"
    assert out["link_user_id"] == 3
    save_mock.assert_called_once()


def test_failed_exchange_does_not_save_tokens(monkeypatch):
    verifier, _ = generate_pkce_pair()
    state = "oauth-state-fail"
    yds._remember_yandex_oauth_state(
        state,
        link_user_id=None,
        redirect_uri="http://127.0.0.1:8002/api/cloud/callback/yandex",
        client_mode="desktop_app",
        flow="pkce",
        code_verifier=verifier,
    )

    class FakeClient:
        secret = ""

        async def get_token(self, code, redirect_uri=None, **kwargs):
            raise RuntimeError("invalid_grant")

        async def close(self):
            return None

    monkeypatch.setattr(yds, "_oauth_client_for_flow", lambda _flow: FakeClient())
    save_mock = MagicMock()
    monkeypatch.setattr(yds, "_save_tokens_sync", save_mock)

    with pytest.raises(RuntimeError, match="invalid_grant"):
        asyncio.run(
            yds.YandexDiskService().exchange_code_for_token(
                "bad-code",
                state=state,
                persist=False,
            )
        )
    save_mock.assert_not_called()


def test_oauth_client_for_flow_uses_httpx_session(monkeypatch):
    """Real yadisk AsyncClient must load httpx session (packaged + dev dependency)."""
    import httpx  # noqa: F401
    from yadisk.sessions.async_httpx_session import AsyncHTTPXSession

    client = yds._oauth_client_for_flow("pkce")
    try:
        assert isinstance(client.session, AsyncHTTPXSession)
    finally:
        asyncio.run(client.close())


def test_missing_secret_does_not_block_pkce_auth_start(monkeypatch):
    class FakeClient:
        def get_code_url(self, **kwargs):
            return "https://oauth.yandex.ru/authorize?ok=1"

        async def close(self):
            return None

    monkeypatch.setattr(yds, "_oauth_client_for_flow", lambda _flow: FakeClient())
    url = asyncio.run(
        yds.YandexDiskService().get_authorization_url(
            redirect_uri="http://127.0.0.1:8002/api/cloud/callback/yandex",
        )
    )
    assert url.startswith("https://oauth.yandex.ru/")


def test_confidential_mode_requires_secret(monkeypatch):
    monkeypatch.setenv("YANDEX_OAUTH_FLOW", "confidential")
    with pytest.raises(RuntimeError, match="YANDEX_CLIENT_SECRET"):
        yds._yandex_confidential_env()


def test_confidential_mode_uses_secret_when_configured(monkeypatch):
    monkeypatch.setenv("YANDEX_OAUTH_FLOW", "confidential")
    monkeypatch.setenv("YANDEX_CLIENT_SECRET", "legacy-secret")
    cid, secret, redirect = yds._yandex_confidential_env()
    assert cid == "yandex-test-client"
    assert secret == "legacy-secret"
    assert "callback/yandex" in redirect


def test_pkce_refresh_without_secret(monkeypatch):
    monkeypatch.setattr(
        yds.requests,
        "post",
        lambda *args, **kwargs: MagicMock(
            status_code=200,
            text='{"access_token":"refreshed","expires_in":3600}',
            json=lambda: {"access_token": "refreshed", "expires_in": 3600},
        ),
    )
    save_mock = MagicMock()
    monkeypatch.setattr(yds, "_save_tokens_sync", save_mock)
    out = asyncio.run(yds.YandexDiskService(user_id=1)._refresh_access_token("refresh-token"))
    assert out == "refreshed"
    save_mock.assert_called_once()
