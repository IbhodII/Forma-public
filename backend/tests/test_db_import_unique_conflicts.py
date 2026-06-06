# -*- coding: utf-8 -*-
"""Universal import conflict resolver: preflight, cardio_type_settings, multi-table."""
from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest

from backend.services.db_import_conflict_handlers import (
    _merge_cardio_type_settings_from_staging,
    _remap_account_warmup_checkpoint_user_ids,
    _remap_cardio_type_settings_user_ids,
    _upsert_cardio_type_settings_row,
)
from backend.services.db_import_natural_merge import (
    NATURAL_KEY_HANDLERS,
    assert_safe_main_table_import,
    merge_table_from_staging,
)
from backend.services.db_import_preflight import ImportPreflightError, run_import_preflight
from backend.services.db_import_unique_inventory import (
    EXPECTED_USER_SCOPED_HANDLED,
    SINGLETON_USER_SCOPED_TABLES,
    TableImportClass,
    classify_constraint,
    scan_unique_constraints,
)
from backend.services.db_import_natural_merge import has_user_scoped_handler


def _create_cardio_type_settings(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE cardio_type_settings (
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (user_id, type)
        )
        """
    )


def _create_steps(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT DEFAULT 'excel_archive',
            updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(user_id, date)
        )
        """
    )


def _create_hr_meta(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE strength_hr_session_meta (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        CREATE UNIQUE INDEX idx_hr_session_meta_user_session
        ON strength_hr_session_meta(user_id, workout_date, workout_title)
        """
    )


def test_all_expected_user_scoped_have_handlers():
    missing = EXPECTED_USER_SCOPED_HANDLED - set(NATURAL_KEY_HANDLERS.keys())
    assert not missing, f"Missing handlers: {missing}"


def test_classify_cardio_type_settings():
    assert classify_constraint("main", "cardio_type_settings", ("user_id", "type")) == (
        TableImportClass.user_scoped
    )
    assert classify_constraint("main", "cloud_tokens", ("user_id", "provider")) == (
        TableImportClass.cloud_auth
    )


def test_assert_safe_blocks_cardio_type_settings():
    with pytest.raises(RuntimeError, match="cardio_type_settings"):
        assert_safe_main_table_import("cardio_type_settings")


def test_cardio_type_settings_upsert_and_remap():
    conn = sqlite3.connect(":memory:")
    _create_cardio_type_settings(conn)
    conn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order, updated_at)
        VALUES (1, 'бег', 1, 2, '2026-01-01 00:00:00')
        """
    )
    conn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order, updated_at)
        VALUES (99, 'бег', 0, 5, '2026-06-01 00:00:00')
        """
    )
    conn.commit()

    stats = _remap_cardio_type_settings_user_ids(conn, 1, [99])
    assert stats.get("updated", 0) + stats.get("merged", 0) >= 1
    row = conn.execute(
        "SELECT is_active, sort_order FROM cardio_type_settings WHERE user_id=1 AND type='бег'"
    ).fetchone()
    assert row is not None
    assert int(row[0]) == 0
    assert int(row[1]) == 5
    assert (
        conn.execute("SELECT COUNT(*) FROM cardio_type_settings WHERE user_id=99").fetchone()[0]
        == 0
    )


def test_multi_table_merge_staging(tmp_path):
    target = tmp_path / "target.db"
    staging = tmp_path / "staging.db"
    tconn = sqlite3.connect(target)
    _create_steps(tconn)
    _create_cardio_type_settings(tconn)
    _create_hr_meta(tconn)
    tconn.execute(
        "INSERT INTO steps_history (user_id, date, steps) VALUES (1, '2026-06-01', 100)"
    )
    tconn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order, updated_at)
        VALUES (1, 'бег', 1, 0, '2026-01-01')
        """
    )
    tconn.commit()
    tconn.close()

    sconn = sqlite3.connect(staging)
    _create_steps(sconn)
    _create_cardio_type_settings(sconn)
    _create_hr_meta(sconn)
    sconn.execute(
        "INSERT INTO steps_history (user_id, date, steps) VALUES (99, '2026-06-01', 5000)"
    )
    sconn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order, updated_at)
        VALUES (99, 'бег', 0, 9, '2026-06-02')
        """
    )
    sconn.execute(
        """
        INSERT INTO strength_hr_session_meta (user_id, workout_date, workout_title)
        VALUES (99, '2026-06-01', 'Legs')
        """
    )
    sconn.commit()
    sconn.close()

    conn = sqlite3.connect(target)
    conn.execute("ATTACH DATABASE ? AS import_main", (str(staging.resolve()),))
    for table in ("steps_history", "cardio_type_settings"):
        merge_table_from_staging(conn, table, target_user_id=1, import_uid=99)
    conn.commit()
    steps = conn.execute(
        "SELECT steps FROM steps_history WHERE user_id=1 AND date='2026-06-01'"
    ).fetchone()[0]
    assert int(steps) == 5000
    active = conn.execute(
        "SELECT is_active FROM cardio_type_settings WHERE user_id=1 AND type='бег'"
    ).fetchone()[0]
    assert int(active) == 0
    conn.close()


def _create_account_warmup_checkpoint(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE account_warmup_checkpoint (
            user_id INTEGER PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'idle',
            mode TEXT,
            task_id TEXT,
            cursor_json TEXT,
            processed_units INTEGER NOT NULL DEFAULT 0,
            total_units INTEGER NOT NULL DEFAULT 0,
            started_at TEXT,
            updated_at TEXT,
            completed_at TEXT,
            last_error TEXT
        )
        """
    )


