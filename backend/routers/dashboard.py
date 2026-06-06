# -*- coding: utf-8 -*-
"""Home dashboard aggregated API."""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from backend.database.client_context import is_admin_browser_client
from backend.schemas.models import DashboardHomeResponse
from backend.services.dashboard_home_service import (
    build_dashboard_home,
    build_dashboard_home_extensions,
    build_dashboard_home_summary,
)

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


def _strip_profile(data: dict[str, Any]) -> dict[str, Any]:
    out = dict(data)
    out.pop("_profile", None)
    return out


@router.get(
    "/home/summary",
    response_model=DashboardHomeResponse,
    summary="Лёгкая сводка для cold start",
    description=(
        "Быстрый первый экран: питание (lite), тело, шаги, сон, синхронизация. "
        "CTL и тяжёлая аналитика — через /home/extensions."
    ),
)
async def api_dashboard_home_summary(
    phase: str = Query("cut", pattern="^(cut|bulk)$"),
) -> DashboardHomeResponse:
    data = await build_dashboard_home_summary(phase=phase)
    return DashboardHomeResponse.model_validate(_strip_profile(data))


@router.get(
    "/home/extensions",
    summary="Тяжёлые блоки главной (lazy)",
    description="parts=ctl — тренировочная нагрузка (90 дней TRIMP).",
)
async def api_dashboard_home_extensions(
    parts: str = Query("ctl", description="Через запятую: ctl"),
    ctl_days: int = Query(90, ge=7, le=365),
) -> dict[str, Any]:
    part_list = [p.strip() for p in parts.split(",") if p.strip()]
    return build_dashboard_home_extensions(part_list, ctl_days=ctl_days)


@router.get(
    "/home",
    response_model=DashboardHomeResponse,
    summary="Сводка для главной (summary + CTL)",
    description=(
        "По умолчанию summary + CTL. Полный HC hub — ?include_hc_hub=1 "
        "или admin_browser."
    ),
)
async def api_dashboard_home(
    phase: str = Query("cut", pattern="^(cut|bulk)$"),
    include_hc_hub: bool | None = Query(
        None,
        description="Включить полный health-connect hub",
    ),
    include_ctl: bool = Query(True, description="Включить CTL/ATL/TSB"),
) -> DashboardHomeResponse:
    if include_hc_hub is None:
        include_hc_hub = is_admin_browser_client()
    if include_hc_hub:
        data = await build_dashboard_home(
            phase=phase,
            include_hc_hub=True,
            include_ctl=include_ctl,
        )
    else:
        data = await build_dashboard_home_summary(phase=phase)
        if include_ctl:
            ext = build_dashboard_home_extensions(["ctl"])
            data["ctl"] = ext.get("ctl") or {"items": [], "current": {}}
        return DashboardHomeResponse.model_validate(_strip_profile(data))
    return DashboardHomeResponse.model_validate(_strip_profile(data))
