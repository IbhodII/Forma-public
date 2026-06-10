# -*- coding: utf-8 -*-
"""Route point telemetry merge for running/cycling map tooltips."""
from __future__ import annotations

from utils.bike_track import (
    enrich_geojson_from_sensors,
    geojson_has_point_telemetry,
    merge_telemetry_into_track_points,
)


def test_running_geojson_with_elapsed_only_gets_hr_and_speed():
    geo = {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [37.60, 55.75],
                        [37.601, 55.751],
                        [37.602, 55.752],
                    ],
                },
                "properties": {
                    "elapsed_sec": [0, 10, 20],
                },
            }
        ],
    }
    assert not geojson_has_point_telemetry(geo["features"][0]["properties"])

    sensors = [{"elapsed_sec": 10, "speed_kmh": 12.0, "cadence": 160.0}]
    hr = [{"seconds": 10, "heart_rate": 155, "distance_m": 50.0}]

    merged = merge_telemetry_into_track_points(
        [
            {"lon": 37.60, "lat": 55.75, "elapsed_sec": 0},
            {"lon": 37.601, "lat": 55.751, "elapsed_sec": 10},
            {"lon": 37.602, "lat": 55.752, "elapsed_sec": 20},
        ],
        sensors,
        hr,
    )
    mid = merged[1]
    assert mid["heart_rate"] == 155
    assert mid["distance_m"] == 50.0
    assert mid["cadence"] == 160.0
    assert mid["speed_kmh"] == 12.0
    assert merged[0]["speed_kmh"] is not None and merged[0]["speed_kmh"] > 0

    enriched = enrich_geojson_from_sensors(geo, sensors, hr)
    props = enriched["features"][0]["properties"]
    assert geojson_has_point_telemetry(props)
    assert any(v is not None for v in props["heart_rate"])
    assert any(v is not None for v in props["speed_kmh"])
