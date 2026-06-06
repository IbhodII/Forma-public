# -*- coding: utf-8 -*-
"""OAuth popup HTML for cloud providers (desktop vs browser)."""
from __future__ import annotations

from backend.services.oauth_popup_html import oauth_popup_html


def test_oauth_popup_html_skips_custom_scheme_for_desktop():
    html = oauth_popup_html(
        "yandex-disk-auth",
        "success",
        "OK",
        user_id=42,
        email="u@example.com",
        cloud_provider="yandex",
        use_custom_scheme=False,
    )
    assert "myhealthdashboard" not in html
    assert 'id="forma-oauth-data"' in html
    assert '"type": "yandex-disk-auth"' in html


def test_oauth_popup_html_includes_custom_scheme_for_browser():
    html = oauth_popup_html(
        "yandex-disk-auth",
        "success",
        "OK",
        user_id=42,
        email="u@example.com",
        cloud_provider="yandex",
        use_custom_scheme=True,
    )
    assert "myhealthdashboard://auth/login" in html
