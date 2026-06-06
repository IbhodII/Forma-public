# -*- coding: utf-8 -*-
"""Post-import / post-warmup verification: DB health and section smoke checks."""
from __future__ import annotations

import logging
import sqlite3
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Any, Callable

from database.connection import SHARED_DB_PATH, WORKOUTS_DB_PATH, is_shared_attached, open_db

logger = logging.getLogger("database_post_verify")

REQUIRED_INDEXES: tuple[str, ...] = (
    "idx_strength_user_date",
    "idx_cardio_user_date",
    "idx_food_entries_user_phase_date",
    "idx_body_date",
)

OPTIONAL_USER_TABLES: tuple[str, ...] = (
    "sleep_data",
    "passive_heart_rate_samples",
    "menstrual_cycle_log",
)


@dataclass
class VerifyCheckResult:
    id: str
    label: str
    ok: bool
    detail: str | None = None
    error: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "ok": self.ok,
        }
        if self.detail:
            out["detail"] = self.detail
        if self.error:
            out["error"] = self.error
        return out


@dataclass
class PostDbVerifyReport:
    ok: bool
    checks: list[VerifyCheckResult] = field(default_factory=list)
    workout_visibility: dict[str, Any] | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "ok": self.ok,
            "checks": [c.to_dict() for c in self.checks],
            "failed": [c.id for c in self.checks if not c.ok],
        }
        if self.workout_visibility is not None:
            out["workout_visibility"] = self.workout_visibility
        return out

    def first_failure_message(self) -> str:
        for c in self.checks:
            if not c.ok:
                if c.error:
                    return f"{c.label}: {c.error}"
                return c.label
        return "Проверка базы не пройдена"


class PostDbVerifyError(RuntimeError):
    """Raised when post-import verification fails; import must not be marked successful."""

    def __init__(self, message: str, report: PostDbVerifyReport) -> None:
        self.report = report
        super().__init__(message)


def _run_check(
    check_id: str,
    label: str,
    fn: Callable[[], str | None],
) -> VerifyCheckResult:
    try:
        detail = fn()
        return VerifyCheckResult(id=check_id, label=label, ok=True, detail=detail)
    except Exception as exc:
        logger.error("post_verify failed check=%s: %s", check_id, exc, exc_info=True)
        return VerifyCheckResult(
            id=check_id,
            label=label,
            ok=False,
            error=str(exc),
        )


def _check_auth_user(user_id: int) -> str | None:
    from backend.services.auth_user_service import get_user_by_id

    user = get_user_by_id(int(user_id))
    if user is None:
        raise RuntimeError(
            f"Пользователь id={user_id} не найден в таблице users после импорта"
        )
    provider = user.get("cloud_provider") or "local"
    return f"users.id={user_id} ({provider})"


def _check_db_opens() -> str | None:
    if not WORKOUTS_DB_PATH.is_file():
        raise RuntimeError("workouts.db не найден")
    if not SHARED_DB_PATH.is_file():
        raise RuntimeError("shared.db не найден")
    conn = open_db(attach=True)
    try:
        conn.execute("SELECT 1").fetchone()
        if is_shared_attached(conn):
            conn.execute("SELECT 1 FROM shared.sqlite_master LIMIT 1").fetchone()
    finally:
        conn.close()
    return "workouts.db и shared.db открываются"


def _check_integrity() -> str | None:
    conn = open_db(attach=True)
    try:
        row = conn.execute("PRAGMA quick_check").fetchone()
        check = str(row[0]) if row else "ok"
        if check.lower() != "ok":
            raise RuntimeError(f"PRAGMA quick_check: {check}")
        if is_shared_attached(conn):
            srow = conn.execute("PRAGMA shared.quick_check").fetchone()
            scheck = str(srow[0]) if srow else "ok"
            if scheck.lower() != "ok":
                raise RuntimeError(f"PRAGMA shared.quick_check: {scheck}")
    finally:
        conn.close()
    return "integrity ok"


def _check_migrations() -> str | None:
    from database.migrations import SCHEMA_VERSION, ensure_db_schema, get_schema_version

    ensure_db_schema()
    conn = open_db(attach=False)
    try:
        version = get_schema_version(conn)
    finally:
        conn.close()
    if version < SCHEMA_VERSION:
        raise RuntimeError(
            f"Миграции не применены полностью: v{version}, нужно v{SCHEMA_VERSION}"
        )
    return f"schema v{version} (target v{SCHEMA_VERSION})"


def _check_indexes() -> str | None:
    conn = open_db(attach=False)
    try:
        missing: list[str] = []
        for name in REQUIRED_INDEXES:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='index' AND name=?",
                (name,),
            ).fetchone()
            if not row:
                missing.append(name)
    finally:
        conn.close()
    if missing:
        raise RuntimeError(f"Нет индексов: {', '.join(missing)}")
    return f"{len(REQUIRED_INDEXES)} индексов на месте"


def _check_workouts(user_id: int) -> str | None:
    from backend.services import strength_service

    try:
        items, total = strength_service.get_sessions(10, 0)
        return f"сессий: {total}, выборка: {len(items)}"
    except Exception:
        from backend.database.db_utils import get_db

        conn = get_db()
        try:
            row = conn.execute(
                "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ?",
                (int(user_id),),
            ).fetchone()
            count = int(row[0]) if row else 0
        finally:
            conn.close()
        return f"записей силовых: {count}"


