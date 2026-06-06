# -*- coding: utf-8 -*-
"""Парсинг TCX/GPX/FIT для ручного импорта в polar_pending_workouts."""
from __future__ import annotations

import hashlib
import io
import statistics
import tempfile
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

ALLOWED_UPLOAD_EXTENSIONS = frozenset({".tcx", ".gpx", ".fit"})

TCX_NS = "http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2"
TCX_NS_EX = "http://www.garmin.com/xmlschemas/ActivityExtension/v2"

_SPORT_KEYWORDS: dict[str, tuple[str, ...]] = {
    "силовая": (
        "strength",
        "gym",
        "weight",
        "crossfit",
        "flexibility",
        "training",
        "workout",
        "hiit",
        "силов",
        "тренаж",
        "качал",
        "фитнес",
    ),
    "бег": ("run", "running", "jog", "бег"),
    "вело": ("bike", "biking", "cycl", "cycling", "вело", "велосипед"),
    "бассейн": ("swim", "swimming", "pool", "бассейн", "плаван"),
}

_TCX_SPORT_EXPLICIT: dict[str, str] = {
    "Running": "бег",
    "Biking": "вело",
    "Cycling": "вело",
    "Swimming": "бассейн",
    "Training": "силовая",
}

# TCX Sport без явного кардио-типа — уточняем по GPS/дистанции
_TCX_SPORT_AMBIGUOUS = frozenset({"Other", "Multisport", ""})

# FIT sub_sport → тип (fitdecode enum names)
_FIT_SUB_SPORT_MAP: dict[str, str] = {
    "strength_training": "силовая",
    "weight_training": "силовая",
    "flexibility_training": "силовая",
    "running": "бег",
    "road": "бег",
    "trail": "бег",
    "cycling": "вело",
    "swimming": "бассейн",
    "lap_swimming": "бассейн",
}

_FIT_SPORT_MAP: dict[str, str] = {
    "running": "бег",
    "cycling": "вело",
    "swimming": "бассейн",
    "training": "силовая",
    "fitness_equipment": "силовая",
}


@dataclass(frozen=True)
class ParsedPolarUpload:
    polar_transaction_id: str
    date: str
    type: str
    duration_sec: int | None
    distance_km: float | None
    calories: int | None
    avg_hr: int | None
    max_hr: int | None
    raw_data: dict[str, Any]


def parse_uploaded_workout_file(content: bytes, filename: str) -> ParsedPolarUpload:
    """Разбор загруженного файла тренировки."""
    if not content:
        raise ValueError("Файл пустой")
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_UPLOAD_EXTENSIONS:
        raise ValueError(
            f"Неподдерживаемый формат «{ext or '?'}». Допустимы: .tcx, .gpx, .fit"
        )
    file_hash = hashlib.sha256(content).hexdigest()
    polar_transaction_id = f"upload:{file_hash}"
    if ext == ".fit":
        return _parse_fit_bytes(content, filename, polar_transaction_id)
    if ext == ".gpx":
        return _parse_gpx_bytes(content, filename, polar_transaction_id)
    return _parse_tcx_bytes(content, filename, polar_transaction_id)


def _normalize_hr(val: Any) -> int | None:
    if val is None:
        return None
    try:
        hr = int(round(float(val)))
        return hr if 30 <= hr <= 250 else None
    except (TypeError, ValueError):
        return None


def _parse_iso_dt(text: str | None) -> datetime | None:
    if not text:
        return None
    try:
        return datetime.fromisoformat(str(text).replace("Z", "+00:00")).replace(tzinfo=None)
    except ValueError:
        return None


def _date_str(dt: datetime | None) -> str:
    if dt is None:
        return datetime.now().date().isoformat()
    return dt.date().isoformat()


def _iso_local(dt: datetime) -> str:
    return dt.replace(microsecond=0).isoformat()


def _seconds_to_pt(sec: int) -> str:
    return f"PT{max(0, int(sec))}S"


def _infer_workout_type(*hints: str | None, default: str = "бег") -> str:
    blob = " ".join(h for h in hints if h).lower()
    for wtype, keys in _SPORT_KEYWORDS.items():
        if any(k in blob for k in keys):
            return wtype
    return default


