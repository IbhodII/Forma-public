# -*- coding: utf-8 -*-
"""Токены облака привязаны к аккаунту Яндекс/Google, а не к локальному user_id."""
from __future__ import annotations

import logging
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services.auth_user_service import get_user_by_id

logger = logging.getLogger(__name__)

STORAGE_YANDEX = "yandex"
STORAGE_GOOGLE = "google"


def _normalize_account_id(value: str | None) -> str:
    return str(value or "").strip().lower()


def _ensure_cloud_tables(conn) -> None:
    """Self-heal cloud token/link tables for legacy packaged databases."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS user_cloud_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            storage_provider TEXT NOT NULL,
            account_cloud_provider TEXT NOT NULL,
            account_cloud_user_id TEXT NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, storage_provider)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS cloud_tokens (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL DEFAULT 1,
            provider TEXT NOT NULL,
            access_token TEXT NOT NULL,
            refresh_token TEXT,
            expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            account_cloud_provider TEXT,
            account_cloud_user_id TEXT,
            UNIQUE(user_id, provider),
            UNIQUE(account_cloud_provider, account_cloud_user_id, provider)
        )
        """
    )
    cloud_cols = {r[1] for r in conn.execute("PRAGMA table_info(cloud_tokens)")}
    if "user_id" not in cloud_cols:
        conn.execute("ALTER TABLE cloud_tokens ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1")
    if "account_cloud_provider" not in cloud_cols:
        conn.execute("ALTER TABLE cloud_tokens ADD COLUMN account_cloud_provider TEXT")
    if "account_cloud_user_id" not in cloud_cols:
        conn.execute("ALTER TABLE cloud_tokens ADD COLUMN account_cloud_user_id TEXT")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_cloud_tokens_account_unique
        ON cloud_tokens(account_cloud_provider, account_cloud_user_id, provider)
        WHERE account_cloud_provider IS NOT NULL AND account_cloud_user_id IS NOT NULL
        """
    )
    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_cloud_tokens_user_provider ON cloud_tokens(user_id, provider)"
    )

    link_cols = {r[1] for r in conn.execute("PRAGMA table_info(user_cloud_links)")}
    if "updated_at" not in link_cols:
        conn.execute("ALTER TABLE user_cloud_links ADD COLUMN updated_at TIMESTAMP")
    conn.execute(
        """
        CREATE UNIQUE INDEX IF NOT EXISTS idx_user_cloud_links_unique
        ON user_cloud_links(user_id, storage_provider)
        """
    )


def link_user_to_cloud_account(
    user_id: int,
    storage_provider: str,
    account_cloud_provider: str,
    account_cloud_user_id: str,
) -> None:
    """Связывает локального пользователя с облачным аккаунтом (общие токены и бэкапы)."""
    uid = int(user_id)
    storage = str(storage_provider or "").strip().lower()
    acct_provider = str(account_cloud_provider or "").strip().lower()
    acct_id = _normalize_account_id(account_cloud_user_id)
    if not acct_id or storage not in (STORAGE_YANDEX, STORAGE_GOOGLE):
        return
    conn = get_db()
    try:
        _ensure_cloud_tables(conn)
        conn.execute(
            """
            INSERT INTO user_cloud_links (
                user_id, storage_provider, account_cloud_provider, account_cloud_user_id
            )
            VALUES (?, ?, ?, ?)
            ON CONFLICT(user_id, storage_provider) DO UPDATE SET
                account_cloud_provider = excluded.account_cloud_provider,
                account_cloud_user_id = excluded.account_cloud_user_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (uid, storage, acct_provider, acct_id),
        )
        conn.commit()
        logger.info(
            "Облако: пользователь %s привязан к %s/%s (storage=%s)",
            uid,
            acct_provider,
            acct_id,
            storage,
        )
    finally:
        conn.close()


