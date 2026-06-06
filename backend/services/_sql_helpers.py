# -*- coding: utf-8 -*-
"""Вспомогательные функции для сервисов (без Streamlit)."""
from __future__ import annotations

import json
from typing import Any

import pandas as pd


def records_from_df(df: pd.DataFrame) -> list[dict[str, Any]]:
    """DataFrame → list[dict], NaN → null для JSON/Pydantic."""
    if df.empty:
        return []
    out = json.loads(df.to_json(orient="records", date_format="iso"))
    for rec in out:
        if rec.get("date"):
            rec["date"] = str(rec["date"])[:10]
    return out


def int_or_none(value: Any) -> int | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def float_or_none(value: Any) -> float | None:
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
