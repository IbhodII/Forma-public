# -*- coding: utf-8 -*-
"""
Импорт тренировок из архива Polar Flow в workouts.db.

Для каждой сессии: тип cardio (бег / вело / бассейн) или strength.
За день — самая ранняя сессия Polar; следующие только при паузе ≤ 5 мин.

Cardio: INSERT/UPDATE cardio_workouts (data_source=polar_historical),
пульс в workout_heart_rate (source_type=cardio), GPS в gps_tracks.

Strength: INSERT/UPDATE strength_workouts (заглушка подхода),
пульс в workout_heart_rate (source_type=strength).

Запуск (из корня проекта, через venv — там установлен pandas):
    .\\venv\\Scripts\\python.exe import_polar_historical.py
    .\\venv\\Scripts\\python.exe import_polar_historical.py --update
"""
from __future__ import annotations

import argparse
import json
import math
import shutil
import sqlite3
import sys
import zipfile
from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent

try:
    import pandas as _pd  # noqa: F401 — нужен database.db_utils / strength_service
except ImportError:
    _venv_py = PROJECT_ROOT / "venv" / "Scripts" / "python.exe"
    print(
        "[ОШИБКА] Не найден pandas. Запускайте скрипт через venv проекта:\n"
        f"  {_venv_py} import_polar_historical.py --update",
        file=sys.stderr,
    )
    raise SystemExit(1) from None

from database.db_utils import DB_PATH, ensure_fit_import_schema, upsert_gps_track
from utils.bike_track import build_enriched_geojson
from utils.constants import CARDIO_SOURCE_POLAR

ARCHIVE_ZIP = PROJECT_ROOT / (
    "polar-user-data-export_8c5eed34-6e16-4442-9d2c-e2e8f4126b25.zip"
)
EXTRACT_DIR = PROJECT_ROOT / "polar_temp"
MERGE_GAP_SEC = 300
GPS_SOURCE = CARDIO_SOURCE_POLAR

REFERENCE_DATE_MARKER = "2026-05-05T"
FALLBACK_STRENGTH_BASENAME = (
    "training-session-2026-05-05T12:30:35-0e14ac7a-3090-1170-b061-"
    "25ef9f5b5367-7e34572b-3d71-49cb-952b-22819f171314.json"
)

WORKOUT_TYPE_STRENGTH = "strength"
HR_SOURCE_CARDIO = "cardio"
HR_SOURCE_STRENGTH = "strength"
CARDIO_TYPES = ("бег", "вело", "бассейн")

POLAR_STRENGTH_TITLE = "Polar (импорт)"
POLAR_PLACEHOLDER_EXERCISE = "—"
POLAR_STRENGTH_NOTES = "polar_historical: импорт без детализации подходов."

POLAR_SPORT_ID_MAP: dict[str, str] = {
    "1": "бег",
    "2": "вело",
    "18": "бассейн",
}

_SPORT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "бег": ("run", "running", "jog", "бег", "бегов"),
    "вело": ("bike", "biking", "cycl", "вело", "велосипед"),
    "бассейн": ("swim", "pool", "бассейн", "плаван"),
}

_DISTANCE_SLACK_M = 150.0


@dataclass(frozen=True)
class SessionFeatures:
    sport_id: str
    distance_m: float
    gps_waypoints: int
    has_exercises: bool
    top_level_keys: frozenset[str]
    exercise_keys: frozenset[str]
    has_strength_results_key: bool


@dataclass(frozen=True)
class StrengthSignature:
    reference_name: str
    sport_ids: frozenset[str]
    max_distance_m: float
    max_gps_waypoints: int
    require_exercises: bool
    top_level_keys_present: frozenset[str]
    exercise_keys_present: frozenset[str]
    require_strength_results_key: bool

    def describe(self) -> str:
        return (
            f"опорный файл: {self.reference_name}; "
            f"sport.id in {sorted(self.sport_ids)}; "
            f"distance <= {self.max_distance_m:.0f} m; "
            f"GPS <= {self.max_gps_waypoints} points"
        )


@dataclass
class ParsedSession:
    date: str
    workout_type: str
    start_dt: datetime | None
    end_dt: datetime | None
    duration_sec: int
    distance_km: float | None
    avg_hr: int | None
    max_hr: int | None
    calories: int | None
    hr_samples: list[tuple[int, int]] = field(default_factory=list)
    track_points: list[dict[str, Any]] = field(default_factory=list)
    source_files: list[str] = field(default_factory=list)

    def merge_with(self, other: ParsedSession) -> ParsedSession:
        offset = self.duration_sec
        merged_hr = list(self.hr_samples)
        for elapsed, hr in other.hr_samples:
            merged_hr.append((elapsed + offset, hr))

        merged_track: list[dict[str, Any]] = []
        for p in self.track_points:
            merged_track.append(dict(p))
        for p in other.track_points:
            pt = dict(p)
            if pt.get("elapsed_sec") is not None:
                pt["elapsed_sec"] = int(pt["elapsed_sec"]) + offset
            merged_track.append(pt)

        parts = [self, other]
        total_dur = sum(p.duration_sec for p in parts)

        dist_parts = [p.distance_km for p in parts if p.distance_km]
        distance_km = round(sum(dist_parts), 3) if dist_parts else None
        if self.workout_type == WORKOUT_TYPE_STRENGTH:
            distance_km = None

        weighted_hr = 0.0
        hr_weight = 0
        for p in parts:
            if p.avg_hr and p.duration_sec > 0:
                weighted_hr += p.avg_hr * p.duration_sec
                hr_weight += p.duration_sec
        avg_hr = int(round(weighted_hr / hr_weight)) if hr_weight else None
        max_hr_vals = [p.max_hr for p in parts if p.max_hr]
        max_hr = max(max_hr_vals) if max_hr_vals else None

        cal_parts = [p.calories for p in parts if p.calories]
        calories = sum(cal_parts) if cal_parts else None

        end_dt = other.end_dt or self.end_dt
        if self.start_dt and total_dur:
            end_dt = self.start_dt + timedelta(seconds=total_dur)

        return ParsedSession(
            date=self.date,
            workout_type=self.workout_type,
            start_dt=self.start_dt,
            end_dt=end_dt,
            duration_sec=total_dur,
            distance_km=distance_km,
            avg_hr=avg_hr,
            max_hr=max_hr,
            calories=calories,
            hr_samples=merged_hr,
            track_points=merged_track,
            source_files=self.source_files + other.source_files,
        )


# ---------------------------------------------------------------------------
# Архив, сигнатура, классификация
# ---------------------------------------------------------------------------


def extract_archive(zip_path: Path, dest_dir: Path) -> None:
    if dest_dir.exists():
        shutil.rmtree(dest_dir, ignore_errors=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path, "r") as zf:
        zf.extractall(dest_dir)