def test_scan_inline_user_id_primary_key():
    conn = sqlite3.connect(":memory:")
    _create_account_warmup_checkpoint(conn)
    found = scan_unique_constraints(conn, schemas=("main",))
    keys = [
        c.columns
        for c in found
        if c.table == "account_warmup_checkpoint" and c.import_class == TableImportClass.user_scoped
    ]
    assert ("user_id",) in keys


def test_checkpoint_remap_merge_no_unique():
    conn = sqlite3.connect(":memory:")
    _create_account_warmup_checkpoint(conn)
    conn.execute(
        """
        INSERT INTO account_warmup_checkpoint (
            user_id, status, processed_units, total_units, updated_at
        ) VALUES (1, 'running', 10, 100, '2026-01-01 00:00:00')
        """
    )
    conn.execute(
        """
        INSERT INTO account_warmup_checkpoint (
            user_id, status, processed_units, total_units, updated_at
        ) VALUES (99, 'completed', 50, 100, '2026-06-03 12:00:00')
        """
    )
    conn.commit()

    stats = _remap_account_warmup_checkpoint_user_ids(conn, 1, [99])
    assert stats.get("updated", 0) + stats.get("merged", 0) + stats.get("imported", 0) >= 1
    row = conn.execute(
        "SELECT status, processed_units FROM account_warmup_checkpoint WHERE user_id=1"
    ).fetchone()
    assert row is not None
    assert str(row[0]) == "completed"
    assert int(row[1]) == 50
    assert (
        conn.execute(
            "SELECT COUNT(*) FROM account_warmup_checkpoint WHERE user_id=99"
        ).fetchone()[0]
        == 0
    )
    assert conn.execute("SELECT COUNT(*) FROM account_warmup_checkpoint").fetchone()[0] == 1


