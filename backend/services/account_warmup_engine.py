# -*- coding: utf-8 -*-
"""Batched, resumable account warmup for large databases."""
from __future__ import annotations

import hashlib
import logging
import sqlite3
import time
from dataclasses import dataclass, field
from datetime import date, timedelta
from threading import Event
from typing import Any, Callable

from database.connection import open_db

from backend.services.account_warmup_checkpoint_store import (
    WarmupCheckpoint,
    WarmupCursor,
    _utc_now,
    get_cache_fingerprint,
    get_checkpoint,
    save_checkpoint,
    upsert_daily_cache,
)
from backend.services.account_warmup_service import WarmupRunSummary, WarmupStageResult

logger = logging.getLogger("account_warmup")

BATCH_SIZE = 1000
TRIMP_BATCH = 50
BODY_METRICS_BATCH = 500
WORKOUTS_PAGE = 50
CARDIO_PAGE = 50
EXERCISE_SET_PAGE = 100
FOOD_PRODUCT_PAGE = 200
CTL_CHUNK_DAYS = 14
SOURCE_RESOLVER_BATCH = 5
DATE_CHUNK_DAYS = 7
YIELD_MS = 50

BatchProgressFn = Callable[[int, int, str, str], None]


@dataclass
class EngineContext:
    user_id: int
    task_id: str
    cancel_event: Event | None = None
    on_batch: BatchProgressFn | None = None
    processed_units: int = 0
    total_units: int = 1
    warnings: list[str] = field(default_factory=list)
    stages: list[WarmupStageResult] = field(default_factory=list)

    def tick(self, stage: str, tier: str = "") -> None:
        self.processed_units += 1
        if self.on_batch:
            label = f"{stage}" + (f" ({tier})" if tier else "")
            self.on_batch(self.processed_units, self.total_units, stage, label)

    def should_cancel(self) -> bool:
        return bool(self.cancel_event and self.cancel_event.is_set())

    def yield_cpu(self) -> None:
        time.sleep(YIELD_MS / 1000.0)


def _fingerprint(conn: sqlite3.Connection, sql: str, params: tuple[Any, ...]) -> str:
    row = conn.execute(sql, params).fetchone()
    val = row[0] if row else ""
    return hashlib.sha256(str(val).encode()).hexdigest()[:16]


def _date_chunks(d_from: date, d_to: date, chunk_days: int = DATE_CHUNK_DAYS) -> list[tuple[str, str]]:
    chunks: list[tuple[str, str]] = []
    cur = d_from
    while cur <= d_to:
        end = min(cur + timedelta(days=chunk_days - 1), d_to)
        chunks.append((cur.isoformat(), end.isoformat()))
        cur = end + timedelta(days=1)
    return chunks


def _tier_ranges(today: date) -> dict[str, tuple[date, date]]:
    d30 = today - timedelta(days=30)
    d180 = today - timedelta(days=180)
    return {
        "recent_30d": (d30, today),
        "recent_180d": (d180, d30 - timedelta(days=1)),
        "full_history": (date(2000, 1, 1), d180 - timedelta(days=1)),
    }


