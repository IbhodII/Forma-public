# -*- coding: utf-8 -*-
"""История шагов (steps_history)."""
from __future__ import annotations

from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id


def normalize_month_date(date_str: str) -> str:
    """Первый день месяца YYYY-MM-01."""
    raw = str(date_str)[:10]
    parts = raw.split("-")
    if len(parts) < 2:
        raise ValueError("Некорректная дата, ожидается YYYY-MM-DD")
    year = int(parts[0])
    month = int(parts[1])
    if month < 1 or month > 12:
        raise ValueError("Некорректный месяц")
    return f"{year:04d}-{month:02d}-01"


def _row_to_point(r: Any) -> dict[str, Any]:
    steps = int(r["steps"])
    sl = float(r["step_length_m"]) if r["step_length_m"] is not None else None
    distance_km = round(steps * sl / 1000.0, 2) if sl and sl > 0 else None
    return {
        "date": str(r["date"])[:10],
        "steps": steps,
        "step_length_m": round(sl, 4) if sl is not None else None,
        "distance_km": distance_km,
        "source": r["source"],
    }


def upsert_steps_month(
    date: str,
    steps: int,
    *,
    step_length_m: float | None = None,
    distance_km: float | None = None,
    source: str = "manual",
) -> tuple[dict[str, Any], str]:
    month_key = normalize_month_date(date)
    if steps <= 0:
        raise ValueError("Количество шагов должно быть больше 0")

    sl: float | None = None
    if step_length_m is not None and step_length_m > 0:
        sl = float(step_length_m)
    elif distance_km is not None and distance_km > 0:
        sl = (float(distance_km) * 1000.0) / float(steps)

    uid = get_current_user_id()
    conn = get_db()
    try:
        existing = conn.execute(
            "SELECT 1 FROM steps_history WHERE user_id = ? AND date = ?",
            (uid, month_key),
        ).fetchone()
        status = "updated" if existing else "created"
        conn.execute(
            """
            INSERT INTO steps_history (user_id, date, steps, step_length_m, source, updated_at)
            VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(user_id, date) DO UPDATE SET
                steps = excluded.steps,
                step_length_m = COALESCE(excluded.step_length_m, steps_history.step_length_m),
                source = excluded.source,
                updated_at = CURRENT_TIMESTAMP
            """,
            (uid, month_key, int(steps), sl, source),
        )
        conn.commit()
        row = conn.execute(
            """
            SELECT date, steps, step_length_m, source
            FROM steps_history
            WHERE user_id = ? AND date = ?
            """,
            (uid, month_key),
        ).fetchone()
        if row is None:
            raise RuntimeError("Не удалось прочитать сохранённую запись шагов")
        return _row_to_point(row), status
    finally:
        conn.close()


def get_steps_history(
    date_from: str | None = None,
    date_to: str | None = None,
) -> dict[str, Any]:
    uid = get_current_user_id()
    conn = get_db()
    try:
        where: list[str] = ["user_id = ?"]
        params: list[Any] = [uid]
        if date_from:
            where.append("date >= ?")
            params.append(str(date_from)[:10])
        if date_to:
            where.append("date <= ?")
            params.append(str(date_to)[:10])
        where_sql = f"WHERE {' AND '.join(where)}"

        rows = conn.execute(
            f"""
            SELECT date, steps, step_length_m, source
            FROM steps_history
            {where_sql}
            ORDER BY date
            """,
            params,
        ).fetchall()

        items: list[dict[str, Any]] = [_row_to_point(r) for r in rows]

        from backend.services.hc_analytics_service import filter_steps_items

        items = filter_steps_items(items)

        yearly: list[dict[str, Any]] = []
        if items:
            by_year: dict[str, dict[str, Any]] = {}
            for item in items:
                year = str(item["date"])[:4]
                bucket = by_year.setdefault(
                    year,
                    {"year": int(year), "total_steps": 0, "months_count": 0, "steps_sum": 0},
                )
                bucket["total_steps"] += int(item["steps"])
                bucket["months_count"] += 1
            for year, bucket in sorted(by_year.items(), reverse=True):
                avg = bucket["total_steps"] / max(bucket["months_count"], 1)
                yearly.append(
                    {
                        "year": bucket["year"],
                        "total_steps": bucket["total_steps"],
                        "months_count": bucket["months_count"],
                        "avg_monthly_steps": round(avg, 0),
                    }
                )

        summary: dict[str, Any] = {
            "count": len(items),
            "min_date": items[0]["date"] if items else None,
            "max_date": items[-1]["date"] if items else None,
        }
        if items:
            summary["latest"] = items[-1]
            summary["total_steps_all"] = sum(i["steps"] for i in items)
            summary["avg_monthly_steps"] = round(summary["total_steps_all"] / len(items), 0)

        return {"items": items, "yearly": yearly, "summary": summary}
    finally:
        conn.close()
