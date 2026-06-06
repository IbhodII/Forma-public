# -*- coding: utf-8 -*-
"""Профиль облачного аккаунта после OAuth (email, имя)."""
from __future__ import annotations

import logging

import requests

logger = logging.getLogger(__name__)

YANDEX_DISK_API = "https://cloud-api.yandex.net/v1/disk/"


def _identity_from_disk_user(user: dict) -> dict[str, str] | None:
    uid = str(user.get("uid") or "").strip()
    login = str(user.get("login") or "").strip().lower()
    display_name = str(user.get("display_name") or login or "").strip()
    if not uid and not login:
        return None
    cloud_user_id = uid or login
    display_email = None
    if login:
        display_email = login if "@" in login else f"{login}@yandex.ru"
    return {
        "cloud_user_id": cloud_user_id,
        "display_email": display_email,
        "display_name": display_name or None,
    }


def _fetch_yandex_identity_via_disk(access_token: str) -> dict[str, str] | None:
    """UID/login из Disk API — работает с scope cloud_api:disk.* без login:email."""
    try:
        resp = requests.get(
            YANDEX_DISK_API,
            headers={"Authorization": f"OAuth {access_token}"},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.warning("Yandex Disk API /disk user failed: %s", exc)
        return None
    user = data.get("user")
    if not isinstance(user, dict):
        return None
    return _identity_from_disk_user(user)


def _fetch_yandex_identity_via_login_info(access_token: str) -> dict[str, str] | None:
    """Email через login.yandex.ru/info — только если в OAuth-приложении есть login:*."""
    try:
        resp = requests.get(
            "https://login.yandex.ru/info",
            params={"format": "json"},
            headers={"Authorization": f"OAuth {access_token}"},
            timeout=12,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as exc:
        logger.debug("Yandex /info unavailable (login scope may be off): %s", exc)
        return None

    email = str(data.get("default_email") or data.get("login") or "").strip().lower()
    name = str(
        data.get("real_name") or data.get("display_name") or data.get("login") or ""
    ).strip()
    uid = str(data.get("id") or data.get("client_id") or "").strip()
    cloud_user_id = uid or email or name
    if not cloud_user_id:
        return None
    return {
        "cloud_user_id": cloud_user_id,
        "display_email": email or None,
        "display_name": name or None,
    }


def fetch_yandex_identity(access_token: str) -> dict[str, str]:
    """
    Идентификация аккаунта Яндекса после OAuth.

    Сначала Disk API (uid) — не требует login:email в приложении.
    Затем /info, если в .env заданы YANDEX_EXTRA_SCOPES с login:*.
    """
    disk_identity = _fetch_yandex_identity_via_disk(access_token)
    info_identity = _fetch_yandex_identity_via_login_info(access_token)

    if disk_identity and info_identity:
        merged = dict(disk_identity)
        if info_identity.get("display_email"):
            merged["display_email"] = info_identity["display_email"]
        if info_identity.get("display_name"):
            merged["display_name"] = info_identity["display_name"]
        # Стабильный ключ — uid Диска, не email
        merged["cloud_user_id"] = disk_identity["cloud_user_id"]
        return merged

    if disk_identity:
        return disk_identity
    if info_identity:
        return info_identity

    raise RuntimeError(
        "Не удалось определить аккаунт Яндекса. Проверьте права приложения "
        "«Яндекс.Диск» на oauth.yandex.ru."
    )


def format_account_label(identity: dict[str, str | None]) -> str:
    """Строка для UI: «Имя (email)» или email/login."""
    email = (identity.get("display_email") or "").strip()
    name = (identity.get("display_name") or "").strip()
    if email:
        if name and name.lower() not in {email.lower(), email.split("@")[0].lower()}:
            return f"{name} ({email})"
        return email
    if name:
        return name
    uid = str(identity.get("cloud_user_id") or "").strip()
    return uid or "Подключённый аккаунт"


def account_fields_for_status(identity: dict[str, str | None]) -> dict[str, str | None]:
    return {
        "account_email": identity.get("display_email"),
        "account_name": identity.get("display_name"),
        "account_label": format_account_label(identity),
    }


def try_yandex_identity(access_token: str) -> dict[str, str] | None:
    """Без исключений — для /cloud/status."""
    disk_identity = _fetch_yandex_identity_via_disk(access_token)
    info_identity = _fetch_yandex_identity_via_login_info(access_token)
    if disk_identity and info_identity:
        merged = dict(disk_identity)
        if info_identity.get("display_email"):
            merged["display_email"] = info_identity["display_email"]
        if info_identity.get("display_name"):
            merged["display_name"] = info_identity["display_name"]
        merged["cloud_user_id"] = disk_identity["cloud_user_id"]
        return merged
    return disk_identity or info_identity


def try_google_identity(credentials) -> dict[str, str] | None:
    try:
        return fetch_google_identity(credentials)
    except Exception as exc:
        logger.debug("Google account info for status failed: %s", exc)
        return None


def fetch_google_identity(credentials) -> dict[str, str]:
    """Google userinfo по Credentials после OAuth."""
    try:
        from googleapiclient.discovery import build

        service = build("oauth2", "v2", credentials=credentials, cache_discovery=False)
        data = service.userinfo().get().execute()
    except Exception as exc:
        logger.warning("Google userinfo failed: %s", exc)
        raise RuntimeError("Не удалось получить профиль Google") from exc

    email = str(data.get("email") or "").strip().lower()
    name = str(data.get("name") or email or "").strip()
    if not email:
        raise RuntimeError("Google не вернул email")
    return {
        "cloud_user_id": email,
        "display_email": email,
        "display_name": name or None,
    }
