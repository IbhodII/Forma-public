# -*- coding: utf-8 -*-
"""Dev-only: build a small SQLite snapshot (workouts.db + shared.db) for import testing."""
from __future__ import annotations

import json
import logging
import shutil
import sqlite3
import tempfile
import uuid
import zipfile
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from database.connection import DATA_ROOT, SHARED_DB_PATH, WORKOUTS_DB_PATH

logger = logging.getLogger("mini_database")

MINI_DB_EXPORT_DIR = DATA_ROOT / "mini-db-exports"
ZIP_FORMAT = "forma_db_zip_v1"

STRENGTH_SESSION_LIMIT = 8
CARDIO_DAYS = 30
BODY_DAYS = 30
FOOD_DAYS = 7
WELLNESS_DAYS = 7


@dataclass
class MiniDbBuildReport:
    user_id: int
    source_workouts_bytes: int
    source_shared_bytes: int
    workouts_bytes: int
    shared_bytes: int
    zip_bytes: int
    row_counts: dict[str, int] = field(default_factory=dict)
    strength_sessions: list[dict[str, str]] = field(default_factory=list)
    checks: list[dict[str, Any]] = field(default_factory=list)
    ok: bool = True
    errors: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "user_id": self.user_id,
            "source_workouts_bytes": self.source_workouts_bytes,
            "source_shared_bytes": self.source_shared_bytes,
            "workouts_bytes": self.workouts_bytes,
            "shared_bytes": self.shared_bytes,
            "zip_bytes": self.zip_bytes,
            "row_counts": dict(self.row_counts),
            "strength_sessions": list(self.strength_sessions),
            "checks": list(self.checks),
            "errors": list(self.errors),
        }


def mini_db_exports_dir() -> Path:
    MINI_DB_EXPORT_DIR.mkdir(parents=True, exist_ok=True)
    return MINI_DB_EXPORT_DIR


def _now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _table_exists(conn: sqlite3.Connection, schema: str, table: str) -> bool:
    if schema == "main":
        row = conn.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table,),
        ).fetchone()
    else:
        row = conn.execute(
            f"SELECT 1 FROM {schema}.sqlite_master WHERE type='table' AND name=? LIMIT 1",
            (table,),
        ).fetchone()
    return row is not None


def _pragma_cols(conn: sqlite3.Connection, schema: str, table: str) -> list[str]:
    prefix = f"{schema}." if schema != "main" else ""
    rows = conn.execute(f"PRAGMA {prefix}table_info({table})").fetchall()
    return [str(r[1]) for r in rows]


def _copy_rows(
    dest: sqlite3.Connection,
    src_schema: str,
    dest_schema: str,
    table: str,
    where_sql: str,
    params: tuple[Any, ...],
) -> int:
    if not _table_exists(dest, dest_schema, table) or not _table_exists(dest, src_schema, table):
        return 0
    dest_qual = table if dest_schema == "main" else f"{dest_schema}.{table}"
    src_qual = f"{src_schema}.{table}"
    live_cols = set(_pragma_cols(dest, dest_schema, table))
    imp_cols = [c for c in _pragma_cols(dest, src_schema, table) if c in live_cols]
    if not imp_cols:
        return 0
    col_sql = ", ".join(imp_cols)
    before = dest.total_changes
    dest.execute(
        f"INSERT OR REPLACE INTO {dest_qual} ({col_sql}) "
        f"SELECT {col_sql} FROM {src_qual} WHERE {where_sql}",
        params,
    )
    return dest.total_changes - before


def _iso_cutoff(days: int) -> str:
    return (date.today() - timedelta(days=int(days))).isoformat()


def _strength_session_keys(
    src: sqlite3.Connection, user_id: int, limit: int
) -> list[tuple[str, str]]:
    if not _table_exists(src, "src_w", "strength_workouts"):
        return []
    rows = src.execute(
        """
        SELECT date, workout_title
        FROM src_w.strength_workouts
        WHERE user_id = ?
          AND COALESCE(deleted_at, '') = ''
        GROUP BY date, workout_title
        ORDER BY date DESC, workout_title DESC
        LIMIT ?
        """,
        (int(user_id), int(limit)),
    ).fetchall()
    return [(str(r[0])[:10], str(r[1] or "")) for r in rows]