def test_preflight_blocks_empty_table_without_handler(tmp_path):
    staging_w = tmp_path / "workouts.db"
    staging_s = tmp_path / "shared.db"
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        CREATE TABLE mystery_singleton (
            user_id INTEGER PRIMARY KEY,
            value TEXT
        )
        """
    )
    conn.commit()
    conn.close()
    sconn = sqlite3.connect(staging_s)
    sconn.execute("CREATE TABLE _m (v TEXT)")
    sconn.commit()
    sconn.close()

    with pytest.raises(ImportPreflightError) as excinfo:
        run_import_preflight(
            staging_w,
            staging_s,
            target_user_id=1,
            mode="replace",
        )
    assert "mystery_singleton" in str(excinfo.value)
    assert "mystery_singleton" in excinfo.value.report["tables_blocked"]


def test_preflight_blocks_missing_handler(tmp_path):
    staging_w = tmp_path / "workouts.db"
    staging_s = tmp_path / "shared.db"
    conn = sqlite3.connect(staging_w)
    conn.execute(
        """
        CREATE TABLE mystery_settings (
            user_id INTEGER NOT NULL,
            code TEXT NOT NULL,
            value TEXT,
            PRIMARY KEY (user_id, code)
        )
        """
    )
    conn.execute("INSERT INTO mystery_settings VALUES (99, 'x', '1')")
    conn.commit()
    conn.close()
    sconn = sqlite3.connect(staging_s)
    sconn.execute("CREATE TABLE _m (v TEXT)")
    sconn.commit()
    sconn.close()

    with pytest.raises(ImportPreflightError) as excinfo:
        run_import_preflight(
            staging_w,
            staging_s,
            target_user_id=1,
            mode="replace",
        )
    assert "mystery_settings" in str(excinfo.value)
    assert excinfo.value.report["tables_blocked"]


def test_preflight_ok_with_handlers(tmp_path):
    staging_w = tmp_path / "workouts.db"
    staging_s = tmp_path / "shared.db"
    conn = sqlite3.connect(staging_w)
    _create_cardio_type_settings(conn)
    _create_steps(conn)
    conn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order)
        VALUES (99, 'бег', 1, 0)
        """
    )
    conn.commit()
    conn.close()
    sconn = sqlite3.connect(staging_s)
    sconn.execute("CREATE TABLE food_products (id INTEGER PRIMARY KEY, name TEXT UNIQUE)")
    sconn.commit()
    sconn.close()

    report = run_import_preflight(
        staging_w,
        staging_s,
        target_user_id=1,
        mode="replace",
    )
    assert report["ok"] is True
    assert "cardio_type_settings" in report["tables_upsert"]
    assert report["tables_blocked"] == []


def test_cardio_repeat_import_idempotent():
    conn = sqlite3.connect(":memory:")
    _create_cardio_type_settings(conn)
    row = {
        "user_id": 1,
        "type": "бег",
        "is_active": 1,
        "sort_order": 2,
        "updated_at": "2026-06-03 12:00:00",
    }
    assert _upsert_cardio_type_settings_row(conn, row) == "imported"
    stored = conn.execute(
        """
        SELECT is_active, sort_order, updated_at
        FROM cardio_type_settings WHERE user_id=1 AND type='бег'
        """
    ).fetchone()
    row["is_active"] = stored[0]
    row["sort_order"] = stored[1]
    row["updated_at"] = stored[2]
    assert _upsert_cardio_type_settings_row(conn, row) == "skipped_identical"
    assert (
        conn.execute("SELECT COUNT(*) FROM cardio_type_settings").fetchone()[0] == 1
    )


def test_all_singletons_have_handlers():
    for table in SINGLETON_USER_SCOPED_TABLES:
        if table == "user_profile":
            continue
        assert has_user_scoped_handler(table), f"Missing handler for singleton {table}"


def test_preflight_lists_required_handlers_includes_checkpoint(tmp_path):
    staging_w = tmp_path / "workouts.db"
    staging_s = tmp_path / "shared.db"
    conn = sqlite3.connect(staging_w)
    _create_account_warmup_checkpoint(conn)
    conn.commit()
    conn.close()
    sconn = sqlite3.connect(staging_s)
    sconn.execute("CREATE TABLE food_products (id INTEGER PRIMARY KEY, name TEXT UNIQUE)")
    sconn.commit()
    sconn.close()

    report = run_import_preflight(
        staging_w,
        staging_s,
        target_user_id=1,
        mode="replace",
    )
    assert "account_warmup_checkpoint" in report["tables_required_handlers"]
    assert "account_warmup_checkpoint" in report["tables_singleton"]
    assert "account_warmup_checkpoint" in report["tables_upsert"]


def test_row_dict_tuple_and_sqlite_row():
    from backend.services.db_import_merge_common import row_dict

    cols = ["user_id", "date", "steps"]
    assert row_dict((1, "2026-01-01", 100), cols) == {
        "user_id": 1,
        "date": "2026-01-01",
        "steps": 100,
    }

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT 1 AS user_id, '2026-01-01' AS date, 50 AS steps").fetchone()
    assert row_dict(row, cols) == {"user_id": 1, "date": "2026-01-01", "steps": 50}


