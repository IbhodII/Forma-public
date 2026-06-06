# -*- coding: utf-8 -*-
"""Нормализация DataFrame кардио (колонки FIT/Excel)."""
from __future__ import annotations

from typing import Any

import pandas as pd

CARDIO_OPTIONAL_COLUMNS: dict[str, Any] = {
    "start_time": None,
    "data_source": None,
    "avg_speed_kmh": None,
    "max_speed_kmh": None,
    "avg_cadence": None,
    "avg_power": None,
    "max_power": None,
    "speed_kmh": None,
    "pace_min_km": None,
    "pace_sec_100m": None,
    "calories_chest": None,
    "calories_watch": None,
}


def ensure_cardio_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Добавляет отсутствующие колонки (None), чтобы не было KeyError."""
    if df.empty:
        return df
    out = df.copy()
    for col, default in CARDIO_OPTIONAL_COLUMNS.items():
        if col not in out.columns:
            out[col] = default
    return out


def has_nonempty_start_time(df: pd.DataFrame) -> pd.Series:
    """Маска строк с заполненным start_time; если колонки нет — все False."""
    if df.empty or "start_time" not in df.columns:
        return pd.Series(False, index=df.index)
    col = df["start_time"]
    return col.notna() & (col.astype(str).str.strip() != "")
