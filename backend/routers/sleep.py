# -*- coding: utf-8 -*-
"""API сводки сна."""
from __future__ import annotations

from fastapi import APIRouter, Query

from backend.services import sleep_service

router = APIRouter(tags=["sleep"])


@router.get("/summary", summary="Сводка сна за последние N дней")
def api_sleep_summary(days: int = Query(7, ge=1, le=30)):
    return sleep_service.get_sleep_summary(days=days)
