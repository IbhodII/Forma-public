# -*- coding: utf-8 -*-
from unittest.mock import patch

from backend.services.openfoodfacts_contribute import contribute_product, off_contribute_configured


def test_off_not_configured():
    with patch.dict("os.environ", {}, clear=True):
        assert off_contribute_configured() is False
        result = contribute_product(
            barcode="4607019751002",
            name="Test",
            protein=10,
            fat=5,
            carbs=20,
            fiber_g=2,
            calories=150,
        )
        assert result["ok"] is False


def test_off_contribute_success():
    with patch.dict("os.environ", {"OFF_USER_ID": "user", "OFF_PASSWORD": "pass"}):
        mock_resp = type(
            "R",
            (),
            {
                "content": b'{"status": 1, "status_verbose": "fields saved"}',
                "text": '{"status": 1}',
                "raise_for_status": lambda self: None,
                "json": lambda self: {"status": 1, "status_verbose": "fields saved"},
            },
        )()
        with patch("backend.services.openfoodfacts_contribute.requests.post", return_value=mock_resp):
            result = contribute_product(
                barcode="4607019751002",
                name="Гречка",
                protein=3,
                fat=1,
                carbs=20,
                fiber_g=2,
                calories=100,
            )
        assert result["ok"] is True
        assert result["barcode"] == "4607019751002"
