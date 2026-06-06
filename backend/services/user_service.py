# -*- coding: utf-8 -*-
"""Профиль пользователя (одна строка id=1)."""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Any

from backend.core.bmr import compute_bmr as _core_compute_bmr
from backend.core.week_calendar import WEEKDAY_LABELS_RU
from backend.database import get_db
from backend.database.db_utils import get_current_user_id
from backend.services import settings_service
from utils.hr_profile import age_from_date_of_birth, heart_rate_zones, resolve_max_heart_rate

def _profile_id() -> int:
    return get_current_user_id()
VALID_ACTIVITY_LEVELS = frozenset({"sedentary", "active"})
FIBER_TARGET_GRAMS = 30.0
MIN_DEFICIT_PER_KG_FAT = 5.0
MAX_DEFICIT_PER_KG_FAT = 70.0
TDEE_MULTIPLIER = {"sedentary": 1.2, "active": 1.55}
WORKOUT_ACTIVITY_HINT = (
    "Для точного определения уровня активности выполните несколько тренировок "
    "(кардио или силовых) за последние 30 дней."
)
MISSING_FIELD_LABELS = {
    "height": "Рост (добавьте в профиль)",
    "birth_date": "Дата рождения (добавьте в профиль)",
    "gender": "Пол (добавьте в профиль)",
    "weight": "Вес (добавьте замер на странице Тело)",
    "body_fat": "Процент жира (необязательно, но повышает точность)",
}

_PROFILE_COLUMNS = (
    "id",
    "date_of_birth",
    "height_cm",
    "max_heart_rate",
    "updated_at",
    "sex",
    "week_start_day",
    "cloud_sync_provider",
    "units_system",
    "protein_gram_per_kg",
    "fat_gram_per_kg",
    "carbs_gram_per_kg",
    "activity_level",
    "fit_folder_path",
    "first_name",
    "last_name",
    "display_name",
    "max_deficit_per_kg_fat",
    "max_physiological_deficit_per_kg_fat",
    "target_bulk_grams_per_week",
    "use_chest_strap_priority",
)

