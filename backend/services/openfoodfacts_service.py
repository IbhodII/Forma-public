# -*- coding: utf-8 -*-
"""Open Food Facts API: поиск по штрихкоду и названию, парсинг нутриентов на 100 г."""
from __future__ import annotations

import json
import logging
import re
import threading
import time
from typing import Any
from urllib.parse import quote

import requests
from fastapi import HTTPException

from utils.micro_nutrients import MICRO_KEYS

logger = logging.getLogger(__name__)

OFF_PRODUCT_URL = "https://world.openfoodfacts.org/api/v0/product/{barcode}.json"
OFF_SEARCH_URL = "https://world.openfoodfacts.org/cgi/search.pl"
OFF_USER_AGENT = "MyHealthDashboard/1.0 (personal nutrition tracker)"
OFF_TIMEOUT_SEC = 12
MIN_REQUEST_INTERVAL_SEC = 0.5
OFF_MAX_RETRIES = 2

_rate_lock = threading.Lock()
_last_request_at = 0.0


class OpenFoodFactsError(Exception):
    """Сбой запроса к Open Food Facts."""

    def __init__(self, message: str, *, status_code: int = 502) -> None:
        super().__init__(message)
        self.status_code = status_code


def normalize_barcode(raw: str) -> str:
    digits = re.sub(r"\D", "", str(raw or "").strip())
    if len(digits) < 8 or len(digits) > 14:
        raise HTTPException(status_code=400, detail="Штрихкод: от 8 до 14 цифр")
    return digits


def _throttle() -> None:
    global _last_request_at
    with _rate_lock:
        now = time.monotonic()
        wait = MIN_REQUEST_INTERVAL_SEC - (now - _last_request_at)
        if wait > 0:
            time.sleep(wait)
        _last_request_at = time.monotonic()


def _off_get(
    url: str,
    *,
    params: dict[str, Any] | None = None,
    allow_http_not_found: bool = False,
) -> dict[str, Any] | None:
    last_exc: requests.RequestException | None = None
    for attempt in range(OFF_MAX_RETRIES):
        _throttle()
        try:
            resp = requests.get(
                url,
                params=params,
                timeout=OFF_TIMEOUT_SEC,
                headers={"User-Agent": OFF_USER_AGENT},
            )
        except requests.RequestException as exc:
            last_exc = exc
            logger.warning(
                "Open Food Facts network error (attempt %s/%s): %s",
                attempt + 1,
                OFF_MAX_RETRIES,
                exc,
            )
            if attempt + 1 < OFF_MAX_RETRIES:
                time.sleep(0.3)
                continue
            raise OpenFoodFactsError(
                "Не удалось связаться с Open Food Facts. Заполните продукт вручную.",
                status_code=503,
            ) from exc

        if allow_http_not_found and resp.status_code == 404:
            return None
        if resp.status_code == 429:
            raise OpenFoodFactsError(
                "Превышен лимит запросов Open Food Facts. Повторите через минуту.",
                status_code=429,
            )
        if resp.status_code >= 500:
            if attempt + 1 < OFF_MAX_RETRIES:
                time.sleep(0.3)
                continue
            raise OpenFoodFactsError(
                "Сервис Open Food Facts временно недоступен.",
                status_code=502,
            )
        try:
            return resp.json()
        except ValueError as exc:
            raise OpenFoodFactsError("Некорректный ответ Open Food Facts.") from exc

    if last_exc is not None:
        raise OpenFoodFactsError(
            "Не удалось связаться с Open Food Facts. Заполните продукт вручную.",
            status_code=503,
        ) from last_exc
    raise OpenFoodFactsError("Не удалось связаться с Open Food Facts.")


def _round1(n: float) -> float:
    return round(float(n), 1)