def estimate_total_units(user_id: int) -> int:
    """Estimate batch count for progress bar."""
    today = date.today()
    tiers = _tier_ranges(today)
    total = 0
    conn = open_db(attach=False)
    try:
        uid = int(user_id)
        for tier_name, (d_from, d_to) in tiers.items():
            if d_from > d_to:
                continue
            chunks = _date_chunks(d_from, d_to)
            if tier_name == "recent_30d":
                total += len(chunks) * 3  # expenditure, steps, stretching
                total += max(1, _count_rows(conn, "body_metrics", uid) // BODY_METRICS_BATCH)
                trimp_missing = conn.execute(
                    """
                    SELECT COUNT(DISTINCT c.id) FROM cardio_workouts c
                    INNER JOIN workout_heart_rate h ON h.cardio_workout_id = c.id
                    WHERE c.trimp IS NULL AND c.user_id = ?
                    """,
                    (uid,),
                ).fetchone()[0]
                total += max(1, int(trimp_missing) // TRIMP_BATCH)
                strength_total = conn.execute(
                    "SELECT COUNT(DISTINCT date || workout_title) FROM strength_workouts WHERE user_id = ?",
                    (uid,),
                ).fetchone()[0]
                total += max(1, int(strength_total) // WORKOUTS_PAGE)
            elif tier_name == "recent_180d":
                total += len(chunks) * 2
            else:
                months = max(1, (d_to.year - d_from.year) * 12 + d_to.month - d_from.month + 1)
                total += months * 2
        cardio_count = int(
            conn.execute(
                "SELECT COUNT(*) FROM cardio_workouts WHERE user_id = ?",
                (uid,),
            ).fetchone()[0]
        )
        total += max(1, cardio_count // CARDIO_PAGE)
        ex_sets = int(
            conn.execute(
                "SELECT COUNT(*) FROM exercise_sets WHERE user_id = ?",
                (uid,),
            ).fetchone()[0]
        )
        total += max(1, ex_sets // EXERCISE_SET_PAGE)
        try:
            products = int(
                conn.execute("SELECT COUNT(*) FROM shared.food_products").fetchone()[0]
            )
        except sqlite3.Error:
            products = 0
        total += max(1, products // FOOD_PRODUCT_PAGE)
        total += len(_date_chunks(date(2000, 1, 1), today)) * 2  # nutrition week chunks
        total += max(1, 30 // CTL_CHUNK_DAYS)  # CTL/ATL windows
        total += 6  # balance, hr, source, sync, sleep/cycle probes
    finally:
        conn.close()
    return max(total, 1)


def _count_rows(conn: sqlite3.Connection, table: str, user_id: int) -> int:
    if table == "body_metrics":
        return int(
            conn.execute(
                "SELECT COUNT(*) FROM body_metrics WHERE user_id = ?",
                (user_id,),
            ).fetchone()[0]
        )
    return 0


def _run_trimp_batches(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services.cardio_service import refresh_missing_trimp

    stage = WarmupStageResult(id="trimp_backfill", label="TRIMP (батчи)", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    updated_total = 0
    try:
        while not ctx.should_cancel():
            n = refresh_missing_trimp(limit=TRIMP_BATCH)
            updated_total += n
            ctx.tick("trimp_backfill", cursor.tier or "recent_30d")
            ctx.yield_cpu()
            if n < TRIMP_BATCH:
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Обновлено TRIMP: {updated_total}"
    except Exception as err:
        stage.status = "skipped"
        stage.detail = str(err)
        ctx.warnings.append(f"TRIMP: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "expenditure"
    return cursor


def _run_expenditure_tiered(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services import analytics_service

    stage = WarmupStageResult(id="analytics_expenditure", label="Расход калорий", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    today = date.today()
    tiers = _tier_ranges(today)
    resume_tier = cursor.tier or "recent_30d"
    tier_order = ["recent_30d", "recent_180d", "full_history"]
    started = resume_tier in tier_order and cursor.stage in ("expenditure", "") or cursor.stage == "expenditure"
    if not started and cursor.stage not in ("", "expenditure"):
        stage.status = "done"
        stage.elapsed_ms = 0
        return cursor

    try:
        for tier_name in tier_order:
            if tier_name in tier_order and tier_order.index(tier_name) < tier_order.index(resume_tier):
                continue
            d_from, d_to = tiers[tier_name]
            if d_from > d_to:
                continue
            grain = "day" if tier_name == "recent_30d" else ("week" if tier_name == "recent_180d" else "month")
            chunks = _date_chunks(d_from, d_to) if grain == "day" else [(d_from.isoformat(), d_to.isoformat())]
            for chunk_from, chunk_to in chunks:
                if ctx.should_cancel():
                    cursor.tier = tier_name
                    cursor.date_from = chunk_from
                    cursor.stage = "expenditure"
                    break
                conn = open_db(attach=False)
                try:
                    fp = _fingerprint(
                        conn,
                        """
                        SELECT MAX(updated_at) FROM food_entries
                        WHERE user_id = ? AND date BETWEEN ? AND ?
                        """,
                        (ctx.user_id, chunk_from, chunk_to),
                    )
                finally:
                    conn.close()
                cached_fp = get_cache_fingerprint(
                    ctx.user_id, "expenditure:cut", grain, chunk_from
                )
                if cached_fp != fp:
                    if grain == "day":
                        analytics_service.get_daily_expenditure_range(
                            chunk_from, chunk_to, "cut", prefer_chest=True
                        )
                        upsert_daily_cache(
                            ctx.user_id,
                            "expenditure:cut",
                            grain,
                            chunk_from,
                            {"date_from": chunk_from, "date_to": chunk_to},
                            source_fingerprint=fp,
                        )
                    else:
                        _aggregate_expenditure_monthly(ctx.user_id, chunk_from, chunk_to, grain, fp)
                cursor.tier = tier_name
                cursor.date_from = chunk_from
                ctx.tick("analytics_expenditure", tier_name)
                ctx.yield_cpu()
            if ctx.should_cancel():
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Расход: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "steps"
    return cursor


def _aggregate_expenditure_monthly(
    user_id: int, d_from: str, d_to: str, grain: str, fp: str
) -> None:
    conn = open_db(attach=False)
    try:
        if grain == "month":
            rows = conn.execute(
                """
                SELECT strftime('%Y-%m', date) AS bucket,
                       SUM(COALESCE(calories_chest, calories_hr, calories, 0)) AS kcal
                FROM cardio_workouts
                WHERE user_id = ? AND date BETWEEN ? AND ?
                GROUP BY bucket
                """,
                (user_id, d_from, d_to),
            ).fetchall()
            for row in rows:
                upsert_daily_cache(
                    user_id,
                    "expenditure:cardio_kcal",
                    "month",
                    str(row["bucket"]),
                    {"kcal": float(row["kcal"] or 0)},
                    source_fingerprint=fp,
                    conn=conn,
                )
        conn.commit()
    finally:
        conn.close()


def _run_steps_tiered(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services.steps_service import get_steps_history

    stage = WarmupStageResult(id="steps", label="Шаги", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    today = date.today()
    tiers = _tier_ranges(today)
    try:
        for tier_name, (d_from, d_to) in tiers.items():
            if d_from > d_to:
                continue
            chunks = _date_chunks(d_from, d_to) if tier_name == "recent_30d" else [(d_from.isoformat(), d_to.isoformat())]
            grain = "day" if tier_name == "recent_30d" else ("week" if tier_name == "recent_180d" else "month")
            for chunk_from, chunk_to in chunks:
                if ctx.should_cancel():
                    cursor.stage = "steps"
                    cursor.tier = tier_name
                    break
                get_steps_history(chunk_from, chunk_to)
                upsert_daily_cache(
                    ctx.user_id,
                    "steps",
                    grain,
                    chunk_from,
                    {"date_from": chunk_from, "date_to": chunk_to},
                )
                ctx.tick("steps", tier_name)
                ctx.yield_cpu()
            if ctx.should_cancel():
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Шаги: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "body_metrics"
    return cursor


def _run_body_metrics_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services.body_service import get_metrics

    stage = WarmupStageResult(id="body_metrics", label="Метрики тела", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    offset = cursor.last_id if cursor.stage == "body_metrics" else 0
    try:
        while not ctx.should_cancel():
            items, total = get_metrics(BODY_METRICS_BATCH, offset)
            if not items:
                break
            upsert_daily_cache(
                ctx.user_id,
                "body_metrics",
                "batch",
                str(offset),
                {"count": len(items), "offset": offset},
            )
            offset += len(items)
            cursor.last_id = offset
            ctx.tick("body_metrics")
            ctx.yield_cpu()
            if offset >= total:
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Строк: {offset}"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Метрики тела: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "workouts_list"
    cursor.last_id = 0
    return cursor


def _run_workouts_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services import strength_service

    stage = WarmupStageResult(id="workouts_list", label="Список тренировок", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    offset = cursor.last_id if cursor.stage == "workouts_list" else 0
    try:
        while not ctx.should_cancel():
            items, total = strength_service.get_sessions(WORKOUTS_PAGE, offset)
            if not items:
                break
            offset += len(items)
            cursor.last_id = offset
            ctx.tick("workouts_list")
            ctx.yield_cpu()
            if offset >= total:
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Сессий: {offset}"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Тренировки: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "nutrition"
    cursor.last_id = 0
    return cursor


def _run_cardio_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services.cardio_service import get_workouts

    stage = WarmupStageResult(id="cardio_section", label="Кардио", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    today = date.today()
    d_from = (today - timedelta(days=365 * 5)).isoformat()
    d_to = today.isoformat()
    offset = cursor.last_id if cursor.stage == "cardio_section" else 0
    loaded = 0
    try:
        while not ctx.should_cancel():
            items, total = get_workouts(
                CARDIO_PAGE,
                offset,
                date_from=d_from,
                date_to=d_to,
            )
            if not items:
                break
            loaded += len(items)
            offset += len(items)
            cursor.last_id = offset
            ctx.tick("cardio_section")
            ctx.yield_cpu()
            if offset >= total:
                break
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Кардио записей: {loaded}"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Кардио: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "exercises_sets"
    cursor.last_id = 0
    return cursor


def _run_exercises_sets_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    stage = WarmupStageResult(id="exercises_sets", label="Упражнения и подходы", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    offset = cursor.last_id if cursor.stage == "exercises_sets" else 0
    warmed = 0
    try:
        conn = open_db(attach=False)
        try:
            total_items = int(
                conn.execute(
                    """
                    SELECT COUNT(*) FROM exercise_set_items
                    WHERE exercise_set_id IN (
                      SELECT id FROM exercise_sets WHERE user_id = ?
                    )
                    """,
                    (ctx.user_id,),
                ).fetchone()[0]
            )
        finally:
            conn.close()
        while not ctx.should_cancel() and offset < total_items:
            conn = open_db(attach=False)
            try:
                rows = conn.execute(
                    """
                    SELECT esi.id, esi.exercise_name, esi.exercise_set_id
                    FROM exercise_set_items esi
                    INNER JOIN exercise_sets es ON es.id = esi.exercise_set_id
                    WHERE es.user_id = ?
                    ORDER BY esi.id
                    LIMIT ? OFFSET ?
                    """,
                    (ctx.user_id, EXERCISE_SET_PAGE, offset),
                ).fetchall()
            finally:
                conn.close()
            if not rows:
                break
            warmed += len(rows)
            offset += len(rows)
            cursor.last_id = offset
            ctx.tick("exercises_sets")
            ctx.yield_cpu()
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Подходов: {warmed}"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Упражнения: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "nutrition_week"
    cursor.last_id = 0
    return cursor


def _run_nutrition_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services import food_service

    stage = WarmupStageResult(id="nutrition_week", label="Питание", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    today = date.today()
    chunks = _date_chunks(date(2000, 1, 1), today)
    start_idx = cursor.batch_index if cursor.stage == "nutrition_week" else 0
    try:
        for idx, (chunk_from, chunk_to) in enumerate(chunks):
            if idx < start_idx:
                continue
            if ctx.should_cancel():
                cursor.batch_index = idx
                break
            anchor = chunk_to
            food_service.get_week_log(anchor, "cut")
            food_service.get_week_log(anchor, "bulk")
            cursor.batch_index = idx + 1
            ctx.tick("nutrition_week", chunk_from)
            ctx.yield_cpu()
        stage.status = "done" if not ctx.should_cancel() else "skipped"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Питание: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "food_products"
    cursor.batch_index = 0
    cursor.last_id = 0
    return cursor


def _run_food_products_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    stage = WarmupStageResult(id="food_products", label="Продукты", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    offset = cursor.last_id if cursor.stage == "food_products" else 0
    scanned = 0
    try:
        conn = open_db(attach=True)
        try:
            total = int(conn.execute("SELECT COUNT(*) FROM shared.food_products").fetchone()[0])
        finally:
            conn.close()
        while not ctx.should_cancel() and offset < total:
            conn = open_db(attach=True)
            try:
                rows = conn.execute(
                    """
                    SELECT id FROM shared.food_products
                    ORDER BY id
                    LIMIT ? OFFSET ?
                    """,
                    (FOOD_PRODUCT_PAGE, offset),
                ).fetchall()
            finally:
                conn.close()
            if not rows:
                break
            scanned += len(rows)
            offset += len(rows)
            cursor.last_id = offset
            ctx.tick("food_products")
            ctx.yield_cpu()
        stage.status = "done" if not ctx.should_cancel() else "skipped"
        stage.detail = f"Продуктов: {scanned}"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"Продукты: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "analytics_ctl"
    cursor.last_id = 0
    return cursor


def _run_analytics_ctl_batched(ctx: EngineContext, cursor: WarmupCursor) -> WarmupCursor:
    from backend.services import analytics_service, cardio_service

    stage = WarmupStageResult(id="analytics_ctl", label="CTL / ATL / TSB / TRIMP", status="running")
    ctx.stages.append(stage)
    t0 = time.monotonic()
    today = date.today()
    windows = list(range(30, 366, CTL_CHUNK_DAYS))
    start_idx = cursor.batch_index if cursor.stage == "analytics_ctl" else 0
    try:
        for idx, days in enumerate(windows):
            if idx < start_idx:
                continue
            if ctx.should_cancel():
                cursor.batch_index = idx
                break
            analytics_service.get_ctl_atl_tsb(days)
            d_from = (today - timedelta(days=days - 1)).isoformat()
            cardio_service.get_daily_trimp(d_from, today.isoformat())
            cursor.batch_index = idx + 1
            ctx.tick("analytics_ctl", f"{days}d")
            ctx.yield_cpu()
        stage.status = "done" if not ctx.should_cancel() else "skipped"
    except Exception as err:
        stage.status = "skipped"
        ctx.warnings.append(f"CTL: {err}")
    finally:
        stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
    cursor.stage = "nutrition_balance"
    cursor.batch_index = 0
    return cursor


def _run_sleep_section(user_id: int) -> str:
    conn = open_db(attach=False)
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM sleep_data WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        count = int(row[0]) if row else 0
    finally:
        conn.close()
    if count == 0:
        raise ValueError("пропущено — таблица пуста")
    return f"Записей сна: {count}"


def _run_passive_hr(user_id: int) -> str:
    conn = open_db(attach=False)
    try:
        row = conn.execute(
            "SELECT COUNT(*) FROM passive_heart_rate_samples WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        count = int(row[0]) if row else 0
    finally:
        conn.close()
    if count == 0:
        raise ValueError("пропущено — таблица пуста")
    return f"Записей пульса: {count}"


def _run_cycle_section() -> str:
    conn = open_db(attach=False)
    try:
        row = conn.execute("SELECT COUNT(*) FROM menstrual_cycle_log").fetchone()
        count = int(row[0]) if row else 0
    finally:
        conn.close()
    if count == 0:
        raise ValueError("пропущено — таблица пуста")
    return f"Записей цикла: {count}"


def _run_lightweight_stages(ctx: EngineContext) -> None:
    """Bounded stages after batched pipeline (read-only / cache)."""
    runners: list[tuple[str, str, Callable[[], Any]]] = [
        ("nutrition_balance", "Баланс и дефицит", _nutrition_balance),
        ("sleep_section", "Сон", lambda: _run_sleep_section(ctx.user_id)),
        ("passive_hr", "Пульс", lambda: _run_passive_hr(ctx.user_id)),
        ("cycle_section", "Цикл", _run_cycle_section),
        ("stretching", "Растяжка", _stretching_30d),
        ("hr_analytics", "HR-аналитика", _hr_analytics),
        ("source_resolver", "Источники данных", lambda: _source_resolver_batched(ctx)),
        ("sync_metadata", "Синхронизация", _sync_metadata),
    ]
    for stage_id, label, fn in runners:
        if ctx.should_cancel():
            break
        stage = WarmupStageResult(id=stage_id, label=label, status="running")
        ctx.stages.append(stage)
        t0 = time.monotonic()
        try:
            detail = fn()
            stage.status = "done"
            if isinstance(detail, str):
                stage.detail = detail
        except Exception as err:
            stage.status = "skipped"
            stage.detail = str(err)
            ctx.warnings.append(f"{label}: {err}")
        finally:
            stage.elapsed_ms = int((time.monotonic() - t0) * 1000)
        ctx.tick(stage_id)
        ctx.yield_cpu()


def _nutrition_balance() -> None:
    from backend.services import nutrition_balance_service

    nutrition_balance_service.get_week_energy_balance("cut")
    nutrition_balance_service.get_cut_deficit_control()
    nutrition_balance_service.get_forecast_readiness("cut")


def _stretching_30d() -> None:
    from backend.services import stretching_service

    stretching_service.list_log(days=30)
    stretching_service.get_activity_calendar(days=30)


def _hr_analytics() -> str | None:
    from backend.services import strength_hr_analytics_service

    overview = strength_hr_analytics_service.build_hr_analytics_overview()
    sessions = int(overview.get("sessions_total") or 0)
    if sessions == 0:
        raise ValueError("Нет HR-сессий")
    return f"HR-сессий: {sessions}"


def _source_resolver_batched(ctx: EngineContext) -> str | None:
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
            (ctx.user_id,),
        ).fetchall()
    finally:
        conn.close()
    if not rows:
        return "Нет кардио-тренировок"
    ids = [int(r[0]) for r in rows]
    for i in range(0, len(ids), SOURCE_RESOLVER_BATCH):
        if ctx.should_cancel():
            break
        for wid in ids[i : i + SOURCE_RESOLVER_BATCH]:
            source_resolver_service.resolve_source_summary(wid)
        ctx.yield_cpu()
    return f"Прогрето источников: {len(ids)}"


def _sync_metadata() -> None:
    import asyncio

    from backend.services.dashboard_home_service import build_hc_status_snapshot
    from backend.services.forma_sync.engine import get_forma_sync_status

    asyncio.run(get_forma_sync_status(include_debug=False))
    build_hc_status_snapshot()


STAGE_PIPELINE: list[tuple[str, Callable[[EngineContext, WarmupCursor], WarmupCursor]]] = [
    ("trimp_backfill", _run_trimp_batches),
    ("expenditure", _run_expenditure_tiered),
    ("steps", _run_steps_tiered),
    ("body_metrics", _run_body_metrics_batched),
    ("workouts_list", _run_workouts_batched),
    ("cardio_section", _run_cardio_batched),
    ("exercises_sets", _run_exercises_sets_batched),
    ("nutrition_week", _run_nutrition_batched),
    ("food_products", _run_food_products_batched),
    ("analytics_ctl", _run_analytics_ctl_batched),
]


def _stage_index(stage_name: str) -> int:
    for i, (name, _) in enumerate(STAGE_PIPELINE):
        if name == stage_name:
            return i
    return 0


def run_batched_full_warmup(
    user_id: int,
    task_id: str,
    *,
    cancel_event: Event | None = None,
    on_batch: BatchProgressFn | None = None,
    resume: bool = True,
) -> WarmupRunSummary:
    """Execute tiered batched full warmup with checkpoint/resume."""
    summary = WarmupRunSummary(mode="full")
    run_started = time.monotonic()

    cp = get_checkpoint(user_id)
    cursor = cp.cursor
    if resume and cp.status in ("failed", "cancelled") and cp.cursor.stage:
        logger.info(
            "warmup resume user_id=%s from stage=%s tier=%s",
            user_id,
            cursor.stage,
            cursor.tier,
        )
    else:
        cursor = WarmupCursor()

    total_units = estimate_total_units(user_id)
    ctx = EngineContext(
        user_id=user_id,
        task_id=task_id,
        cancel_event=cancel_event,
        on_batch=on_batch,
        processed_units=cp.processed_units if resume else 0,
        total_units=total_units,
    )

    conn_counts = open_db(attach=False)
    try:
        uid = int(user_id)
        counts = {
            "strength": conn_counts.execute(
                "SELECT COUNT(*) FROM strength_workouts WHERE user_id = ?", (uid,)
            ).fetchone()[0],
            "cardio": conn_counts.execute(
                "SELECT COUNT(*) FROM cardio_workouts WHERE user_id = ?", (uid,)
            ).fetchone()[0],
            "food": conn_counts.execute(
                "SELECT COUNT(*) FROM food_entries WHERE user_id = ?", (uid,)
            ).fetchone()[0],
        }
    finally:
        conn_counts.close()

    logger.info("warmup batched start user_id=%s counts=%s units=%s", user_id, counts, total_units)

    cp = WarmupCheckpoint(
        user_id=user_id,
        status="running",
        mode="full",
        task_id=task_id,
        cursor=cursor,
        processed_units=ctx.processed_units,
        total_units=total_units,
        started_at=cp.started_at,
    )
    save_checkpoint(cp)

    start_idx = _stage_index(cursor.stage) if cursor.stage else 0

    try:
        for idx, (stage_name, runner) in enumerate(STAGE_PIPELINE):
            if idx < start_idx:
                continue
            if ctx.should_cancel():
                break
            cursor = runner(ctx, cursor)
            cp.cursor = cursor
            cp.processed_units = ctx.processed_units
            cp.total_units = ctx.total_units
            save_checkpoint(cp)

        if not ctx.should_cancel():
            _run_lightweight_stages(ctx)

        final_status = "cancelled" if ctx.should_cancel() else "completed"
        cp.status = final_status
        cp.processed_units = ctx.processed_units
        cp.completed_at = None if final_status == "cancelled" else _utc_now()
        save_checkpoint(cp)

    except sqlite3.OperationalError as err:
        if "locked" in str(err).lower():
            raise
        cp.status = "failed"
        cp.last_error = str(err)
        save_checkpoint(cp)
        raise
    except Exception as err:
        cp.status = "failed"
        cp.last_error = str(err)
        cp.cursor = cursor
        cp.processed_units = ctx.processed_units
        save_checkpoint(cp)
        raise

    summary.stages = ctx.stages
    summary.warnings = ctx.warnings
    summary.total_elapsed_ms = int((time.monotonic() - run_started) * 1000)
    logger.info(
        "warmup batched complete user_id=%s status=%s ms=%s warnings=%s",
        user_id,
        final_status,
        summary.total_elapsed_ms,
        len(summary.warnings),
    )
    return summary