def collect_json_files(root: Path) -> list[Path]:
    return sorted(root.rglob("*.json"))


def find_reference_in_zip(zip_path: Path) -> tuple[str, dict[str, Any]]:
    candidates: list[tuple[str, dict[str, Any]]] = []
    fallback: tuple[str, dict[str, Any]] | None = None

    with zipfile.ZipFile(zip_path, "r") as zf:
        for name in zf.namelist():
            if not name.endswith(".json"):
                continue
            base = Path(name).name
            try:
                data = json.loads(zf.read(name))
            except json.JSONDecodeError:
                continue
            if not isinstance(data, dict):
                continue
            if REFERENCE_DATE_MARKER in base or REFERENCE_DATE_MARKER in name:
                candidates.append((base, data))
            if base == FALLBACK_STRENGTH_BASENAME:
                fallback = (base, data)
            if fallback is None and "training-session" in base:
                sport = data.get("sport")
                if isinstance(sport, dict) and str(sport.get("id")) == "15":
                    fallback = (base, data)

    if candidates:
        return candidates[0]
    if fallback:
        return fallback
    raise FileNotFoundError(
        f"Не найден опорный файл (маркер {REFERENCE_DATE_MARKER!r})"
    )


def _first_exercise(data: dict[str, Any]) -> dict[str, Any] | None:
    ex = data.get("exercises")
    if isinstance(ex, list):
        for item in ex:
            if isinstance(item, dict):
                return item
    if isinstance(ex, dict):
        return ex
    return None


def _count_gps_waypoints(data: dict[str, Any]) -> int:
    exercise = _first_exercise(data)
    if not exercise:
        return 0
    routes = exercise.get("routes")
    if not isinstance(routes, dict):
        return 0
    route = routes.get("route")
    if not isinstance(route, dict):
        return 0
    waypoints = route.get("wayPoints") or route.get("waypoints") or route.get("points")
    return len(waypoints) if isinstance(waypoints, list) else 0


def extract_features(data: dict[str, Any]) -> SessionFeatures:
    sport = data.get("sport")
    sport_id = ""
    if isinstance(sport, dict):
        sport_id = str(sport.get("id", "")).strip()
    elif sport is not None:
        sport_id = str(sport).strip()

    try:
        distance_m = float(data.get("distanceMeters") or data.get("distance") or 0)
    except (TypeError, ValueError):
        distance_m = 0.0

    exercise = _first_exercise(data)
    exercise_keys: set[str] = set()
    has_str_key = False
    if exercise:
        exercise_keys = set(exercise.keys())
        has_str_key = "strengthTrainingResults" in exercise

    return SessionFeatures(
        sport_id=sport_id,
        distance_m=distance_m,
        gps_waypoints=_count_gps_waypoints(data),
        has_exercises=bool(data.get("exercises")),
        top_level_keys=frozenset(data.keys()),
        exercise_keys=frozenset(exercise_keys),
        has_strength_results_key=has_str_key,
    )


def learn_strength_signature(reference_name: str, data: dict[str, Any]) -> StrengthSignature:
    feats = extract_features(data)
    top_must = frozenset(
        k
        for k in (
            "startTime",
            "stopTime",
            "durationMillis",
            "sport",
            "exercises",
            "calories",
        )
        if k in feats.top_level_keys
    )
    exercise_must = frozenset(
        k
        for k in (
            "strengthTrainingResults",
            "samples",
            "sport",
            "startTime",
            "durationMillis",
        )
        if k in feats.exercise_keys
    )
    return StrengthSignature(
        reference_name=reference_name,
        sport_ids=frozenset({feats.sport_id} if feats.sport_id else {"15"}),
        max_distance_m=max(feats.distance_m, 0.0) + _DISTANCE_SLACK_M,
        max_gps_waypoints=feats.gps_waypoints,
        require_exercises=feats.has_exercises,
        top_level_keys_present=top_must,
        exercise_keys_present=exercise_must,
        require_strength_results_key=feats.has_strength_results_key,
    )


def matches_strength_signature(feats: SessionFeatures, sig: StrengthSignature) -> bool:
    if feats.sport_id in POLAR_SPORT_ID_MAP:
        return False
    if sig.require_exercises and not feats.has_exercises:
        return False
    if not sig.top_level_keys_present.issubset(feats.top_level_keys):
        return False
    if not sig.exercise_keys_present.issubset(feats.exercise_keys):
        return False
    if sig.require_strength_results_key and not feats.has_strength_results_key:
        return False
    if feats.distance_m > sig.max_distance_m:
        return False
    if feats.gps_waypoints > sig.max_gps_waypoints:
        return False
    if feats.sport_id and feats.sport_id in sig.sport_ids:
        return True
    return (
        feats.has_strength_results_key
        and feats.distance_m <= sig.max_distance_m
        and feats.gps_waypoints <= sig.max_gps_waypoints
    )


def classify_workout_type(data: dict[str, Any], sig: StrengthSignature) -> str | None:
    feats = extract_features(data)
    if matches_strength_signature(feats, sig):
        return WORKOUT_TYPE_STRENGTH
    return _map_cardio_sport_type(data)


def _map_cardio_sport_type(data: dict[str, Any]) -> str | None:
    sport = data.get("sport")
    sport_id = None
    sport_name = ""
    if isinstance(sport, dict):
        sport_id = str(sport.get("id", "")).strip() or None
        sport_name = str(sport.get("name") or sport.get("value") or "").lower()
    elif sport is not None:
        sport_id = str(sport).strip() or None

    if sport_id and sport_id in POLAR_SPORT_ID_MAP:
        return POLAR_SPORT_ID_MAP[sport_id]

    for label, keywords in _SPORT_KEYWORDS.items():
        if any(kw in sport_name for kw in keywords):
            return label

    for key in ("activity_type", "activityType", "sport", "type", "name"):
        text = str(data.get(key) or "").lower()
        for label, keywords in _SPORT_KEYWORDS.items():
            if any(kw in text for kw in keywords):
                return label

    feats = extract_features(data)
    if feats.distance_m > 500 and feats.gps_waypoints > 10:
        return "бег"
    if feats.distance_m > 500:
        return "вело"
    return None


def _dig(data: dict[str, Any], *keys: str) -> Any:
    for key in keys:
        if "." in key:
            cur: Any = data
            ok = True
            for part in key.split("."):
                if not isinstance(cur, dict):
                    ok = False
                    break
                cur = cur.get(part)
            if ok and cur is not None and cur != "":
                return cur
            continue
        if key in data and data[key] is not None and data[key] != "":
            return data[key]
    return None