def test_remap_body_metrics_second_source_after_upsert_clears_factory():
    """Regression: upsert must not leave row_factory=None on a Row-configured conn."""
    from backend.services.db_import_natural_merge import _remap_body_metrics_user_ids

    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.execute(
        """
        CREATE TABLE body_metrics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            weight REAL,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.execute(
        "INSERT INTO body_metrics (user_id, date, weight) VALUES (5, '2026-01-01', 70.0)"
    )
    conn.execute(
        "INSERT INTO body_metrics (user_id, date, weight) VALUES (6, '2026-01-02', 71.0)"
    )
    conn.commit()

    stats = _remap_body_metrics_user_ids(conn, target_user_id=1, source_user_ids=[5, 6])
    assert stats["imported"] + stats["updated"] + stats["merged"] >= 2
    assert conn.row_factory == sqlite3.Row

    user_ids = {
        int(r[0])
        for r in conn.execute("SELECT DISTINCT user_id FROM body_metrics").fetchall()
    }
    assert user_ids == {1}


def test_merge_steps_history_staging_tuple_rows():
    """Large DB merge path uses default tuple rows from fetchall()."""
    from backend.services.db_import_natural_merge import _merge_steps_history_from_staging

    conn = sqlite3.connect(":memory:")
    conn.execute("ATTACH DATABASE ':memory:' AS import_main")
    conn.executescript(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT,
            updated_at TEXT,
            UNIQUE(user_id, date)
        );
        CREATE TABLE import_main.steps_history (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            step_length_m REAL,
            source TEXT,
            updated_at TEXT
        );
        """
    )
    conn.execute(
        "INSERT INTO import_main.steps_history (user_id, date, steps, source) VALUES (9, '2026-03-01', 1000, 'import')"
    )
    conn.commit()

    stats = _merge_steps_history_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats["imported"] >= 1
    row = conn.execute(
        "SELECT steps FROM steps_history WHERE user_id=1 AND date='2026-03-01'"
    ).fetchone()
    assert row is not None and int(row[0]) == 1000


def test_registered_dedupe_handlers_match_dispatcher_signature():
    """Every NATURAL_KEY_HANDLERS dedupe fn must accept (conn, ImportDedupeContext)."""
    import inspect

    from backend.services.db_import_merge_common import ImportDedupeContext
    from backend.services.db_import_natural_merge import NATURAL_KEY_HANDLERS

    for table, handlers in NATURAL_KEY_HANDLERS.items():
        dedupe_fn = handlers[2]
        if dedupe_fn is None:
            continue
        sig = inspect.signature(dedupe_fn)
        params = list(sig.parameters.values())
        assert len(params) == 2, f"{table}: expected (conn, ctx), got {sig}"
        assert params[0].name == "conn"
        assert params[1].name == "ctx"
        ann = params[1].annotation
        assert ann in (inspect.Parameter.empty, ImportDedupeContext, "ImportDedupeContext")


