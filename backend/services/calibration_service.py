# -*- coding: utf-8 -*-
"""Калибровка калорий с браслета (часов) по динамике веса и дневнику питания."""
from __future__ import annotations

import logging
from datetime import date, datetime, timedelta
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import food_service

logger = logging.getLogger(__name__)

KCAL_PER_KG_FAT = 7700.0
MIN_FACTOR = 0.5
MAX_FACTOR = 1.5
DEFAULT_FACTOR = 1.0
MIN_WINDOW_DAYS = 14
MIN_WEIGHT_MEASUREMENTS = 5
MIN_LOGGED_DAYS_RATIO = 0.8
MIN_BRACELET_DAYS_RATIO = 0.7
MIN_PREDICTED_DEFICIT_ABS = 500.0


def _today() -> date:
    return date.today()


def get_bracelet_calibration_factor() -> float:
    """Текущий поправочный коэффициент (по умолчанию 1.0)."""
    from backend.services.request_cache import get_cached

    def _load() -> float:
        conn = get_db()
        try:
            row = conn.execute(
                "SELECT calibration_factor FROM user_profile WHERE id = 1"
            ).fetchone()
            if not row or row[0] is None:
                return DEFAULT_FACTOR
            return float(row[0])
        finally:
            conn.close()

    return get_cached("calibration_factor:1", 60.0, _load)


def get_calibration_status() -> dict[str, Any]:
    """Коэффициент и дата последнего пересчёта."""
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT calibration_factor, last_calibration_date
            FROM user_profile WHERE id = 1
            """
        ).fetchone()
        if not row:
            return {
                "factor": DEFAULT_FACTOR,
                "last_calibration_date": None,
            }
        factor = (
            float(row["calibration_factor"])
            if row["calibration_factor"] is not None
            else DEFAULT_FACTOR
        )
        last = row["last_calibration_date"]
        return {
            "factor": round(factor, 4),
            "last_calibration_date": str(last)[:10] if last else None,
        }
    finally:
        conn.close()


def update_calibration_factor(factor: float) -> None:
    clamped = max(MIN_FACTOR, min(MAX_FACTOR, float(factor)))
    today = _today().isoformat()
    conn = get_db()
    try:
        conn.execute(
            """
            UPDATE user_profile
            SET calibration_factor = ?, last_calibration_date = ?
            WHERE id = 1
            """,
            (clamped, today),
        )
        conn.commit()
    finally:
        conn.close()
    logger.info("Коэффициент калибровки браслета обновлён: %.3f", clamped)


def _latest_calibration_history() -> dict[str, Any] | None:
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT window_start, window_end, days, factor,
                   predicted_deficit_kcal, observed_deficit_kcal,
                   total_intake_kcal, total_predicted_expenditure_kcal,
                   weight_measurements, food_days, bracelet_days, status, note
            FROM calorie_calibration_history
            WHERE user_id = ?
            ORDER BY calculated_at DESC, id DESC
            LIMIT 1
            """,
            (get_current_user_id(),),
        ).fetchone()
        return dict(row) if row else None
    except Exception:
        return None
    finally:
        conn.close()


