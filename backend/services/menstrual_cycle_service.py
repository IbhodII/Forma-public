# -*- coding: utf-8 -*-
"""Журнал и настройки женского цикла."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import menstrual_cycle_phases as phases

_VALID_FLOW = frozenset({"light", "medium", "heavy"})
_LOG_HAS_PHASE: bool | None = None


def _ensure_log_phase_column() -> bool:
    """Ленивое добавление колонки phase (если миграция при старте не успела из‑за lock)."""
    global _LOG_HAS_PHASE
    if _LOG_HAS_PHASE is not None:
        return _LOG_HAS_PHASE

    conn = get_db()
    try:
        cols = {r[1] for r in conn.execute("PRAGMA table_info(menstrual_cycle_log)")}
        if "phase" in cols:
            _LOG_HAS_PHASE = True
            return True
        try:
            conn.execute("ALTER TABLE menstrual_cycle_log ADD COLUMN phase TEXT")
            conn.commit()
            _LOG_HAS_PHASE = True
        except Exception:
            conn.rollback()
            _LOG_HAS_PHASE = False
    finally:
        conn.close()
    return _LOG_HAS_PHASE


def _now() -> str:
    return datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")


def _normalize_flow(flow_intensity: str | None) -> str | None:
    if flow_intensity is None or not str(flow_intensity).strip():
        return None
    val = str(flow_intensity).strip().lower()
    if val not in _VALID_FLOW:
        raise ValueError("flow_intensity должен быть light, medium или heavy")
    return val


def _profile_cycle_row(conn) -> dict[str, Any] | None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "last_menstruation" not in cols:
        return None
    row = conn.execute(
        """
        SELECT last_menstruation, cycle_length, menstruation_length, cycle_enabled
        FROM user_profile WHERE id = ?
        """,
        (get_current_user_id(),),
    ).fetchone()
    if not row:
        return None
    return {
        "last_menstruation": str(row[0])[:10] if row[0] else None,
        "cycle_length": int(row[1] or 28),
        "menstruation_length": int(row[2] or 5),
        "cycle_enabled": bool(int(row[3] if row[3] is not None else 1)),
    }


def _sync_profile_cycle(
    conn,
    *,
    cycle_length_days: int,
    period_length_days: int,
    last_period_start: str | None,
    cycle_enabled: bool,
) -> None:
    cols = {r[1] for r in conn.execute("PRAGMA table_info(user_profile)")}
    if "last_menstruation" not in cols:
        return
    enabled = 1 if cycle_enabled else 0
    existing = conn.execute("SELECT id FROM user_profile WHERE id = ?", (get_current_user_id(),)).fetchone()
    ts = _now()
    if existing:
        conn.execute(
            """
            UPDATE user_profile
            SET last_menstruation = ?,
                cycle_length = ?,
                menstruation_length = ?,
                cycle_enabled = ?,
                updated_at = ?
            WHERE id = ?
            """,
            (last_period_start, cycle_length_days, period_length_days, enabled, ts, get_current_user_id()),
        )
    else:
        conn.execute(
            """
            INSERT INTO user_profile (
                id, updated_at, last_menstruation, cycle_length, menstruation_length, cycle_enabled
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (get_current_user_id(), ts, last_period_start, cycle_length_days, period_length_days, enabled),
        )


def get_settings() -> dict[str, Any]:
    conn = get_db()
    try:
        profile = _profile_cycle_row(conn)
        row = conn.execute(
            """
            SELECT cycle_length_days, period_length_days, last_period_start
            FROM menstrual_cycle_settings
            WHERE user_id = ?
            """,
            (get_current_user_id(),),
        ).fetchone()
    finally:
        conn.close()

    if profile:
        last = profile["last_menstruation"]
        return {
            "cycle_length_days": profile["cycle_length"],
            "period_length_days": profile["menstruation_length"],
            "last_period_start": last,
            "last_menstruation": last,
            "cycle_length": profile["cycle_length"],
            "menstruation_length": profile["menstruation_length"],
            "cycle_enabled": profile["cycle_enabled"],
        }

    if not row:
        return {
            "cycle_length_days": 28,
            "period_length_days": 5,
            "last_period_start": None,
            "last_menstruation": None,
            "cycle_length": 28,
            "menstruation_length": 5,
            "cycle_enabled": True,
        }
    last = row["last_period_start"]
    return {
        "cycle_length_days": int(row["cycle_length_days"] or 28),
        "period_length_days": int(row["period_length_days"] or 5),
        "last_period_start": str(last)[:10] if last else None,
        "last_menstruation": str(last)[:10] if last else None,
        "cycle_length": int(row["cycle_length_days"] or 28),
        "menstruation_length": int(row["period_length_days"] or 5),
        "cycle_enabled": True,
    }


