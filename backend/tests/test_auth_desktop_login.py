# -*- coding: utf-8 -*-
"""Desktop local login API."""
from __future__ import annotations

import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.main import app


@pytest.fixture()
def client_env(monkeypatch):
    tmp = Path(tempfile.mkdtemp())
    monkeypatch.setenv("FORMA_DATA_DIR", str(tmp))
    monkeypatch.setattr("database.connection.DATA_ROOT", tmp)
    from backend.services import auth_user_service as aus

    aus._tasks.clear() if hasattr(aus, "_tasks") else None
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("client_mode", ["desktop_app", "admin_browser"])
def test_desktop_login_creates_local_user(client_env, client_mode):
    res = client_env.post(
        "/api/auth/desktop-login",
        headers={"X-Forma-Client": client_mode},
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"] == 1
    assert body["cloud_provider"] == "local"

    me = client_env.get(
        "/api/auth/me",
        headers={"X-User-ID": "1", "X-Forma-Client": client_mode},
    )
    assert me.status_code == 200
    assert me.json()["user_id"] == 1
