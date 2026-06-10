# -*- coding: utf-8 -*-
"""Shared helpers for packaging seed generation and audit."""
from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Iterable

LOCAL_DESKTOP_USER_ID = 1
LOCAL_DESKTOP_USERNAME = "admin"
LOCAL_DESKTOP_PROVIDER = "local"
LOCAL_DESKTOP_CLOUD_USER_ID = "desktop"

# Tables that must be empty (zero rows) in installer seed workouts.db.
SEED_MUST_BE_EMPTY_TABLES: tuple[str, ...] = (
    "strength_workouts",
    "exercise_set_items",
    "exercise_sets",
    "strength_sessions",
    "cardio_workouts",
    "workout_heart_rate",
    "workout_sensors",
    "workout_gps_points",
    "daily_bracelet_calories",
    "daily_meal_logs",
    "meal_log_items",
    "meal_templates",
    "meal_template_items",
    "daily_meal_plans",
    "daily_meal_plan_templates",
    "meal_plan_items",
    "weekly_meal_schedule",
    "user_strength_exercises",
    "cloud_tokens",
    "cloud_accounts",
    "polar_tokens",
    "polar_pending_workouts",
    "auth_users",
    "calorie_calibration_history",
    "forma_sync_queue",
    "app_events",
    "body_metrics",
    "daily_weight",
    "food_entries",
    "daily_nutrition_goals",
    "nutrition_plan",
    "workout_presets",
    "preset_exercises",
    "preset_sets",
    "stretching_presets",
    "stretching_preset_exercises",
    "stretching_log",
    "steps_history",
    "passive_heart_rate_samples",
    "gps_tracks",
    "imported_files",
    "user_cloud_links",
    "all_exercises",
    "sleep_data",
    "menstrual_cycle_days",
    "health_connect_sync_log",
)

SEED_TOKEN_TABLES: frozenset[str] = frozenset(
    {
        "cloud_tokens",
        "polar_tokens",
        "cloud_accounts",
        "auth_users",
        "user_cloud_links",
    }
)

SEED_REQUIRED_MAIN_MEAL_TABLES: tuple[str, ...] = (
    "meal_templates",
    "meal_template_items",
    "daily_meal_plans",
    "daily_meal_plan_templates",
    "meal_plan_items",
)


def table_names(conn: sqlite3.Connection) -> set[str]:
    rows = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {str(r[0]) for r in rows}


def purge_personal_rows(conn: sqlite3.Connection, tables: Iterable[str]) -> None:
    existing = table_names(conn)
    conn.execute("PRAGMA foreign_keys = OFF")
    for table in tables:
        if table in existing:
            conn.execute(f"DELETE FROM {table}")
    conn.commit()
    conn.execute("VACUUM")


def reset_local_desktop_identity(conn: sqlite3.Connection) -> None:
    """Single local desktop user; no cloud email or provider in seed."""
    existing = table_names(conn)
    if "users" in existing:
        conn.execute("DELETE FROM users")
        conn.execute(
            """
            INSERT INTO users (id, username, cloud_provider, cloud_user_id, display_email)
            VALUES (?, ?, ?, ?, NULL)
            """,
            (
                LOCAL_DESKTOP_USER_ID,
                LOCAL_DESKTOP_USERNAME,
                LOCAL_DESKTOP_PROVIDER,
                LOCAL_DESKTOP_CLOUD_USER_ID,
            ),
        )
    if "user_profile" in existing:
        conn.execute("DELETE FROM user_profile")
        cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
        if cols:
            conn.execute(
                """
                INSERT INTO user_profile (id, updated_at)
                VALUES (?, datetime('now'))
                """,
                (LOCAL_DESKTOP_USER_ID,),
            )
    conn.commit()


def sanitize_workouts_seed(conn: sqlite3.Connection) -> None:
    purge_personal_rows(conn, SEED_MUST_BE_EMPTY_TABLES)
    reset_local_desktop_identity(conn)


def audit_workouts_seed(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"Missing workouts seed: {path}"]

    conn = sqlite3.connect(path)
    try:
        existing = table_names(conn)
        for table in SEED_MUST_BE_EMPTY_TABLES:
            if table not in existing:
                continue
            count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
            if int(count) > 0:
                errors.append(f"workouts.db table {table} has {count} row(s); expected 0")

        if "users" in existing:
            row = conn.execute(
                """
                SELECT username, cloud_provider, cloud_user_id, display_email
                FROM users WHERE id = ?
                """,
                (LOCAL_DESKTOP_USER_ID,),
            ).fetchone()
            if row is None:
                errors.append("workouts.db missing users row id=1")
            else:
                username, provider, cloud_uid, email = row
                if str(username) != LOCAL_DESKTOP_USERNAME:
                    errors.append(f"users.username={username!r}; expected {LOCAL_DESKTOP_USERNAME!r}")
                if str(provider or "").lower() != LOCAL_DESKTOP_PROVIDER:
                    errors.append(
                        f"users.cloud_provider={provider!r}; expected {LOCAL_DESKTOP_PROVIDER!r}"
                    )
                if str(cloud_uid or "") != LOCAL_DESKTOP_CLOUD_USER_ID:
                    errors.append(
                        f"users.cloud_user_id={cloud_uid!r}; expected {LOCAL_DESKTOP_CLOUD_USER_ID!r}"
                    )
                if email not in (None, ""):
                    errors.append(f"users.display_email must be empty; got {email!r}")

        for table in SEED_REQUIRED_MAIN_MEAL_TABLES:
            if table not in existing:
                errors.append(f"workouts.db missing required meal table main.{table}")

        for table in SEED_TOKEN_TABLES:
            if table in existing:
                count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
                if int(count) > 0:
                    errors.append(f"workouts.db auth table {table} has {count} row(s)")
    finally:
        conn.close()
    return errors


def audit_shared_seed(path: Path) -> list[str]:
    errors: list[str] = []
    if not path.is_file():
        return [f"Missing shared seed: {path}"]

    forbidden_meal = (
        "meal_templates",
        "meal_template_items",
        "daily_meal_plans",
        "daily_meal_plan_templates",
        "meal_plan_items",
    )
    conn = sqlite3.connect(path)
    try:
        for table in forbidden_meal:
            row = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name = ?",
                (table,),
            ).fetchone()
            if row is not None:
                errors.append(f"shared.db must not contain meal table {table}")
        row = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='openfoodfacts_cache'"
        ).fetchone()
        if row is not None:
            errors.append("shared.db must not contain openfoodfacts_cache")
    finally:
        conn.close()
    return errors


def audit_packaging_seed_dir(seed_dir: Path) -> list[str]:
    errors: list[str] = []
    errors.extend(audit_workouts_seed(seed_dir / "workouts.db"))
    errors.extend(audit_shared_seed(seed_dir / "shared.db"))
    return errors
