# -*- coding: utf-8 -*-
"""Пользователи приложения, привязанные к облачному аккаунту (OAuth)."""
from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException

from backend.database import get_db
from database.connection import open_db

VALID_CLOUD_PROVIDERS = frozenset({"yandex", "google", "local"})
DEFAULT_LOCAL_USER_ID = 1


def _slug_username(raw: str) -> str:
    text = re.sub(r"[^\w.\-@]+", "_", str(raw or "").strip(), flags=re.UNICODE)
    text = text.strip("._") or "user"
    return text[:64]


def _ensure_auth_tables(conn) -> None:
    """Self-heal minimal auth schema for packaged/legacy databases."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            cloud_provider TEXT,
            cloud_user_id TEXT,
            display_email TEXT,
            last_sync TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(cloud_provider, cloud_user_id)
        )
        """
    )
    conn.execute(
        """
        INSERT OR IGNORE INTO users (id, username, cloud_provider, cloud_user_id, display_email)
        VALUES (1, 'admin', 'local', 'admin', NULL)
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_profile (
            id INTEGER PRIMARY KEY,
            date_of_birth TEXT,
            height_cm REAL,
            max_heart_rate INTEGER,
            updated_at TEXT NOT NULL
        )
        """
    )


def ensure_auth_schema() -> None:
    """Один раз при старте API — не вызывать на каждый HTTP-запрос."""
    conn = open_db(attach=False)
    try:
        _ensure_auth_tables(conn)
        conn.commit()
    finally:
        conn.close()


