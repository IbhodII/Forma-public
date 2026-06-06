# -*- coding: utf-8 -*-
"""Background account warmup with staged progress."""
from __future__ import annotations

import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Event
from typing import Any, Literal

from backend.database.request_context import clear_current_user_id, set_current_user_id
from backend.services.account_warmup_checkpoint_store import get_checkpoint
from backend.services.account_warmup_service import (
    STAGE_LABELS,
    WarmupRunSummary,
    WarmupStageResult,
    run_account_warmup,
)

WarmupMode = Literal["light", "full"]
WarmupTaskStatus = Literal["idle", "running", "completed", "failed", "cancelled"]


class AccountWarmupAlreadyRunningError(Exception):
    def __init__(self, task_id: str, message: str = "Прогрев уже выполняется") -> None:
        self.task_id = task_id
        super().__init__(message)


@dataclass
class AccountWarmupTaskState:
    task_id: str
    user_id: int
    mode: WarmupMode
    include_vacuum: bool
    status: str  # idle | running | completed | failed | cancelled
    phase: str = "starting"
    current: int = 0
    total: int = 1
    stage: str = ""
    percent: int = 0
    message: str = "Запуск…"
    error: str | None = None
    started_at: float = field(default_factory=time.monotonic)
    stages: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    summary: dict[str, Any] | None = None
    processed_units: int = 0
    total_units: int = 0
    last_heartbeat_at: str | None = None

    @property
    def elapsed_sec(self) -> int:
        return int(time.monotonic() - self.started_at)

    def to_dict(self) -> dict[str, Any]:
        progress_processed = (
            self.processed_units if self.total_units > 0 else self.current
        )
        progress_total = self.total_units if self.total_units > 0 else self.total
        section_label = STAGE_LABELS.get(self.stage, self.stage) if self.stage else ""
        out: dict[str, Any] = {
            "task_id": self.task_id,
            "job_id": self.task_id,
            "status": self.status,
            "phase": self.phase,
            "current": self.current,
            "total": progress_total,
            "stage": self.stage,
            "currentSection": section_label,
            "percent": self.percent,
            "message": self.message,
            "error": self.error,
            "elapsed_sec": self.elapsed_sec,
            "stages": list(self.stages),
            "warnings": list(self.warnings),
            "processed_units": self.processed_units,
            "total_units": self.total_units,
            "processed": progress_processed,
            "lastHeartbeatAt": self.last_heartbeat_at,
        }
        if self.summary is not None:
            out["summary"] = self.summary
        return out


_lock = threading.Lock()
_tasks: dict[str, AccountWarmupTaskState] = {}
_running_by_user: dict[int, str] = {}
_cancel_events: dict[str, Event] = {}


def _percent_for(processed: int, total: int) -> int:
    if total <= 0:
        return 0
    return min(99, int((processed / total) * 100))


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def _touch_heartbeat(task_id: str) -> None:
    with _lock:
        task = _tasks.get(task_id)
        if task and task.status == "running":
            task.last_heartbeat_at = _utc_now_iso()


def _heartbeat_loop(task_id: str, stop: Event) -> None:
    while not stop.wait(2.0):
        _touch_heartbeat(task_id)


def _update_progress(
    task_id: str,
    current: int,
    total: int,
    stage_id: str,
    stage_results: list[WarmupStageResult],
    warnings: list[str],
) -> None:
    label = STAGE_LABELS.get(stage_id, stage_id)
    with _lock:
        task = _tasks.get(task_id)
        if not task or task.status != "running":
            return
        task.current = current
        task.total = max(total, 1)
        task.stage = stage_id
        task.phase = "warming"
        task.stages = [s.to_dict() for s in stage_results]
        task.warnings = list(warnings)
        if task.total_units > 0:
            task.percent = _percent_for(task.processed_units, task.total_units)
            task.message = f"Прогрев данных: {task.percent}%"
        else:
            task.percent = _percent_for(current, total)
            task.message = f"Прогрев данных: {task.percent}%"
    _touch_heartbeat(task_id)


def _update_batch_progress(
    task_id: str,
    processed: int,
    total: int,
    stage_id: str,
    _label: str,
) -> None:
    with _lock:
        task = _tasks.get(task_id)
        if not task or task.status != "running":
            return
        task.processed_units = processed
        task.total_units = max(total, 1)
        task.stage = stage_id
        task.phase = "warming"
        task.percent = _percent_for(processed, total)
        stage_label = STAGE_LABELS.get(stage_id, stage_id)
        task.message = (
            f"Подготовка базы: {task.percent}% · "
            f"Обрабатываются {stage_label}: {processed:,} / {max(total, 1):,}"
        )
    _touch_heartbeat(task_id)


