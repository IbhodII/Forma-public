# -*- coding: utf-8 -*-
"""Per-table merge key columns, timestamp resolution, and conflict strategies."""
from __future__ import annotations

from dataclasses import dataclass

from backend.services.db_import_merge_common import (
    TIMESTAMP_COLUMN_CANDIDATES,
    MergeStrategy,
)


@dataclass(frozen=True)
class TableMergeSpec:
    key_cols: tuple[str, ...]
    strategy: MergeStrategy = MergeStrategy.newer_timestamp
    timestamp_candidates: tuple[str, ...] = TIMESTAMP_COLUMN_CANDIDATES
    richer_field: str | None = None
    date_field: str | None = None


TABLE_MERGE_SPECS: dict[str, TableMergeSpec] = {
    "steps_history": TableMergeSpec(
        ("user_id", "date"),
        MergeStrategy.max_numeric,
        richer_field="steps",
        timestamp_candidates=("updated_at", "date"),
    ),
    "body_metrics": TableMergeSpec(
        ("user_id", "date"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "date"),
    ),
    "daily_bracelet_calories": TableMergeSpec(
        ("user_id", "date"),
        MergeStrategy.max_numeric,
        richer_field="total_calories",
        timestamp_candidates=("updated_at", "date"),
    ),
    "passive_heart_rate_samples": TableMergeSpec(
        ("user_id", "recorded_at"),
        MergeStrategy.max_numeric,
        richer_field="bpm",
        timestamp_candidates=("created_at", "recorded_at"),
    ),
    "sleep_data": TableMergeSpec(
        ("user_id", "external_id"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "created_at", "date"),
        date_field="date",
    ),
    "strength_hr_session_meta": TableMergeSpec(
        ("user_id", "workout_date", "workout_title"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "verified_at", "created_at"),
    ),
    "strength_hr_block_mappings": TableMergeSpec(
        ("user_id", "workout_date", "workout_title", "block_index"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "created_at"),
    ),
    "cardio_type_settings": TableMergeSpec(
        ("user_id", "type"),
        MergeStrategy.richer,
        timestamp_candidates=("updated_at",),
    ),
    "bike_settings": TableMergeSpec(
        ("user_id",),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "created_at"),
    ),
    "menstrual_cycle_settings": TableMergeSpec(
        ("user_id",),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "last_period_start"),
    ),
    "menstrual_cycle_log": TableMergeSpec(
        ("user_id", "date"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "created_at", "date"),
        date_field="date",
    ),
    "exercise_sets": TableMergeSpec(
        ("user_id", "workout_type", "effective_from"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "effective_from"),
        date_field="effective_from",
    ),
    "workout_presets": TableMergeSpec(
        ("user_id", "name"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at", "created_at"),
    ),
    "account_warmup_daily_cache": TableMergeSpec(
        ("user_id", "metric_key", "grain", "bucket_date"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("computed_at", "updated_at"),
    ),
    "account_warmup_checkpoint": TableMergeSpec(
        ("user_id",),
        MergeStrategy.richer,
        timestamp_candidates=("updated_at", "started_at", "completed_at"),
    ),
    "weekly_meal_schedule": TableMergeSpec(
        ("user_id", "day_of_week"),
        MergeStrategy.incoming_wins,
    ),
    "strength_hr_block_overrides": TableMergeSpec(
        ("user_id", "workout_date", "workout_title", "block_index"),
        MergeStrategy.newer_timestamp,
        timestamp_candidates=("updated_at",),
    ),
}


def get_table_merge_spec(table: str) -> TableMergeSpec:
    """Registry entry with inventory fallback for user-scoped UK tables."""
    if table in TABLE_MERGE_SPECS:
        return TABLE_MERGE_SPECS[table]

    from backend.services.db_import_unique_inventory import (
        SINGLETON_USER_SCOPED_TABLES,
    )

    if table in SINGLETON_USER_SCOPED_TABLES:
        return TableMergeSpec(
            ("user_id",),
            MergeStrategy.richer,
            timestamp_candidates=TIMESTAMP_COLUMN_CANDIDATES,
        )
    return TableMergeSpec(
        ("user_id",),
        MergeStrategy.incoming_wins,
        timestamp_candidates=TIMESTAMP_COLUMN_CANDIDATES,
    )