def _check_nutrition(user_id: int) -> str | None:
    from backend.repositories import food_repo

    count = food_repo.count_food_entries(int(user_id))
    products = food_repo.count_food_products()
    return f"записей питания: {count}, продуктов shared: {products}"


def _check_body(user_id: int) -> str | None:
    from backend.services import body_service

    items, total = body_service.get_metrics(10, 0)
    return f"записей тела: {total}"


def _check_steps(user_id: int) -> str | None:
    from backend.services import steps_service

    today = date.today()
    d_from = (today - timedelta(days=30)).isoformat()
    hist = steps_service.get_steps_history(d_from, today.isoformat())
    count = len(hist.get("items") or []) if isinstance(hist, dict) else 0
    return f"шаги за 30 дн.: {count} записей"


def _check_analytics(user_id: int) -> str | None:
    from backend.services import analytics_query

    start = (date.today() - timedelta(days=29)).isoformat()
    end = date.today().isoformat()
    if not analytics_query.has_cardio_trimp_data(user_id, start, end):
        return "CTL/ATL: нет данных кардио"
    rows = analytics_query.get_ctl_atl_tsb_series(30)
    return f"CTL/ATL: {len(rows)} точек"


def _check_optional_tables(user_id: int) -> str | None:
    conn = open_db(attach=False)
    probed: list[str] = []
    skipped: list[str] = []
    try:
        for table in OPTIONAL_USER_TABLES:
            row = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name=?",
                (table,),
            ).fetchone()
            if not row:
                skipped.append(table)
                continue
            cols = {r[1] for r in conn.execute(f"PRAGMA table_info({table})").fetchall()}
            if table == "menstrual_cycle_log":
                conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
            elif "user_id" in cols:
                conn.execute(
                    f"SELECT 1 FROM {table} WHERE user_id = ? LIMIT 1",
                    (int(user_id),),
                ).fetchone()
            else:
                conn.execute(f"SELECT 1 FROM {table} LIMIT 1").fetchone()
            probed.append(table)
    finally:
        conn.close()
    parts = []
    if probed:
        parts.append(f"проверено: {', '.join(probed)}")
    if skipped:
        parts.append(f"нет таблицы: {', '.join(skipped)}")
    return "; ".join(parts) or "нет опциональных таблиц"


def run_post_db_verification(user_id: int, *, light_verify: bool = False) -> PostDbVerifyReport:
    """
    Smoke-test active DB after import/warmup. Caller must set request user context.
  Does not mutate user data.
    """
    uid = int(user_id)
    logger.info("post_verify start user_id=%s light=%s", uid, light_verify)

    visibility: dict[str, Any] | None = None
    vis_detail = "пропущено (large import)" if light_verify else "недоступно"
    if not light_verify:
        try:
            from backend.services.workout_visibility_diagnostics import (
                build_workout_visibility_report,
            )

            visibility = build_workout_visibility_report(uid)
            vis_detail = (
                f"строк: {visibility.get('rows_for_current_user', 0)}, "
                f"UI (3 мес.): {visibility.get('ui_visible_sessions', 0)}, "
                f"за всё время: {visibility.get('ui_visible_sessions_all_time', 0)}"
            )
            causes = visibility.get("likely_causes") or []
            if causes:
                vis_detail += "; " + "; ".join(str(c) for c in causes[:2])
        except Exception as exc:
            logger.warning("post_verify workout_visibility skipped user_id=%s: %s", uid, exc)

    checks: list[VerifyCheckResult] = [
        _run_check("auth_user", "Пользователь в users", lambda: _check_auth_user(uid)),
        _run_check("db_opens", "Открытие базы", _check_db_opens),
        _run_check("integrity", "Целостность (quick_check)", _check_integrity),
        _run_check("migrations", "Версия миграций", _check_migrations),
    ]
    if not light_verify:
        checks.extend(
            [
                _run_check("indexes", "Индексы", _check_indexes),
                _run_check("workouts", "Тренировки", lambda: _check_workouts(uid)),
                VerifyCheckResult(
                    id="workouts_visibility",
                    label="Видимость тренировок (UI)",
                    ok=True,
                    detail=vis_detail,
                ),
                _run_check("nutrition", "Питание", lambda: _check_nutrition(uid)),
                _run_check("body", "Тело / замеры", lambda: _check_body(uid)),
                _run_check("steps", "Шаги", lambda: _check_steps(uid)),
                _run_check("analytics", "Аналитика", lambda: _check_analytics(uid)),
                _run_check(
                    "optional_tables",
                    "Опциональные таблицы",
                    lambda: _check_optional_tables(uid),
                ),
            ]
        )
    else:
        checks.append(
            VerifyCheckResult(
                id="workouts_visibility",
                label="Видимость тренировок (UI)",
                ok=True,
                detail=vis_detail,
            )
        )

    ok = all(c.ok for c in checks)
    report = PostDbVerifyReport(ok=ok, checks=checks, workout_visibility=visibility)
    if ok:
        logger.info("post_verify passed user_id=%s checks=%s", uid, len(checks))
    else:
        failed = [c.id for c in checks if not c.ok]
        logger.error(
            "post_verify FAILED user_id=%s failed=%s message=%s",
            uid,
            failed,
            report.first_failure_message(),
        )
    return report


def assert_post_db_verification(
    user_id: int,
    *,
    light_verify: bool = False,
) -> PostDbVerifyReport:
    """Run verification; raise PostDbVerifyError if any check failed."""
    report = run_post_db_verification(user_id, light_verify=light_verify)
    if not report.ok:
        raise PostDbVerifyError(report.first_failure_message(), report)
    return report