def _enum_name(val: Any) -> str:
    if val is None:
        return ""
    name = getattr(val, "name", None)
    if name:
        return str(name)
    return str(val)


def _looks_like_strength_session(
    *,
    distance_km: float | None,
    gps_points: int,
    duration_sec: int | None,
) -> bool:
    """Силовая: почти нет GPS и мало дистанции (типичный экспорт Polar TCX/GPX)."""
    low_dist = distance_km is None or distance_km < 0.15
    no_gps = gps_points == 0
    if no_gps and low_dist:
        return True
    if no_gps and duration_sec is not None and duration_sec >= 300 and low_dist:
        return True
    return False


def _resolve_workout_type(
    *text_hints: str | None,
    filename: str | None = None,
    distance_km: float | None = None,
    track_points: list[dict[str, Any]] | None = None,
    duration_sec: int | None = None,
    tcx_sport: str | None = None,
    fit_sport: str | None = None,
    fit_sub_sport: str | None = None,
) -> str:
    """Определяет тип: бег / вело / бассейн / силовая."""
    hints = [h for h in text_hints if h]
    if filename:
        hints.append(filename)
    if tcx_sport:
        hints.append(tcx_sport)
    if fit_sport:
        hints.append(_enum_name(fit_sport))
    if fit_sub_sport:
        hints.append(_enum_name(fit_sub_sport))

    blob = " ".join(hints).lower()
    gps_points = len(track_points or [])

    for wtype, keys in _SPORT_KEYWORDS.items():
        if any(k in blob for k in keys):
            if wtype == "силовая":
                return "силовая"
            # «… training …» в названии беговой — не силовая
            if wtype == "бег" and any(
                sk in blob for sk in ("strength", "gym", "weight", "силов", "тренаж")
            ):
                continue
            return wtype

    fs = _enum_name(fit_sub_sport).lower()
    if fs in _FIT_SUB_SPORT_MAP:
        return _FIT_SUB_SPORT_MAP[fs]

    fsport = _enum_name(fit_sport).lower()
    if fsport in _FIT_SPORT_MAP:
        return _FIT_SPORT_MAP[fsport]

    sport_raw = (tcx_sport or "").strip()
    if sport_raw in _TCX_SPORT_EXPLICIT:
        return _TCX_SPORT_EXPLICIT[sport_raw]

    if sport_raw in _TCX_SPORT_AMBIGUOUS or sport_raw.lower() in ("other", "multisport", "training"):
        if _looks_like_strength_session(
            distance_km=distance_km, gps_points=gps_points, duration_sec=duration_sec
        ):
            return "силовая"
        if gps_points >= 2 and distance_km and distance_km >= 0.5:
            return _infer_workout_type(*hints, default="бег")

    if _looks_like_strength_session(
        distance_km=distance_km, gps_points=gps_points, duration_sec=duration_sec
    ):
        return "силовая"

    return _infer_workout_type(*hints, default="бег")


def _hr_pairs_to_accesslink_samples(pairs: list[tuple[int, int]]) -> list[dict[str, Any]]:
    if not pairs:
        return []
    ordered = sorted(pairs, key=lambda x: x[0])
    min_sec = ordered[0][0]
    max_sec = ordered[-1][0]
    by_sec: dict[int, int] = {s: hr for s, hr in ordered}
    values: list[str] = []
    for sec in range(min_sec, max_sec + 1):
        if sec in by_sec:
            values.append(str(by_sec[sec]))
        elif values:
            values.append(values[-1])
        else:
            values.append("")
    data_csv = ",".join(v for v in values if v != "")
    if not data_csv:
        return []
    return [{"sample-type": "1", "recording-rate": 1, "data": data_csv}]


def _track_to_accesslink_route(points: list[dict[str, Any]]) -> list[dict[str, Any]]:
    route: list[dict[str, Any]] = []
    for pt in points:
        lat = pt.get("lat")
        lon = pt.get("lon")
        if lat is None or lon is None:
            continue
        elapsed = int(pt.get("elapsed_sec") or len(route))
        item: dict[str, Any] = {
            "latitude": float(lat),
            "longitude": float(lon),
            "time": _seconds_to_pt(elapsed),
        }
        elev = pt.get("elevation_m")
        if elev is not None:
            item["elevation"] = float(elev)
        route.append(item)
    return route


