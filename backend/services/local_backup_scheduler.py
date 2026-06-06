# -*- coding: utf-8 -*-
"""Планировщик ежедневной проверки локального автобэкапа (APScheduler)."""
from __future__ import annotations

import logging
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler

from backend.services.backup_service import check_and_auto_backup

logger = logging.getLogger(__name__)

_scheduler: Optional[BackgroundScheduler] = None


def start_local_backup_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        return
    try:
        scheduler = BackgroundScheduler(daemon=True)
        scheduler.add_job(
            check_and_auto_backup,
            "interval",
            days=1,
            id="local_monthly_backup_check",
            replace_existing=True,
            max_instances=1,
            coalesce=True,
        )
        scheduler.start()
        _scheduler = scheduler
        logger.info("[backup] local auto-backup scheduler started (daily check)")
        check_and_auto_backup()
    except Exception as err:
        logger.warning("[backup] scheduler start failed: %s", err)


def stop_local_backup_scheduler() -> None:
    global _scheduler
    if _scheduler is None:
        return
    try:
        _scheduler.shutdown(wait=False)
    except Exception as err:
        logger.warning("[backup] scheduler shutdown: %s", err)
    finally:
        _scheduler = None