def _session_predicate(keys: list[tuple[str, str]]) -> tuple[str, tuple[Any, ...]]:
    if not keys:
        return "0", ()
    parts: list[str] = []
    params: list[Any] = []
    for d, title in keys:
        parts.append("(date = ? AND workout_title = ?)")
        params.extend([d, title])
    return f"({' OR '.join(parts)})", tuple(params)


def _list_tables(conn: sqlite3.Connection, schema: str = "main") -> list[str]:
    if schema == "main":
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    else:
        rows = conn.execute(
            f"SELECT name FROM {schema}.sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        ).fetchall()
    return [str(r[0]) for r in rows]


def _clear_database_tables(db_path: Path) -> None:
    """Remove all rows; keep schema intact (after file copy)."""
    conn = sqlite3.connect(str(db_path), timeout=60.0)
    try:
        conn.execute("PRAGMA foreign_keys = OFF")
        for table in reversed(_list_tables(conn, "main")):
            try:
                conn.execute(f"DELETE FROM {table}")
            except sqlite3.Error:
                pass
        conn.commit()
    finally:
        conn.close()


def _prepare_dest_shell(
    dest_root: Path,
    *,
    source_workouts: Path,
    source_shared: Path,
) -> tuple[Path, Path]:
    """Clone schema from live DB files, then wipe rows (original files untouched)."""
    dest_root.mkdir(parents=True, exist_ok=True)
    dest_w = dest_root / "workouts.db"
    dest_s = dest_root / "shared.db"
    shutil.copy2(source_workouts, dest_w)
    shutil.copy2(source_shared, dest_s)
    _clear_database_tables(dest_w)
    _clear_database_tables(dest_s)
    return dest_w, dest_s


def _copy_workouts_db(
    *,
    src_workouts: Path,
    src_shared: Path,
    dest_workouts: Path,
    user_id: int,
    report: MiniDbBuildReport,
) -> None:
    uid = int(user_id)
    cardio_cutoff = _iso_cutoff(CARDIO_DAYS)
    body_cutoff = _iso_cutoff(BODY_DAYS)
    food_cutoff = _iso_cutoff(FOOD_DAYS)
    wellness_cutoff = _iso_cutoff(WELLNESS_DAYS)

    dest = sqlite3.connect(str(dest_workouts), timeout=60.0)
    dest.execute("PRAGMA foreign_keys = OFF")
    try:
        dest.execute("ATTACH DATABASE ? AS src_w", (str(src_workouts.resolve()),))
        session_keys = _strength_session_keys(dest, uid, STRENGTH_SESSION_LIMIT)
        report.strength_sessions = [
            {"date": d, "workout_title": t} for d, t in session_keys
        ]
        sess_pred, sess_params = _session_predicate(session_keys)

        if _table_exists(dest, "src_w", "users"):
            _copy_rows(dest, "src_w", "main", "users", "id = ?", (uid,))

        if _table_exists(dest, "src_w", "user_profile"):
            _copy_rows(dest, "src_w", "main", "user_profile", "user_id = ?", (uid,))

        from backend.services.db_import_natural_merge import (
            NATURAL_KEY_HANDLERS,
            copy_natural_key_rows_from_attached,
        )

        for table in (
            "workout_presets",
            "preset_exercises",
            "preset_sets",
            "workout_exercise_template",
            "exercise_sets",
            "exercise_set_items",
            "cardio_type_settings",
            "daily_nutrition_goals",
            "nutrition_plan",
            "bike_settings",
            "menstrual_cycle_settings",
            "menstrual_cycle_log",
            "account_warmup_daily_cache",
        ):
            if _table_exists(dest, "src_w", table):
                cols = _pragma_cols(dest, "src_w", table)
                if "user_id" in cols:
                    if table in NATURAL_KEY_HANDLERS:
                        n = copy_natural_key_rows_from_attached(
                            dest,
                            table,
                            src_schema="src_w",
                            dest_schema="main",
                            where_sql="user_id = ?",
                            params=(uid,),
                            target_user_id=uid,
                        )
                    else:
                        n = _copy_rows(dest, "src_w", "main", table, "user_id = ?", (uid,))
                    report.row_counts[table] = report.row_counts.get(table, 0) + n

        if session_keys and _table_exists(dest, "src_w", "strength_workouts"):
            n = _copy_rows(
                dest,
                "src_w",
                "main",
                "strength_workouts",
                f"user_id = ? AND {sess_pred}",
                (uid, *sess_params),
            )
            report.row_counts["strength_workouts"] = n

        for table in ("strength_hr_session_meta", "strength_hr_block_mappings"):
            if session_keys and _table_exists(dest, "src_w", table):
                cols = _pragma_cols(dest, "src_w", table)
                if {"workout_date", "workout_title"}.issubset(cols):
                    date_title_pred = sess_pred.replace("date", "workout_date")
                    n = _copy_rows(
                        dest,
                        "src_w",
                        "main",
                        table,
                        f"user_id = ? AND {date_title_pred}",
                        (uid, *sess_params),
                    )
                    report.row_counts[table] = n

        cardio_ids: list[int] = []
        if _table_exists(dest, "src_w", "cardio_workouts"):
            rows = dest.execute(
                """
                SELECT id FROM src_w.cardio_workouts
                WHERE user_id = ? AND date >= ?
                ORDER BY date DESC
                """,
                (uid, cardio_cutoff),
            ).fetchall()
            cardio_ids = [int(r[0]) for r in rows if r[0] is not None]
            if cardio_ids:
                placeholders = ", ".join("?" * len(cardio_ids))
                n = _copy_rows(
                    dest,
                    "src_w",
                    "main",
                    "cardio_workouts",
                    f"user_id = ? AND id IN ({placeholders})",
                    (uid, *cardio_ids),
                )
                report.row_counts["cardio_workouts"] = n

        if cardio_ids:
            ph = ", ".join("?" * len(cardio_ids))
            for table, col in (
                ("workout_heart_rate", "cardio_workout_id"),
                ("workout_sensors", "cardio_workout_id"),
                ("gps_tracks", "cardio_workout_id"),
            ):
                if _table_exists(dest, "src_w", table) and col in _pragma_cols(dest, "src_w", table):
                    n = _copy_rows(
                        dest,
                        "src_w",
                        "main",
                        table,
                        f"{col} IN ({ph})",
                        tuple(cardio_ids),
                    )
                    report.row_counts[table] = report.row_counts.get(table, 0) + n

        for table, date_col in (
            ("body_metrics", "date"),
            ("daily_weight", "date"),
            ("food_entries", "date"),
            ("steps_history", "date"),
            ("daily_bracelet_calories", "date"),
            ("sleep_data", "date"),
            ("passive_heart_rate_samples", "date"),
        ):
            if not _table_exists(dest, "src_w", table):
                continue
            cols = _pragma_cols(dest, "src_w", table)
            if "user_id" not in cols or date_col not in cols:
                continue
            cutoff = (
                wellness_cutoff
                if table
                in (
                    "steps_history",
                    "daily_bracelet_calories",
                    "sleep_data",
                    "passive_heart_rate_samples",
                )
                else body_cutoff
                if table in ("body_metrics", "daily_weight")
                else food_cutoff
            )
            if table == "passive_heart_rate_samples" and "recorded_at" in cols:
                where_sql = "user_id = ? AND recorded_at >= ?"
            else:
                where_sql = f"user_id = ? AND {date_col} >= ?"
            from backend.services.db_import_natural_merge import (
                NATURAL_KEY_HANDLERS,
                copy_natural_key_rows_from_attached,
            )

            if table in NATURAL_KEY_HANDLERS:
                n = copy_natural_key_rows_from_attached(
                    dest,
                    table,
                    src_schema="src_w",
                    dest_schema="main",
                    where_sql=where_sql,
                    params=(uid, cutoff),
                    target_user_id=uid,
                )
            else:
                n = _copy_rows(
                    dest,
                    "src_w",
                    "main",
                    table,
                    where_sql,
                    (uid, cutoff),
                )
            report.row_counts[table] = report.row_counts.get(table, 0) + n

        dest.commit()
    finally:
        try:
            dest.execute("DETACH src_w")
        except sqlite3.Error:
            pass
        dest.close()


def _collect_food_product_ids(dest_workouts: Path, user_id: int) -> set[int]:
    conn = sqlite3.connect(str(dest_workouts))
    try:
        if not _table_exists(conn, "main", "food_entries"):
            return set()
        rows = conn.execute(
            """
            SELECT DISTINCT product_id FROM food_entries
            WHERE user_id = ? AND product_id IS NOT NULL
            """,
            (int(user_id),),
        ).fetchall()
        return {int(r[0]) for r in rows if r[0] is not None}
    finally:
        conn.close()


def _copy_shared_db(
    *,
    src_shared: Path,
    dest_shared: Path,
    product_ids: set[int],
    report: MiniDbBuildReport,
) -> None:
    dest = sqlite3.connect(str(dest_shared), timeout=60.0)
    try:
        dest.execute("ATTACH DATABASE ? AS src_s", (str(src_shared.resolve()),))
        from database.connection import _SHARED_COPY_PARENTS, _SHARED_COPY_CHILDREN

        for table in _SHARED_COPY_PARENTS:
            if not _table_exists(dest, "src_s", table):
                continue
            if table == "food_products" and product_ids:
                ph = ", ".join("?" * len(product_ids))
                n = _copy_rows(dest, "src_s", "main", table, f"id IN ({ph})", tuple(product_ids))
            else:
                n = _copy_rows(dest, "src_s", "main", table, "1=1", ())
            report.row_counts[f"shared.{table}"] = report.row_counts.get(f"shared.{table}", 0) + n

        if product_ids and _table_exists(dest, "src_s", "food_product_components"):
            ph = ", ".join("?" * len(product_ids))
            n = _copy_rows(
                dest,
                "src_s",
                "main",
                "food_product_components",
                f"product_id IN ({ph})",
                tuple(product_ids),
            )
            report.row_counts["shared.food_product_components"] = n

        for table in _SHARED_COPY_CHILDREN:
            if table == "food_product_components":
                continue
            if _table_exists(dest, "src_s", table):
                n = _copy_rows(dest, "src_s", "main", table, "1=1", ())
                report.row_counts[f"shared.{table}"] = report.row_counts.get(f"shared.{table}", 0) + n

        for table in ("stretching_exercises", "tire_coefficients", "surface_multipliers"):
            if _table_exists(dest, "src_s", table):
                n = _copy_rows(dest, "src_s", "main", table, "1=1", ())
                report.row_counts[f"shared.{table}"] = n

        dest.commit()
    finally:
        try:
            dest.execute("DETACH src_s")
        except sqlite3.Error:
            pass
        dest.close()


def _verify_mini_databases(workouts: Path, shared: Path, user_id: int) -> list[dict[str, Any]]:
    checks: list[dict[str, Any]] = []
    uid = int(user_id)

    def add(check_id: str, label: str, ok: bool, detail: str = "", error: str = "") -> None:
        checks.append(
            {
                "id": check_id,
                "label": label,
                "ok": ok,
                "detail": detail or None,
                "error": error or None,
            }
        )

    if not workouts.is_file() or not shared.is_file():
        add("files", "Файлы mini DB", False, error="workouts.db или shared.db отсутствуют")
        return checks

    conn = sqlite3.connect(str(workouts), timeout=30.0)
    try:
        conn.execute("ATTACH DATABASE ? AS shared", (str(shared.resolve()),))
        row = conn.execute("PRAGMA quick_check").fetchone()
        ok = str(row[0]).lower() == "ok" if row else False
        add("integrity_main", "PRAGMA quick_check (workouts)", ok, detail=str(row[0]) if row else "")
        srow = conn.execute("PRAGMA shared.quick_check").fetchone()
        sok = str(srow[0]).lower() == "ok" if srow else False
        add("integrity_shared", "PRAGMA shared.quick_check", sok, detail=str(srow[0]) if srow else "")

        sw = conn.execute(
            "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ?",
            (uid,),
        ).fetchone()[0]
        add(
            "strength",
            "Силовые тренировки",
            int(sw) > 0,
            detail=f"строк: {int(sw)}",
        )

        fe = conn.execute(
            "SELECT COUNT(*) FROM food_entries WHERE user_id = ?",
            (uid,),
        ).fetchone()[0]
        fp = conn.execute("SELECT COUNT(*) FROM shared.food_products").fetchone()[0]
        add(
            "nutrition",
            "Питание",
            int(fe) > 0 and int(fp) > 0,
            detail=f"записей: {int(fe)}, продуктов: {int(fp)}",
        )

        bw = 0
        if _table_exists(conn, "main", "daily_weight"):
            bw = int(
                conn.execute(
                    "SELECT COUNT(*) FROM daily_weight WHERE user_id = ?",
                    (uid,),
                ).fetchone()[0]
            )
        bm = 0
        if _table_exists(conn, "main", "body_metrics"):
            bm = int(
                conn.execute(
                    "SELECT COUNT(*) FROM body_metrics WHERE user_id = ?",
                    (uid,),
                ).fetchone()[0]
            )
        add(
            "body",
            "Вес и замеры",
            (bw + bm) > 0,
            detail=f"daily_weight: {bw}, body_metrics: {bm}",
        )

        prof = conn.execute(
            "SELECT COUNT(*) FROM user_profile WHERE user_id = ?",
            (uid,),
        ).fetchone()[0]
        add("profile", "Профиль user_profile", int(prof) > 0, detail=f"строк: {int(prof)}")
    except Exception as exc:
        add("verify", "Проверка mini DB", False, error=str(exc))
    finally:
        try:
            conn.execute("DETACH shared")
        except sqlite3.Error:
            pass
        conn.close()

    return checks


def build_mini_database_zip(
    dest_zip: Path,
    *,
    user_id: int,
    source_workouts: Path | None = None,
    source_shared: Path | None = None,
) -> MiniDbBuildReport:
    """
    Build forma_db_zip_v1-compatible archive without modifying source databases.
    """
    src_w = Path(source_workouts or WORKOUTS_DB_PATH)
    src_s = Path(source_shared or SHARED_DB_PATH)
    if not src_w.is_file():
        raise FileNotFoundError(f"workouts.db не найден: {src_w}")
    if not src_s.is_file():
        raise FileNotFoundError(f"shared.db не найден: {src_s}")

    from backend.services.database_export_service import checkpoint_sqlite

    checkpoint_sqlite(src_w)
    checkpoint_sqlite(src_s)

    report = MiniDbBuildReport(
        user_id=int(user_id),
        source_workouts_bytes=src_w.stat().st_size,
        source_shared_bytes=src_s.stat().st_size,
        workouts_bytes=0,
        shared_bytes=0,
        zip_bytes=0,
    )

    dest_zip.parent.mkdir(parents=True, exist_ok=True)
    if dest_zip.exists():
        dest_zip.unlink()

    with tempfile.TemporaryDirectory(prefix="forma-mini-db-") as tmp_dir:
        tmp = Path(tmp_dir)
        dest_w, dest_s = _prepare_dest_shell(
            tmp,
            source_workouts=src_w,
            source_shared=src_s,
        )
        _copy_workouts_db(
            src_workouts=src_w,
            src_shared=src_s,
            dest_workouts=dest_w,
            user_id=int(user_id),
            report=report,
        )
        product_ids = _collect_food_product_ids(dest_w, int(user_id))
        _copy_shared_db(
            src_shared=src_s,
            dest_shared=dest_s,
            product_ids=product_ids,
            report=report,
        )

        report.workouts_bytes = dest_w.stat().st_size
        report.shared_bytes = dest_s.stat().st_size

        report.checks = _verify_mini_databases(dest_w, dest_s, int(user_id))
        report.ok = all(c.get("ok", False) for c in report.checks) if report.checks else False
        if not report.ok:
            report.errors.append("Одна или несколько проверок mini DB не пройдены")

        schema_version: int | None = None
        try:
            from database.migrations import get_schema_version

            conn = sqlite3.connect(str(dest_w), timeout=30.0)
            try:
                schema_version = get_schema_version(conn)
            finally:
                conn.close()
        except Exception as exc:
            logger.warning("mini_db: schema version read failed: %s", exc)

        manifest = {
            "format": ZIP_FORMAT,
            "kind": "forma_mini_db_v1",
            "user_id": int(user_id),
            "exported_at": _now_iso(),
            "schema_version": schema_version,
            "files": ["workouts.db", "shared.db"],
            "limits": {
                "strength_sessions": STRENGTH_SESSION_LIMIT,
                "cardio_days": CARDIO_DAYS,
                "body_days": BODY_DAYS,
                "food_days": FOOD_DAYS,
                "wellness_days": WELLNESS_DAYS,
            },
            "row_counts": report.row_counts,
            "strength_sessions": report.strength_sessions,
            "verification": report.checks,
        }

        with zipfile.ZipFile(dest_zip, "w", compression=zipfile.ZIP_DEFLATED) as zf:
            zf.write(dest_w, "workouts.db")
            zf.write(dest_s, "shared.db")
            zf.writestr(
                "manifest.json",
                json.dumps(manifest, ensure_ascii=False, indent=2),
            )

    report.zip_bytes = dest_zip.stat().st_size
    logger.info(
        "mini_database built user_id=%s zip=%s bytes=%s strength_sessions=%s",
        user_id,
        dest_zip,
        report.zip_bytes,
        len(report.strength_sessions),
    )
    return report


def create_mini_database_export(user_id: int) -> tuple[str, Path, MiniDbBuildReport]:
    """Returns (export_id, zip_path, report)."""
    export_id = str(uuid.uuid4())
    ts = datetime.now().strftime("%Y-%m-%d_%H%M%S")
    zip_path = mini_db_exports_dir() / f"forma_mini_db_{ts}_{export_id[:8]}.zip"
    report = build_mini_database_zip(zip_path, user_id=int(user_id))
    meta_path = zip_path.with_suffix(".json")
    meta_path.write_text(
        json.dumps(
            {
                "export_id": export_id,
                "report": report.to_dict(),
                "zip": zip_path.name,
            },
            ensure_ascii=False,
            indent=2,
        ),
        encoding="utf-8",
    )
    return export_id, zip_path, report


def resolve_mini_database_export(export_id: str) -> Path | None:
    for path in sorted(mini_db_exports_dir().glob("forma_mini_db_*.zip"), reverse=True):
        meta = path.with_suffix(".json")
        if meta.is_file():
            try:
                data = json.loads(meta.read_text(encoding="utf-8"))
                if data.get("export_id") == export_id:
                    return path
            except (json.JSONDecodeError, OSError):
                continue
    return None


def prune_old_mini_exports(*, keep: int = 5) -> int:
    files = sorted(mini_db_exports_dir().glob("forma_mini_db_*.zip"), reverse=True)
    removed = 0
    for path in files[keep:]:
        try:
            path.unlink(missing_ok=True)
            path.with_suffix(".json").unlink(missing_ok=True)
            removed += 1
        except OSError:
            pass
    return removed
