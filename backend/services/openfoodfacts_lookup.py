# -*- coding: utf-8 -*-

"""Поиск продуктов: локальная БД → кэш OFF → API Open Food Facts."""

from __future__ import annotations



import logging

from typing import Any



from fastapi import HTTPException



from backend.services import food_service

from backend.services.openfoodfacts_service import (

    OpenFoodFactsError,

    cache_key_barcode,

    cache_key_search,

    deserialize_cache_payload,

    normalize_barcode,

    parse_barcode_response,

    parse_search_response_summaries,

    preview_to_product_summary,

    product_summary_to_preview,

    search_by_barcode,

    search_by_name,

    serialize_cache_payload,

)



logger = logging.getLogger(__name__)



NOT_FOUND_BARCODE_MSG = "Продукт не найден в Open Food Facts"

NOT_FOUND_SEARCH_MSG = (

    "Ничего не найдено. Попробуйте другое название или создайте продукт вручную."

)





def _preview_from_product_row(product: dict[str, Any]) -> dict[str, Any]:

    return {

        "name": product["name"],

        "external_id": product.get("external_id"),

        "brand": None,

        "image_url": None,

        "protein": product.get("protein", 0),

        "fat": product.get("fat", 0),

        "carbs": product.get("carbs", 0),

        "fiber_g": product.get("fiber_g", 0),

        "calories": product.get("calories", 0),

        "is_alcohol": product.get("is_alcohol", False),

        "vitamin_c_mg": product.get("vitamin_c_mg", 0),

        "vitamin_d_mcg": product.get("vitamin_d_mcg", 0),

        "vitamin_b12_mcg": product.get("vitamin_b12_mcg", 0),

        "calcium_mg": product.get("calcium_mg", 0),

        "iron_mg": product.get("iron_mg", 0),

        "magnesium_mg": product.get("magnesium_mg", 0),

        "zinc_mg": product.get("zinc_mg", 0),

        "potassium_mg": product.get("potassium_mg", 0),

        "sodium_mg": product.get("sodium_mg", 0),

    }





def _preview_has_macros(preview: dict[str, Any]) -> bool:
    return (
        float(preview.get("calories") or 0) > 0
        or float(preview.get("protein") or 0) > 0
        or float(preview.get("fat") or 0) > 0
        or float(preview.get("carbs") or 0) > 0
    )


def _barcode_hit(

    *,

    code: str,

    source: str,

    preview: dict[str, Any],

    message: str | None = None,

    existing: dict[str, Any] | None = None,

) -> dict[str, Any]:

    product = preview_to_product_summary(preview)

    return {

        "found": True,

        "barcode": code,

        "source": source,

        "message": message,

        "product": product,

        "preview": preview,

        "existing_product": existing,

        "local_name_matches": _local_name_matches(preview["name"]),

    }





def _local_name_matches(name: str) -> list[dict[str, Any]]:

    exact = food_service.find_product_by_name_exact(name)

    if exact:

        return [exact]

    return food_service.find_products_by_name(name, limit=5)





def lookup_by_barcode(barcode: str) -> dict[str, Any]:

    code = normalize_barcode(barcode)



    existing = food_service.get_product_by_external_id(code)

    if existing:

        preview = _preview_from_product_row(existing)

        return _barcode_hit(

            code=code,

            source="local",

            preview=preview,

            message="Продукт уже есть в справочнике по этому штрихкоду.",

            existing=existing,

        )



    key = cache_key_barcode(code)

    cached = food_service.get_off_cache(key)

    if cached:

        try:

            raw = deserialize_cache_payload(cached)

            preview = parse_barcode_response(raw) if isinstance(raw, dict) else None

            if preview:

                return _barcode_hit(code=code, source="cache", preview=preview)

        except Exception:

            logger.debug("Invalid OFF barcode cache", exc_info=True)



    try:
        raw = search_by_barcode(code)
    except OpenFoodFactsError as exc:
        logger.warning("OFF barcode lookup failed for %s: %s", code, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc



    preview = parse_barcode_response(raw)
    if preview is None:
        return {
            "found": False,
            "barcode": code,
            "source": "none",
            "message": NOT_FOUND_BARCODE_MSG,
            "product": None,
            "preview": None,
            "existing_product": None,
            "local_name_matches": [],
        }

    if not _preview_has_macros(preview):
        logger.warning("OFF barcode %s: product without usable macros", code)
        raise HTTPException(
            status_code=400,
            detail="У продукта нет данных о калориях или БЖУ в Open Food Facts",
        )

    food_service.set_off_cache(key, serialize_cache_payload(raw))

    return _barcode_hit(code=code, source="api", preview=preview)





def lookup_by_name(query: str) -> dict[str, Any]:

    q = str(query or "").strip()

    if len(q) < 2:

        raise HTTPException(status_code=400, detail="Запрос: минимум 2 символа")



    local_matches = food_service.find_products_by_name(q, limit=8)



    key = cache_key_search(q)

    cached = food_service.get_off_cache(key)

    if cached:

        try:

            raw = deserialize_cache_payload(cached)

            items = parse_search_response_summaries(raw) if isinstance(raw, dict) else []

            if items:

                return {

                    "found": True,

                    "source": "cache",

                    "items": items,

                    "local_matches": local_matches,

                }

        except Exception:

            logger.debug("Invalid OFF search cache", exc_info=True)



    try:
        raw = search_by_name(q)
    except OpenFoodFactsError as exc:
        logger.warning("OFF name search failed for %r: %s", q, exc)
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc



    food_service.set_off_cache(key, serialize_cache_payload(raw))

    items = parse_search_response_summaries(raw)
    items = [item for item in items if _preview_has_macros(product_summary_to_preview(item))]

    if not items:
        return {
            "found": False,
            "source": "none",
            "message": NOT_FOUND_SEARCH_MSG,
            "items": [],
            "local_matches": local_matches,
        }

    return {

        "found": True,

        "source": "api",

        "items": items,

        "local_matches": local_matches,

    }





def summary_to_preview_for_form(summary: dict[str, Any]) -> dict[str, Any]:

    """Превью с микронутриентами для формы (из краткой сводки поиска)."""

    return product_summary_to_preview(summary)


