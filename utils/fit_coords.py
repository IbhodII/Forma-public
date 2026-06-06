# -*- coding: utf-8 -*-
"""Координаты FIT: semicircles → градусы (WGS84)."""
from __future__ import annotations

_SEMICIRCLE_TO_DEG = 180.0 / (2**31)


def semicircles_to_degrees(value: float) -> float:
    return float(value) * _SEMICIRCLE_TO_DEG


def normalize_lon_lat(lon: float, lat: float) -> tuple[float, float]:
    """
    GeoJSON [lon, lat] в градусах.
    Если в БД остались сырые semicircles (|lon|>180) — конвертируем.
    """
    lon_f, lat_f = float(lon), float(lat)
    if abs(lon_f) > 180 or abs(lat_f) > 90:
        return semicircles_to_degrees(lon_f), semicircles_to_degrees(lat_f)
    return lon_f, lat_f
