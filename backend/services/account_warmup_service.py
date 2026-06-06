# -*- coding: utf-8 -*-
"""Post-import / account data warmup — DB optimize + read-only service preloads."""
from __future__ import annotations

import asyncio
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from threading import Event
from typing import Any, Callable, Literal

from database.connection import SHARED_SCHEMA, attach_shared, is_shared_attached, open_db

logger = logging.getLogger("account_warmup")

WarmupMode = Literal["light", "full"]

STAGE_LABELS: dict[str, str] = {
    "db_indexes": "Индексы БД",
    "db_analyze": "ANALYZE SQLite",
    "db_vacuum": "VACUUM SQLite",
    "profile_cache": "Профиль и настройки",
    "dashboard": "Главная (dashboard)",
    "workouts_list": "Список тренировок",
    "cardio_section": "Кардио",
    "exercises_sets": "Упражнения и подходы",
    "nutrition_week": "Питание за неделю",
    "food_products": "Продукты",
    "nutrition_balance": "Баланс и дефицит",
    "body_metrics": "Метрики тела",
    "steps": "Шаги",
    "sleep_section": "Сон",
    "passive_hr": "Пульс",
    "cycle_section": "Цикл",
    "stretching": "Растяжка",
    "analytics_expenditure": "Расход калорий",
    "analytics_ctl": "CTL / TRIMP",
    "hr_analytics": "HR-аналитика силовых",
    "source_resolver": "Источники данных",
    "sync_metadata": "Синхронизация",
}


@dataclass
class WarmupStageResult:
    id: str
    label: str
    status: str  # pending | running | done | skipped | failed
    elapsed_ms: int = 0
    detail: str | None = None

    def to_dict(self) -> dict[str, Any]:
        out: dict[str, Any] = {
            "id": self.id,
            "label": self.label,
            "status": self.status,
            "elapsed_ms": self.elapsed_ms,
        }
        if self.detail:
            out["detail"] = self.detail
        return out


@dataclass
class WarmupRunSummary:
    mode: WarmupMode
    stages: list[WarmupStageResult] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    total_elapsed_ms: int = 0

    def to_dict(self) -> dict[str, Any]:
        return {
            "mode": self.mode,
            "stages": [s.to_dict() for s in self.stages],
            "warnings": list(self.warnings),
            "total_elapsed_ms": self.total_elapsed_ms,
        }


ProgressFn = Callable[[int, int, str, list[WarmupStageResult], list[str]], None]
BatchProgressFn = Callable[[int, int, str, str], None]


def _stage_ids_for_mode(mode: WarmupMode, *, include_vacuum: bool) -> list[str]:
    light = ["db_indexes", "db_analyze", "profile_cache"]
    if include_vacuum:
        light = ["db_indexes", "db_analyze", "db_vacuum", "profile_cache"]
    if mode == "light":
        return light
    # Full mode: light DB stages only; batched engine handles compute stages.
    return light


def _run_db_indexes() -> None:
    from database.migrations import ensure_performance_indexes

    conn = open_db(attach=True)
    try:
        ensure_performance_indexes(conn)
        conn.commit()
    finally:
        conn.close()


def _run_db_analyze() -> None:
    conn = open_db(attach=True)
    try:
        conn.execute("ANALYZE")
        if not is_shared_attached(conn):
            attach_shared(conn)
        rows = conn.execute(
            f"SELECT name FROM {SHARED_SCHEMA}.sqlite_master WHERE type='table'"
        ).fetchall()
        for (table_name,) in rows:
            conn.execute(f"ANALYZE {SHARED_SCHEMA}.{table_name}")
    finally:
        conn.close()


def _run_db_vacuum() -> None:
    conn = open_db(attach=False)
    try:
        conn.execute("VACUUM")
    finally:
        conn.close()


def _run_profile_cache(user_id: int) -> None:
    from backend.services import user_service
    from backend.services.calibration_service import get_bracelet_calibration_factor
    from backend.services.hc_analytics_service import get_hc_analytics_prefs

    user_service.get_profile()
    get_hc_analytics_prefs(user_id)
    get_bracelet_calibration_factor()


def _run_dashboard() -> None:
    from backend.services.dashboard_home_service import build_dashboard_home

    asyncio.run(build_dashboard_home(phase="cut", include_hc_hub=False))


def _run_workouts_list() -> None:
    from backend.services import strength_service

    strength_service.get_sessions(50, 0)


def _run_nutrition_week() -> None:
    from backend.services import food_service

    today = date.today().isoformat()
    food_service.get_week_log(today, "cut")
    food_service.get_week_log(today, "bulk")


def _run_nutrition_balance() -> None:
    from backend.services import nutrition_balance_service

    nutrition_balance_service.get_week_energy_balance("cut")
    nutrition_balance_service.get_cut_deficit_control()
    nutrition_balance_service.get_forecast_readiness("cut")


def _run_body_metrics() -> None:
    from backend.services.body_service import get_metrics_summary, get_weekly_metrics

    get_metrics_summary()
    get_weekly_metrics()


def _run_steps() -> None:
    from backend.services.steps_service import get_steps_history

    today = date.today()
    d_from = (today - timedelta(days=89)).isoformat()
    get_steps_history(d_from, today.isoformat())


def _run_stretching() -> None:
    from backend.services import stretching_service

    stretching_service.list_log(days=90)
    stretching_service.get_activity_calendar(days=90)