def get_user_cloud_link(user_id: int, storage_provider: str) -> dict[str, str] | None:
    conn = get_db()
    try:
        _ensure_cloud_tables(conn)
        row = conn.execute(
            """
            SELECT account_cloud_provider, account_cloud_user_id
            FROM user_cloud_links
            WHERE user_id = ? AND storage_provider = ?
            """,
            (int(user_id), str(storage_provider).strip().lower()),
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return None
    return {
        "account_cloud_provider": str(row["account_cloud_provider"]),
        "account_cloud_user_id": str(row["account_cloud_user_id"]),
    }


def _account_from_user_row(user: dict[str, Any] | None, storage_provider: str) -> tuple[str, str] | None:
    if not user:
        return None
    provider = str(user.get("cloud_provider") or "").strip().lower()
    cloud_uid = _normalize_account_id(user.get("cloud_user_id"))
    if not cloud_uid or provider == "local":
        return None
    storage = str(storage_provider).strip().lower()
    if provider == storage:
        return provider, cloud_uid
    return None


def resolve_cloud_account(
    storage_provider: str,
    user_id: int | None = None,
) -> tuple[str, str] | None:
    """Возвращает (account_cloud_provider, account_cloud_user_id) для доступа к токенам."""
    uid = int(user_id) if user_id is not None else get_current_user_id()
    storage = str(storage_provider).strip().lower()

    link = get_user_cloud_link(uid, storage)
    if link:
        return link["account_cloud_provider"], link["account_cloud_user_id"]

    user = get_user_by_id(uid)
    account = _account_from_user_row(user, storage)
    if account:
        return account

    return None


def save_cloud_account_tokens(
    storage_provider: str,
    access_token: str,
    refresh_token: str | None,
    expires_at: str | None,
    *,
    account_cloud_provider: str,
    account_cloud_user_id: str,
    link_user_id: int | None = None,
    legacy_user_id: int | None = None,
) -> None:
    """Сохраняет токены по ключу облачного аккаунта и опционально привязывает локального пользователя."""
    storage = str(storage_provider).strip().lower()
    acct_provider = str(account_cloud_provider or "").strip().lower()
    acct_id = _normalize_account_id(account_cloud_user_id)
    if not acct_id:
        raise ValueError("account_cloud_user_id обязателен")

    uid_legacy = int(legacy_user_id) if legacy_user_id is not None else None
    conn = get_db()
    try:
        _ensure_cloud_tables(conn)
        conn.execute(
            """
            INSERT INTO cloud_tokens (
                user_id, provider, access_token, refresh_token, expires_at,
                account_cloud_provider, account_cloud_user_id, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(account_cloud_provider, account_cloud_user_id, provider)
            DO UPDATE SET
                access_token = excluded.access_token,
                refresh_token = COALESCE(excluded.refresh_token, cloud_tokens.refresh_token),
                expires_at = excluded.expires_at,
                user_id = excluded.user_id,
                updated_at = CURRENT_TIMESTAMP
            """,
            (
                uid_legacy or (int(link_user_id) if link_user_id else 1),
                storage,
                access_token,
                refresh_token,
                expires_at,
                acct_provider,
                acct_id,
            ),
        )
        conn.commit()
    finally:
        conn.close()

    target_link = int(link_user_id) if link_user_id is not None else uid_legacy
    if target_link is not None:
        link_user_to_cloud_account(target_link, storage, acct_provider, acct_id)

    logger.info(
        "Облако: токены %s сохранены для аккаунта %s/%s (link_user=%s)",
        storage,
        acct_provider,
        acct_id,
        target_link,
    )


def load_cloud_account_tokens(
    storage_provider: str,
    user_id: int | None = None,
) -> tuple[str, str | None, str | None] | None:
    """Загружает токены для текущего пользователя через привязку к облачному аккаунту."""
    uid = int(user_id) if user_id is not None else get_current_user_id()
    storage = str(storage_provider).strip().lower()
    conn = get_db()
    try:
        _ensure_cloud_tables(conn)
        row = conn.execute(
            """
            SELECT access_token, refresh_token, expires_at
            FROM cloud_tokens
            WHERE provider = ? AND user_id = ?
            """,
            (storage, uid),
        ).fetchone()
        if row is not None:
            logger.debug("Облако: токены %s найдены по user_id=%s", storage, uid)
            return str(row[0]), row[1], row[2]

        account = resolve_cloud_account(storage, uid)
        if account:
            acct_provider, acct_id = account
            row = conn.execute(
                """
                SELECT access_token, refresh_token, expires_at
                FROM cloud_tokens
                WHERE provider = ?
                  AND account_cloud_provider = ?
                  AND LOWER(account_cloud_user_id) = ?
                """,
                (storage, acct_provider, acct_id),
            ).fetchone()
            if row is not None:
                logger.debug(
                    "Облако: токены %s по аккаунту %s/%s (запрос user_id=%s)",
                    storage,
                    acct_provider,
                    acct_id,
                    uid,
                )
                return str(row[0]), row[1], row[2]
    finally:
        conn.close()

    logger.debug("Облако: токены %s не найдены для user_id=%s", storage, uid)
    return None


def delete_cloud_tokens_for_user(storage_provider: str, user_id: int | None = None) -> None:
    """Отключает облако: удаляет привязку пользователя и токены аккаунта, если больше никто не связан."""
    uid = int(user_id) if user_id is not None else get_current_user_id()
    storage = str(storage_provider).strip().lower()
    account = resolve_cloud_account(storage, uid)

    conn = get_db()
    try:
        _ensure_cloud_tables(conn)
        conn.execute(
            "DELETE FROM user_cloud_links WHERE user_id = ? AND storage_provider = ?",
            (uid, storage),
        )
        conn.execute(
            "DELETE FROM cloud_tokens WHERE provider = ? AND user_id = ?",
            (storage, uid),
        )

        if account:
            acct_provider, acct_id = account
            others = conn.execute(
                """
                SELECT COUNT(*) FROM user_cloud_links
                WHERE storage_provider = ?
                  AND account_cloud_provider = ?
                  AND LOWER(account_cloud_user_id) = ?
                """,
                (storage, acct_provider, acct_id),
            ).fetchone()[0]
            if int(others or 0) == 0:
                conn.execute(
                    """
                    DELETE FROM cloud_tokens
                    WHERE provider = ?
                      AND account_cloud_provider = ?
                      AND LOWER(account_cloud_user_id) = ?
                    """,
                    (storage, acct_provider, acct_id),
                )
                logger.info(
                    "Облако: токены %s удалены для аккаунта %s/%s",
                    storage,
                    acct_provider,
                    acct_id,
                )

        conn.commit()
    finally:
        conn.close()