def _worker(
    task_id: str,
    user_id: int,
    mode: WarmupMode,
    include_vacuum: bool,
    *,
    resume: bool = True,
) -> None:
    set_current_user_id(user_id)
    cancel_event = _cancel_events.get(task_id)
    stop_heartbeat = Event()
    hb_thread = threading.Thread(
        target=_heartbeat_loop,
        args=(task_id, stop_heartbeat),
        name=f"account-warmup-hb-{task_id[:8]}",
        daemon=True,
    )
    with _lock:
        task = _tasks.get(task_id)
        if task:
            task.last_heartbeat_at = _utc_now_iso()
    hb_thread.start()
    try:
        if mode == "full":
            with _lock:
                task = _tasks.get(task_id)
                needs_estimate = bool(task and task.total_units <= 0)
            if needs_estimate:
                from backend.services.account_warmup_engine import estimate_total_units

                estimated_total = estimate_total_units(user_id)
                with _lock:
                    task = _tasks.get(task_id)
                    if task and task.total_units <= 0:
                        task.total_units = estimated_total
                        task.total = max(estimated_total, 1)

        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.message = "Прогрев данных: 0%"
                task.phase = "warming"

        summary: WarmupRunSummary = run_account_warmup(
            user_id,
            mode=mode,
            include_vacuum=include_vacuum,
            task_id=task_id,
            resume=resume,
            cancel_event=cancel_event,
            on_progress=lambda cur, tot, sid, stages, warns: _update_progress(
                task_id, cur, tot, sid, stages, warns
            ),
            on_batch=lambda proc, tot, sid, lbl: _update_batch_progress(
                task_id, proc, tot, sid, lbl
            ),
        )

        cancelled = bool(cancel_event and cancel_event.is_set())
        if cancelled:
            from backend.services.account_warmup_checkpoint_store import get_checkpoint, save_checkpoint

            cp = get_checkpoint(user_id)
            if cp.status == "running":
                cp.status = "cancelled"
                save_checkpoint(cp)

        with _lock:
            task = _tasks.get(task_id)
            if not task:
                return
            task.summary = summary.to_dict()
            task.stages = [s.to_dict() for s in summary.stages]
            task.warnings = list(summary.warnings)
            if cancelled:
                task.status = "cancelled"
                task.phase = "cancelled"
                task.message = "Прогрев остановлен, можно запустить повторно для продолжения."
            else:
                task.message = "Проверка работоспособности базы…"
                from backend.services.database_post_verify import (
                    PostDbVerifyError,
                    assert_post_db_verification,
                )

                verify_report = assert_post_db_verification(user_id)
                summary_dict = task.summary or {}
                summary_dict["verification"] = verify_report.to_dict()
                if mode == "full":
                    if verify_report.workout_visibility is not None:
                        summary_dict["workout_visibility"] = verify_report.workout_visibility
                    else:
                        from backend.services.workout_visibility_diagnostics import (
                            build_workout_visibility_report,
                        )

                        summary_dict["workout_visibility"] = build_workout_visibility_report(
                            user_id
                        )
                task.summary = summary_dict
                task.status = "completed"
                task.phase = "done"
                task.percent = 100
                task.message = "Прогрев завершён"
    except Exception as exc:
        from backend.services.database_post_verify import PostDbVerifyError

        if isinstance(exc, PostDbVerifyError):
            logger.error(
                "account_warmup verify failed task_id=%s: %s report=%s",
                task_id,
                exc,
                exc.report.to_dict(),
            )
        with _lock:
            task = _tasks.get(task_id)
            if task:
                task.status = "failed"
                task.error = str(exc)
                task.phase = "error"
                task.message = str(exc) if isinstance(exc, PostDbVerifyError) else (
                    "Прогрев остановлен, можно запустить повторно для продолжения."
                )
                if isinstance(exc, PostDbVerifyError):
                    summary_dict = dict(task.summary or {})
                    summary_dict["verification"] = exc.report.to_dict()
                    task.summary = summary_dict
    finally:
        stop_heartbeat.set()
        clear_current_user_id()
        with _lock:
            if _running_by_user.get(user_id) == task_id:
                del _running_by_user[user_id]
            _cancel_events.pop(task_id, None)