def _parse_iso_datetime(val: Any) -> datetime | None:
    if val is None:
        return None
    text = str(val).strip().replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(text)
    except ValueError:
        return None
    if dt.tzinfo is not None:
        dt = dt.astimezone().replace(tzinfo=None)
    return dt.replace(microsecond=0)


def _duration_to_seconds(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if val <= 0:
        return None
    if val > 86400:
        return int(round(val / 1000))
    if val > 1440:
        return int(round(val / 1000))
    return int(round(val))


def _distance_to_km(raw: Any) -> float | None:
    if raw is None:
        return None
    try:
        val = float(raw)
    except (TypeError, ValueError):
        return None
    if val <= 0:
        return None
    if val >= 500:
        return round(val / 1000.0, 3)
    return round(val, 3)


def _int_or_none(raw: Any) -> int | None:
    if raw is None:
        return None
    try:
        v = int(round(float(raw)))
        return v if v > 0 else None
    except (TypeError, ValueError):
        return None


def _normalize_hr_value(val: Any) -> int | None:
    if val is None:
        return None
    if isinstance(val, str):
        text = val.strip().lower()
        if text in ("", "nan", "none", "null"):
            return None
    try:
        if isinstance(val, float) and math.isnan(val):
            return None
    except TypeError:
        pass
    try:
        hr = int(round(float(val)))
        return hr if 30 <= hr <= 250 else None
    except (TypeError, ValueError):
        return None


def _raw_duration_to_sec(val: Any) -> int | None:
    """duration: накопительное время от старта (сек или мс)."""
    if val is None:
        return None
    try:
        num = float(val)
    except (TypeError, ValueError):
        return None
    if num < 0:
        return None
    if num > 86400 * 1000:
        return int(round(num / 1000))
    if num > 86400:
        return int(round(num / 1000))
    return int(round(num))


def _interpolate_hr_to_1sec(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    """5-секундные агрегаты -> 1 сек (одинаковый bpm между точками)."""
    if len(points) < 2:
        return points
    ordered = sorted(points, key=lambda x: x[0])
    gaps = [ordered[i + 1][0] - ordered[i][0] for i in range(len(ordered) - 1)]
    if not gaps or min(gaps) <= 1:
        return ordered
    out: list[tuple[int, int]] = []
    for i, (t0, hr0) in enumerate(ordered):
        out.append((t0, hr0))
        if i + 1 >= len(ordered):
            break
        t1, _ = ordered[i + 1]
        for t in range(t0 + 1, t1):
            out.append((t, hr0))
    return out


def _dedupe_hr_points(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    by_sec: dict[int, int] = {}
    for elapsed, hr in points:
        by_sec[int(elapsed)] = hr
    return sorted(by_sec.items(), key=lambda x: x[0])


def _extract_hr_from_pair_list(items: list[Any]) -> list[tuple[int, int]]:
    rows: list[tuple[int, int]] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        hr = _normalize_hr_value(
            item.get("heartRate")
            or item.get("heart_rate")
            or item.get("hr")
            or item.get("bpm"),
        )
        if hr is None:
            continue
        elapsed = _raw_duration_to_sec(
            item.get("duration")
            or item.get("elapsed")
            or item.get("elapsedMillis")
            or item.get("time"),
        )
        if elapsed is None:
            elapsed = len(rows)
        rows.append((elapsed, hr))
    return rows


def _extract_hr_from_samples(container: Any) -> list[tuple[int, int]]:
    """samples: HEART_RATE/values или список {heartRate, duration}."""
    rows: list[tuple[int, int]] = []
    if container is None:
        return rows

    if isinstance(container, list):
        if container and isinstance(container[0], dict):
            if "heartRate" in container[0] or "heart_rate" in container[0]:
                rows.extend(_extract_hr_from_pair_list(container))
            for item in container:
                if isinstance(item, dict):
                    rows.extend(_extract_hr_from_samples(item))
        return _dedupe_hr_points(rows)

    if not isinstance(container, dict):
        return rows

    blocks = container.get("samples")
    if isinstance(blocks, list):
        if blocks and isinstance(blocks[0], dict):
            if "heartRate" in blocks[0] or "heart_rate" in blocks[0]:
                rows.extend(_extract_hr_from_pair_list(blocks))
        for block in blocks:
            if not isinstance(block, dict):
                continue
            btype = str(block.get("type") or "").upper()
            if btype and btype != "HEART_RATE":
                continue
            interval_ms = int(block.get("intervalMillis") or block.get("interval") or 1000)
            step_sec = max(1, interval_ms // 1000)
            values = block.get("values") or block.get("data") or []
            if not isinstance(values, list):
                continue
            block_pts: list[tuple[int, int]] = []
            for i, val in enumerate(values):
                hr = _normalize_hr_value(val)
                if hr is not None:
                    block_pts.append((i * step_sec, hr))
            rows.extend(_interpolate_hr_to_1sec(block_pts))

    return _dedupe_hr_points(rows)


def _extract_hr_from_data(data: dict[str, Any]) -> list[tuple[int, int]]:
    merged: list[tuple[int, int]] = []
    exercise = _first_exercise(data)
    if exercise:
        merged.extend(_extract_hr_from_samples(exercise.get("samples")))
    merged.extend(_extract_hr_from_samples(data.get("samples")))
    return _dedupe_hr_points(merged)


def _waypoints_from_route_obj(route: Any) -> list[dict[str, Any]]:
    if not isinstance(route, dict):
        return []
    waypoints = (
        route.get("wayPoints")
        or route.get("waypoints")
        or route.get("points")
    )
    if not isinstance(waypoints, list):
        return []

    points: list[dict[str, Any]] = []
    for wp in waypoints:
        if not isinstance(wp, dict):
            continue
        lat = wp.get("latitude") if wp.get("latitude") is not None else wp.get("lat")
        lon = wp.get("longitude") if wp.get("longitude") is not None else wp.get("lon")
        if lat is None or lon is None:
            continue
        elev = (
            wp.get("elevation")
            if wp.get("elevation") is not None
            else wp.get("elevation_m")
            if wp.get("elevation_m") is not None
            else wp.get("altitude")
        )
        elapsed_ms = wp.get("elapsedMillis") or wp.get("elapsed_ms") or 0
        try:
            elapsed_sec = int(float(elapsed_ms) / 1000)
        except (TypeError, ValueError):
            elapsed_sec = len(points)
        pt: dict[str, Any] = {
            "lat": float(lat),
            "lon": float(lon),
            "elapsed_sec": elapsed_sec,
        }
        if elev is not None:
            try:
                pt["elevation_m"] = float(elev)
            except (TypeError, ValueError):
                pass
        points.append(pt)
    return points


def _extract_track_points_from_data(data: dict[str, Any]) -> list[dict[str, Any]]:
    """GPS: exercises[].routes.route.wayPoints и альтернативные пути."""
    points: list[dict[str, Any]] = []
    exercise = _first_exercise(data)
    if exercise:
        routes = exercise.get("routes")
        if isinstance(routes, dict):
            points.extend(_waypoints_from_route_obj(routes.get("route")))
            points.extend(_waypoints_from_route_obj(routes))
        points.extend(_waypoints_from_route_obj(exercise.get("route")))
        points.extend(_waypoints_from_route_obj(exercise.get("wayPoints")))

    for key in ("route", "routes", "wayPoints"):
        extra = data.get(key)
        if isinstance(extra, dict):
            points.extend(_waypoints_from_route_obj(extra.get("route")))
            points.extend(_waypoints_from_route_obj(extra))

    seen: set[tuple[int, float, float]] = set()
    unique: list[dict[str, Any]] = []
    for p in sorted(points, key=lambda x: int(x.get("elapsed_sec") or 0)):
        sig = (
            int(p.get("elapsed_sec") or 0),
            round(float(p["lat"]), 6),
            round(float(p["lon"]), 6),
        )
        if sig in seen:
            continue
        seen.add(sig)
        unique.append(p)
    return unique


def parse_polar_json(
    path: Path,
    data: dict[str, Any],
    workout_type: str,
) -> ParsedSession | None:
    start_dt = _parse_iso_datetime(
        _dig(data, "startTime", "start_time", "date", "start"),
    )
    stop_dt = _parse_iso_datetime(_dig(data, "stopTime", "stop_time", "end_time", "end"))

    duration_sec = _duration_to_seconds(
        _dig(data, "durationMillis", "duration_millis", "duration", "time", "length"),
    )
    if duration_sec is None and start_dt and stop_dt:
        duration_sec = max(0, int((stop_dt - start_dt).total_seconds()))
    if duration_sec is None:
        return None

    if start_dt is None and stop_dt is not None:
        start_dt = stop_dt - timedelta(seconds=duration_sec)
    end_dt = stop_dt
    if end_dt is None and start_dt is not None:
        end_dt = start_dt + timedelta(seconds=duration_sec)

    if start_dt is not None:
        date_str = start_dt.strftime("%Y-%m-%d")
    else:
        raw_date = _dig(data, "date", "startTime", "start_time")
        dt = _parse_iso_datetime(raw_date)
        if dt is None:
            return None
        date_str = dt.strftime("%Y-%m-%d")
        start_dt = dt

    distance_km = None
    if workout_type != WORKOUT_TYPE_STRENGTH:
        distance_km = _distance_to_km(
            _dig(data, "distanceMeters", "distance_meters", "distance", "totalDistance"),
        )

    hr_block = data.get("heart_rate") or data.get("heartRate")
    avg_hr = _int_or_none(_dig(data, "hrAvg", "hr_avg", "heart_rate.avg", "heartRate.avg"))
    max_hr = _int_or_none(_dig(data, "hrMax", "hr_max", "heart_rate.max", "heartRate.max"))
    if isinstance(hr_block, dict):
        avg_hr = avg_hr or _int_or_none(hr_block.get("avg") or hr_block.get("average"))
        max_hr = max_hr or _int_or_none(hr_block.get("max") or hr_block.get("maximum"))

    calories = _int_or_none(
        _dig(data, "calories", "kcal", "energy", "totalCalories", "calorie"),
    )

    hr_samples: list[tuple[int, int]] = []
    try:
        from backend.services.polar_attach_service import extract_hr_samples

        hr_samples = extract_hr_samples(data)
    except Exception:
        hr_samples = _extract_hr_from_data(data)
    track_points: list[dict[str, Any]] = []
    if workout_type != WORKOUT_TYPE_STRENGTH:
        track_points = _extract_track_points_from_data(data)

    if avg_hr is None and hr_samples:
        vals = [hr for _, hr in hr_samples]
        avg_hr = int(round(sum(vals) / len(vals)))
    if max_hr is None and hr_samples:
        max_hr = max(hr for _, hr in hr_samples)

    return ParsedSession(
        date=date_str,
        workout_type=workout_type,
        start_dt=start_dt,
        end_dt=end_dt,
        duration_sec=duration_sec,
        distance_km=distance_km,
        avg_hr=avg_hr,
        max_hr=max_hr,
        calories=calories,
        hr_samples=hr_samples,
        track_points=track_points,
        source_files=[path.name],
    )


def _log_unknown_type(path: Path, raw_text: str) -> None:
    snippet = raw_text[:200].replace("\n", " ")
    print(
        f"[ПРЕДУПРЕЖДЕНИЕ] {path.name}: тип не определён. Начало: {snippet!r}",
    )


# ---------------------------------------------------------------------------
# Выбор Polar-сессий за день и обогащение БД
# ---------------------------------------------------------------------------


def _field_empty(val: Any) -> bool:
    """Пустое значение метрики в БД (NULL или 0)."""
    if val is None:
        return True
    if isinstance(val, (int, float)):
        return val <= 0
    if isinstance(val, str):
        return not val.strip()
    return False


def collapse_polar_for_day(
    sessions: list[ParsedSession],
    gap_sec: int = MERGE_GAP_SEC,
) -> tuple[ParsedSession | None, int]:
    """
    Самая ранняя сессия за день; следующие только если пауза ≤ gap_sec.
    Возвращает (итоговая сессия, число пропущенных из-за интервала > gap).
    """
    if not sessions:
        return None, 0

    ordered = sorted(sessions, key=lambda s: s.start_dt or datetime.min)
    current = ordered[0]
    skipped_interval = 0
    i = 1
    while i < len(ordered):
        nxt = ordered[i]
        end_prev = current.end_dt
        if end_prev is None and current.start_dt:
            end_prev = current.start_dt + timedelta(seconds=current.duration_sec)
        if end_prev is None or nxt.start_dt is None:
            skipped_interval += len(ordered) - i
            break
        gap = (nxt.start_dt - end_prev).total_seconds()
        if gap > gap_sec:
            skipped_interval += len(ordered) - i
            break
        current = current.merge_with(nxt)
        i += 1

    return current, skipped_interval


def _format_start_time(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.replace(microsecond=0).strftime("%Y-%m-%d %H:%M:%S")


def find_cardio_row(
    conn: sqlite3.Connection,
    date_str: str,
    cardio_type: str,
) -> sqlite3.Row | None:
    """Сводка без start_time в приоритете, иначе самый ранний заезд."""
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        SELECT id, avg_hr, max_hr, calories, calories_chest, calories_watch, start_time
        FROM cardio_workouts
        WHERE date = ? AND type = ?
        ORDER BY
            CASE
                WHEN start_time IS NULL OR TRIM(COALESCE(start_time, '')) = ''
                THEN 0 ELSE 1
            END,
            start_time ASC,
            id ASC
        LIMIT 1
        """,
        (date_str, cardio_type),
    ).fetchone()


def find_cardio_polar_row(
    conn: sqlite3.Connection,
    date_str: str,
    cardio_type: str,
    start_time: str | None = None,
) -> sqlite3.Row | None:
    """Строка polar_historical за день (и start_time, если задан)."""
    conn.row_factory = sqlite3.Row
    if start_time:
        return conn.execute(
            """
            SELECT id, avg_hr, max_hr, calories, calories_chest, calories_watch,
                   start_time, data_source
            FROM cardio_workouts
            WHERE date = ? AND type = ? AND data_source = ? AND start_time = ?
            ORDER BY id ASC
            LIMIT 1
            """,
            (date_str, cardio_type, CARDIO_SOURCE_POLAR, start_time),
        ).fetchone()
    return conn.execute(
        """
        SELECT id, avg_hr, max_hr, calories, calories_chest, calories_watch,
               start_time, data_source
        FROM cardio_workouts
        WHERE date = ? AND type = ? AND data_source = ?
          AND (start_time IS NULL OR TRIM(COALESCE(start_time, '')) = '')
        ORDER BY id ASC
        LIMIT 1
        """,
        (date_str, cardio_type, CARDIO_SOURCE_POLAR),
    ).fetchone()


def find_polar_strength_row(conn: sqlite3.Connection, date_str: str) -> sqlite3.Row | None:
    """Заглушка силовой Polar за день."""
    conn.row_factory = sqlite3.Row
    return conn.execute(
        """
        SELECT id, avg_hr, calories_chest, calories_watch, calories_hr, notes
        FROM strength_workouts
        WHERE date = ? AND workout_title = ? AND exercise = ?
        ORDER BY id ASC
        LIMIT 1
        """,
        (date_str, POLAR_STRENGTH_TITLE, POLAR_PLACEHOLDER_EXERCISE),
    ).fetchone()


def find_first_strength_row(
    conn: sqlite3.Connection,
    date_str: str,
    workout_title: str,
) -> sqlite3.Row | None:
    """Первая строка сессии (дата + тип тренировки)."""
    conn.row_factory = sqlite3.Row
    if workout_title == "Без названия":
        return conn.execute(
            """
            SELECT id, avg_hr, calories_chest, calories_watch, calories_hr, notes
            FROM strength_workouts
            WHERE date = ? AND workout_title IS NULL
            ORDER BY set_number ASC, id ASC
            LIMIT 1
            """,
            (date_str,),
        ).fetchone()
    return conn.execute(
        """
        SELECT id, avg_hr, calories_chest, calories_watch, calories_hr, notes
        FROM strength_workouts
        WHERE date = ? AND workout_title = ?
        ORDER BY set_number ASC, id ASC
        LIMIT 1
        """,
        (date_str, workout_title),
    ).fetchone()


def strength_session_targets(
    conn: sqlite3.Connection,
    date_str: str,
    polar: ParsedSession,
) -> list[tuple[int, sqlite3.Row, bool, str]]:
    """
    Цели обогащения за день: все силовые сессии (Бицепс, Грудь, …)
    или одна новая заглушка Polar, если в БД пусто.
    """
    conn.row_factory = sqlite3.Row
    titles = conn.execute(
        """
        SELECT DISTINCT COALESCE(workout_title, 'Без названия') AS wt
        FROM strength_workouts
        WHERE date = ?
        ORDER BY wt
        """,
        (date_str,),
    ).fetchall()

    out: list[tuple[int, sqlite3.Row, bool, str]] = []
    if not titles:
        wid = create_strength_workout(conn, polar)
        row = find_polar_strength_row(conn, date_str)
        if row is None:
            raise RuntimeError(f"strength polar row missing after insert for {date_str}")
        out.append((wid, row, True, POLAR_STRENGTH_TITLE))
        return out

    for (title,) in titles:
        if title == POLAR_STRENGTH_TITLE:
            continue
        row = find_first_strength_row(conn, date_str, title)
        if row is not None:
            out.append((int(row["id"]), row, False, title))
    return out


def cardio_has_gps(conn: sqlite3.Connection, workout_id: int) -> bool:
    row = conn.execute(
        """
        SELECT 1 FROM gps_tracks
        WHERE cardio_workout_id = ?
          AND track_data IS NOT NULL
          AND TRIM(track_data) != ''
        LIMIT 1
        """,
        (workout_id,),
    ).fetchone()
    return row is not None


def _hr_table_has_source_type(conn: sqlite3.Connection) -> bool:
    info = {row[1] for row in conn.execute("PRAGMA table_info(workout_heart_rate)")}
    return "source_type" in info


def workout_has_hr_samples(
    conn: sqlite3.Connection,
    workout_id: int,
    source_type: str,
) -> bool:
    if _hr_table_has_source_type(conn):
        row = conn.execute(
            """
            SELECT 1 FROM workout_heart_rate
            WHERE cardio_workout_id = ?
              AND COALESCE(source_type, 'cardio') = ?
            LIMIT 1
            """,
            (workout_id, source_type),
        ).fetchone()
    else:
        row = conn.execute(
            "SELECT 1 FROM workout_heart_rate WHERE cardio_workout_id = ? LIMIT 1",
            (workout_id,),
        ).fetchone()
    return row is not None


def insert_hr_samples_if_empty(
    conn: sqlite3.Connection,
    workout_id: int,
    samples: list[tuple[int, int]],
    source_type: str = HR_SOURCE_CARDIO,
) -> bool:
    if not samples or workout_has_hr_samples(conn, workout_id, source_type):
        return False
    if _hr_table_has_source_type(conn):
        conn.executemany(
            """
            INSERT INTO workout_heart_rate (
                cardio_workout_id, elapsed_sec, heart_rate, distance_m, source_type
            )
            VALUES (?, ?, ?, NULL, ?)
            """,
            [
                (workout_id, int(elapsed), int(hr), source_type)
                for elapsed, hr in samples
            ],
        )
    else:
        conn.executemany(
            """
            INSERT INTO workout_heart_rate (cardio_workout_id, elapsed_sec, heart_rate, distance_m)
            VALUES (?, ?, ?, NULL)
            """,
            [(workout_id, int(elapsed), int(hr)) for elapsed, hr in samples],
        )
    return True


def save_cardio_gps_if_empty(
    conn: sqlite3.Connection,
    workout_id: int,
    polar: ParsedSession,
) -> bool:
    if not polar.track_points or cardio_has_gps(conn, workout_id):
        return False
    geo = build_enriched_geojson(polar.track_points)
    if not geo:
        return False
    file_name = f"polar_{polar.date}_{polar.workout_type}.geojson"
    upsert_gps_track(
        workout_id,
        GPS_SOURCE,
        polar.date,
        file_name,
        geo,
        conn=conn,
    )
    return True


def update_cardio_scalar_fields(
    conn: sqlite3.Connection,
    workout_id: int,
    row: sqlite3.Row,
    polar: ParsedSession,
) -> bool:
    sets: list[str] = []
    params: list[Any] = []
    if _field_empty(row["avg_hr"]) and polar.avg_hr:
        sets.append("avg_hr = ?")
        params.append(polar.avg_hr)
    if _field_empty(row["max_hr"]) and polar.max_hr:
        sets.append("max_hr = ?")
        params.append(polar.max_hr)
    if _field_empty(row["calories"]) and polar.calories:
        sets.append("calories = ?")
        params.append(polar.calories)
    if _field_empty(row["calories_chest"]) and polar.calories:
        sets.append("calories_chest = ?")
        params.append(polar.calories)
    if _field_empty(row["calories_watch"]) and polar.calories:
        sets.append("calories_watch = ?")
        params.append(polar.calories)
    if not sets:
        return False
    conn.execute(
        f"UPDATE cardio_workouts SET {', '.join(sets)} WHERE id = ?",
        (*params, workout_id),
    )
    return True


def enrich_cardio_workout(
    conn: sqlite3.Connection,
    workout_id: int,
    row: sqlite3.Row,
    polar: ParsedSession,
    *,
    only_missing_details: bool = True,
) -> tuple[bool, bool, bool]:
    """
    Обогащение cardio: (изменены скаляры, добавлен пульс, добавлен GPS).
    only_missing_details: не трогать HR/GPS, если уже есть в БД.
    """
    metrics = update_cardio_scalar_fields(conn, workout_id, row, polar)
    hr_added = False
    gps_added = False
    if polar.hr_samples and (
        not only_missing_details
        or not workout_has_hr_samples(conn, workout_id, HR_SOURCE_CARDIO)
    ):
        hr_added = insert_hr_samples_if_empty(
            conn,
            workout_id,
            polar.hr_samples,
            HR_SOURCE_CARDIO,
        )
    if polar.track_points and (not only_missing_details or not cardio_has_gps(conn, workout_id)):
        gps_added = save_cardio_gps_if_empty(conn, workout_id, polar)
    return metrics, hr_added, gps_added


def cardio_needs_detail_import(
    conn: sqlite3.Connection,
    workout_id: int,
    polar: ParsedSession,
) -> bool:
    """Новая запись для деталей: нет пульса и/или нет GPS (если есть в Polar)."""
    need_hr = bool(polar.hr_samples) and not workout_has_hr_samples(
        conn,
        workout_id,
        HR_SOURCE_CARDIO,
    )
    need_gps = bool(polar.track_points) and not cardio_has_gps(conn, workout_id)
    return need_hr or need_gps


def create_cardio_workout(conn: sqlite3.Connection, polar: ParsedSession) -> int:
    """Новая cardio_workouts из Polar."""
    start_time = _format_start_time(polar.start_dt)
    distance_km = polar.distance_km if polar.distance_km is not None else 0.0
    calories = polar.calories
    cur = conn.execute(
        """
        INSERT INTO cardio_workouts (
            date, type, distance_km, duration_sec, avg_hr, max_hr, calories,
            calories_chest, calories_watch, data_source, start_time
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            polar.date,
            polar.workout_type,
            distance_km,
            polar.duration_sec,
            polar.avg_hr,
            polar.max_hr,
            calories,
            calories,
            calories,
            CARDIO_SOURCE_POLAR,
            start_time,
        ),
    )
    return int(cur.lastrowid)


def create_strength_workout(conn: sqlite3.Connection, polar: ParsedSession) -> int:
    """Одна строка-заглушка силовой без детализации подходов."""
    sw_cols = {row[1] for row in conn.execute("PRAGMA table_info(strength_workouts)")}
    notes = POLAR_STRENGTH_NOTES
    if polar.source_files:
        tail = ", ".join(polar.source_files[:2])
        notes = f"{notes} ({tail})"

    base_cols = [
        "date",
        "exercise",
        "weight",
        "reps",
        "set_number",
        "notes",
        "workout_title",
        "avg_hr",
        "calories_chest",
        "calories_watch",
        "calories_hr",
    ]
    base_vals: list[Any] = [
        polar.date,
        POLAR_PLACEHOLDER_EXERCISE,
        0,
        0,
        1,
        notes,
        POLAR_STRENGTH_TITLE,
        polar.avg_hr,
        polar.calories,
        polar.calories,
        polar.calories,
    ]
    if "duration_sec" in sw_cols:
        base_cols.append("duration_sec")
        base_vals.append(polar.duration_sec)
    if "is_warmup" in sw_cols:
        base_cols.append("is_warmup")
        base_vals.append(0)
    if "is_bodyweight" in sw_cols:
        base_cols.append("is_bodyweight")
        base_vals.append(0)

    placeholders = ", ".join("?" * len(base_cols))
    cur = conn.execute(
        f"""
        INSERT INTO strength_workouts ({", ".join(base_cols)})
        VALUES ({placeholders})
        """,
        base_vals,
    )
    return int(cur.lastrowid)


def enrich_strength_workout(
    conn: sqlite3.Connection,
    row_id: int,
    row: sqlite3.Row,
    polar: ParsedSession,
    *,
    only_missing_details: bool = True,
) -> tuple[bool, bool]:
    """(скаляры обновлены, добавлен пульс)."""
    changed = False
    sets: list[str] = []
    params: list[Any] = []

    if _field_empty(row["avg_hr"]) and polar.avg_hr:
        sets.append("avg_hr = ?")
        params.append(polar.avg_hr)
    if _field_empty(row["calories_chest"]) and polar.calories:
        sets.append("calories_chest = ?")
        params.append(polar.calories)
    if _field_empty(row["calories_watch"]) and polar.calories:
        sets.append("calories_watch = ?")
        params.append(polar.calories)
    if "calories_hr" in row.keys() and _field_empty(row["calories_hr"]) and polar.calories:
        sets.append("calories_hr = ?")
        params.append(polar.calories)

    sw_cols = {r[1] for r in conn.execute("PRAGMA table_info(strength_workouts)")}
    if "duration_sec" in sw_cols and polar.duration_sec > 0:
        sets.append("duration_sec = COALESCE(NULLIF(duration_sec, 0), ?)")
        params.append(polar.duration_sec)

    if sets:
        conn.execute(
            f"UPDATE strength_workouts SET {', '.join(sets)} WHERE id = ?",
            (*params, row_id),
        )
        changed = True

    hr_added = False
    if polar.hr_samples and (
        not only_missing_details
        or not workout_has_hr_samples(conn, row_id, HR_SOURCE_STRENGTH)
    ):
        hr_added = insert_hr_samples_if_empty(
            conn,
            row_id,
            polar.hr_samples,
            HR_SOURCE_STRENGTH,
        )

    return changed, hr_added


def resolve_cardio_target(
    conn: sqlite3.Connection,
    polar: ParsedSession,
) -> tuple[int, sqlite3.Row, bool, bool]:
    """
    id строки cardio, row для enrich, only_missing_details, created.
    Создаёт polar_historical, если нет подходящей записи.
    """
    start_time = _format_start_time(polar.start_dt)
    polar_row = find_cardio_polar_row(
        conn,
        polar.date,
        polar.workout_type,
        start_time,
    )
    if polar_row is not None:
        return int(polar_row["id"]), polar_row, True, False

    manual_row = find_cardio_row(conn, polar.date, polar.workout_type)
    if manual_row is not None:
        return int(manual_row["id"]), manual_row, True, False

    wid = create_cardio_workout(conn, polar)
    conn.row_factory = sqlite3.Row
    new_row = conn.execute(
        """
        SELECT id, avg_hr, max_hr, calories, calories_chest, calories_watch, start_time
        FROM cardio_workouts WHERE id = ?
        """,
        (wid,),
    ).fetchone()
    if new_row is None:
        raise RuntimeError(f"cardio_workouts id={wid} не найден после INSERT")
    return wid, new_row, False, True


def run_polar_strength_hr_update_pass(
    conn: sqlite3.Connection,
    groups: dict[tuple[str, ...], list[ParsedSession]],
    stats: dict[str, int],
) -> None:
    """--update: дозаполнить пульс strength на все сессии за день."""
    print("\n--- Режим --update: strength HR ---")
    for key, day_sessions in groups.items():
        if key[0] != "strength":
            continue
        date_str = key[1]
        polar, _ = collapse_polar_for_day(day_sessions)
        if polar is None or not polar.hr_samples:
            continue
        for sid, row, _created, title in strength_session_targets(conn, date_str, polar):
            if workout_has_hr_samples(conn, sid, HR_SOURCE_STRENGTH):
                continue
            if insert_hr_samples_if_empty(conn, sid, polar.hr_samples, HR_SOURCE_STRENGTH):
                stats["hr_strength_updated"] += 1
                stats["update_rows"] += 1
                enrich_strength_workout(conn, sid, row, polar, only_missing_details=True)
                print(f"  [strength update] {date_str} {title} id={sid}: hr+")
            else:
                stats["update_unchanged"] += 1


def group_polar_sessions(
    sessions: list[ParsedSession],
) -> dict[tuple[str, ...], list[ParsedSession]]:
    groups: dict[tuple[str, ...], list[ParsedSession]] = defaultdict(list)
    for s in sessions:
        if s.workout_type == WORKOUT_TYPE_STRENGTH:
            groups[("strength", s.date)].append(s)
        elif s.workout_type in CARDIO_TYPES:
            groups[("cardio", s.date, s.workout_type)].append(s)
    return groups


def build_collapsed_cardio_index(
    groups: dict[tuple[str, ...], list[ParsedSession]],
) -> dict[tuple[str, str], ParsedSession]:
    """(date, cardio_type) -> свёрнутая Polar-сессия за день."""
    index: dict[tuple[str, str], ParsedSession] = {}
    for key, day_sessions in groups.items():
        if key[0] != "cardio":
            continue
        _, date_str, cardio_type = key
        polar, _skipped = collapse_polar_for_day(day_sessions)
        if polar is not None:
            index[(date_str, cardio_type)] = polar
    return index


def load_polar_historical_cardio(conn: sqlite3.Connection) -> list[sqlite3.Row]:
    conn.row_factory = sqlite3.Row
    return list(
        conn.execute(
            """
            SELECT id, date, type, avg_hr, max_hr, calories, calories_chest, calories_watch
            FROM cardio_workouts
            WHERE data_source = ?
            ORDER BY date, type, id
            """,
            (CARDIO_SOURCE_POLAR,),
        ).fetchall(),
    )


def run_polar_historical_update_pass(
    conn: sqlite3.Connection,
    cardio_index: dict[tuple[str, str], ParsedSession],
    stats: dict[str, int],
) -> None:
    """--update: дозаполнить HR/GPS для уже импортированных polar_historical."""
    print("\n--- Режим --update: polar_historical ---")
    rows = load_polar_historical_cardio(conn)
    for row in rows:
        date_str = str(row["date"])[:10]
        cardio_type = str(row["type"])
        polar = cardio_index.get((date_str, cardio_type))
        if polar is None:
            stats["update_skipped_no_json"] += 1
            continue
        wid = int(row["id"])
        if not polar.hr_samples and not polar.track_points:
            stats["update_skipped_no_data"] += 1
            continue
        metrics, hr_added, gps_added = enrich_cardio_workout(
            conn,
            wid,
            row,
            polar,
            only_missing_details=True,
        )
        if not (metrics or hr_added or gps_added):
            stats["update_unchanged"] += 1
            continue
        stats["update_rows"] += 1
        if hr_added:
            stats["hr_updated"] += 1
        if gps_added:
            stats["gps_updated"] += 1
        print(
            f"  [update] id={wid} {date_str} {cardio_type}: "
            f"hr={'+' if hr_added else '-'} gps={'+' if gps_added else '-'}",
        )


# ---------------------------------------------------------------------------
# Основной пайплайн
# ---------------------------------------------------------------------------


def run_import(*, update_mode: bool = False) -> dict[str, int]:
    stats: dict[str, int] = {
        "json_total": 0,
        "parsed": 0,
        "parse_skipped": 0,
        "warnings": 0,
        "dates_processed": 0,
        "created_cardio": 0,
        "created_strength": 0,
        "enriched_cardio": 0,
        "enriched_strength": 0,
        "skipped_interval": 0,
        "unchanged": 0,
        "hr_updated": 0,
        "gps_updated": 0,
        "hr_strength_updated": 0,
        "update_rows": 0,
        "update_unchanged": 0,
        "update_skipped_no_json": 0,
        "update_skipped_no_data": 0,
    }

    if not ARCHIVE_ZIP.is_file():
        print(f"[ОШИБКА] Архив не найден: {ARCHIVE_ZIP}")
        return stats

    print(f"Архив: {ARCHIVE_ZIP}")
    print(f"База:  {DB_PATH.resolve()}")
    mode = "импорт + --update" if update_mode else "импорт (INSERT при отсутствии строки)"
    print(f"Режим: {mode}")

    try:
        ref_name, ref_data = find_reference_in_zip(ARCHIVE_ZIP)
    except FileNotFoundError as err:
        print(f"[ОШИБКА] {err}")
        return stats

    signature = learn_strength_signature(ref_name, ref_data)
    print(f"\n--- Сигнатура силовой ---\n{signature.describe()}")

    try:
        extract_archive(ARCHIVE_ZIP, EXTRACT_DIR)
    except zipfile.BadZipFile:
        print("[ОШИБКА] Некорректный ZIP.")
        return stats
    except OSError as err:
        print(f"[ОШИБКА] Распаковка: {err}")
        return stats

    json_files = collect_json_files(EXTRACT_DIR)
    stats["json_total"] = len(json_files)

    ensure_fit_import_schema()
    if not DB_PATH.exists():
        print(f"[ОШИБКА] База не найдена: {DB_PATH}")
        return stats

    parsed_sessions: list[ParsedSession] = []

    for jpath in json_files:
        if "training-session" not in jpath.name:
            stats["parse_skipped"] += 1
            continue
        try:
            raw = jpath.read_text(encoding="utf-8")
            data = json.loads(raw)
        except (OSError, json.JSONDecodeError) as err:
            stats["warnings"] += 1
            print(f"[ПРЕДУПРЕЖДЕНИЕ] {jpath.name}: {err}")
            continue
        if not isinstance(data, dict):
            stats["warnings"] += 1
            continue

        workout_type = classify_workout_type(data, signature)
        if workout_type is None:
            stats["warnings"] += 1
            _log_unknown_type(jpath, raw)
            continue

        try:
            session = parse_polar_json(jpath, data, workout_type)
        except Exception as err:
            stats["warnings"] += 1
            print(f"[ПРЕДУПРЕЖДЕНИЕ] {jpath.name}: {err}")
            continue
        if session is None:
            stats["parse_skipped"] += 1
            continue

        parsed_sessions.append(session)
        stats["parsed"] += 1

    groups = group_polar_sessions(parsed_sessions)
    cardio_index = build_collapsed_cardio_index(groups)

    conn = sqlite3.connect(DB_PATH, timeout=30.0)
    conn.execute("PRAGMA foreign_keys = ON")
    try:
        print("\n--- Импорт по датам ---")

        for key, day_sessions in sorted(groups.items()):
            polar, skipped = collapse_polar_for_day(day_sessions)
            stats["skipped_interval"] += skipped
            if polar is None:
                continue

            stats["dates_processed"] += 1

            if key[0] == "strength":
                date_str = key[1]
                any_change = False
                for sid, row, created, title in strength_session_targets(
                    conn,
                    date_str,
                    polar,
                ):
                    only_missing = not created
                    metrics, hr_added = enrich_strength_workout(
                        conn,
                        sid,
                        row,
                        polar,
                        only_missing_details=only_missing,
                    )
                    if created:
                        stats["created_strength"] += 1
                    if metrics or hr_added or created:
                        any_change = True
                        stats["enriched_strength"] += 1
                        if hr_added:
                            stats["hr_strength_updated"] += 1
                        tag = "new" if created else "upd"
                        print(
                            f"  [strength] {date_str} {title} id={sid} ({tag}): "
                            f"hr={'+' if hr_added else '-'}",
                        )
                if not any_change:
                    stats["unchanged"] += 1

            elif key[0] == "cardio":
                _, date_str, cardio_type = key
                wid, row, only_missing, created = resolve_cardio_target(conn, polar)
                if created:
                    stats["created_cardio"] += 1

                if (
                    not update_mode
                    and only_missing
                    and not cardio_needs_detail_import(conn, wid, polar)
                ):
                    scalar_empty = (
                        (_field_empty(row["avg_hr"]) and polar.avg_hr)
                        or (_field_empty(row["max_hr"]) and polar.max_hr)
                        or (_field_empty(row["calories"]) and polar.calories)
                    )
                    if not scalar_empty:
                        stats["unchanged"] += 1
                        continue

                metrics, hr_added, gps_added = enrich_cardio_workout(
                    conn,
                    wid,
                    row,
                    polar,
                    only_missing_details=only_missing,
                )
                if metrics or hr_added or gps_added or created:
                    stats["enriched_cardio"] += 1
                    if hr_added:
                        stats["hr_updated"] += 1
                    if gps_added:
                        stats["gps_updated"] += 1
                    tag = "new" if created else "upd"
                    print(
                        f"  [{cardio_type}] {date_str} id={wid} ({tag}): "
                        f"hr={'+' if hr_added else '-'} gps={'+' if gps_added else '-'}",
                    )
                else:
                    stats["unchanged"] += 1

        if update_mode:
            run_polar_historical_update_pass(conn, cardio_index, stats)
            run_polar_strength_hr_update_pass(conn, groups, stats)

        conn.commit()
    finally:
        conn.close()

    print("\n--- Статистика ---")
    print(f"JSON-файлов:                  {stats['json_total']}")
    print(f"Разобрано Polar-сессий:        {stats['parsed']}")
    print(f"Дат обработано:                {stats['dates_processed']}")
    print(f"Создано cardio:                {stats['created_cardio']}")
    print(f"Создано strength:              {stats['created_strength']}")
    print(f"Обновлено cardio:              {stats['enriched_cardio']}")
    print(f"  пульс cardio (workout_hr):   {stats['hr_updated']}")
    print(f"  GPS (gps_tracks):             {stats['gps_updated']}")
    print(f"Обновлено strength:            {stats['enriched_strength']}")
    print(f"  пульс strength:               {stats['hr_strength_updated']}")
    print(f"Без изменений:                 {stats['unchanged']}")
    print(f"Пропущено (интервал > 5 мин):  {stats['skipped_interval']} сессий Polar")
    if update_mode:
        print(f"--update строк:                {stats['update_rows']}")
        print(f"--update без изменений:       {stats['update_unchanged']}")
        print(f"--update нет JSON:             {stats['update_skipped_no_json']}")
    print(f"Предупреждений:               {stats['warnings']}")
    return stats


def main() -> int:
    parser = argparse.ArgumentParser(description="Импорт тренировок из архива Polar")
    parser.add_argument(
        "--update",
        action="store_true",
        help="Дозаполнить HR/GPS для cardio с data_source=polar_historical",
    )
    args = parser.parse_args()
    if not ARCHIVE_ZIP.is_file():
        print(f"[ОШИБКА] Архив не найден: {ARCHIVE_ZIP}")
        return 1
    run_import(update_mode=args.update)
    return 0


if __name__ == "__main__":
    sys.exit(main())
