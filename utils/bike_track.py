# -*- coding: utf-8 -*-
"""Сборка GeoJSON трека велотренировки с метаданными точек."""
from __future__ import annotations

from typing import Any


def _arr(values: list[Any]) -> list[Any]:
    return values


def build_enriched_geojson(track_points: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    track_points: упорядоченные dict с ключами lon, lat, elapsed_sec и опционально
    speed_kmh, cadence, elevation_m, temperature_c, heart_rate, distance_m.
    """
    if len(track_points) < 2:
        return None
    coords: list[list[float]] = []
    elapsed: list[int | None] = []
    speed: list[float | None] = []
    cadence: list[float | None] = []
    elevation: list[float | None] = []
    temperature: list[float | None] = []
    heart_rate: list[int | None] = []
    distance_m: list[float | None] = []

    for p in track_points:
        lon, lat = p.get("lon"), p.get("lat")
        if lon is None or lat is None:
            continue
        coords.append([float(lon), float(lat)])
        elapsed.append(
            float(p["elapsed_sec"]) if p.get("elapsed_sec") is not None else None
        )
        speed.append(_float_or_none(p.get("speed_kmh")))
        cadence.append(_float_or_none(p.get("cadence")))
        elevation.append(_float_or_none(p.get("elevation_m")))
        temperature.append(_float_or_none(p.get("temperature_c")))
        heart_rate.append(
            int(p["heart_rate"]) if p.get("heart_rate") is not None else None
        )
        distance_m.append(_float_or_none(p.get("distance_m")))

    if len(coords) < 2:
        return None

    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {"type": "LineString", "coordinates": coords},
                "properties": {
                    "elapsed_sec": _arr(elapsed),
                    "speed_kmh": _arr(speed),
                    "cadence": _arr(cadence),
                    "elevation_m": _arr(elevation),
                    "temperature_c": _arr(temperature),
                    "heart_rate": _arr(heart_rate),
                    "distance_m": _arr(distance_m),
                },
            }
        ],
    }


def _float_or_none(val: Any) -> float | None:
    if val is None:
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None


def geojson_to_track_points(geo: dict[str, Any]) -> list[dict[str, Any]]:
    """Точки трека с properties (elapsed_sec, speed_kmh, …)."""
    feature = None
    if geo.get("type") == "FeatureCollection" and geo.get("features"):
        feature = geo["features"][0]
    elif geo.get("type") == "Feature":
        feature = geo
    elif geo.get("type") == "LineString":
        feature = {"geometry": geo, "properties": {}}

    if not feature:
        return linestring_to_track_points(geo)

    geometry = feature.get("geometry") or {}
    props = feature.get("properties") or {}
    coords = geometry.get("coordinates") or []
    if geometry.get("type") != "LineString" or len(coords) < 2:
        return linestring_to_track_points(geo)

    elapsed = props.get("elapsed_sec")
    has_props = isinstance(elapsed, list) and len(elapsed) > 0

    out: list[dict[str, Any]] = []
    for i, c in enumerate(coords):
        if not isinstance(c, (list, tuple)) or len(c) < 2:
            continue
        lon, lat = float(c[0]), float(c[1])
        sec = float(elapsed[i]) if has_props and i < len(elapsed) else float(i)
        out.append(
            {
                "lon": lon,
                "lat": lat,
                "elapsed_sec": sec,
                "speed_kmh": _prop_at(props, "speed_kmh", i),
                "cadence": _prop_at(props, "cadence", i),
                "elevation_m": _prop_at(props, "elevation_m", i),
                "temperature_c": _prop_at(props, "temperature_c", i),
                "heart_rate": _prop_int(props, "heart_rate", i),
                "distance_m": _prop_at(props, "distance_m", i),
            }
        )
    return out


def _prop_at(props: dict[str, Any], key: str, i: int) -> float | None:
    arr = props.get(key)
    if not isinstance(arr, list) or i >= len(arr):
        return None
    return _float_or_none(arr[i])


def _prop_int(props: dict[str, Any], key: str, i: int) -> int | None:
    v = _prop_at(props, key, i)
    if v is None:
        return None
    return int(v)


def linestring_to_track_points(geo: dict[str, Any]) -> list[dict[str, Any]]:
    """Из LineString или FeatureCollection извлечь точки (без properties)."""
    coords: list[list[float]] = []
    if geo.get("type") == "LineString":
        coords = geo.get("coordinates") or []
    elif geo.get("type") == "FeatureCollection":
        for f in geo.get("features") or []:
            g = (f or {}).get("geometry") or {}
            if g.get("type") == "LineString":
                coords = g.get("coordinates") or []
                break
    out: list[dict[str, Any]] = []
    for i, c in enumerate(coords):
        if not isinstance(c, (list, tuple)) or len(c) < 2:
            continue
        out.append({"lon": float(c[0]), "lat": float(c[1]), "elapsed_sec": i})
    return out


def enrich_geojson_from_sensors(
    geo: dict[str, Any],
    sensor_rows: list[dict[str, Any]],
    hr_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Дополнить legacy LineString свойствами из workout_sensors и пульса."""
    feature = None
    if geo.get("type") == "FeatureCollection" and geo.get("features"):
        feature = geo["features"][0]
    elif geo.get("type") == "LineString":
        feature = {
            "type": "Feature",
            "geometry": geo,
            "properties": {},
        }
        geo = {"type": "FeatureCollection", "features": [feature]}
    if not feature:
        return geo

    props = feature.get("properties") or {}
    if props.get("elapsed_sec") and props.get("speed_kmh"):
        return geo

    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return geo

    sensor_by_sec = {int(r["elapsed_sec"]): r for r in sensor_rows if r.get("elapsed_sec") is not None}
    hr_by_sec = {int(r["seconds"]): r for r in hr_rows if r.get("seconds") is not None}

    n = len(coords)
    if sensor_rows:
        max_sec = max(sensor_by_sec.keys(), default=n - 1)
        step = max_sec / max(n - 1, 1)
    else:
        step = 1.0

    elapsed: list[int] = []
    speed: list[float | None] = []
    cadence: list[float | None] = []
    elevation: list[float | None] = []
    temperature: list[float | None] = []
    heart_rate: list[int | None] = []
    distance_m: list[float | None] = []

    for i in range(n):
        sec = int(round(i * step)) if sensor_rows else i
        elapsed.append(sec)
        s = sensor_by_sec.get(sec, {})
        h = hr_by_sec.get(sec, {})
        speed.append(_float_or_none(s.get("speed_kmh")))
        cadence.append(_float_or_none(s.get("cadence")))
        elevation.append(_float_or_none(s.get("elevation_m")))
        temperature.append(_float_or_none(s.get("temperature_c")))
        heart_rate.append(
            int(h["heart_rate"]) if h.get("heart_rate") is not None else None
        )
        distance_m.append(_float_or_none(h.get("distance_m")))

    feature["properties"] = {
        "elapsed_sec": elapsed,
        "speed_kmh": speed,
        "cadence": cadence,
        "elevation_m": elevation,
        "temperature_c": temperature,
        "heart_rate": heart_rate,
        "distance_m": distance_m,
    }
    return geo
