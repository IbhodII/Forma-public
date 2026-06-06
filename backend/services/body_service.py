# -*- coding: utf-8 -*-
"""Замеры тела — только SQLite через get_db()."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

from backend.core import week_calendar
from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import settings_service
from backend.services._sql_helpers import records_from_df
from utils.date_utils import normalize_date_column

try:
    from utils.body_metrics import BODY_METRICS_FIELDS, apply_body_derived
except ImportError:
    BODY_METRICS_FIELDS = ()  # type: ignore
    apply_body_derived = None  # type: ignore

SUMMARY_METRIC_KEYS = (
    "weight_kg",
    "body_fat_percent",
    "muscle_mass_kg",
    "waist_cm",
    "hips_cm",
)

# Минимум для контрольного замера (первый день недели)
CONTROL_DAY_REQUIRED = (
    "weight_kg",
    "body_fat_percent",
    "muscle_mass_kg",
    "waist_cm",
    "hips_cm",
)

BODY_MEASUREMENT_FIELDS = tuple(
    key for key in BODY_METRICS_FIELDS if key.endswith("_cm")
)


def _metric_exists(conn, measure_date: str, user_id: int | None = None) -> bool:
    uid = user_id if user_id is not None else get_current_user_id()
    row = conn.execute(
        "SELECT 1 FROM body_metrics WHERE user_id = ? AND date = ? LIMIT 1",
        (uid, measure_date),
    ).fetchone()
    return row is not None


def _body_fat_percent(v: Any) -> float | None:
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if 0 <= n < 100 else None


def get_genetic_limit() -> dict[str, Any]:
    """Генетический предел: рост из профиля; вес и % жира — последние известные из body_metrics."""
    from backend.core.genetic_potential import build_genetic_potential_state
    from backend.services import user_service

    profile = user_service.get_profile() or {}
    latest = get_latest_metric_values()

    weight = _positive(latest.get("weight_kg"))
    fat = _body_fat_percent(latest.get("body_fat_percent"))
    weight_date = latest.get("weight_kg_date")
    fat_date = latest.get("body_fat_percent_date")

    dates = [d for d in (weight_date, fat_date) if d]
    measure_date = max(dates) if dates else None

    out = build_genetic_potential_state(
        profile.get("height_cm"),
        weight,
        fat,
        measurement_date=measure_date,
    )
    out["weight_kg"] = weight
    out["body_fat_percent"] = fat
    out["weight_date"] = weight_date
    out["body_fat_date"] = fat_date
    return out


def get_latest() -> dict[str, Any] | None:
    """Последний замер тела (максимальная date в body_metrics)."""
    conn = get_db()
    try:
        uid = get_current_user_id()
        df = pd.read_sql_query(
            """
            SELECT *
            FROM body_metrics
            WHERE user_id = ?
              AND date = (SELECT MAX(date) FROM body_metrics WHERE user_id = ?)
            LIMIT 1
            """,
            conn,
            params=(uid, uid),
        )
    except Exception:
        return None
    finally:
        conn.close()
    if df.empty:
        return None
    df = normalize_date_column(df, "date")
    rec = df.iloc[0].where(pd.notna(df.iloc[0]), None).to_dict()
    rec["date"] = str(rec["date"])[:10]
    merged = _apply_daily_weight_overrides([rec])
    return merged[0] if merged else None


FORM_REFERENCE_FIELDS = (
    "weight_kg",
    "body_fat_percent",
    "muscle_mass_kg",
    "chest_inhale_cm",
    "chest_exhale_cm",
    "bicep_relaxed_cm",
    "bicep_tense_cm",
    "forearm_relaxed_cm",
    "forearm_tense_cm",
    "wrist_cm",
    "thigh_relaxed_cm",
    "thigh_tense_cm",
    "calf_relaxed_cm",
    "calf_tense_cm",
    "ankle_cm",
    "waist_cm",
    "hips_cm",
    "neck_cm",
)


def _field_value(row: dict[str, Any], key: str) -> float | None:
    if key == "body_fat_percent":
        return _body_fat_percent(row.get(key))
    return _positive(row.get(key))


def _latest_daily_weight_field(field: str) -> tuple[float, str] | None:
    daily = _load_daily_weight_map()
    if not daily:
        return None
    for d in sorted(daily.keys(), reverse=True):
        dw = daily[d]
        if field == "weight_kg":
            raw = dw.get("weight_kg") if hasattr(dw, "get") else dw["weight_kg"]
            val = _positive(raw)
        elif field == "body_fat_percent":
            raw = dw.get("body_fat_percent") if hasattr(dw, "get") else None
            val = _body_fat_percent(raw)
        else:
            return None
        if val is not None:
            return val, d
    return None


def get_field_reference() -> dict[str, Any]:
    """Latest positive value per form field across all body_metrics history."""
    items, _ = get_metrics(10_000, 0)
    fields: dict[str, float] = {}
    field_dates: dict[str, str] = {}

    for row in items:
        row_date = str(row.get("date", ""))[:10]
        if not row_date:
            continue
        for key in FORM_REFERENCE_FIELDS:
            if key in fields:
                continue
            val = _field_value(row, key)
            if val is not None:
                fields[key] = val
                field_dates[key] = row_date

    for key in ("weight_kg", "body_fat_percent"):
        daily_point = _latest_daily_weight_field(key)
        if daily_point is None:
            continue
        val, d = daily_point
        existing_date = field_dates.get(key)
        if existing_date is None or d > existing_date:
            fields[key] = val
            field_dates[key] = d

    return {"fields": fields, "field_dates": field_dates}


def _metrics_where(
    date_from: str | None = None,
    date_to: str | None = None,
    user_id: int | None = None,
    *,
    body_measurements_only: bool = False,
    existing_columns: set[str] | None = None,
) -> tuple[str, list[Any]]:
    uid = user_id if user_id is not None else get_current_user_id()
    clauses: list[str] = ["user_id = ?"]
    params: list[Any] = [uid]
    if date_from:
        clauses.append("date >= ?")
        params.append(str(date_from)[:10])
    if date_to:
        clauses.append("date <= ?")
        params.append(str(date_to)[:10])
    if body_measurements_only:
        cols = [
            col for col in BODY_MEASUREMENT_FIELDS
            if existing_columns is None or col in existing_columns
        ]
        if cols:
            clauses.append(
                "(" + " OR ".join(f"({col} IS NOT NULL AND {col} > 0)" for col in cols) + ")"
            )
        else:
            clauses.append("0 = 1")
    return " WHERE " + " AND ".join(clauses), params


def _positive(v: Any) -> float | None:
    if v is None:
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _load_daily_weight_map() -> dict[str, Any]:
    """date (YYYY-MM-DD) -> row daily_weight."""
    try:
        from backend.database.daily_weight_store import load_daily_weight

        df = load_daily_weight()
    except Exception:
        return {}
    if df.empty:
        return {}
    out: dict[str, Any] = {}
    for _, row in df.iterrows():
        d = str(row.get("date", ""))[:10]
        if d:
            out[d] = row
    return out


def _apply_daily_weight_overrides(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Вес и % жира с вкладки «Вес» (daily_weight) приоритетнее body_metrics на ту же дату."""
    daily = _load_daily_weight_map()
    if not daily:
        return items
    merged: list[dict[str, Any]] = []
    for row in items:
        r = dict(row)
        d = str(r.get("date", ""))[:10]
        dw = daily.get(d)
        if dw is not None:
            w = _positive(dw.get("weight_kg") if hasattr(dw, "get") else dw["weight_kg"])
            if w is not None:
                r["weight_kg"] = w
            fat_raw = dw.get("body_fat_percent")
            fat = _body_fat_percent(fat_raw)
            if fat is not None:
                r["body_fat_percent"] = fat
        merged.append(r)
    return merged