def _build_raw_data(
    *,
    upload_source: str,
    filename: str,
    file_hash: str,
    start_dt: datetime | None,
    workout_type: str,
    duration_sec: int | None,
    distance_km: float | None,
    calories: int | None,
    avg_hr: int | None,
    max_hr: int | None,
    hr_pairs: list[tuple[int, int]],
    track_points: list[dict[str, Any]],
    sport_hint: str | None = None,
) -> dict[str, Any]:
    samples = _hr_pairs_to_accesslink_samples(hr_pairs)
    route = _track_to_accesslink_route(track_points)
    distance_m = round(float(distance_km) * 1000, 1) if distance_km else None
    raw: dict[str, Any] = {
        "_upload_source": upload_source,
        "_upload_filename": filename,
        "_upload_file_hash": file_hash,
        "_upload_hr_pairs": [[s, h] for s, h in hr_pairs],
        "_upload_track_points": track_points,
        "start-time": _iso_local(start_dt) if start_dt else None,
        "sport": sport_hint or workout_type,
        "distance": distance_m,
        "duration": _seconds_to_pt(duration_sec) if duration_sec else None,
        "calories": calories,
        "heart-rate": {},
        "samples": samples,
        "route": route,
    }
    if avg_hr is not None:
        raw["heart-rate"]["average"] = avg_hr
    if max_hr is not None:
        raw["heart-rate"]["maximum"] = max_hr
    return raw


def _finalize_parsed(
    *,
    polar_transaction_id: str,
    upload_source: str,
    filename: str,
    file_hash: str,
    start_dt: datetime | None,
    workout_type: str,
    duration_sec: int | None,
    distance_km: float | None,
    calories: int | None,
    hr_pairs: list[tuple[int, int]],
    track_points: list[dict[str, Any]],
    sport_hint: str | None = None,
) -> ParsedPolarUpload:
    hrs = [h for _, h in hr_pairs]
    avg_hr = int(round(statistics.mean(hrs))) if hrs else None
    max_hr = max(hrs) if hrs else None
    raw_data = _build_raw_data(
        upload_source=upload_source,
        filename=filename,
        file_hash=file_hash,
        start_dt=start_dt,
        workout_type=workout_type,
        duration_sec=duration_sec,
        distance_km=distance_km,
        calories=calories,
        avg_hr=avg_hr,
        max_hr=max_hr,
        hr_pairs=hr_pairs,
        track_points=track_points,
        sport_hint=sport_hint,
    )
    return ParsedPolarUpload(
        polar_transaction_id=polar_transaction_id,
        date=_date_str(start_dt),
        type=workout_type,
        duration_sec=duration_sec,
        distance_km=distance_km,
        calories=calories,
        avg_hr=avg_hr,
        max_hr=max_hr,
        raw_data=raw_data,
    )


def _parse_fit_bytes(content: bytes, filename: str, polar_transaction_id: str) -> ParsedPolarUpload:
    from fit_importer import parse_fit_file

    file_hash = polar_transaction_id.removeprefix("upload:")
    with tempfile.NamedTemporaryFile(suffix=".fit", delete=False) as tmp:
        tmp.write(content)
        tmp_path = Path(tmp.name)
    try:
        metadata, heart_rate_points, track_points = parse_fit_file(tmp_path)
        fit_sport, fit_sub_sport = _read_fit_session_sport(tmp_path)
    finally:
        tmp_path.unlink(missing_ok=True)

    start_dt = _parse_iso_dt(metadata.get("start_time"))
    hr_pairs = [
        (int(p["seconds"]), int(p["heart_rate"]))
        for p in heart_rate_points
        if p.get("seconds") is not None and p.get("heart_rate") is not None
    ]
    gps_pts: list[dict[str, Any]] = []
    for pt in track_points:
        if pt.get("lat") is None or pt.get("lon") is None:
            continue
        gps_pts.append(
            {
                "lat": pt["lat"],
                "lon": pt["lon"],
                "elapsed_sec": int(float(pt.get("elapsed_sec") or 0)),
                "elevation_m": pt.get("elevation_m"),
            }
        )

    workout_type = _resolve_workout_type(
        metadata.get("source_file"),
        filename,
        distance_km=metadata.get("distance_km"),
        track_points=gps_pts,
        duration_sec=metadata.get("duration_sec"),
        fit_sport=fit_sport,
        fit_sub_sport=fit_sub_sport,
    )
    sport_hint = _enum_name(fit_sub_sport) or _enum_name(fit_sport) or "fit"
    return _finalize_parsed(
        polar_transaction_id=polar_transaction_id,
        upload_source="fit",
        filename=filename,
        file_hash=file_hash,
        start_dt=start_dt,
        workout_type=workout_type,
        duration_sec=metadata.get("duration_sec"),
        distance_km=metadata.get("distance_km"),
        calories=metadata.get("calories") or metadata.get("calories_chest"),
        hr_pairs=hr_pairs,
        track_points=gps_pts,
        sport_hint=sport_hint,
    )