def test_post_import_dedupe_body_metrics_without_id_column():
    """Regression: legacy body_metrics has user_id+date UK but no surrogate id."""
    from backend.services.db_import_merge_common import ImportDedupeContext
    from backend.services.db_import_natural_merge import (
        dedupe_body_metrics_sql,
        post_import_dedupe_table,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE body_metrics (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            weight REAL
        )
        """
    )
    conn.executemany(
        "INSERT INTO body_metrics (user_id, date, weight) VALUES (?, ?, ?)",
        [(1, "2026-01-01", 70.0), (1, "2026-01-01", 71.0)],
    )
    conn.commit()

    removed = dedupe_body_metrics_sql(conn, ImportDedupeContext(user_id=1))
    assert removed == 1
    assert conn.execute("SELECT COUNT(*) FROM body_metrics").fetchone()[0] == 1

    conn.executemany(
        "INSERT INTO body_metrics (user_id, date, weight) VALUES (?, ?, ?)",
        [(1, "2026-01-03", 72.0), (1, "2026-01-03", 73.0)],
    )
    conn.commit()
    assert post_import_dedupe_table(conn, "body_metrics", user_id=1) == 1


def test_cardio_type_settings_merge_without_updated_at_idempotent():
    """Legacy cardio_type_settings may lack updated_at; SQL must not reference it."""
    from backend.services.db_import_conflict_handlers import (
        _merge_cardio_type_settings_from_staging,
        _remap_cardio_type_settings_user_ids,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute("ATTACH DATABASE ':memory:' AS import_main")
    conn.executescript(
        """
        CREATE TABLE cardio_type_settings (
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, type)
        );
        CREATE TABLE import_main.cardio_type_settings (
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0
        );
        """
    )
    conn.execute(
        """
        INSERT INTO import_main.cardio_type_settings (user_id, type, is_active, sort_order)
        VALUES (9, 'бег', 1, 2)
        """
    )
    conn.execute(
        """
        INSERT INTO cardio_type_settings (user_id, type, is_active, sort_order)
        VALUES (5, 'бег', 0, 1)
        """
    )
    conn.commit()

    stats = _merge_cardio_type_settings_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats["imported"] + stats["updated"] + stats["merged"] >= 1
    row = conn.execute(
        "SELECT is_active, sort_order FROM cardio_type_settings WHERE user_id=1 AND type='бег'"
    ).fetchone()
    assert int(row[0]) == 1 and int(row[1]) == 2

    stats2 = _merge_cardio_type_settings_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats2["skipped_identical"] >= 1

    remap = _remap_cardio_type_settings_user_ids(conn, 1, [5])
    assert remap["imported"] + remap["updated"] >= 0
    assert conn.execute("SELECT COUNT(*) FROM cardio_type_settings").fetchone()[0] >= 1


def test_steps_history_legacy_date_unique_no_recursion():
    """Legacy UNIQUE(date) only: upsert must find row by date, not recurse."""
    from backend.services.db_import_natural_merge import _upsert_steps_history_row

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE steps_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL UNIQUE,
            steps INTEGER NOT NULL,
            user_id INTEGER NOT NULL DEFAULT 1,
            source TEXT DEFAULT 'excel_archive'
        )
        """
    )
    conn.execute(
        "INSERT INTO steps_history (date, steps, user_id, source) VALUES ('2026-01-01', 5000, 5, 'old')"
    )
    conn.commit()

    result = _upsert_steps_history_row(
        conn,
        {
            "user_id": 1,
            "date": "2026-01-01",
            "steps": 8000,
            "source": "import",
        },
    )
    assert result in ("merged", "updated", "imported")
    row = conn.execute(
        "SELECT user_id, steps, source FROM steps_history WHERE date='2026-01-01'"
    ).fetchone()
    assert int(row[0]) == 1
    assert int(row[1]) == 8000
    assert row[2] == "import"

    again = _upsert_steps_history_row(
        conn,
        {
            "user_id": 1,
            "date": "2026-01-01",
            "steps": 8000,
            "source": "import",
        },
    )
    assert again == "skipped_identical"


def test_schema_helpers_has_column_and_get_table_columns():
    from backend.services.db_import_merge_common import (
        get_table_columns,
        has_column,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE t_legacy (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            value REAL
        )
        """
    )
    cols = get_table_columns(conn, "main", "t_legacy")
    assert "date" in cols
    assert "updated_at" not in cols
    assert has_column(conn, "main", "t_legacy", "date") is True
    assert has_column(conn, "main", "t_legacy", "updated_at") is False


def test_workout_presets_merge_without_updated_at_no_sql_reference():
    from backend.services.db_import_conflict_handlers import _upsert_workout_presets_row

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE workout_presets (
            user_id INTEGER NOT NULL,
            name TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            PRIMARY KEY (user_id, name)
        )
        """
    )
    conn.execute(
        "INSERT INTO workout_presets (user_id, name, is_active, sort_order) VALUES (1, 'Legs', 0, 1)"
    )
    conn.commit()

    result = _upsert_workout_presets_row(
        conn,
        {"user_id": 1, "name": "Legs", "is_active": 1, "sort_order": 5},
    )
    assert result == "updated"
    row = conn.execute(
        "SELECT is_active, sort_order FROM workout_presets WHERE user_id=1 AND name='Legs'"
    ).fetchone()
    assert int(row[0]) == 1 and int(row[1]) == 5

    again = _upsert_workout_presets_row(
        conn,
        {"user_id": 1, "name": "Legs", "is_active": 1, "sort_order": 5},
    )
    assert again == "skipped_identical"