def _daily_weight_summary_entry() -> dict[str, Any] | None:
    """Последний и предыдущий вес из daily_weight (LIMIT 2, без полного скана)."""
    try:
        from backend.database.daily_weight_store import load_daily_weight_recent

        df = load_daily_weight_recent(limit=8)
    except Exception:
        return None
    if df.empty:
        return None
    points: list[dict[str, Any]] = []
    for _, row in df.sort_values("date", ascending=False).iterrows():
        w = _positive(row.get("weight_kg"))
        if w is None:
            continue
        points.append({"value": w, "date": str(row["date"])[:10]})
        if len(points) >= 2:
            break
    if not points:
        return None
    entry: dict[str, Any] = dict(points[0])
    if len(points) > 1:
        entry["previous_value"] = points[1]["value"]
        entry["previous_date"] = points[1]["date"]
    return entry


def _latest_metric_points_sql(metric_key: str, limit: int = 2) -> list[dict[str, Any]]:
    """До `limit` последних положительных значений метрики из body_metrics."""
    if metric_key not in SUMMARY_METRIC_KEYS:
        return []
    uid = get_current_user_id()
    conn = get_db()
    try:
        rows = conn.execute(
            f"""
            SELECT date, {metric_key} AS val
            FROM body_metrics
            WHERE user_id = ? AND {metric_key} IS NOT NULL AND {metric_key} > 0
            ORDER BY date DESC
            LIMIT ?
            """,
            (uid, int(limit)),
        ).fetchall()
    except Exception:
        return []
    finally:
        conn.close()
    out: list[dict[str, Any]] = []
    for row in rows:
        val = _positive(row["val"])
        if val is None:
            continue
        out.append({"value": val, "date": str(row["date"])[:10]})
    return out