def _parse_gpx_bytes(content: bytes, filename: str, polar_transaction_id: str) -> ParsedPolarUpload:
    try:
        import gpxpy
    except ImportError as exc:
        raise ImportError("Установите gpxpy: pip install gpxpy") from exc

    file_hash = polar_transaction_id.removeprefix("upload:")
    text = content.decode("utf-8", errors="replace")
    gpx = gpxpy.parse(text)

    start_dt: datetime | None = None
    hr_pairs: list[tuple[int, int]] = []
    track_points: list[dict[str, Any]] = []
    total_dist_m = 0.0

    for track in gpx.tracks:
        for segment in track.segments:
            prev_time: datetime | None = None
            for point in segment.points:
                if point.time and start_dt is None:
                    start_dt = point.time.replace(tzinfo=None)
                if point.time and start_dt:
                    elapsed = int((point.time.replace(tzinfo=None) - start_dt).total_seconds())
                else:
                    elapsed = len(track_points)

                hr = None
                if point.extensions:
                    for ext in point.extensions:
                        for child in ext:
                            tag = child.tag.split("}")[-1].lower()
                            if tag in ("hr", "heartrate", "heart_rate"):
                                hr = _normalize_hr(child.text)
                if hr is not None:
                    hr_pairs.append((elapsed, hr))

                if point.latitude is not None and point.longitude is not None:
                    track_points.append(
                        {
                            "lat": float(point.latitude),
                            "lon": float(point.longitude),
                            "elapsed_sec": elapsed,
                            "elevation_m": float(point.elevation) if point.elevation is not None else None,
                        }
                    )
                prev_time = point.time.replace(tzinfo=None) if point.time else prev_time

    if gpx.get_moving_data().moving_distance:
        total_dist_m = float(gpx.get_moving_data().moving_distance)

    duration_sec: int | None = None
    if start_dt and gpx.time_bounds()[1]:
        end = gpx.time_bounds()[1]
        if end:
            duration_sec = int((end.replace(tzinfo=None) - start_dt).total_seconds())

    distance_km = round(total_dist_m / 1000.0, 3) if total_dist_m > 0 else None

    workout_type = _resolve_workout_type(
        " ".join(t.name or "" for t in gpx.tracks),
        filename,
        distance_km=distance_km,
        track_points=track_points,
        duration_sec=duration_sec if duration_sec and duration_sec > 0 else None,
    )

    return _finalize_parsed(
        polar_transaction_id=polar_transaction_id,
        upload_source="gpx",
        filename=filename,
        file_hash=file_hash,
        start_dt=start_dt,
        workout_type=workout_type,
        duration_sec=duration_sec if duration_sec and duration_sec > 0 else None,
        distance_km=distance_km,
        calories=None,
        hr_pairs=hr_pairs,
        track_points=track_points,
    )


