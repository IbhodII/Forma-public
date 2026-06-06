# -*- coding: utf-8 -*-
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Any

import pandas as pd

def format_date_ru(value, *, with_time: bool = False) -> str:
    """ISO-дата или datetime → DD.MM.YYYY (опционально HH:MM)."""
    if value is None or (isinstance(value, float) and pd.isna(value)):
        return "—"
    text = str(value).strip()
    if not text or text.lower() in ("nan", "nat", "none"):
        return "—"
    try:
        if with_time and len(text) >= 16:
            dt = pd.to_datetime(text[:19], errors="coerce")
            if pd.notna(dt):
                return dt.strftime("%d.%m.%Y %H:%M")
        dt = pd.to_datetime(text[:10], errors="coerce")
        if pd.notna(dt):
            return dt.strftime("%d.%m.%Y")
    except (TypeError, ValueError):
        pass
    return text


def normalize_cardio_date_column(df: pd.DataFrame, column: str = "date") -> pd.DataFrame:
    """
    Даты кардио: не пересчитывать уже сохранённые ISO-строки (иначе Excel serial ломает месяц).
    """
    if df.empty or column not in df.columns:
        return df
    out = df.copy()
    as_str = out[column].astype(str).str.strip().str[:10]
    if as_str.str.match(r"^\d{4}-\d{2}-\d{2}$", na=False).all():
        out[column] = as_str
        return out
    return normalize_date_column(out, column)


def cardio_duration_sec(minutes_val: Any, seconds_val: Any) -> int | None:
    """
  Продолжительность кардио из Excel: минуты/секунды, timedelta, время суток,
  дробь суток (0.065 ≈ 1 ч 34 мин).
    """
    def _from_minutes_cell(v: Any) -> int:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0
        if isinstance(v, timedelta):
            return max(0, int(v.total_seconds()))
        if isinstance(v, time):
            return v.hour * 3600 + v.minute * 60 + v.second
        if isinstance(v, datetime):
            return v.hour * 3600 + v.minute * 60 + v.second
        try:
            num = float(str(v).strip().replace(",", "."))
        except (TypeError, ValueError):
            return 0
        if 0 < num < 1:
            return int(round(num * 86400))
        if num >= 1:
            return int(round(num * 60))
        return 0

    def _from_seconds_cell(v: Any) -> int:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return 0
        if isinstance(v, timedelta):
            return max(0, int(v.total_seconds()))
        if isinstance(v, time):
            return v.hour * 3600 + v.minute * 60 + v.second
        if isinstance(v, datetime):
            return v.hour * 3600 + v.minute * 60 + v.second
        try:
            num = float(str(v).strip().replace(",", "."))
        except (TypeError, ValueError):
            return 0
        if 0 < num < 1:
            return int(round(num * 86400))
        return int(round(num))

    if isinstance(minutes_val, timedelta):
        total = _from_minutes_cell(minutes_val)
    else:
        total = _from_minutes_cell(minutes_val) + _from_seconds_cell(seconds_val)
    return total if total > 0 else None


def format_duration(duration_sec) -> str:
    if duration_sec is None or pd.isna(duration_sec):
        return "—"
    try:
        total = int(round(float(duration_sec)))
    except (TypeError, ValueError):
        return "—"
    if total <= 0:
        return "—"
    h, rem = divmod(total, 3600)
    m, s = divmod(rem, 60)
    if h > 0:
        return f"{h} ч {m} мин"
    return f"{m} мин {s} сек"


def normalize_date_column(df: pd.DataFrame, column: str = "date") -> pd.DataFrame:
    """
    Приводит колонку даты к строкам YYYY-MM-DD.
    Сначала Excel serial (25 000–60 000), затем ISO/строки (не pd.to_datetime(45123) → 1970/45234 год).
    """
    if df.empty or column not in df.columns:
        return df
    out = df.copy()
    raw = out[column]
    numeric = pd.to_numeric(raw, errors="coerce")
    parsed = pd.Series(pd.NaT, index=out.index, dtype="datetime64[ns]")

    serial_mask = numeric.notna() & (numeric >= 25000) & (numeric <= 60000)
    if serial_mask.any():
        parsed.loc[serial_mask] = pd.to_datetime(
            numeric.loc[serial_mask],
            unit="D",
            origin="1899-12-30",
            errors="coerce",
        )

    rest = ~serial_mask
    if rest.any():
        parsed.loc[rest] = pd.to_datetime(raw.loc[rest], errors="coerce")

    # Число попало в pd.to_datetime как наносекунды (1970 год) — перечитать как serial
    bad_year = parsed.notna() & (parsed.dt.year < 1990) & serial_mask
    if bad_year.any():
        parsed.loc[bad_year] = pd.to_datetime(
            numeric.loc[bad_year], unit="D", origin="1899-12-30", errors="coerce"
        )

    out[column] = parsed.dt.strftime("%Y-%m-%d")
    valid = parsed.notna() & (parsed.dt.year >= 1990) & (parsed.dt.year <= 2100)
    return out.loc[valid].copy()


def excel_date_to_str(val) -> str | None:
    """Excel serial или строка → YYYY-MM-DD."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    out = normalize_date_column(pd.DataFrame({"date": [val]}), "date")
    return None if out.empty else str(out.iloc[0]["date"])[:10]