def save_settings(
    *,
    cycle_length_days: int,
    period_length_days: int,
    last_period_start: str | None,
    cycle_enabled: bool | None = None,
) -> dict[str, Any]:
    if cycle_length_days < 15 or cycle_length_days > 60:
        raise ValueError("cycle_length_days должен быть от 15 до 60")
    if period_length_days < 1 or period_length_days > 14:
        raise ValueError("period_length_days должен быть от 1 до 14")

    last_val: str | None = None
    if last_period_start and str(last_period_start).strip():
        last_val = str(last_period_start).strip()[:10]

    conn = get_db()
    try:
        if cycle_enabled is None:
            prof = _profile_cycle_row(conn)
            cycle_enabled = prof["cycle_enabled"] if prof else True

        existing = conn.execute(
            "SELECT id FROM menstrual_cycle_settings WHERE user_id = ?",
            (get_current_user_id(),),
        ).fetchone()
        ts = _now()
        if existing:
            conn.execute(
                """
                UPDATE menstrual_cycle_settings
                SET cycle_length_days = ?,
                    period_length_days = ?,
                    last_period_start = ?,
                    updated_at = ?
                WHERE user_id = ?
                """,
                (cycle_length_days, period_length_days, last_val, ts, get_current_user_id()),
            )
        else:
            conn.execute(
                """
                INSERT INTO menstrual_cycle_settings
                (user_id, cycle_length_days, period_length_days, last_period_start, updated_at)
                VALUES (?, ?, ?, ?, ?)
                """,
                (get_current_user_id(), cycle_length_days, period_length_days, last_val, ts),
            )
        _sync_profile_cycle(
            conn,
            cycle_length_days=cycle_length_days,
            period_length_days=period_length_days,
            last_period_start=last_val,
            cycle_enabled=bool(cycle_enabled),
        )
        conn.commit()
    finally:
        conn.close()
    return get_settings()


def _row_to_log(row: Any) -> dict[str, Any]:
    phase = row["phase"] if "phase" in row.keys() else None
    return {
        "date": str(row["date"])[:10],
        "flow_intensity": row["flow_intensity"],
        "symptoms": row["symptoms"],
        "notes": row["notes"],
        "phase": phase,
    }


def get_log(date_from: str | None = None, date_to: str | None = None) -> list[dict[str, Any]]:
    has_phase = _ensure_log_phase_column()
    conn = get_db()
    try:
        phase_col = ", phase" if has_phase else ""
        where: list[str] = ["user_id = ?"]
        params: list[Any] = [get_current_user_id()]
        if date_from:
            where.append("date >= ?")
            params.append(str(date_from)[:10])
        if date_to:
            where.append("date <= ?")
            params.append(str(date_to)[:10])
        rows = conn.execute(
            f"""
            SELECT date, flow_intensity, symptoms, notes{phase_col}
            FROM menstrual_cycle_log
            WHERE {' AND '.join(where)}
            ORDER BY date
            """,
            params,
        ).fetchall()
    finally:
        conn.close()
    return [_row_to_log(r) for r in rows]


def upsert_log(
    *,
    date: str,
    flow_intensity: str | None = None,
    symptoms: str | None = None,
    notes: str | None = None,
    phase: str | None = None,
) -> dict[str, Any]:
    day = str(date).strip()[:10]
    if len(day) < 10:
        raise ValueError("Некорректная дата, ожидается YYYY-MM-DD")
    flow = _normalize_flow(flow_intensity)
    sym = (str(symptoms).strip() or None) if symptoms is not None else None
    nts = (str(notes).strip() or None) if notes is not None else None
    phase_val: str | None = None
    if phase is not None and str(phase).strip():
        phase_val = phases.normalize_phase(phase)

    has_phase = _ensure_log_phase_column()
    conn = get_db()
    try:
        if has_phase:
            conn.execute(
                """
                INSERT INTO menstrual_cycle_log
                (date, flow_intensity, symptoms, notes, phase, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    flow_intensity = excluded.flow_intensity,
                    symptoms = excluded.symptoms,
                    notes = excluded.notes,
                    phase = excluded.phase
                """,
                (day, flow, sym, nts, phase_val, get_current_user_id(), _now()),
            )
        else:
            conn.execute(
                """
                INSERT INTO menstrual_cycle_log
                (date, flow_intensity, symptoms, notes, user_id, created_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(date) DO UPDATE SET
                    flow_intensity = excluded.flow_intensity,
                    symptoms = excluded.symptoms,
                    notes = excluded.notes
                """,
                (day, flow, sym, nts, get_current_user_id(), _now()),
            )
        conn.commit()
        sel = (
            "SELECT date, flow_intensity, symptoms, notes, phase FROM menstrual_cycle_log WHERE date = ?"
            if has_phase
            else "SELECT date, flow_intensity, symptoms, notes FROM menstrual_cycle_log WHERE date = ?"
        )
        row = conn.execute(sel, (day,)).fetchone()
    finally:
        conn.close()
    if not row:
        raise RuntimeError("Не удалось сохранить запись")
    return _row_to_log(row)


