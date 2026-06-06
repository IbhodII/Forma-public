# -*- coding: utf-8 -*-
from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
import requests

from backend.services.forma_sync import yandex_api
from backend.services.yandex_disk_fs import is_disk_not_found


def _mock_response(status: int, *, json_data: dict | None = None, text: str = "") -> MagicMock:
    resp = MagicMock(spec=requests.Response)
    resp.status_code = status
    resp.ok = 200 <= status < 300
    resp.text = text
    if json_data is not None:
        resp.json.return_value = json_data
    else:
        resp.json.side_effect = ValueError("no json")
    return resp


def test_is_disk_not_found_404():
    assert is_disk_not_found(_mock_response(404)) is True


def test_is_disk_not_found_no_item_message():
    resp = _mock_response(
        409,
        json_data={"error": "DiskNotFoundError", "message": "No item with that key"},
    )
    assert is_disk_not_found(resp) is True


def test_is_disk_not_found_other_error():
    resp = _mock_response(403, json_data={"message": "Forbidden"})
    assert is_disk_not_found(resp) is False


@pytest.mark.asyncio
async def test_fetch_remote_manifest_primary_missing_legacy_no_item():
    primary = _mock_response(404)
    legacy = _mock_response(
        409,
        json_data={"error": "DiskNotFoundError", "message": "No item with that key"},
    )

    with patch.object(yandex_api, "_get_access_token", return_value="token"):
        with patch("backend.services.forma_sync.yandex_api.requests.get") as mock_get:
            mock_get.side_effect = [primary, legacy]
            result = await yandex_api.fetch_remote_manifest(1, "12345")

    assert result is None
    assert mock_get.call_count == 2


@pytest.mark.asyncio
async def test_fetch_remote_manifest_returns_primary():
    meta = _mock_response(
        200,
        json_data={"href": "https://example.com/manifest"},
    )
    body = MagicMock(spec=requests.Response)
    body.ok = True
    body.text = (
        '{"schema_version":1,"revision":2,"updated_at":"2026-01-01",'
        '"source_device":"desktop","source_device_id":"d1",'
        '"package":"packages/000002-desktop.zip","package_sha256":"abc",'
        '"entities_summary":{}}'
    )

    with patch.object(yandex_api, "_get_access_token", return_value="token"):
        with patch("backend.services.forma_sync.yandex_api.requests.get") as mock_get:
            mock_get.side_effect = [meta, body]
            result = await yandex_api.fetch_remote_manifest(1, "12345")

    assert result is not None
    assert result.revision == 2
    assert mock_get.call_count == 2