def _first_float(nutriments: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        if key not in nutriments:
            continue
        try:
            val = float(nutriments[key])
        except (TypeError, ValueError):
            continue
        if val < 0:
            continue
        return val
    return None


def _g_per_100g_to_mg(value: float) -> float:
    """Значения *_100g у минералов/витаминов в OFF часто в г на 100 г."""
    return _round1(value * 1000.0)


def _micro_from_nutriments(nutriments: dict[str, Any]) -> dict[str, float]:
    out = {key: 0.0 for key in MICRO_KEYS}

    vit_c = _first_float(
        nutriments,
        "vitamin-c_100g",
        "vitamin-c",
        "vitamin-c_value",
    )
    if vit_c is not None:
        out["vitamin_c_mg"] = vit_c if vit_c > 15 else _g_per_100g_to_mg(vit_c)

    vit_d = _first_float(nutriments, "vitamin-d_100g", "vitamin-d", "vitamin-d_value")
    if vit_d is not None:
        out["vitamin_d_mcg"] = _round1(vit_d * 1_000_000 if vit_d < 0.05 else vit_d)

    b12 = _first_float(
        nutriments,
        "vitamin-b12_100g",
        "vitamin-b12",
        "vitamin-b12_value",
    )
    if b12 is not None:
        out["vitamin_b12_mcg"] = b12 if b12 > 0.05 else _round1(b12 * 1_000_000)

    calcium = _first_float(nutriments, "calcium_100g", "calcium", "calcium_value")
    if calcium is not None:
        out["calcium_mg"] = calcium if calcium > 50 else _g_per_100g_to_mg(calcium)

    iron = _first_float(nutriments, "iron_100g", "iron", "iron_value")
    if iron is not None:
        out["iron_mg"] = iron if iron > 5 else _g_per_100g_to_mg(iron)

    magnesium = _first_float(
        nutriments,
        "magnesium_100g",
        "magnesium",
        "magnesium_value",
    )
    if magnesium is not None:
        out["magnesium_mg"] = magnesium if magnesium > 50 else _g_per_100g_to_mg(magnesium)

    zinc = _first_float(nutriments, "zinc_100g", "zinc", "zinc_value")
    if zinc is not None:
        out["zinc_mg"] = zinc if zinc > 5 else _g_per_100g_to_mg(zinc)

    potassium = _first_float(
        nutriments,
        "potassium_100g",
        "potassium",
        "potassium_value",
    )
    if potassium is not None:
        out["potassium_mg"] = potassium if potassium > 50 else _g_per_100g_to_mg(potassium)

    sodium = _first_float(nutriments, "sodium_100g", "sodium", "sodium_value")
    if sodium is not None:
        out["sodium_mg"] = sodium if sodium > 50 else _g_per_100g_to_mg(sodium)

    return out


def parse_off_product(product: dict[str, Any], *, barcode: str | None = None) -> dict[str, Any]:
    """Структура для FoodProductCreate / превью на фронте."""
    nutriments = product.get("nutriments") or {}
    if not isinstance(nutriments, dict):
        nutriments = {}

    name = (
        str(product.get("product_name") or "").strip()
        or str(product.get("product_name_ru") or "").strip()
        or str(product.get("generic_name") or "").strip()
        or str(product.get("abbreviated_product_name") or "").strip()
    )
    if not name:
        name = f"Продукт {barcode}" if barcode else "Без названия"

    protein = _first_float(nutriments, "proteins_100g", "proteins") or 0.0
    fat = _first_float(nutriments, "fat_100g", "fat") or 0.0
    carbs = _first_float(
        nutriments,
        "carbohydrates_100g",
        "carbohydrates",
        "carbohydrates_total_100g",
    ) or 0.0
    fiber = _first_float(nutriments, "fiber_100g", "fiber") or 0.0

    kcal = _first_float(
        nutriments,
        "energy-kcal_100g",
        "energy-kcal",
        "energy_100g",
    )
    if kcal is None:
        kj = _first_float(nutriments, "energy-kj_100g", "energy-kj", "energy_100g")
        if kj is not None:
            kcal = kj / 4.184
    if kcal is None:
        kcal = protein * 4 + fat * 9 + carbs * 4

    code = barcode or str(product.get("code") or product.get("_id") or "").strip()
    code = re.sub(r"\D", "", code) or None

    brands = str(product.get("brands") or "").strip() or None
    image = str(product.get("image_front_small_url") or product.get("image_url") or "").strip()
    if not image:
        image = None

    preview: dict[str, Any] = {
        "name": name,
        "external_id": code,
        "brand": brands,
        "image_url": image,
        "protein": _round1(protein),
        "fat": _round1(fat),
        "carbs": _round1(carbs),
        "fiber_g": _round1(fiber),
        "calories": _round1(kcal),
        "is_alcohol": False,
        **_micro_from_nutriments(nutriments),
    }
    return preview


def search_by_barcode(barcode: str) -> dict[str, Any]:
    """Сырой ответ API (status + product). HTTP 404 → status 0."""
    code = normalize_barcode(barcode)
    url = OFF_PRODUCT_URL.format(barcode=code)
    data = _off_get(url, allow_http_not_found=True)
    if data is None:
        return {"status": 0, "_barcode": code}
    data["_barcode"] = code
    return data


def search_by_name(query: str, *, page_size: int = 20) -> dict[str, Any]:
    q = str(query or "").strip()
    if len(q) < 2:
        raise HTTPException(status_code=400, detail="Запрос: минимум 2 символа")
    params = {
        "search_terms": q,
        "search_simple": 1,
        "action": "process",
        "json": 1,
        "page_size": min(max(page_size, 1), 30),
        "fields": (
            "code,product_name,product_name_ru,generic_name,brands,"
            "image_front_small_url,nutriments"
        ),
    }
    return _off_get(OFF_SEARCH_URL, params=params)


def parse_barcode_response(data: dict[str, Any]) -> dict[str, Any] | None:
    if int(data.get("status") or 0) != 1:
        return None
    product = data.get("product")
    if not isinstance(product, dict):
        return None
    barcode = str(data.get("_barcode") or product.get("code") or "")
    return parse_off_product(product, barcode=barcode or None)


def parse_search_response(data: dict[str, Any]) -> list[dict[str, Any]]:
    products = data.get("products")
    if not isinstance(products, list):
        return []
    out: list[dict[str, Any]] = []
    for item in products:
        if not isinstance(item, dict):
            continue
        code = re.sub(r"\D", "", str(item.get("code") or ""))
        try:
            out.append(parse_off_product(item, barcode=code or None))
        except Exception:
            logger.debug("Skip OFF product parse error", exc_info=True)
    return out


def _optional_macro(value: float | None) -> float | None:
    if value is None:
        return None
    return _round1(value)


def preview_to_product_summary(preview: dict[str, Any]) -> dict[str, Any]:
    """Краткая структура для API (product / items)."""
    barcode = preview.get("external_id")
    fiber = preview.get("fiber_g")
    return {
        "name": preview["name"],
        "barcode": barcode,
        "calories": _optional_macro(preview.get("calories")),
        "protein": _optional_macro(preview.get("protein")),
        "fat": _optional_macro(preview.get("fat")),
        "carbs": _optional_macro(preview.get("carbs")),
        "fiber": _optional_macro(fiber if fiber is not None else None),
    }


def parse_off_product_summary(
    product: dict[str, Any],
    *,
    barcode: str | None = None,
) -> dict[str, Any]:
    """Сводка с null для отсутствующих макронутриентов (поиск / API product)."""
    nutriments = product.get("nutriments") or {}
    if not isinstance(nutriments, dict):
        nutriments = {}

    name = (
        str(product.get("product_name") or "").strip()
        or str(product.get("product_name_ru") or "").strip()
        or str(product.get("generic_name") or "").strip()
        or str(product.get("abbreviated_product_name") or "").strip()
    )
    code = barcode or str(product.get("code") or product.get("_id") or "").strip()
    code = re.sub(r"\D", "", code) or None
    if not name:
        name = f"Продукт {code}" if code else "Без названия"

    protein = _first_float(nutriments, "proteins_100g", "proteins")
    fat = _first_float(nutriments, "fat_100g", "fat")
    carbs = _first_float(
        nutriments,
        "carbohydrates_100g",
        "carbohydrates",
        "carbohydrates_total_100g",
    )
    fiber = _first_float(nutriments, "fiber_100g", "fiber")

    kcal = _first_float(
        nutriments,
        "energy-kcal_100g",
        "energy-kcal",
        "energy_100g",
    )
    if kcal is None:
        kj = _first_float(nutriments, "energy-kj_100g", "energy-kj", "energy_100g")
        if kj is not None:
            kcal = kj / 4.184
    if kcal is None and protein is not None and fat is not None and carbs is not None:
        kcal = protein * 4 + fat * 9 + carbs * 4

    return {
        "name": name,
        "barcode": code,
        "calories": _optional_macro(kcal),
        "protein": _optional_macro(protein),
        "fat": _optional_macro(fat),
        "carbs": _optional_macro(carbs),
        "fiber": _optional_macro(fiber),
    }


def product_summary_to_preview(summary: dict[str, Any]) -> dict[str, Any]:
    """Полное превью для формы из краткой сводки."""
    barcode = summary.get("barcode")
    return parse_off_product(
        {
            "product_name": summary.get("name"),
            "code": barcode,
            "nutriments": {
                "proteins_100g": summary.get("protein") or 0,
                "fat_100g": summary.get("fat") or 0,
                "carbohydrates_100g": summary.get("carbs") or 0,
                "fiber_100g": summary.get("fiber") or 0,
                "energy-kcal_100g": summary.get("calories") or 0,
            },
        },
        barcode=barcode,
    )


def parse_search_response_summaries(data: dict[str, Any]) -> list[dict[str, Any]]:
    products = data.get("products")
    if not isinstance(products, list):
        return []
    out: list[dict[str, Any]] = []
    for item in products:
        if not isinstance(item, dict):
            continue
        code = re.sub(r"\D", "", str(item.get("code") or ""))
        try:
            out.append(parse_off_product_summary(item, barcode=code or None))
        except Exception:
            logger.debug("Skip OFF product summary parse error", exc_info=True)
    return out


def cache_key_barcode(barcode: str) -> str:
    return f"barcode:{normalize_barcode(barcode)}"


def cache_key_search(query: str) -> str:
    return f"search:{quote(str(query).strip().lower()[:120])}"


def serialize_cache_payload(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def deserialize_cache_payload(raw: str) -> Any:
    return json.loads(raw)
