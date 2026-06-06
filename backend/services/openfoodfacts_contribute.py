# -*- coding: utf-8 -*-
"""Отправка новых продуктов в Open Food Facts (write API)."""
from __future__ import annotations

import logging
import os
from typing import Any

import requests

from backend.services.openfoodfacts_service import OFF_USER_AGENT, OFF_TIMEOUT_SEC, normalize_barcode

logger = logging.getLogger(__name__)

OFF_WRITE_URL = "https://world.openfoodfacts.org/cgi/product_jquery.pl"


def _off_credentials() -> tuple[str, str]:
    user = os.getenv("OFF_USER_ID", "").strip()
    password = os.getenv("OFF_PASSWORD", "").strip()
    return user, password


def off_contribute_configured() -> bool:
    user, password = _off_credentials()
    return bool(user and password)


def contribute_product(
    *,
    barcode: str,
    name: str,
    brand: str | None = None,
    protein: float = 0,
    fat: float = 0,
    carbs: float = 0,
    fiber_g: float = 0,
    calories: float = 0,
) -> dict[str, Any]:
    """
    Создать/обновить карточку продукта в OFF (на 100 г).
    Требуются OFF_USER_ID и OFF_PASSWORD в .env (аккаунт openfoodfacts.org).
    """
    user, password = _off_credentials()
    if not user or not password:
        return {
            "ok": False,
            "message": (
                "Отправка в Open Food Facts не настроена на сервере "
                "(OFF_USER_ID / OFF_PASSWORD в .env)."
            ),
        }

    code = normalize_barcode(barcode)
    title = str(name or "").strip()
    if not title:
        return {"ok": False, "message": "Укажите название продукта"}

    kcal = max(0.0, float(calories or 0))
    energy_kj = round(kcal * 4.184, 2)

    data: dict[str, str] = {
        "user_id": user,
        "password": password,
        "code": code,
        "product_name": title,
        "nutrition_data_per": "100g",
        "nutriment_energy-kj_100g": str(energy_kj),
        "nutriment_proteins_100g": str(round(float(protein or 0), 3)),
        "nutriment_fat_100g": str(round(float(fat or 0), 3)),
        "nutriment_carbohydrates_100g": str(round(float(carbs or 0), 3)),
        "nutriment_fiber_100g": str(round(float(fiber_g or 0), 3)),
    }
    if brand and str(brand).strip():
        data["brands"] = str(brand).strip()

    try:
        resp = requests.post(
            OFF_WRITE_URL,
            data=data,
            timeout=OFF_TIMEOUT_SEC,
            headers={"User-Agent": OFF_USER_AGENT},
        )
        resp.raise_for_status()
        payload = resp.json() if resp.content else {}
    except requests.RequestException as exc:
        logger.warning("OFF contribute failed: %s", exc)
        return {
            "ok": False,
            "message": f"Не удалось отправить в Open Food Facts: {exc}",
        }
    except ValueError:
        payload = {"status_verbose": resp.text[:500] if resp.text else "unknown"}

    status = str(payload.get("status") or payload.get("status_verbose") or "").lower()
    if status in ("1", "fields saved", "ok", "success") or "saved" in status:
        return {
            "ok": True,
            "message": "Продукт отправлен в Open Food Facts",
            "barcode": code,
            "off_status": payload.get("status_verbose") or status,
        }

    verbose = payload.get("status_verbose") or payload.get("error") or str(payload)
    return {
        "ok": False,
        "message": f"Open Food Facts: {verbose}",
        "barcode": code,
    }