def sync_weight_from_daily(
    measure_date: str,
    weight_kg: float,
    body_fat_percent: float | None = None,
) -> str:
    """Прописать вес (и опционально жир) в body_metrics после сохранения на вкладке «Вес»."""
    fields: dict[str, float] = {"weight_kg": float(weight_kg)}
    if body_fat_percent is not None:
        fields["body_fat_percent"] = float(body_fat_percent)
    return create_metric(
        {
            "date": str(measure_date)[:10],
            "allow_replace": True,
            "fields": fields,
        }
    )


def _is_control_day_row(row: dict[str, Any], week_start_day: int) -> bool:
    date_str = str(row.get("date") or "")[:10]
    if not date_str:
        return False
    d = date.fromisoformat(date_str)
    if week_calendar.week_start_for_date(d, week_start_day) != d:
        return False
    return all(_positive(row.get(k)) is not None for k in CONTROL_DAY_REQUIRED)


def get_weight_week_series(days: int = 7) -> dict[str, Any]:
    """Точки веса за последние N дней (daily_weight + body_metrics в окне)."""
    end = date.today()
    start = end - timedelta(days=max(1, days) - 1)
    d_from = start.isoformat()
    d_to = end.isoformat()
    by_date: dict[str, float] = {}
    try:
        from backend.database.daily_weight_store import load_daily_weight_recent

        dw = load_daily_weight_recent(limit=days + 14, date_from=d_from)
        for _, row in dw.iterrows():
            w = _positive(row.get("weight_kg"))
            d = str(row.get("date", ""))[:10]
            if w is not None and d_from <= d <= d_to:
                by_date[d] = float(w)
    except Exception:
        pass
    items, _ = get_metrics(64, 0, date_from=d_from, date_to=d_to)
    for row in items:
        w = _positive(row.get("weight_kg"))
        d = str(row.get("date", ""))[:10]
        if w is not None and d and d not in by_date:
            by_date[d] = float(w)
    points = [{"date": d, "weight_kg": v} for d, v in sorted(by_date.items())]
    return {"items": points}


def get_metrics_summary() -> dict[str, Any]:
    """Последние (и предыдущие) значения по ключевым метрикам — SQL LIMIT, без полного скана."""
    metrics: dict[str, Any] = {}
    weight_from_daily = _daily_weight_summary_entry()
    if weight_from_daily:
        metrics["weight_kg"] = weight_from_daily
    for key in SUMMARY_METRIC_KEYS:
        if key == "weight_kg" and weight_from_daily:
            continue
        points = _latest_metric_points_sql(key, limit=2)
        if not points:
            continue
        entry: dict[str, Any] = dict(points[0])
        if len(points) > 1:
            entry["previous_value"] = points[1]["value"]
            entry["previous_date"] = points[1]["date"]
        metrics[key] = entry
    return {"metrics": metrics}


