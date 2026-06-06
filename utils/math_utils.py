# -*- coding: utf-8 -*-
from __future__ import annotations

import re

import pandas as pd

def parse_reps(reps_str: str) -> list[int]:
    if not reps_str or not str(reps_str).strip():
        return []
    result = []
    for part in re.split(r"\s*\+\s*", str(reps_str).strip()):
        part = part.strip()
        if not part:
            continue
        try:
            result.append(int(float(part)))
        except ValueError:
            continue
    return result


def format_reps(reps_list: list) -> str:
    return "—" if not reps_list else "+".join(str(int(r)) for r in reps_list)

def calc_speed_kmh(distance_km, duration_sec) -> float | None:
    if distance_km is None or duration_sec is None or pd.isna(distance_km) or pd.isna(duration_sec):
        return None
    if duration_sec <= 0 or distance_km <= 0:
        return None
    return round(float(distance_km) / (float(duration_sec) / 3600), 2)


def calc_pace_min_km(distance_km, duration_sec) -> float | None:
    sp = calc_speed_kmh(distance_km, duration_sec)
    return round(60 / sp, 2) if sp and sp > 0 else None


def calc_pace_sec_100m(distance_km, duration_sec) -> float | None:
    if not distance_km or not duration_sec or distance_km <= 0:
        return None
    return round(float(duration_sec) / (float(distance_km) * 10), 1)


def epley_1rm(weight: float, reps: int) -> float:
    return round(weight * (1 + reps / 30), 1)