def ensure_local_desktop_user(user_id: int = DEFAULT_LOCAL_USER_ID) -> dict[str, Any]:
    """
    Гарантирует локального admin-пользователя для desktop login (id=1 по умолчанию).
    Не трогает существующие строки users, только создаёт отсутствующий профиль.
    """
    uid = int(user_id)
    conn = open_db(attach=False)
    try:
        _ensure_auth_tables(conn)
        row = conn.execute(
            """
            SELECT id, username, cloud_provider, cloud_user_id, display_email, last_sync, created_at
            FROM users WHERE id = ?
            """,
            (uid,),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
                VALUES (?, 'admin', 'local', 'desktop', NULL)
                """,
                (uid,),
            )
        else:
            provider = str(row["cloud_provider"] or "").strip().lower()
            if provider in ("", "admin"):
                conn.execute(
                    """
                    UPDATE users
                    SET cloud_provider = 'local', cloud_user_id = COALESCE(NULLIF(cloud_user_id, ''), 'desktop')
                    WHERE id = ?
                    """,
                    (uid,),
                )
        _ensure_user_profile_row(conn, uid)
        conn.commit()
    finally:
        conn.close()
    user = get_user_by_id(uid)
    if user is None:
        raise HTTPException(status_code=500, detail="Не удалось подготовить локальный профиль")
    return user


def get_user_by_id(user_id: int) -> dict[str, Any] | None:
    conn = open_db(attach=False)
    try:
        row = conn.execute(
            """
            SELECT id, username, cloud_provider, cloud_user_id, display_email, last_sync, created_at
            FROM users
            WHERE id = ?
            """,
            (int(user_id),),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def find_user_by_cloud(cloud_provider: str, cloud_user_id: str) -> dict[str, Any] | None:
    provider = str(cloud_provider or "").strip().lower()
    uid = str(cloud_user_id or "").strip().lower()
    if not provider or not uid:
        return None
    conn = open_db(attach=False)
    try:
        row = conn.execute(
            """
            SELECT id, username, cloud_provider, cloud_user_id, display_email, last_sync, created_at
            FROM users
            WHERE cloud_provider = ? AND LOWER(cloud_user_id) = ?
            """,
            (provider, uid),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def _ensure_user_profile_row(conn, user_id: int) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    has_user_id = "user_id" in cols
    if has_user_id:
        row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ? OR user_id = ? LIMIT 1",
            (user_id, user_id),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ? LIMIT 1",
            (user_id,),
        ).fetchone()
    if row is not None:
        if has_user_id:
            conn.execute(
                "UPDATE user_profile SET user_id = ? WHERE id = ? AND (user_id IS NULL OR user_id = 0)",
                (user_id, user_id),
            )
        return
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    if has_user_id:
        conn.execute(
            "INSERT INTO user_profile (id, user_id, updated_at) VALUES (?, ?, ?)",
            (user_id, user_id, now),
        )
    else:
        conn.execute(
            "INSERT INTO user_profile (id, updated_at) VALUES (?, ?)",
            (user_id, now),
        )


def _table_has_any_row(conn, table: str, where_sql: str = "") -> bool:
    try:
        sql = f"SELECT 1 FROM {table} {where_sql} LIMIT 1"
        return conn.execute(sql).fetchone() is not None
    except Exception:
        return False


def _database_has_legacy_workouts(conn) -> bool:
    """True if primary local profile likely has real user data."""
    if _table_has_any_row(conn, "strength_workout_dates"):
        return True
    if _table_has_any_row(
        conn,
        "strength_workouts",
        "WHERE user_id = 1 OR user_id IS NULL",
    ):
        return True
    if _table_has_any_row(
        conn,
        "cardio_workouts",
        "WHERE user_id = 1 OR user_id IS NULL",
    ):
        return True
    if _table_has_any_row(
        conn,
        "food_entries",
        "WHERE user_id = 1 OR user_id IS NULL",
    ):
        return True
    if _table_has_any_row(
        conn,
        "body_metrics",
        "WHERE user_id = 1 OR user_id IS NULL",
    ):
        return True
    return False


def _can_link_primary_local_user(conn, provider: str) -> int | None:
    """If user 1 is local-only and DB already has workouts, reuse id=1 on first cloud login."""
    row = conn.execute(
        """
        SELECT id, cloud_provider, cloud_user_id
        FROM users
        WHERE id = ?
        """,
        (DEFAULT_LOCAL_USER_ID,),
    ).fetchone()
    if not row:
        return None
    current_provider = str(row["cloud_provider"] or "local").strip().lower()
    if current_provider not in ("", "local", "admin"):
        return None
    if row["cloud_user_id"] and str(row["cloud_user_id"]).lower() not in ("", "admin", "local"):
        return None
    if not _database_has_legacy_workouts(conn):
        return None
    other = conn.execute(
        "SELECT 1 FROM users WHERE cloud_provider = ? AND id != ? LIMIT 1",
        (provider, DEFAULT_LOCAL_USER_ID),
    ).fetchone()
    if other:
        return None
    return DEFAULT_LOCAL_USER_ID


def find_or_create_cloud_user(
    *,
    cloud_provider: str,
    cloud_user_id: str,
    display_email: str | None = None,
    display_name: str | None = None,
) -> dict[str, Any]:
    provider = str(cloud_provider or "").strip().lower()
    if provider not in VALID_CLOUD_PROVIDERS - {"local"}:
        raise HTTPException(status_code=400, detail="Неподдерживаемый cloud_provider")

    cloud_id = str(cloud_user_id or "").strip()
    if not cloud_id:
        raise HTTPException(status_code=400, detail="cloud_user_id обязателен")

    existing = find_user_by_cloud(provider, cloud_id)
    if existing:
        return existing

    email = str(display_email or "").strip().lower() or None
    base_name = display_name or email or cloud_id
    username = _slug_username(base_name)
    conn = get_db()
    try:
        _ensure_auth_tables(conn)
        link_id = _can_link_primary_local_user(conn, provider)
        if link_id is not None:
            conn.execute(
                """
                UPDATE users
                SET cloud_provider = ?, cloud_user_id = ?, display_email = COALESCE(?, display_email)
                WHERE id = ?
                """,
                (provider, cloud_id, email, link_id),
            )
            _ensure_user_profile_row(conn, link_id)
            conn.commit()
            user_id = link_id
        else:
            taken = conn.execute(
                "SELECT 1 FROM users WHERE username = ? LIMIT 1", (username,)
            ).fetchone()
            if taken:
                username = _slug_username(f"{username}_{provider}")

            cur = conn.execute(
                """
                INSERT INTO users (username, cloud_provider, cloud_user_id, display_email)
                VALUES (?, ?, ?, ?)
                """,
                (username, provider, cloud_id, email),
            )
            user_id = int(cur.lastrowid)
            _ensure_user_profile_row(conn, user_id)
            conn.commit()
    finally:
        conn.close()
    created = get_user_by_id(user_id)
    if created is None:
        raise HTTPException(status_code=500, detail="Не удалось создать пользователя")
    return created


def touch_last_sync(user_id: int) -> None:
    conn = get_db()
    try:
        _ensure_auth_tables(conn)
        conn.execute(
            "UPDATE users SET last_sync = CURRENT_TIMESTAMP WHERE id = ?",
            (int(user_id),),
        )
        conn.commit()
    finally:
        conn.close()


def user_session_payload(user: dict[str, Any]) -> dict[str, Any]:
    return {
        "user_id": user["id"],
        "username": user["username"],
        "cloud_provider": user.get("cloud_provider"),
        "cloud_user_id": user.get("cloud_user_id"),
        "email": user.get("display_email"),
        "last_sync": user.get("last_sync"),
    }