def delete_log(day: str) -> bool:
    date_str = str(day).strip()[:10]
    conn = get_db()
    try:
        cur = conn.execute(
            "DELETE FROM menstrual_cycle_log WHERE date = ? AND user_id = ?",
            (date_str, get_current_user_id()),
        )
        conn.commit()
        return cur.rowcount > 0
    finally:
        conn.close()


def get_phases_for_range(date_from: str, date_to: str) -> list[dict[str, Any]]:
    settings = get_settings()
    logs = get_log(date_from, date_to)
    manual: dict[str, str | None] = {e["date"]: e.get("phase") for e in logs}
    return phases.phases_for_range(date_from, date_to, settings, manual)


def get_cycle_impact(day: str) -> dict[str, Any]:
    """Текущая фаза и коэффициенты для BMR и TRIMP."""
    from backend.services.cycle_access import is_female_profile

    if not is_female_profile():
        return {
            "tracking": False,
            "message": "Учёт цикла доступен при поле «Женский» в профиле",
        }
    settings = get_settings()
    if not settings.get("cycle_enabled", True):
        return {
            "tracking": False,
            "message": "Учёт фазы цикла отключён в настройках",
        }
    last = settings.get("last_menstruation") or settings.get("last_period_start")
    if not last:
        return {
            "tracking": False,
            "message": "Добавьте дату последней менструации в профиле",
        }

    d = str(day)[:10]
    logs = get_log(d, d)
    manual = logs[0].get("phase") if logs else None
    info = phases.resolve_phase_for_date(
        date.fromisoformat(d),
        settings,
        manual_phase=manual,
    )
    if not info:
        return {
            "tracking": False,
            "message": "Не удалось определить фазу",
        }

    bmr_mult = float(info["bmr_multiplier"])
    rec_mult = float(info["recovery_multiplier"])
    return {
        "tracking": True,
        "date": d,
        "phase": info["phase"],
        "phase_label": phases.phase_label_ru(info["phase"]),
        "source": info["source"],
        "bmr_multiplier": bmr_mult,
        "recovery_multiplier": rec_mult,
        "bmr_adjusted": bmr_mult != 1.0,
        "bmr_note": (
            "Скорректировано с учётом фазы цикла (+5% в лютеиновой)"
            if bmr_mult != 1.0
            else None
        ),
        "recovery_note": (
            f"TRIMP учитывается с коэффициентом {rec_mult}"
            if rec_mult != 1.0
            else None
        ),
    }


def compute_stats(
    settings: dict[str, Any],
    log_dates: list[str],
    *,
    reference_month: tuple[int, int] | None = None,
) -> dict[str, Any]:
    """Простая статистика для UI."""
    today = date.today()
    ref_y, ref_m = reference_month or (today.year, today.month)
    month_prefix = f"{ref_y:04d}-{ref_m:02d}"

    marked_this_month = sum(1 for d in log_dates if d.startswith(month_prefix))

    next_period: str | None = None
    last_start = settings.get("last_menstruation") or settings.get("last_period_start")
    cycle_len = int(settings.get("cycle_length_days") or settings.get("cycle_length") or 28)
    if last_start:
        try:
            start = date.fromisoformat(str(last_start)[:10])
            next_period = (start + timedelta(days=cycle_len)).isoformat()
        except ValueError:
            next_period = None

    avg_cycle: float | None = None
    sorted_dates = sorted(set(str(d)[:10] for d in log_dates))
    if len(sorted_dates) >= 2:
        period_starts: list[date] = []
        prev = date.fromisoformat(sorted_dates[0])
        period_starts.append(prev)
        for ds in sorted_dates[1:]:
            cur = date.fromisoformat(ds)
            if (cur - prev).days > 2:
                period_starts.append(cur)
            prev = cur

        cutoff = today - timedelta(days=183)
        recent_starts = [s for s in period_starts if s >= cutoff]
        if len(recent_starts) >= 2:
            gaps = [
                (recent_starts[i] - recent_starts[i - 1]).days
                for i in range(1, len(recent_starts))
            ]
            if gaps:
                avg_cycle = round(sum(gaps) / len(gaps), 1)

    return {
        "marked_days_this_month": marked_this_month,
        "predicted_next_period": next_period,
        "average_cycle_length_days": avg_cycle,
    }