def _insert_calibration_history(
    conn: Any,
    *,
    factor: float,
    window_start: str,
    window_end: str,
    days: int,
    weight_measurements: int,
    food_days: int,
    bracelet_days: int,
    predicted_deficit: float,
    observed_deficit: float,
    total_intake: float,
    total_predicted_expenditure: float,
    status: str,
    note: str | None = None,
) -> None:
    try:
        conn.execute(
            """
            INSERT INTO calorie_calibration_history (
                user_id, calculated_at, window_start, window_end, days,
                factor, predicted_deficit_kcal, observed_deficit_kcal,
                total_intake_kcal, total_predicted_expenditure_kcal,
                weight_measurements, food_days, bracelet_days, status, note
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                get_current_user_id(),
                datetime.now().isoformat(timespec="seconds"),
                window_start,
                window_end,
                days,
                round(float(factor), 4),
                round(float(predicted_deficit), 1),
                round(float(observed_deficit), 1),
                round(float(total_intake), 1),
                round(float(total_predicted_expenditure), 1),
                int(weight_measurements),
                int(food_days),
                int(bracelet_days),
                status,
                note,
            ),
        )
    except Exception:
        logger.debug("Не удалось сохранить историю калибровки калорий", exc_info=True)


def _sum_food_calories(
    conn: Any, start_date: str, end_date: str, phase: str
) -> float:
    """Сумма калорий из дневника питания за период (как в food_service)."""
    ph = phase.strip().lower()
    if ph not in food_service.FOOD_PHASES:
        ph = "cut"
    rows = conn.execute(
        f"""
        {food_service._ENTRY_SELECT}
        WHERE e.user_id = ? AND e.date >= ? AND e.date <= ? AND e.phase = ?
        """,
        (get_current_user_id(), start_date, end_date, ph),
    ).fetchall()
    total = 0.0
    for row in rows:
        entry = food_service._entry_from_row(row)
        total += float(entry.get("calories") or 0)
    return total


def _food_logged_days(conn: Any, start_date: str, end_date: str, phase: str) -> int:
    ph = phase.strip().lower()
    if ph not in food_service.FOOD_PHASES:
        ph = "cut"
    row = conn.execute(
        """
        SELECT COUNT(DISTINCT date)
        FROM food_entries
        WHERE user_id = ? AND date >= ? AND date <= ? AND phase = ?
        """,
        (get_current_user_id(), start_date, end_date, ph),
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _sum_bracelet_calories(conn: Any, start_date: str, end_date: str) -> float:
    uid = get_current_user_id()
    row = conn.execute(
        """
        SELECT COALESCE(SUM(total_calories), 0)
        FROM daily_bracelet_calories
        WHERE user_id = ? AND date >= ? AND date <= ?
        """,
        (uid, start_date, end_date),
    ).fetchone()
    return float(row[0] or 0) if row else 0.0


def _bracelet_logged_days(conn: Any, start_date: str, end_date: str) -> int:
    uid = get_current_user_id()
    row = conn.execute(
        """
        SELECT COUNT(DISTINCT date)
        FROM daily_bracelet_calories
        WHERE user_id = ? AND date >= ? AND date <= ? AND total_calories > 0
        """,
        (uid, start_date, end_date),
    ).fetchone()
    return int(row[0] or 0) if row else 0


def _trend_weight_change_kg(weight_rows: list[Any]) -> float | None:
    if len(weight_rows) < 2:
        return None
    first_day = date.fromisoformat(str(weight_rows[0]["date"])[:10])
    xs: list[float] = []
    ys: list[float] = []
    for row in weight_rows:
        try:
            day = date.fromisoformat(str(row["date"])[:10])
            weight = float(row["weight_kg"])
        except (TypeError, ValueError):
            continue
        xs.append(float((day - first_day).days))
        ys.append(weight)
    if len(xs) < 2:
        return None
    x_mean = sum(xs) / len(xs)
    y_mean = sum(ys) / len(ys)
    denom = sum((x - x_mean) ** 2 for x in xs)
    if denom <= 0:
        return None
    slope = sum((x - x_mean) * (y - y_mean) for x, y in zip(xs, ys)) / denom
    return slope * (max(xs) - min(xs))


def calculate_calibration_factor(
    days: int = 14,
    *,
    phase: str = "cut",
) -> float | None:
    """
    Коэффициент адаптивной калибровки: observed_deficit / predicted_deficit.
    predicted_deficit строится по текущей модели дневного расхода без уже
    сохранённой калибровки, чтобы пересчёт не усиливал сам себя.
    """
    if days < MIN_WINDOW_DAYS:
        return None

    end = _today()
    start = end - timedelta(days=days - 1)
    start_date = start.isoformat()
    end_date = end.isoformat()

    conn = get_db()
    try:
        weight_rows = conn.execute(
            """
            SELECT date, weight_kg FROM daily_weight
            WHERE date >= ? AND date <= ?
            ORDER BY date
            """,
            (start_date, end_date),
        ).fetchall()
        weight_measurements = len(weight_rows)
        if weight_measurements < MIN_WEIGHT_MEASUREMENTS:
            return None

        trend_weight_change = _trend_weight_change_kg(list(weight_rows))
        if trend_weight_change is None:
            return None

        total_intake = _sum_food_calories(conn, start_date, end_date, phase)
        food_days = _food_logged_days(conn, start_date, end_date, phase)
        bracelet_days = _bracelet_logged_days(conn, start_date, end_date)
        if food_days < int(days * MIN_LOGGED_DAYS_RATIO):
            return None
        if bracelet_days < int(days * MIN_BRACELET_DAYS_RATIO):
            return None

        from backend.services import analytics_service

        expenditure_by_day = analytics_service.get_daily_expenditure_range(
            start_date,
            end_date,
            phase,
            prefer_chest=True,
            conn=conn,
            calibration_override=DEFAULT_FACTOR,
        )
        bracelet_mode_days = [
            row
            for row in expenditure_by_day.values()
            if row.get("calculation_mode") == "bracelet"
            and row.get("total_expenditure") is not None
        ]
        if len(bracelet_mode_days) < int(days * MIN_BRACELET_DAYS_RATIO):
            return None

        total_predicted_expenditure = sum(
            float(row["total_expenditure"]) for row in bracelet_mode_days
        )
        total_intake_for_predicted_days = total_intake
        predicted_deficit = total_predicted_expenditure - total_intake_for_predicted_days
        if abs(predicted_deficit) < MIN_PREDICTED_DEFICIT_ABS:
            return None

        observed_deficit = -trend_weight_change * KCAL_PER_KG_FAT
        new_factor = observed_deficit / predicted_deficit
        clamped = max(MIN_FACTOR, min(MAX_FACTOR, new_factor))

        _insert_calibration_history(
            conn,
            factor=clamped,
            window_start=start_date,
            window_end=end_date,
            days=days,
            weight_measurements=weight_measurements,
            food_days=food_days,
            bracelet_days=bracelet_days,
            predicted_deficit=predicted_deficit,
            observed_deficit=observed_deficit,
            total_intake=total_intake,
            total_predicted_expenditure=total_predicted_expenditure,
            status="ok",
            note=None if new_factor == clamped else "factor_clamped",
        )
        conn.commit()
        return clamped
    finally:
        conn.close()


def recalculate_and_save(
    days: int = 14,
    *,
    phase: str = "cut",
) -> dict[str, Any]:
    """Пересчитать коэффициент и сохранить; вернуть old/new или ошибку."""
    old_factor = get_bracelet_calibration_factor()
    new_factor = calculate_calibration_factor(days, phase=phase)
    if new_factor is None:
        raise ValueError(
            "Недостаточно данных (нужно как минимум 2 замера веса за период, "
            "записи питания и калории браслета за те же дни)"
        )
    update_calibration_factor(new_factor)
    result = {
        "old_factor": round(old_factor, 4),
        "new_factor": round(new_factor, 4),
        "last_calibration_date": _today().isoformat(),
    }
    latest = _latest_calibration_history()
    if latest:
        result.update(
            {
                "window_start": latest.get("window_start"),
                "window_end": latest.get("window_end"),
                "predicted_deficit_kcal": latest.get("predicted_deficit_kcal"),
                "observed_deficit_kcal": latest.get("observed_deficit_kcal"),
                "total_intake_kcal": latest.get("total_intake_kcal"),
                "total_predicted_expenditure_kcal": latest.get(
                    "total_predicted_expenditure_kcal"
                ),
                "weight_measurements": latest.get("weight_measurements"),
                "food_days": latest.get("food_days"),
                "bracelet_days": latest.get("bracelet_days"),
                "status": latest.get("status"),
                "note": latest.get("note"),
            }
        )
    return result


def calibration_stale(days: int = 14) -> bool:
    """True, если пересчёт не делали дольше `days` дней (или никогда)."""
    status = get_calibration_status()
    last = status.get("last_calibration_date")
    if not last:
        return True
    try:
        last_d = date.fromisoformat(str(last)[:10])
    except ValueError:
        return True
    return (_today() - last_d).days >= days
