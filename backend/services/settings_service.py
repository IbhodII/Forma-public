# -*- coding: utf-8 -*-
"""Централизованные настройки приложения (строка user_profile id=1)."""
from __future__ import annotations

import threading
from typing import Any

from backend.core.week_calendar import DEFAULT_WEEK_START_DAY, WEEKDAY_LABELS_RU
from backend.database import get_db

_SETTINGS_SCHEMA_LOCK = threading.Lock()

PROFILE_ID = 1

VALID_SEX = frozenset({"male", "female"})
VALID_CLOUD = frozenset({"yandex", "google"})
VALID_UNITS_SYSTEM = frozenset({"metric", "american"})
DEFAULTS: dict[str, Any] = {
    "sex": "male",
    "week_start_day": DEFAULT_WEEK_START_DAY,
    "cloud_sync_provider": "yandex",
    "units_system": "metric",
}

# Идемпотентные ALTER для user_profile (проверяются при каждом вызове ensure_settings_columns).
_PROFILE_COLUMN_MIGRATIONS: tuple[tuple[str, str], ...] = (
    ("sex", "TEXT DEFAULT 'male'"),
    ("week_start_day", "INTEGER DEFAULT 5"),
    ("cloud_sync_provider", "TEXT DEFAULT 'yandex'"),
    ("units_system", "TEXT DEFAULT 'metric'"),
    ("protein_gram_per_kg", "REAL"),
    ("fat_gram_per_kg", "REAL"),
    ("carbs_gram_per_kg", "REAL"),
    ("activity_level", "TEXT"),
    ("fit_folder_path", "TEXT"),
    ("include_warmup_in_analytics", "INTEGER NOT NULL DEFAULT 0"),
    ("hc_analytics_prefs", "TEXT"),
    ("first_name", "TEXT"),
    ("last_name", "TEXT"),
    ("display_name", "TEXT"),
    ("max_deficit_per_kg_fat", "REAL DEFAULT 35"),
    ("target_bulk_grams_per_week", "REAL DEFAULT 300"),
    ("use_chest_strap_priority", "INTEGER NOT NULL DEFAULT 1"),
    ("cloud_auto_backup_enabled", "INTEGER NOT NULL DEFAULT 0"),
    ("backup_folder_path", "TEXT"),
    ("last_backup_date", "TEXT"),
)


def get_settings() -> dict[str, Any]:
    from backend.services import user_service

    profile = user_service.get_profile() or {}
    return {
        "sex": profile.get("sex") or DEFAULTS["sex"],
        "week_start_day": int(profile.get("week_start_day") if profile.get("week_start_day") is not None else DEFAULTS["week_start_day"]),
        "week_start_label": WEEKDAY_LABELS_RU.get(
            int(profile.get("week_start_day") if profile.get("week_start_day") is not None else DEFAULTS["week_start_day"]),
            WEEKDAY_LABELS_RU[DEFAULT_WEEK_START_DAY],
        ),
        "cloud_sync_provider": profile.get("cloud_sync_provider") or DEFAULTS["cloud_sync_provider"],
        "units_system": profile.get("units_system") or DEFAULTS["units_system"],
    }


def get_week_start_day() -> int:
    return int(get_settings()["week_start_day"])


def get_sex() -> str:
    return str(get_settings()["sex"])


def merge_settings_payload(payload: dict[str, Any]) -> dict[str, Any]:
    """Валидация полей настроек для upsert. Неизвестные значения — ValueError (400)."""
    out: dict[str, Any] = {}
    if "sex" in payload:
        sex = str(payload.get("sex") or "male").strip().lower()
        if sex not in VALID_SEX:
            raise ValueError("sex должен быть male или female")
        out["sex"] = sex
    if "week_start_day" in payload:
        day = int(payload["week_start_day"])
        if day < 0 or day > 6:
            raise ValueError("week_start_day должен быть от 0 (пн) до 6 (вс)")
        out["week_start_day"] = day
    if "cloud_sync_provider" in payload:
        prov = str(payload.get("cloud_sync_provider") or "yandex").strip().lower()
        if prov not in VALID_CLOUD:
            raise ValueError("cloud_sync_provider: yandex или google")
        out["cloud_sync_provider"] = prov
    if "units_system" in payload:
        units = str(payload.get("units_system") or "metric").strip().lower()
        if units not in VALID_UNITS_SYSTEM:
            raise ValueError("units_system: metric или american")
        out["units_system"] = units
    return out


def ensure_settings_columns() -> None:
    """Ленивая миграция колонок user_profile (идемпотентно, до полного набора колонок)."""
    with _SETTINGS_SCHEMA_LOCK:
        conn = get_db()
        try:
            cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
            changed = False
            for name, typedef in _PROFILE_COLUMN_MIGRATIONS:
                if name not in cols:
                    conn.execute(f"ALTER TABLE user_profile ADD COLUMN {name} {typedef}")
                    cols.add(name)
                    changed = True
            if "units_system" in cols:
                needs_backfill = conn.execute(
                    """
                    SELECT 1 FROM user_profile
                    WHERE units_system IS NULL OR TRIM(COALESCE(units_system, '')) = ''
                    LIMIT 1
                    """
                ).fetchone()
                if needs_backfill:
                    conn.execute(
                        """
                        UPDATE user_profile
                        SET units_system = 'metric'
                        WHERE units_system IS NULL OR TRIM(COALESCE(units_system, '')) = ''
                        """
                    )
                    changed = True
            if changed:
                conn.commit()
        finally:
            conn.close()
