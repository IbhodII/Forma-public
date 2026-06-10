# -*- coding: utf-8 -*-
"""Сборка GeoJSON трека велотренировки с метаданными точек."""
from __future__ import annotations

import math
from typing import Any


def _arr(values: list[Any]) -> list[Any]:
    return values


def build_enriched_geojson(track_points: list[dict[str, Any]]) -> dict[str, Any] | None:
    """
    track_points: упорядоченные dict с ключами lon, lat, elapsed_sec и опционально
    speed_kmh, cadence, elevation_m, temperature_c, heart_rate, distance_m, power_watts.
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
    power_watts: list[float | None] = []

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
        power_watts.append(_float_or_none(p.get("power_watts")))

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
                    "power_watts": _arr(power_watts),
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
                "power_watts": _prop_at(props, "power_watts", i),
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


def _list_has_values(arr: Any) -> bool:
    if not isinstance(arr, list):
        return False
    return any(v is not None for v in arr)


def geojson_has_point_telemetry(props: dict[str, Any]) -> bool:
    """True when properties arrays include usable speed or heart rate."""
    if not isinstance(props.get("elapsed_sec"), list) or not props["elapsed_sec"]:
        return False
    return _list_has_values(props.get("speed_kmh")) or _list_has_values(props.get("heart_rate"))


def _haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_r = 6_371_000.0
    to_rad = math.radians
    d_lat = to_rad(lat2 - lat1)
    d_lon = to_rad(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(to_rad(lat1)) * math.cos(to_rad(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return 2 * earth_r * math.asin(math.sqrt(a))


def _segment_speed_kmh(a: dict[str, Any], b: dict[str, Any]) -> float:
    from_data = _float_or_none(a.get("speed_kmh")) or _float_or_none(b.get("speed_kmh"))
    if from_data is not None and from_data > 0:
        return from_data
    dt = float(b["elapsed_sec"]) - float(a["elapsed_sec"])
    if dt <= 0:
        return 0.0
    dist_m = _haversine_m(float(a["lat"]), float(a["lon"]), float(b["lat"]), float(b["lon"]))
    if dist_m <= 0:
        return 0.0
    return (dist_m / dt) * 3.6


def _nearest_row_by_sec(
    rows: list[dict[str, Any]],
    sec: int,
    *,
    sec_key: str,
    max_delta_sec: int = 2,
) -> dict[str, Any]:
    if not rows:
        return {}
    exact = next((r for r in rows if int(r[sec_key]) == sec), None)
    if exact:
        return exact
    best = min(rows, key=lambda r: abs(int(r[sec_key]) - sec))
    if abs(int(best[sec_key]) - sec) <= max_delta_sec:
        return best
    return {}


def derive_point_speeds(points: list[dict[str, Any]]) -> None:
    """Fill missing speed_kmh from GPS segments (in-place)."""
    for i, point in enumerate(points):
        if _float_or_none(point.get("speed_kmh")):
            continue
        for neighbor in (i + 1, i - 1):
            if neighbor < 0 or neighbor >= len(points):
                continue
            a = points[min(i, neighbor)]
            b = points[max(i, neighbor)]
            spd = _segment_speed_kmh(a, b)
            if spd > 0:
                point["speed_kmh"] = spd
                break


def merge_telemetry_into_track_points(
    points: list[dict[str, Any]],
    sensor_rows: list[dict[str, Any]],
    hr_rows: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Normalize track points with sensors, HR, and derived GPS speed."""
    if not points:
        return points
    merged: list[dict[str, Any]] = []
    for point in points:
        sec = int(round(float(point.get("elapsed_sec") or 0)))
        sensor = _nearest_row_by_sec(sensor_rows, sec, sec_key="elapsed_sec", max_delta_sec=2)
        hr = _nearest_row_by_sec(hr_rows, sec, sec_key="seconds", max_delta_sec=30)
        row = dict(point)
        if row.get("speed_kmh") is None and sensor.get("speed_kmh") is not None:
            row["speed_kmh"] = _float_or_none(sensor.get("speed_kmh"))
        if row.get("cadence") is None and sensor.get("cadence") is not None:
            row["cadence"] = _float_or_none(sensor.get("cadence"))
        if row.get("elevation_m") is None and sensor.get("elevation_m") is not None:
            row["elevation_m"] = _float_or_none(sensor.get("elevation_m"))
        if row.get("temperature_c") is None and sensor.get("temperature_c") is not None:
            row["temperature_c"] = _float_or_none(sensor.get("temperature_c"))
        if row.get("power_watts") is None and sensor.get("power_watts") is not None:
            row["power_watts"] = _float_or_none(sensor.get("power_watts"))
        if row.get("heart_rate") is None and hr.get("heart_rate") is not None:
            row["heart_rate"] = int(hr["heart_rate"])
        if row.get("distance_m") is None and hr.get("distance_m") is not None:
            row["distance_m"] = _float_or_none(hr.get("distance_m"))
        merged.append(row)
    derive_point_speeds(merged)
    return merged


def enrich_geojson_from_sensors(
    geo: dict[str, Any],
    sensor_rows: list[dict[str, Any]],
    hr_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    """Дополнить GeoJSON телеметрией из workout_sensors и workout_heart_rate."""
    points = geojson_to_track_points(geo)
    if len(points) < 2:
        return geo
    merged = merge_telemetry_into_track_points(points, sensor_rows, hr_rows)
    enriched = build_enriched_geojson(merged)
    if not enriched:
        return geo
    props = {}
    if geo.get("type") == "FeatureCollection" and geo.get("features"):
        props = (geo["features"][0] or {}).get("properties") or {}
    elif geo.get("type") == "Feature":
        props = geo.get("properties") or {}
    start_time = props.get("start_time")
    if start_time:
        enriched["features"][0]["properties"]["start_time"] = start_time
    return enriched
