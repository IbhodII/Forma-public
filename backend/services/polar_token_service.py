# -*- coding: utf-8 -*-
"""Хранение OAuth-токенов Polar AccessLink по локальному user_id."""
from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id


def _row_to_dict(row) -> dict[str, Any] | None:
    if row is None:
        return None
    data = dict(row)
    return {
        "id": int(data["id"]),
        "local_user_id": int(data["local_user_id"]),
        "polar_user_id": str(data["user_id"]) if data.get("user_id") else None,
        "access_token": data.get("access_token"),
        "refresh_token": data.get("refresh_token"),
        "expires_at": data.get("expires_at"),
        "updated_at": data.get("updated_at"),
    }


def get_polar_token(local_user_id: int | None = None) -> dict[str, Any] | None:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT id, local_user_id, access_token, refresh_token, user_id,
                   expires_at, updated_at
            FROM polar_tokens
            WHERE local_user_id = ?
            ORDER BY id DESC
            LIMIT 1
            """,
            (uid,),
        ).fetchone()
    finally:
        conn.close()
    return _row_to_dict(row)


def is_polar_connected(local_user_id: int | None = None) -> bool:
    row = get_polar_token(local_user_id)
    if not row or not row.get("access_token") or not row.get("polar_user_id"):
        return False
    expires_at = row.get("expires_at")
    if expires_at is None:
        return True
    try:
        return int(expires_at) > int(time.time())
    except (TypeError, ValueError):
        return True


def save_polar_tokens(
    local_user_id: int,
    *,
    access_token: str,
    refresh_token: str | None,
    polar_user_id: str,
    expires_in: int | None = None,
) -> None:
    expires_at: int | None = None
    if expires_in is not None:
        try:
            expires_at = int(time.time()) + int(expires_in)
        except (TypeError, ValueError):
            expires_at = None
    updated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    uid = int(local_user_id)
    conn = get_db()
    try:
        conn.execute("DELETE FROM polar_tokens WHERE local_user_id = ?", (uid,))
        conn.execute(
            """
            INSERT INTO polar_tokens (
                local_user_id, access_token, refresh_token, user_id,
                expires_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (uid, access_token, refresh_token, str(polar_user_id), expires_at, updated_at),
        )
        conn.commit()
    finally:
        conn.close()


def delete_polar_tokens(local_user_id: int | None = None) -> None:
    uid = int(local_user_id if local_user_id is not None else get_current_user_id())
    conn = get_db()
    try:
        conn.execute("DELETE FROM polar_tokens WHERE local_user_id = ?", (uid,))
        conn.commit()
    finally:
        conn.close()


def list_local_users_with_polar_tokens() -> list[int]:
    conn = get_db()
    try:
        rows = conn.execute(
            """
            SELECT DISTINCT local_user_id
            FROM polar_tokens
            WHERE access_token IS NOT NULL AND user_id IS NOT NULL
            ORDER BY local_user_id
            """
        ).fetchall()
    finally:
        conn.close()
    return [int(r["local_user_id"]) for r in rows]


def load_polar_api_credentials(local_user_id: int) -> tuple[str, str]:
    """access_token и polar user_id (колонка user_id) для AccessLink API."""
    row = get_polar_token(local_user_id)
    if not row or not row.get("access_token") or not row.get("polar_user_id"):
        raise RuntimeError(
            "Нет сохранённых токенов Polar для этого пользователя. "
            "Подключите Polar Flow в настройках → Интеграции."
        )
    expires_at = row.get("expires_at")
    if expires_at is not None:
        try:
            if int(expires_at) <= int(time.time()):
                raise RuntimeError(
                    "Access token Polar истёк. Переподключите аккаунт в настройках."
                )
        except (TypeError, ValueError):
            pass
    return str(row["access_token"]), str(row["polar_user_id"])