def start_account_warmup(
    user_id: int,
    *,
    mode: WarmupMode = "full",
    include_vacuum: bool = False,
    resume: bool = True,
) -> AccountWarmupTaskState:
    uid = int(user_id)
    with _lock:
        existing_id = _running_by_user.get(uid)
        if existing_id:
            existing = _tasks.get(existing_id)
            if existing and existing.status == "running":
                raise AccountWarmupAlreadyRunningError(existing_id)

    cp = get_checkpoint(uid)
    if cp.status == "running":
        cp.status = "failed"
        cp.last_error = "Stale running checkpoint reset"
        from backend.services.account_warmup_checkpoint_store import save_checkpoint

        save_checkpoint(cp)

    from backend.services.account_warmup_service import _stage_ids_for_mode

    stage_ids = _stage_ids_for_mode(mode, include_vacuum=include_vacuum)
    task_id = str(uuid.uuid4())
    total_units = 0
    processed_units = 0
    if mode == "full":
        if resume and cp.status in ("failed", "cancelled") and cp.total_units:
            processed_units = cp.processed_units
            total_units = cp.total_units

    task = AccountWarmupTaskState(
        task_id=task_id,
        user_id=uid,
        mode=mode,
        include_vacuum=include_vacuum,
        status="running",
        total=len(stage_ids) if mode == "light" else max(total_units, 1),
        message="Запуск прогрева…",
        processed_units=processed_units,
        total_units=total_units,
        last_heartbeat_at=_utc_now_iso(),
    )
    cancel_event = Event()
    with _lock:
        _tasks[task_id] = task
        _running_by_user[uid] = task_id
        _cancel_events[task_id] = cancel_event

    thread = threading.Thread(
        target=_worker,
        args=(task_id, uid, mode, include_vacuum),
        kwargs={"resume": resume},
        name=f"account-warmup-{task_id[:8]}",
        daemon=True,
    )
    thread.start()
    return task


def cancel_account_warmup(user_id: int) -> AccountWarmupTaskState | None:
    uid = int(user_id)
    with _lock:
        tid = _running_by_user.get(uid)
        if tid:
            event = _cancel_events.get(tid)
            if event:
                event.set()
            return _tasks.get(tid)
    cp = get_checkpoint(uid)
    if cp.status == "running":
        cp.status = "cancelled"
        cp.last_error = cp.last_error or "Прогрев отменён"
        from backend.services.account_warmup_checkpoint_store import save_checkpoint

        save_checkpoint(cp)
        return _task_state_from_checkpoint(cp)
    return None


def get_account_warmup_task(task_id: str) -> AccountWarmupTaskState | None:
    with _lock:
        return _tasks.get(task_id)


def reconcile_stale_warmup_checkpoint(user_id: int) -> None:
    """Сбросить checkpoint «running», если в памяти нет активной задачи (перезапуск сервера)."""
    uid = int(user_id)
    with _lock:
        if _running_by_user.get(uid):
            return
    cp = get_checkpoint(uid)
    if cp.status != "running":
        return
    cp.status = "cancelled"
    cp.last_error = cp.last_error or "Прогрев прерван (перезапуск приложения)"
    from backend.services.account_warmup_checkpoint_store import save_checkpoint

    save_checkpoint(cp)


def _task_state_from_checkpoint(cp) -> AccountWarmupTaskState:
    status = cp.status if cp.status in ("completed", "failed", "cancelled") else "cancelled"
    total_u = max(int(cp.total_units or 0), 1)
    processed = int(cp.processed_units or 0)
    message = cp.last_error or (
        "Прогрев остановлен, можно запустить повторно для продолжения."
        if status == "cancelled"
        else "Прогрев завершён"
    )
    return AccountWarmupTaskState(
        task_id=str(cp.task_id or ""),
        user_id=int(cp.user_id),
        mode=cp.mode if cp.mode in ("light", "full") else "full",
        include_vacuum=False,
        status=status,
        phase=status,
        current=processed,
        total=total_u,
        percent=100 if status == "completed" else _percent_for(processed, total_u),
        message=message,
        error=cp.last_error,
        processed_units=processed,
        total_units=total_u,
    )


def get_account_warmup_task_for_user(user_id: int, task_id: str) -> AccountWarmupTaskState | None:
    """Задача в памяти или последнее состояние из checkpoint (после рестарта)."""
    uid = int(user_id)
    task = get_account_warmup_task(task_id)
    if task and task.user_id == uid:
        return task
    cp = get_checkpoint(uid)
    if not cp.task_id or str(cp.task_id) != str(task_id):
        return None
    if cp.status == "running":
        reconcile_stale_warmup_checkpoint(uid)
        cp = get_checkpoint(uid)
    return _task_state_from_checkpoint(cp)


def get_running_warmup_task_for_user(user_id: int) -> AccountWarmupTaskState | None:
    with _lock:
        tid = _running_by_user.get(int(user_id))
        if not tid:
            return None
        task = _tasks.get(tid)
        if task and task.status == "running":
            return task
        return None