def get_latest_metric_values() -> dict[str, Any]:
    """Последние значения ключевых метрик (могут быть с разных дат)."""
    metrics = get_metrics_summary().get("metrics") or {}
    out: dict[str, Any] = {}
    for key, point in metrics.items():
        if not isinstance(point, dict):
            continue
        val = point.get("value")
        if val is not None:
            out[key] = val
            if point.get("date"):
                out[f"{key}_date"] = point["date"]
    return out


def get_control_day_metrics(limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
    """Замеры только в первый день недели (контрольный день с полным набором)."""
    week_start_day = settings_service.get_week_start_day()
    items, _ = get_metrics(10_000, 0)
    filtered = [r for r in items if _is_control_day_row(r, week_start_day)]
    total = len(filtered)
    start = int(offset)
    end = start + int(limit)
    return filtered[start:end], total


def get_metrics(
    limit: int,
    offset: int,
    date_from: str | None = None,
    date_to: str | None = None,
    *,
    control_day_only: bool = False,
    body_measurements_only: bool = False,
) -> tuple[list[dict[str, Any]], int]:
    """Замеры тела с пагинацией и фильтром по дате (ORDER BY date DESC)."""
    if control_day_only:
        return get_control_day_metrics(limit, offset)
    conn = get_db()
    try:
        try:
            existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
            where_sql, where_params = _metrics_where(
                date_from,
                date_to,
                body_measurements_only=body_measurements_only,
                existing_columns=existing_cols,
            )
            total = int(
                conn.execute(
                    f"SELECT COUNT(*) FROM body_metrics{where_sql}",
                    where_params,
                ).fetchone()[0]
            )
            df = pd.read_sql_query(
                f"""
                SELECT * FROM body_metrics{where_sql}
                ORDER BY date DESC
                LIMIT ? OFFSET ?
                """,
                conn,
                params=(*where_params, int(limit), int(offset)),
            )
        except Exception:
            return [], 0
    finally:
        conn.close()
    if df.empty:
        return [], total
    df = normalize_date_column(df, "date")
    return _apply_daily_weight_overrides(records_from_df(df)), total


def get_all_metrics(limit: int, offset: int) -> tuple[list[dict[str, Any]], int]:
    """Обратная совместимость: все замеры без фильтра по дате."""
    return get_metrics(limit, offset)


def create_metric(payload: dict[str, Any]) -> str:
    """
    Добавление замера.
    Возвращает 'ok', 'duplicate' или 'empty'.
    """
    measure_date = str(payload["date"])[:10]
    allow_replace = bool(payload.get("allow_replace"))
    fields: dict[str, Any] = dict(payload.get("fields") or {})
    body_cols = BODY_METRICS_FIELDS or tuple(fields.keys())
    clean = {k: fields[k] for k in body_cols if k in fields and fields[k] is not None}
    if not any(isinstance(v, (int, float)) and v > 0 for v in clean.values()):
        return "empty"

    conn = get_db()
    try:
        uid = get_current_user_id()
        if _metric_exists(conn, measure_date, uid) and not allow_replace:
            return "duplicate"
        existing_cols = {r[1] for r in conn.execute("PRAGMA table_info(body_metrics)")}
        use_cols = [c for c in body_cols if c in existing_cols]
        if not use_cols:
            return "empty"
        if _metric_exists(conn, measure_date, uid):
            old = conn.execute(
                f"SELECT {', '.join(use_cols)} FROM body_metrics WHERE user_id = ? AND date = ?",
                (uid, measure_date),
            ).fetchone()
            if old:
                for i, col in enumerate(use_cols):
                    if col not in clean and old[i] is not None:
                        clean[col] = old[i]
        if apply_body_derived is not None:
            clean = apply_body_derived(clean)
        col_list = ", ".join(("user_id", "date", *use_cols))
        placeholders = ", ".join("?" * (2 + len(use_cols)))
        params: list[Any] = [uid, measure_date] + [clean.get(c) for c in use_cols]
        conn.execute(
            f"INSERT OR REPLACE INTO body_metrics ({col_list}) VALUES ({placeholders})",
            params,
        )
        from backend.services.forma_sync.change_tracker import mark_local_change

        mark_local_change(conn, "body_metrics", "date", measure_date)
        conn.commit()
        if clean.get("weight_kg") and float(clean["weight_kg"]) > 0:
            _sync_daily_weight_from_metric(
                measure_date,
                float(clean["weight_kg"]),
                float(clean["body_fat_percent"])
                if clean.get("body_fat_percent") is not None
                else None,
            )
    finally:
        conn.close()
    return "ok"


def _sync_daily_weight_from_metric(
    measure_date: str,
    weight_kg: float,
    body_fat_percent: float | None,
) -> None:
    """Дублирует вес/жир в daily_weight для вкладки «Вес»."""
    try:
        from backend.database.daily_weight_store import save_daily_weight

        save_daily_weight(
            measure_date,
            weight_kg,
            body_fat_percent,
            keep_existing_fat=body_fat_percent is None,
        )
    except Exception:
        pass


def week_start_saturday(dt: date | pd.Timestamp | datetime) -> date:
    """Начало недели пользователя (legacy name)."""
    if isinstance(dt, pd.Timestamp):
        d = dt.date()
    elif isinstance(dt, datetime):
        d = dt.date()
    else:
        d = dt
    return week_calendar.week_start_for_date(d, settings_service.get_week_start_day())


def _mean_positive(series: pd.Series) -> float | None:
    vals = series.dropna()
    vals = vals[vals > 0]
    if vals.empty:
        return None
    return float(vals.mean())


def _format_week_range(week_start: pd.Timestamp) -> str:
    ws = week_start.date() if hasattr(week_start, "date") else week_start
    we = ws + timedelta(days=6)
    return f"{ws.strftime('%d.%m')} – {we.strftime('%d.%m.%Y')}"


def get_weekly_metrics(
    date_from: str | None = None,
    date_to: str | None = None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Средние по неделям (суббота–пятница) и сводка за текущую неделю."""
    items, _ = get_metrics(10_000, 0, date_from=date_from, date_to=date_to)
    if not items:
        return [], {}
    df = pd.DataFrame(items)
    df["dt"] = pd.to_datetime(df["date"], errors="coerce")
    df = df.dropna(subset=["dt"])
    if df.empty:
        return [], {}
    df["week_start"] = df["dt"].apply(lambda x: pd.Timestamp(week_start_saturday(x)))
    weekly = (
        df.groupby("week_start", as_index=False)
        .agg(
            weight_kg=("weight_kg", _mean_positive),
            body_fat_percent=("body_fat_percent", _mean_positive),
            muscle_mass_kg=("muscle_mass_kg", _mean_positive),
            count=("date", "count"),
        )
        .sort_values("week_start", ascending=False)
    )
    out: list[dict[str, Any]] = []
    for _, r in weekly.iterrows():
        ws = r["week_start"]
        ws_str = str(ws.date())[:10] if hasattr(ws, "date") else str(ws)[:10]
        out.append(
            {
                "week_start": ws_str,
                "week_label": _format_week_range(ws),
                "weight_kg": float(r["weight_kg"]) if pd.notna(r["weight_kg"]) else None,
                "body_fat_percent": (
                    float(r["body_fat_percent"])
                    if pd.notna(r.get("body_fat_percent"))
                    else None
                ),
                "muscle_mass_kg": (
                    float(r["muscle_mass_kg"])
                    if pd.notna(r.get("muscle_mass_kg"))
                    else None
                ),
                "count": int(r["count"]),
            }
        )
    cur_start = pd.Timestamp(week_start_saturday(date.today()))
    cur_row = weekly[weekly["week_start"] == cur_start]
    current_week: dict[str, Any] = {}
    if not cur_row.empty:
        r = cur_row.iloc[0]
        current_week = {
            "week_start": str(cur_start.date()),
            "weight_kg": float(r["weight_kg"]) if pd.notna(r["weight_kg"]) else None,
            "body_fat_percent": (
                float(r["body_fat_percent"])
                if pd.notna(r.get("body_fat_percent"))
                else None
            ),
            "muscle_mass_kg": (
                float(r["muscle_mass_kg"])
                if pd.notna(r.get("muscle_mass_kg"))
                else None
            ),
            "count": int(r["count"]),
        }
    return out, current_week


def delete_metric(measure_date: str) -> bool:
    """Удалить замер за дату."""
    d = str(measure_date)[:10]
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM body_metrics WHERE user_id = ? AND date = ?",
            (get_current_user_id(), d),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()