def _read_fit_session_sport(path: Path) -> tuple[Any, Any]:
    """sport и sub_sport из FIT session (fitdecode enums)."""
    try:
        import fitdecode
    except ImportError:
        return None, None
    sport = sub_sport = None
    with fitdecode.FitReader(str(path)) as fit:
        for frame in fit:
            if frame.frame_type != fitdecode.FIT_FRAME_DATA or frame.name != "session":
                continue
            for field in frame.fields:
                if field.name == "sport" and field.value is not None:
                    sport = field.value
                elif field.name == "sub_sport" and field.value is not None:
                    sub_sport = field.value
            break
    return sport, sub_sport


def _extract_tcx_activity_hints(root: ET.Element) -> list[str]:
    hints: list[str] = []
    for el in root.iter():
        tag = _tcx_local(el.tag)
        if tag in ("Name", "Notes", "Description") and el.text:
            hints.append(el.text.strip())
    return hints


def _tcx_find_text(parent: ET.Element, name: str) -> str | None:
    for child in parent:
        if _tcx_local(child.tag) == name and child.text:
            return child.text.strip()
    return None


def _tcx_find_float(parent: ET.Element, name: str) -> float | None:
    text = _tcx_find_text(parent, name)
    if text is None:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _parse_tcx_bytes(content: bytes, filename: str, polar_transaction_id: str) -> ParsedPolarUpload:
    """TCX: XML (Garmin Training Center Database). Пробует pytcx, иначе ElementTree."""
    file_hash = polar_transaction_id.removeprefix("upload:")
    parsed = _try_parse_tcx_pytcx(content, filename, polar_transaction_id, file_hash)
    if parsed is not None:
        return parsed
    return _parse_tcx_elementtree(content, filename, polar_transaction_id, file_hash)


def _try_parse_tcx_pytcx(
    content: bytes,
    filename: str,
    polar_transaction_id: str,
    file_hash: str,
) -> ParsedPolarUpload | None:
    try:
        from pytcx import TCXTrack  # type: ignore[import-untyped]
    except ImportError:
        return None

    text = content.decode("utf-8", errors="replace")
    try:
        track = TCXTrack()
        track.parse(io.StringIO(text))
    except Exception:
        return None

    if not getattr(track, "activity", None):
        return None

    activity = track.activity[0]
    sport = str(getattr(activity, "Sport", "") or "")
    activity_name = str(getattr(activity, "Name", "") or "")
    activity_notes = str(getattr(activity, "Notes", "") or "")

    start_dt: datetime | None = None
    duration_sec: int | None = None
    distance_m: float | None = None
    calories: int | None = None
    avg_hr: int | None = None
    max_hr: int | None = None
    hr_pairs: list[tuple[int, int]] = []
    track_points: list[dict[str, Any]] = []

    for lap in getattr(activity, "Lap", []) or []:
        lap_start = _parse_iso_dt(getattr(lap, "StartTime", None))
        if lap_start and start_dt is None:
            start_dt = lap_start
        total_time = getattr(lap, "TotalTimeSeconds", None)
        if total_time is not None:
            duration_sec = int(float(total_time))
        dist = getattr(lap, "DistanceMeters", None)
        if dist is not None:
            distance_m = float(dist)
        cals = getattr(lap, "Calories", None)
        if cals is not None:
            calories = int(cals)
        avg = getattr(lap, "AverageHeartRateBpm", None)
        if avg is not None:
            avg_hr = _normalize_hr(getattr(avg, "Value", avg))
        mx = getattr(lap, "MaximumHeartRateBpm", None)
        if mx is not None:
            max_hr = _normalize_hr(getattr(mx, "Value", mx))

        track = getattr(lap, "Track", None)
        if not track:
            continue
        for tp in getattr(track, "Trackpoint", []) or []:
            tp_time = _parse_iso_dt(getattr(tp, "Time", None))
            elapsed = 0
            if tp_time and start_dt:
                elapsed = int((tp_time - start_dt).total_seconds())
            hr_bpm = getattr(tp, "HeartRateBpm", None)
            if hr_bpm is not None:
                hr_val = _normalize_hr(getattr(hr_bpm, "Value", hr_bpm))
                if hr_val is not None:
                    hr_pairs.append((elapsed, hr_val))
            pos = getattr(tp, "Position", None)
            if pos is not None:
                lat = getattr(pos, "LatitudeDegrees", None)
                lon = getattr(pos, "LongitudeDegrees", None)
                if lat is not None and lon is not None:
                    alt = getattr(tp, "AltitudeMeters", None)
                    track_points.append(
                        {
                            "lat": float(lat),
                            "lon": float(lon),
                            "elapsed_sec": elapsed,
                            "elevation_m": float(alt) if alt is not None else None,
                        }
                    )

    workout_type = _resolve_workout_type(
        activity_name,
        activity_notes,
        filename,
        distance_km=round(distance_m / 1000.0, 3) if distance_m else None,
        track_points=track_points,
        duration_sec=duration_sec,
        tcx_sport=sport,
    )

    return _finalize_parsed(
        polar_transaction_id=polar_transaction_id,
        upload_source="tcx",
        filename=filename,
        file_hash=file_hash,
        start_dt=start_dt,
        workout_type=workout_type,
        duration_sec=duration_sec,
        distance_km=round(distance_m / 1000.0, 3) if distance_m else None,
        calories=calories,
        hr_pairs=hr_pairs,
        track_points=track_points,
        sport_hint=sport,
    )