def test_menstrual_cycle_log_without_updated_at():
    from backend.services.db_import_conflict_handlers import (
        _merge_menstrual_cycle_log_from_staging,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute("ATTACH DATABASE ':memory:' AS import_main")
    conn.executescript(
        """
        CREATE TABLE menstrual_cycle_log (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            flow_intensity TEXT,
            symptoms TEXT,
            PRIMARY KEY (user_id, date)
        );
        CREATE TABLE import_main.menstrual_cycle_log (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            flow_intensity TEXT,
            symptoms TEXT
        );
        """
    )
    conn.execute(
        """
        INSERT INTO import_main.menstrual_cycle_log (user_id, date, flow_intensity, symptoms)
        VALUES (9, '2026-06-01', 'medium', 'cramps')
        """
    )
    conn.commit()

    stats = _merge_menstrual_cycle_log_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats["imported"] >= 1
    row = conn.execute(
        "SELECT flow_intensity FROM menstrual_cycle_log WHERE user_id=1 AND date='2026-06-01'"
    ).fetchone()
    assert row[0] == "medium"

    stats2 = _merge_menstrual_cycle_log_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats2["skipped_identical"] >= 1


def test_cardio_type_settings_merge_without_id_idempotent():
    from backend.services.db_import_conflict_handlers import (
        _merge_cardio_type_settings_from_staging,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute("ATTACH DATABASE ':memory:' AS import_main")
    conn.executescript(
        """
        CREATE TABLE cardio_type_settings (
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT,
            PRIMARY KEY (user_id, type)
        );
        CREATE TABLE import_main.cardio_type_settings (
            user_id INTEGER NOT NULL,
            type TEXT NOT NULL,
            is_active INTEGER DEFAULT 1,
            sort_order INTEGER DEFAULT 0,
            updated_at TEXT
        );
        """
    )
    conn.execute(
        """
        INSERT INTO import_main.cardio_type_settings
            (user_id, type, is_active, sort_order, updated_at)
        VALUES (9, 'бег', 1, 1, '2026-06-01 10:00:00')
        """
    )
    conn.commit()

    stats1 = _merge_cardio_type_settings_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats1["imported"] == 1
    stats2 = _merge_cardio_type_settings_from_staging(
        conn, target_user_id=1, import_uid=9, import_schema="import_main"
    )
    assert stats2["skipped_identical"] == 1
    assert conn.execute("SELECT COUNT(*) FROM cardio_type_settings").fetchone()[0] == 1


def test_account_warmup_checkpoint_remap_without_id():
    from backend.services.db_import_conflict_handlers import (
        _remap_account_warmup_checkpoint_user_ids,
    )

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE account_warmup_checkpoint (
            user_id INTEGER PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'idle',
            mode TEXT,
            updated_at TEXT
        )
        """
    )
    conn.execute(
        """
        INSERT INTO account_warmup_checkpoint (user_id, status, mode, updated_at)
        VALUES (5, 'running', 'light', '2026-06-01')
        """
    )
    conn.commit()

    stats = _remap_account_warmup_checkpoint_user_ids(
        conn, target_user_id=1, source_user_ids=[5]
    )
    assert stats["imported"] + stats["updated"] >= 1
    row = conn.execute(
        "SELECT user_id, status FROM account_warmup_checkpoint"
    ).fetchone()
    assert int(row[0]) == 1 and row[1] == "running"
    assert conn.execute("SELECT COUNT(*) FROM account_warmup_checkpoint").fetchone()[0] == 1


def test_all_registered_dedupe_handlers_run_without_id_sql_error():
    from backend.services.db_import_merge_common import ImportDedupeContext
    from backend.services.db_import_natural_merge import NATURAL_KEY_HANDLERS

    conn = sqlite3.connect(":memory:")
    conn.execute(
        """
        CREATE TABLE steps_history (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            steps INTEGER NOT NULL,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE body_metrics (
            user_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            UNIQUE(user_id, date)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE strength_hr_session_meta (
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            updated_at TEXT,
            UNIQUE(user_id, workout_date, workout_title)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE strength_hr_block_mappings (
            user_id INTEGER NOT NULL,
            workout_date TEXT NOT NULL,
            workout_title TEXT NOT NULL,
            block_index INTEGER NOT NULL,
            updated_at TEXT,
            UNIQUE(user_id, workout_date, workout_title, block_index)
        )
        """
    )
    conn.commit()
    ctx = ImportDedupeContext(user_id=1)
    for table, handlers in NATURAL_KEY_HANDLERS.items():
        dedupe_fn = handlers[2]
        if dedupe_fn is None:
            continue
        dedupe_fn(conn, ctx)