def _run_analytics_expenditure() -> None:
    from backend.services import analytics_service

    today = date.today()
    d_from = (today - timedelta(days=89)).isoformat()
    analytics_service.get_daily_expenditure_range(
        d_from, today.isoformat(), "cut", prefer_chest=True
    )


def _run_analytics_ctl() -> None:
    from backend.services import analytics_service, cardio_service

    analytics_service.get_ctl_atl_tsb(90)
    today = date.today()
    d_from = (today - timedelta(days=89)).isoformat()
    cardio_service.get_daily_trimp(d_from, today.isoformat())


def _run_hr_analytics() -> str | None:
    from backend.services import strength_hr_analytics_service

    overview = strength_hr_analytics_service.build_hr_analytics_overview()
    sessions = int(overview.get("sessions_total") or 0)
    if sessions == 0:
        raise ValueError("Нет HR-сессий")
    return f"HR-сессий: {sessions}"


def _run_source_resolver(user_id: int) -> str | None:
    from backend.services import source_resolver_service

    conn = open_db(attach=False)
    try:
        rows = conn.execute(
            """
            SELECT id FROM cardio_workouts
            WHERE user_id = ?
            ORDER BY date DESC, id DESC
            LIMIT 20
            """,
            (user_id,),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return "Нет кардио-тренировок"
    for row in rows:
        source_resolver_service.resolve_source_summary(int(row[0]))
    return f"Прогрето источников: {len(rows)}"


def _run_sync_metadata() -> None:
    from backend.services.dashboard_home_service import build_hc_status_snapshot
    from backend.services.forma_sync.engine import get_forma_sync_status

    asyncio.run(get_forma_sync_status(include_debug=False))
    build_hc_status_snapshot()


_STAGE_RUNNERS: dict[str, Callable[..., Any]] = {
    "db_indexes": lambda _uid: _run_db_indexes(),
    "db_analyze": lambda _uid: _run_db_analyze(),
    "db_vacuum": lambda _uid: _run_db_vacuum(),
    "profile_cache": _run_profile_cache,
    "dashboard": lambda _uid: _run_dashboard(),
    "workouts_list": lambda _uid: _run_workouts_list(),
    "nutrition_week": lambda _uid: _run_nutrition_week(),
    "nutrition_balance": lambda _uid: _run_nutrition_balance(),
    "body_metrics": lambda _uid: _run_body_metrics(),
    "steps": lambda _uid: _run_steps(),
    "stretching": lambda _uid: _run_stretching(),
    "analytics_expenditure": lambda _uid: _run_analytics_expenditure(),
    "analytics_ctl": lambda _uid: _run_analytics_ctl(),
    "hr_analytics": lambda _uid: _run_hr_analytics(),
    "source_resolver": _run_source_resolver,
    "sync_metadata": lambda _uid: _run_sync_metadata(),
}


def run_account_warmup(
    user_id: int,
    *,
    mode: WarmupMode = "full",
    include_vacuum: bool = False,
    task_id: str = "",
    resume: bool = True,
    cancel_event: Event | None = None,
    on_progress: ProgressFn | None = None,
    on_batch: BatchProgressFn | None = None,
) -> WarmupRunSummary:
    """Execute warmup stages for user_id (caller must set request context)."""
    stage_ids = _stage_ids_for_mode(mode, include_vacuum=include_vacuum)
    total = len(stage_ids)
    summary = WarmupRunSummary(mode=mode)
    run_started = time.monotonic()

    for idx, stage_id in enumerate(stage_ids):
        if cancel_event and cancel_event.is_set():
            break
        label = STAGE_LABELS.get(stage_id, stage_id)
        stage = WarmupStageResult(id=stage_id, label=label, status="running")
        summary.stages.append(stage)
        if on_progress:
            on_progress(idx, total, stage_id, summary.stages, summary.warnings)

        logger.info("warmup stage start user_id=%s stage=%s", user_id, stage_id)
        t0 = time.monotonic()
        try:
            runner = _STAGE_RUNNERS[stage_id]
            detail = runner(user_id)
            stage.status = "done"
            if isinstance(detail, str):
                stage.detail = detail
        except sqlite3.OperationalError as err:
            if "locked" in str(err).lower():
                raise
            stage.status = "failed"
            stage.detail = str(err)
            summary.warnings.append(f"{label}: {err}")
            logger.warning("warmup stage failed user_id=%s stage=%s err=%s", user_id, stage_id, err)
        except Exception as err:
            stage.status = "skipped"
            stage.detail = str(err)
            summary.warnings.append(f"{label}: {err}")
            logger.warning("warmup stage skipped user_id=%s stage=%s err=%s", user_id, stage_id, err)
        finally:
            stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
            logger.info(
                "warmup stage done user_id=%s stage=%s status=%s ms=%s",
                user_id,
                stage_id,
                stage.status,
                stage.elapsed_ms,
            )
            if on_progress:
                on_progress(idx + 1, total, stage_id, summary.stages, summary.warnings)

    if mode == "full" and not (cancel_event and cancel_event.is_set()):
        from backend.services.account_warmup_engine import run_batched_full_warmup

        batched = run_batched_full_warmup(
            user_id,
            task_id or "inline",
            cancel_event=cancel_event,
            on_batch=on_batch,
            resume=resume,
        )
        summary.stages.extend(batched.stages)
        summary.warnings.extend(batched.warnings)

    summary.total_elapsed_ms = int((time.monotonic() - run_started) * 1000)
    logger.info(
        "warmup complete user_id=%s mode=%s ms=%s warnings=%s",
        user_id,
        mode,
        summary.total_elapsed_ms,
        len(summary.warnings),
    )
    return summary