def _normalize_name(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text if text else None


def resolve_display_name(
    display_name: str | None,
    first_name: str | None,
    last_name: str | None,
) -> str | None:
    """display_name → иначе «Имя Фамилия»; email пока не используется."""
    explicit = _normalize_name(display_name)
    if explicit:
        return explicit
    parts = [_normalize_name(first_name), _normalize_name(last_name)]
    joined = " ".join(p for p in parts if p)
    return joined if joined else None


def _row_to_dict(row) -> dict[str, Any] | None:
    if row is None:
        return None
    keys = _PROFILE_COLUMNS
    data = dict(zip(keys, row)) if not hasattr(row, "keys") else dict(row)
    return {
        "id": int(data["id"]),
        "date_of_birth": data.get("date_of_birth"),
        "height_cm": float(data["height_cm"]) if data.get("height_cm") is not None else None,
        "max_heart_rate": (
            int(data["max_heart_rate"]) if data.get("max_heart_rate") is not None else None
        ),
        "updated_at": data.get("updated_at"),
        "sex": data.get("sex") or settings_service.DEFAULTS["sex"],
        "week_start_day": (
            int(data["week_start_day"])
            if data.get("week_start_day") is not None
            else settings_service.DEFAULTS["week_start_day"]
        ),
        "cloud_sync_provider": data.get("cloud_sync_provider")
        or settings_service.DEFAULTS["cloud_sync_provider"],
        "units_system": data.get("units_system") or settings_service.DEFAULTS["units_system"],
        "protein_gram_per_kg": (
            float(data["protein_gram_per_kg"])
            if data.get("protein_gram_per_kg") is not None
            else None
        ),
        "fat_gram_per_kg": (
            float(data["fat_gram_per_kg"]) if data.get("fat_gram_per_kg") is not None else None
        ),
        "carbs_gram_per_kg": (
            float(data["carbs_gram_per_kg"])
            if data.get("carbs_gram_per_kg") is not None
            else None
        ),
        "activity_level": data.get("activity_level"),
        "fit_folder_path": data.get("fit_folder_path"),
        "first_name": data.get("first_name"),
        "last_name": data.get("last_name"),
        "display_name": data.get("display_name"),
        "max_deficit_per_kg_fat": (
            float(data["max_deficit_per_kg_fat"])
            if data.get("max_deficit_per_kg_fat") is not None
            else None
        ),
        "max_physiological_deficit_per_kg_fat": (
            float(data["max_physiological_deficit_per_kg_fat"])
            if data.get("max_physiological_deficit_per_kg_fat") is not None
            else None
        ),
        "target_bulk_grams_per_week": (
            float(data["target_bulk_grams_per_week"])
            if data.get("target_bulk_grams_per_week") is not None
            else None
        ),
        "use_chest_strap_priority": (
            bool(int(data["use_chest_strap_priority"]))
            if data.get("use_chest_strap_priority") is not None
            else True
        ),
    }


def get_profile() -> dict[str, Any] | None:
    from backend.database.db_utils import get_current_user_id
    from backend.services.request_cache import get_cached

    uid = get_current_user_id()

    def _load() -> dict[str, Any] | None:
        settings_service.ensure_settings_columns()
        conn = get_db()
        try:
            row = conn.execute(
                f"SELECT {', '.join(_PROFILE_COLUMNS)} FROM user_profile WHERE id = ?",
                (_profile_id(),),
            ).fetchone()
        finally:
            conn.close()
        return _row_to_dict(row)

    return get_cached(f"user_profile:{uid}", 60.0, _load)


def get_effective_max_heart_rate() -> int:
    """Max HR для TRIMP и зон: профиль → формула → 190."""
    profile = get_profile()
    if not profile:
        return resolve_max_heart_rate(None, None)
    return resolve_max_heart_rate(
        profile.get("max_heart_rate"),
        profile.get("date_of_birth"),
    )


def build_profile_response(profile: dict[str, Any] | None) -> dict[str, Any]:
    """Ответ API с эффективным max HR, зонами и настройками."""
    dob = profile.get("date_of_birth") if profile else None
    mhr = profile.get("max_heart_rate") if profile else None
    effective = resolve_max_heart_rate(mhr, dob)
    source = "profile"
    if mhr is None or int(mhr) <= 0:
        from utils.hr_profile import age_from_date_of_birth

        source = "formula" if age_from_date_of_birth(dob) is not None else "default"

    p = profile or {}
    first_name = p.get("first_name")
    last_name = p.get("last_name")
    display_name = p.get("display_name")
    week_start = int(
        p.get("week_start_day")
        if p.get("week_start_day") is not None
        else settings_service.DEFAULTS["week_start_day"]
    )

    return {
        "id": p["id"] if p else _profile_id(),
        "date_of_birth": dob,
        "height_cm": p.get("height_cm"),
        "max_heart_rate": mhr,
        "updated_at": p.get("updated_at"),
        "first_name": first_name,
        "last_name": last_name,
        "display_name": display_name,
        "effective_display_name": resolve_display_name(display_name, first_name, last_name),
        "effective_max_heart_rate": effective,
        "max_hr_source": source,
        "heart_rate_zones": heart_rate_zones(effective),
        "sex": p.get("sex") or settings_service.DEFAULTS["sex"],
        "week_start_day": week_start,
        "week_start_label": WEEKDAY_LABELS_RU.get(
            week_start,
            WEEKDAY_LABELS_RU[settings_service.DEFAULTS["week_start_day"]],
        ),
        "cloud_sync_provider": p.get("cloud_sync_provider")
        or settings_service.DEFAULTS["cloud_sync_provider"],
        "units_system": p.get("units_system") or settings_service.DEFAULTS["units_system"],
        "max_deficit_per_kg_fat": p.get("max_deficit_per_kg_fat"),
        "max_physiological_deficit_per_kg_fat": p.get("max_physiological_deficit_per_kg_fat"),
        "target_bulk_grams_per_week": p.get("target_bulk_grams_per_week"),
        "use_chest_strap_priority": (
            bool(int(p["use_chest_strap_priority"]))
            if p.get("use_chest_strap_priority") is not None
            else True
        ),
    }


def upsert_profile(payload: dict[str, Any]) -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    settings_patch = settings_service.merge_settings_payload(payload)
    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat()

    conn = get_db()
    try:
        row = conn.execute(
            f"SELECT {', '.join(_PROFILE_COLUMNS)} FROM user_profile WHERE id = ?",
            (_profile_id(),),
        ).fetchone()
        existing = _row_to_dict(row) or {}
    finally:
        conn.close()

    if "date_of_birth" in payload:
        dob = payload.get("date_of_birth")
        dob = str(dob)[:10] if dob else None
    else:
        dob = existing.get("date_of_birth")

    if "height_cm" in payload:
        height = payload.get("height_cm")
        height = float(height) if height is not None else None
    else:
        height = existing.get("height_cm")

    if "max_heart_rate" in payload:
        max_hr = payload.get("max_heart_rate")
        max_hr = int(max_hr) if max_hr is not None else None
    else:
        max_hr = existing.get("max_heart_rate")

    if "first_name" in payload:
        first_name = _normalize_name(payload.get("first_name"))
    else:
        first_name = existing.get("first_name")

    if "last_name" in payload:
        last_name = _normalize_name(payload.get("last_name"))
    else:
        last_name = existing.get("last_name")

    if "display_name" in payload:
        display_name = _normalize_name(payload.get("display_name"))
    else:
        display_name = existing.get("display_name")

    sex = settings_patch.get("sex", existing.get("sex", settings_service.DEFAULTS["sex"]))
    week_start_day = settings_patch.get(
        "week_start_day",
        existing.get("week_start_day", settings_service.DEFAULTS["week_start_day"]),
    )
    cloud_sync_provider = settings_patch.get(
        "cloud_sync_provider",
        existing.get("cloud_sync_provider", settings_service.DEFAULTS["cloud_sync_provider"]),
    )
    units_system = str(
        settings_patch.get(
            "units_system",
            existing.get("units_system", settings_service.DEFAULTS["units_system"]),
        )
        or settings_service.DEFAULTS["units_system"]
    ).strip().lower()
    if units_system not in settings_service.VALID_UNITS_SYSTEM:
        units_system = settings_service.DEFAULTS["units_system"]

    conn = get_db()
    try:
        conn.execute(
            """
            INSERT INTO user_profile (
                id, date_of_birth, height_cm, max_heart_rate, updated_at,
                sex, week_start_day, cloud_sync_provider, units_system,
                first_name, last_name, display_name
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
                date_of_birth = excluded.date_of_birth,
                height_cm = excluded.height_cm,
                max_heart_rate = excluded.max_heart_rate,
                updated_at = excluded.updated_at,
                sex = excluded.sex,
                week_start_day = excluded.week_start_day,
                cloud_sync_provider = excluded.cloud_sync_provider,
                units_system = excluded.units_system,
                first_name = excluded.first_name,
                last_name = excluded.last_name,
                display_name = excluded.display_name
            """,
            (
                _profile_id(),
                dob,
                height,
                max_hr,
                now,
                sex,
                int(week_start_day),
                cloud_sync_provider,
                units_system,
                first_name,
                last_name,
                display_name,
            ),
        )
        conn.commit()
        _apply_calorie_control_fields(conn, payload)
        conn.commit()
        row = conn.execute(
            f"SELECT {', '.join(_PROFILE_COLUMNS)} FROM user_profile WHERE id = ?",
            (_profile_id(),),
        ).fetchone()
    finally:
        conn.close()
    return build_profile_response(_row_to_dict(row))


def _apply_calorie_control_fields(conn, payload: dict[str, Any]) -> None:
    """Обновить поля калькулятора сушки/набора в user_profile."""
    parts: list[str] = []
    vals: list[Any] = []
    if "max_deficit_per_kg_fat" in payload and payload["max_deficit_per_kg_fat"] is not None:
        v = float(payload["max_deficit_per_kg_fat"])
        if v < MIN_DEFICIT_PER_KG_FAT or v > MAX_DEFICIT_PER_KG_FAT:
            raise ValueError("Лимит дефицита должен быть от 5 до 70 ккал/кг жира")
        parts.append("max_deficit_per_kg_fat = ?")
        vals.append(v)
    if (
        "max_physiological_deficit_per_kg_fat" in payload
        and payload["max_physiological_deficit_per_kg_fat"] is not None
    ):
        v = float(payload["max_physiological_deficit_per_kg_fat"])
        if v < 50 or v > 100:
            raise ValueError("max_physiological_deficit_per_kg_fat должен быть от 50 до 100")
        parts.append("max_physiological_deficit_per_kg_fat = ?")
        vals.append(v)
    if "target_bulk_grams_per_week" in payload and payload["target_bulk_grams_per_week"] is not None:
        v = float(payload["target_bulk_grams_per_week"])
        if v < 50 or v > 2000:
            raise ValueError("target_bulk_grams_per_week должен быть от 50 до 2000")
        parts.append("target_bulk_grams_per_week = ?")
        vals.append(v)
    if "use_chest_strap_priority" in payload and payload["use_chest_strap_priority"] is not None:
        parts.append("use_chest_strap_priority = ?")
        vals.append(1 if payload["use_chest_strap_priority"] else 0)
    if parts:
        vals.append(_profile_id())
        conn.execute(
            f"UPDATE user_profile SET {', '.join(parts)} WHERE id = ?",
            vals,
        )


def _round1(n: float) -> float:
    return round(float(n), 1)


def get_default_nutrition_grams_per_kg(activity_level: str | None) -> dict[str, float]:
    level = (activity_level or "sedentary").strip().lower()
    if level not in VALID_ACTIVITY_LEVELS:
        level = "sedentary"
    protein = 1.6 if level == "active" else 1.2
    return {"protein": protein, "fat": 0.8, "carbs": 3.5}


def get_effective_nutrition_grams_per_kg(user_id: int | None = None) -> dict[str, float]:
    if user_id is None:
        user_id = get_current_user_id()
    del user_id
    settings_service.ensure_settings_columns()
    profile = get_profile() or {}
    defaults = get_default_nutrition_grams_per_kg(profile.get("activity_level"))
    return {
        "protein": (
            float(profile["protein_gram_per_kg"])
            if profile.get("protein_gram_per_kg") is not None
            else defaults["protein"]
        ),
        "fat": (
            float(profile["fat_gram_per_kg"])
            if profile.get("fat_gram_per_kg") is not None
            else defaults["fat"]
        ),
        "carbs": (
            float(profile["carbs_gram_per_kg"])
            if profile.get("carbs_gram_per_kg") is not None
            else defaults["carbs"]
        ),
        "activity_level": profile.get("activity_level") or "sedentary",
    }


def get_daily_fiber_target() -> dict[str, float]:
    return {"recommended_grams": FIBER_TARGET_GRAMS}


def get_nutrition_settings() -> dict[str, Any]:
    """Настройки БЖУ: NULL в БД заменяются default для ответа (без сохранения)."""
    settings_service.ensure_settings_columns()
    profile = get_profile() or {}
    activity = profile.get("activity_level")
    defaults = get_default_nutrition_grams_per_kg(activity)
    return {
        "protein_gram_per_kg": (
            float(profile["protein_gram_per_kg"])
            if profile.get("protein_gram_per_kg") is not None
            else defaults["protein"]
        ),
        "fat_gram_per_kg": (
            float(profile["fat_gram_per_kg"])
            if profile.get("fat_gram_per_kg") is not None
            else defaults["fat"]
        ),
        "carbs_gram_per_kg": (
            float(profile["carbs_gram_per_kg"])
            if profile.get("carbs_gram_per_kg") is not None
            else defaults["carbs"]
        ),
        "activity_level": activity or "sedentary",
    }


def get_fit_folder_path_setting() -> str | None:
    """Сырой путь из user_profile (без resolve)."""
    settings_service.ensure_settings_columns()
    profile = get_profile() or {}
    raw = profile.get("fit_folder_path")
    if raw is None:
        return None
    text = str(raw).strip()
    return text or None


def get_integration_settings() -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    stored = get_fit_folder_path_setting()
    effective: str | None = None
    try:
        from utils.fit_folder_config import get_fit_folder_path

        effective = str(get_fit_folder_path())
    except Exception:
        effective = None
    return {
        "fit_folder_path": stored,
        "effective_fit_folder_path": effective,
    }


def save_integration_settings(data: dict[str, Any]) -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    if "fit_folder_path" not in data:
        return get_integration_settings()

    raw = data.get("fit_folder_path")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        fit_path: str | None = None
    else:
        fit_path = str(raw).strip()
        if any(ch in fit_path for ch in ("\0", "\n", "\r")):
            raise ValueError("fit_folder_path содержит недопустимые символы")

    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ?",
            (_profile_id(),),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO user_profile (id, updated_at) VALUES (?, ?)
                """,
                (_profile_id(), datetime.now(timezone.utc).replace(microsecond=0).isoformat()),
            )
        if fit_path is None:
            conn.execute(
                "UPDATE user_profile SET fit_folder_path = NULL WHERE id = ?",
                (_profile_id(),),
            )
        else:
            conn.execute(
                "UPDATE user_profile SET fit_folder_path = ? WHERE id = ?",
                (fit_path, _profile_id()),
            )
        conn.commit()
    finally:
        conn.close()

    return get_integration_settings()


def get_analytics_settings() -> dict[str, Any]:
    """Настройки аналитики (разминка + Health Connect toggles)."""
    from backend.services.hc_analytics_service import get_hc_analytics_prefs

    settings_service.ensure_settings_columns()
    uid = _profile_id()
    conn = get_db()
    try:
        row = conn.execute(
            """
            SELECT COALESCE(include_warmup_in_analytics, 0)
            FROM user_profile WHERE id = ?
            """,
            (uid,),
        ).fetchone()
    except Exception:
        return {
            "include_warmup_in_analytics": False,
            "hc_analytics": get_hc_analytics_prefs(uid),
        }
    finally:
        conn.close()
    if row is None:
        return {
            "include_warmup_in_analytics": False,
            "hc_analytics": get_hc_analytics_prefs(uid),
        }
    return {
        "include_warmup_in_analytics": bool(int(row[0])),
        "hc_analytics": get_hc_analytics_prefs(uid),
    }


def update_analytics_settings(data: dict[str, Any]) -> dict[str, Any]:
    """Сохранить настройки аналитики (разминка и/или HC toggles)."""
    from backend.services.hc_analytics_service import save_hc_analytics_prefs

    settings_service.ensure_settings_columns()
    uid = _profile_id()
    conn = get_db()
    try:
        if data.get("include_warmup_in_analytics") is not None:
            include = 1 if data["include_warmup_in_analytics"] else 0
            row = conn.execute(
                "SELECT id FROM user_profile WHERE id = ?",
                (uid,),
            ).fetchone()
            if row is None:
                conn.execute(
                    """
                    INSERT INTO user_profile (id, updated_at, include_warmup_in_analytics)
                    VALUES (?, ?, ?)
                    """,
                    (
                        uid,
                        datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
                        include,
                    ),
                )
            else:
                conn.execute(
                    "UPDATE user_profile SET include_warmup_in_analytics = ? WHERE id = ?",
                    (include, uid),
                )
            conn.commit()
        if data.get("hc_analytics") is not None:
            save_hc_analytics_prefs(data["hc_analytics"], uid)
        from backend.services.forma_sync.change_tracker import touch_user_preferences

        touch_user_preferences(conn)
        conn.commit()
    finally:
        conn.close()
    return get_analytics_settings()


def save_nutrition_settings(data: dict[str, Any]) -> dict[str, Any]:
    settings_service.ensure_settings_columns()
    conn = get_db()
    try:
        row = conn.execute(
            "SELECT id FROM user_profile WHERE id = ?",
            (_profile_id(),),
        ).fetchone()
        if row is None:
            conn.execute(
                """
                INSERT INTO user_profile (id, updated_at) VALUES (?, ?)
                """,
                (_profile_id(), datetime.now(timezone.utc).replace(microsecond=0).isoformat()),
            )

        updates: list[str] = []
        params: list[Any] = []
        for key in (
            "protein_gram_per_kg",
            "fat_gram_per_kg",
            "carbs_gram_per_kg",
            "activity_level",
        ):
            if key not in data:
                continue
            val = data[key]
            if key == "activity_level":
                if val is None or val == "":
                    updates.append(f"{key} = NULL")
                else:
                    level = str(val).strip().lower()
                    if level not in VALID_ACTIVITY_LEVELS:
                        raise ValueError("activity_level: sedentary или active")
                    updates.append(f"{key} = ?")
                    params.append(level)
            elif val is None or val == "":
                updates.append(f"{key} = NULL")
            else:
                updates.append(f"{key} = ?")
                params.append(float(val))

        if updates:
            params.append(_profile_id())
            conn.execute(
                f"UPDATE user_profile SET {', '.join(updates)} WHERE id = ?",
                params,
            )
            from backend.services.forma_sync.change_tracker import touch_user_preferences

            touch_user_preferences(conn)
            conn.commit()
    finally:
        conn.close()

    stored = get_profile() or {}
    activity = stored.get("activity_level")
    defaults = get_default_nutrition_grams_per_kg(activity)
    return {
        "protein_gram_per_kg": (
            float(stored["protein_gram_per_kg"])
            if stored.get("protein_gram_per_kg") is not None
            else defaults["protein"]
        ),
        "fat_gram_per_kg": (
            float(stored["fat_gram_per_kg"])
            if stored.get("fat_gram_per_kg") is not None
            else defaults["fat"]
        ),
        "carbs_gram_per_kg": (
            float(stored["carbs_gram_per_kg"])
            if stored.get("carbs_gram_per_kg") is not None
            else defaults["carbs"]
        ),
        "activity_level": activity or "sedentary",
    }


def _latest_weight_kg(conn) -> float | None:
    row = conn.execute(
        """
        SELECT weight_kg FROM daily_weight
        ORDER BY date DESC
        LIMIT 1
        """
    ).fetchone()
    if row and row[0] is not None:
        return float(row[0])
    return None


def _latest_body_fat(conn) -> float | None:
    row = conn.execute(
        """
        SELECT body_fat_percent FROM daily_weight
        WHERE body_fat_percent IS NOT NULL
        ORDER BY date DESC
        LIMIT 1
        """
    ).fetchone()
    if row and row[0] is not None:
        return float(row[0])
    return None


def _detect_activity_level(conn) -> tuple[str, bool]:
    """active | sedentary; второй флаг — были ли тренировки за 30 дней."""
    since = (date.today() - timedelta(days=30)).isoformat()
    uid = get_current_user_id()
    trimp_row = conn.execute(
        """
        SELECT COALESCE(SUM(trimp), 0), COUNT(DISTINCT date)
        FROM cardio_workouts
        WHERE date >= ? AND user_id = ?
        """,
        (since, uid),
    ).fetchone()
    trimp_sum = float(trimp_row[0] or 0)
    cardio_days = int(trimp_row[1] or 0)

    strength_row = conn.execute(
        """
        SELECT COALESCE(SUM(weight * reps), 0), COUNT(DISTINCT date || '|' || workout_title)
        FROM strength_workouts
        WHERE date >= ? AND weight IS NOT NULL AND reps IS NOT NULL AND user_id = ?
        """,
        (since, uid),
    ).fetchone()
    strength_volume = float(strength_row[0] or 0)
    strength_sessions = int(strength_row[1] or 0)

    has_workouts = cardio_days > 0 or strength_sessions > 0
    if trimp_sum >= 200 or strength_volume >= 30000 or (cardio_days + strength_sessions) >= 8:
        return "active", has_workouts
    return "sedentary", has_workouts


def calculate_user_level(user_id: int | None = None) -> dict[str, Any]:
    if user_id is None:
        user_id = get_current_user_id()
    del user_id
    settings_service.ensure_settings_columns()
    profile = get_profile() or {}
    missing_fields: list[str] = []
    missing_hints: list[str] = []

    height = profile.get("height_cm")
    dob = profile.get("date_of_birth")
    sex = profile.get("sex") or settings_service.get_sex()
    age = age_from_date_of_birth(dob) if dob else None

    conn = get_db()
    try:
        weight = _latest_weight_kg(conn)
        body_fat = _latest_body_fat(conn)
        activity_level, has_workouts = _detect_activity_level(conn)
    finally:
        conn.close()

    if height is None or float(height) <= 0:
        missing_fields.append("height")
    if age is None:
        missing_fields.append("birth_date")
    if not sex:
        missing_fields.append("gender")
    if weight is None or weight <= 0:
        missing_fields.append("weight")
    if body_fat is None:
        missing_fields.append("body_fat")

    if missing_fields:
        required = {"height", "birth_date", "gender", "weight"}
        if required & set(missing_fields):
            return {
                "status": "missing_data",
                "missing_fields": missing_fields,
                "missing_hints": [
                    MISSING_FIELD_LABELS.get(f, f)
                    for f in missing_fields
                    if f in MISSING_FIELD_LABELS
                ],
                "recommendations": None,
            }

    if not has_workouts:
        missing_hints.append(WORKOUT_ACTIVITY_HINT)

    bmr = _core_compute_bmr(float(weight), float(height), int(age), sex=sex)
    tdee = _round1(bmr * TDEE_MULTIPLIER[activity_level])
    protein_gkg = 1.6 if activity_level == "active" else 1.2
    fat_gkg = 0.8
    protein_kcal = protein_gkg * float(weight) * 4
    fat_kcal = fat_gkg * float(weight) * 9
    carbs_kcal = max(0.0, tdee - protein_kcal - fat_kcal)
    carbs_gkg_raw = carbs_kcal / 4.0 / float(weight) if weight else 0.0
    carbs_gkg = max(2.0, min(6.0, carbs_gkg_raw))

    protein_grams = _round1(protein_gkg * float(weight))
    fat_grams = _round1(fat_gkg * float(weight))
    carbs_grams = _round1(carbs_gkg * float(weight))

    return {
        "status": "ok",
        "missing_fields": [f for f in missing_fields if f == "body_fat"],
        "missing_hints": missing_hints,
        "recommendations": {
            "bmr": bmr,
            "tdee": tdee,
            "protein_grams_per_kg": protein_gkg,
            "fat_grams_per_kg": fat_gkg,
            "carbs_grams_per_kg": _round1(carbs_gkg),
            "protein_grams": protein_grams,
            "fat_grams": fat_grams,
            "carbs_grams": carbs_grams,
            "calories": tdee,
            "activity_level": activity_level,
        },
    }
