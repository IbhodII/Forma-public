# -*- coding: utf-8 -*-
"""Парсинг ответов Open Food Facts (без сетевых запросов)."""
from __future__ import annotations

from backend.services.openfoodfacts_service import (
    parse_barcode_response,
    parse_off_product,
    parse_search_response,
    parse_search_response_summaries,
    preview_to_product_summary,
)


def test_parse_off_product_buckwheat_macros():
    product = {
        "product_name": "Гречка",
        "code": "4607019751002",
        "nutriments": {
            "proteins_100g": 12.6,
            "fat_100g": 3.3,
            "carbohydrates_100g": 68,
            "fiber_100g": 10,
            "energy-kcal_100g": 330,
            "vitamin-c_100g": 0,
            "calcium_100g": 0.018,
            "iron_100g": 0.0022,
            "potassium_100g": 0.46,
        },
    }
    preview = parse_off_product(product, barcode="4607019751002")
    assert preview["name"] == "Гречка"
    assert preview["external_id"] == "4607019751002"
    assert preview["protein"] == 12.6
    assert preview["fat"] == 3.3
    assert preview["carbs"] == 68.0
    assert preview["fiber_g"] == 10.0
    assert preview["calories"] == 330.0


def test_parse_barcode_response_not_found():
    assert parse_barcode_response({"status": 0}) is None


def test_parse_barcode_response_found():
    data = {
        "status": 1,
        "_barcode": "4607019751002",
        "product": {
            "product_name": "Test",
            "nutriments": {"proteins_100g": 1, "fat_100g": 2, "carbohydrates_100g": 3},
        },
    }
    preview = parse_barcode_response(data)
    assert preview is not None
    assert preview["name"] == "Test"
    assert preview["external_id"] == "4607019751002"


def test_parse_search_response_list():
    data = {
        "products": [
            {
                "code": "1234567890123",
                "product_name": "A",
                "nutriments": {"proteins_100g": 5},
            },
        ],
    }
    items = parse_search_response(data)
    assert len(items) == 1
    assert items[0]["external_id"] == "1234567890123"


def test_preview_to_product_summary():
    preview = parse_off_product(
        {
            "product_name": "Гречка",
            "code": "4607019751002",
            "nutriments": {"proteins_100g": 12.6, "energy-kcal_100g": 330},
        },
        barcode="4607019751002",
    )
    summary = preview_to_product_summary(preview)
    assert summary["name"] == "Гречка"
    assert summary["barcode"] == "4607019751002"
    assert summary["protein"] == 12.6
    assert summary["calories"] == 330.0


def test_parse_search_response_summaries_null_macros():
    data = {
        "products": [
            {"code": "1234567890123", "product_name": "Без КБЖУ"},
        ],
    }
    items = parse_search_response_summaries(data)
    assert len(items) == 1
    assert items[0]["name"] == "Без КБЖУ"
    assert items[0]["protein"] is None
    assert items[0]["calories"] is None