def _tcx_local(tag: str) -> str:
    return tag.split("}")[-1] if "}" in tag else tag


def _parse_tcx_elementtree(
    content: bytes,
    filename: str,
    polar_transaction_id: str,
    file_hash: str,
) -> ParsedPolarUpload:
    root = ET.fromstring(content)
    sport = root.attrib.get("Sport") or ""
    for act in root.iter():
        if _tcx_local(act.tag) == "Activity" and act.attrib.get("Sport"):
            sport = act.attrib["Sport"]
            break
    tcx_hints = _extract_tcx_activity_hints(root)

    start_dt: datetime | None = None
    duration_sec: int | None = None
    distance_m: float | None = None
    calories: int | None = None
    hr_pairs: list[tuple[int, int]] = []
    track_points: list[dict[str, Any]] = []

    for lap in root.iter():
        if _tcx_local(lap.tag) != "Lap":
            continue
        if start_dt is None:
            start_dt = _parse_iso_dt(lap.attrib.get("StartTime"))
        total_time = _tcx_find_float(lap, "TotalTimeSeconds")
        if total_time is not None:
            duration_sec = int(total_time)
        dist = _tcx_find_float(lap, "DistanceMeters")
        if dist is not None:
            distance_m = dist
        cals = _tcx_find_text(lap, "Calories")
        if cals is not None:
            try:
                calories = int(float(cals))
            except ValueError:
                pass

        for tp in lap.iter():
            if _tcx_local(tp.tag) != "Trackpoint":
                continue
            tp_time = _parse_iso_dt(_tcx_find_text(tp, "Time"))
            elapsed = 0
            if tp_time and start_dt:
                elapsed = int((tp_time - start_dt).total_seconds())
            for child in tp:
                if _tcx_local(child.tag) == "HeartRateBpm":
                    hr_val = _normalize_hr(_tcx_find_text(child, "Value"))
                    if hr_val is not None:
                        hr_pairs.append((elapsed, hr_val))
                if _tcx_local(child.tag) == "Position":
                    lat = _tcx_find_float(child, "LatitudeDegrees")
                    lon = _tcx_find_float(child, "LongitudeDegrees")
                    if lat is not None and lon is not None:
                        alt = _tcx_find_float(tp, "AltitudeMeters")
                        track_points.append(
                            {
                                "lat": lat,
                                "lon": lon,
                                "elapsed_sec": elapsed,
                                "elevation_m": alt,
                            }
                        )

    workout_type = _resolve_workout_type(
        *tcx_hints,
        filename,
        distance_km=round(distance_m / 1000.0, 3) if distance_m else None,
        track_points=track_points,
        duration_sec=duration_sec,
        tcx_sport=sport,
    )

    return _finalize_parsed(
        polar_transaction_id=polar_transaction_id,
        upload_source="tcx",
        filename=filename,
        file_hash=file_hash,
        start_dt=start_dt,
        workout_type=workout_type,
        duration_sec=duration_sec,
        distance_km=round(distance_m / 1000.0, 3) if distance_m else None,
        calories=calories,
        hr_pairs=hr_pairs,
        track_points=track_points,
        sport_hint=sport,
    )
