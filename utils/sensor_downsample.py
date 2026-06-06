# -*- coding: utf-8 -*-
"""Прореживание рядов датчиков велотренировки (1 Гц, температура, графики)."""
from __future__ import annotations

from typing import Any


def downsample_rows_by_second(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Одна точка на целую секунду elapsed_sec (последнее значение в секунде)."""
    by_sec: dict[int, dict[str, Any]] = {}
    for row in sorted(rows, key=lambda r: int(r.get("elapsed_sec", 0))):
        sec = int(row["elapsed_sec"])
        prev = by_sec.get(sec, {})
        merged = {**prev, **row, "elapsed_sec": sec}
        by_sec[sec] = merged
    return [by_sec[s] for s in sorted(by_sec)]


def thin_rows_by_interval(
    rows: list[dict[str, Any]],
    interval_sec: int,
) -> list[dict[str, Any]]:
    """
    Прореживание по elapsed_sec.

    interval_sec=1 — все точки (без прореживания).
    interval_sec=0 — 1 точка в секунду.
    interval_sec>=2 — 1 точка каждые N секунд.
    """
    if not rows:
        return rows
    if interval_sec == 1:
        return rows
    if interval_sec == 0:
        return downsample_rows_by_second(rows)

    by_bucket: dict[int, dict[str, Any]] = {}
    for row in sorted(rows, key=lambda r: int(r.get("elapsed_sec", 0))):
        sec = int(row["elapsed_sec"])
        bucket = sec // interval_sec
        by_bucket[bucket] = {**row, "elapsed_sec": sec}
    return [by_bucket[k] for k in sorted(by_bucket)]


def moving_average(
    values: list[float | None],
    window: int = 7,
) -> list[float | None]:
    """Скользящее среднее; window 5–10 с (по умолчанию 7)."""
    if window < 1:
        window = 1
    n = len(values)
    out: list[float | None] = [None] * n
    half = window // 2
    for i in range(n):
        chunk: list[float] = []
        for j in range(max(0, i - half), min(n, i + half + 1)):
            v = values[j]
            if v is not None:
                chunk.append(float(v))
        if chunk:
            out[i] = sum(chunk) / len(chunk)
    return out


def temperature_chart_series(
    temperature: list[float | None],
    *,
    window: int = 7,
    delta_c: float = 0.5,
) -> list[float | None]:
    """
    Сглаживание + прореживание: точка, если |T − T_prev| >= delta_c.
    Между точками — None (Plotly connectgaps).
    """
    if not temperature:
        return []
    smoothed = moving_average(temperature, window)
    out: list[float | None] = [None] * len(smoothed)
    last_shown: float | None = None
    last_data_idx: int | None = None

    for i, t in enumerate(smoothed):
        if t is None:
            continue
        if last_shown is None or abs(t - last_shown) >= delta_c:
            out[i] = round(t, 2)
            last_shown = t
            last_data_idx = i

    for j in range(len(smoothed) - 1, -1, -1):
        if smoothed[j] is not None:
            if last_data_idx != j:
                out[j] = round(smoothed[j], 2)
            break
    return out


def chart_value_skip_zero(value: float | None) -> float | None:
    """Для графиков скорости/каденса: 0 не рисуем (null), исходные данные не трогаем."""
    if value is None:
        return None
    if value == 0:
        return None
    return value


def apply_sensor_downsample(
    payload: dict[str, Any],
    interval_sec: int = 0,
) -> dict[str, Any]:
    """Прореживание ответа get_sensors + обработка температуры для графика."""
    elapsed = payload.get("elapsed_sec") or []
    if not elapsed:
        return payload

    rows: list[dict[str, Any]] = []
    for i, sec in enumerate(elapsed):
        rows.append(
            {
                "elapsed_sec": int(sec),
                "speed_kmh": _at(payload.get("speed_kmh"), i),
                "cadence": _at(payload.get("cadence"), i),
                "elevation_m": _at(payload.get("elevation_m"), i),
                "temperature_c": _at(payload.get("temperature_c"), i),
                "distance_m": _at(payload.get("distance_m"), i),
                "heart_rate": _at(payload.get("heart_rate"), i),
            }
        )

    rows = thin_rows_by_interval(rows, interval_sec)
    temp_raw = [r.get("temperature_c") for r in rows]
    temp_chart = temperature_chart_series(temp_raw)

    def col(key: str) -> list[Any]:
        return [r.get(key) for r in rows]

    def _has(values: list[Any]) -> bool:
        return any(v is not None for v in values)

    speed = col("speed_kmh")
    cadence = col("cadence")
    elevation = col("elevation_m")

    return {
        **payload,
        "elapsed_sec": col("elapsed_sec"),
        "speed_kmh": speed,
        "cadence": cadence,
        "elevation_m": elevation,
        "temperature_c": temp_chart,
        "distance_m": col("distance_m"),
        "heart_rate": col("heart_rate"),
        "has_cadence": _has(cadence),
        "has_elevation": _has(elevation),
        "has_temperature": _has(temp_chart),
        "has_speed": _has(speed),
    }


def _at(arr: list[Any] | None, i: int) -> Any:
    if not arr or i >= len(arr):
        return None
    return arr[i]
