# -*- coding: utf-8 -*-
"""Константы дашборда."""
from __future__ import annotations

PAGE_SIZE = 20

# Макс. точек на графике пульса (вело); меньше — быстрее отрисовка
HR_CHART_MAX_POINTS = 2000

# Силовые пресеты — только пользовательские / импорт (Desktop v1: без seed).
WORKOUT_EXERCISES: dict[str, list[str]] = {}
WORKOUT_TYPES: list[str] = []
STRENGTH_WEEK_CYCLE: list[str] = []
_TEMPLATE_SEED_DATE = "2000-01-01"
# Начало действия исходного набора упражнений (exercise_sets)
EXERCISE_SET_DEFAULT_FROM = "1900-01-01"

CARDIO_TYPES = {"Бассейн": "бассейн", "Велосипед": "вело"}
CARDIO_DB_BIKE = CARDIO_TYPES["Велосипед"]
CARDIO_SOURCE_FIT = "fit_coospo"
CARDIO_SOURCE_EXCEL = "excel"
CARDIO_SOURCE_MANUAL = "manual"
CARDIO_SOURCE_POLAR = "polar_historical"
CARDIO_SOURCE_HEALTH_CONNECT = "health_connect"
CARDIO_SOURCE_IMPORT_FIT = "import_fit"
CARDIO_SOURCE_IMPORT_TCX = "import_tcx"
CARDIO_SOURCE_IMPORT_GPX = "import_gpx"
CARDIO_MANUAL_TYPES = list(CARDIO_TYPES.keys())
CARDIO_ARCHIVE_TYPE = "бег"
CARDIO_DB_CHART = {"Силовые": None, "Велосипед": "вело", "Бег": "бег", "Бассейн": "бассейн"}

# План питания: прогноз сушки и набора
NUTRITION_PHASES = ("bulk", "cut")
NUTRITION_PHASE_LABELS = {"bulk": "Набор", "cut": "Сушка"}
KCAL_PER_KG_FAT = 7700  # энергия 1 кг жировой ткани
KCAL_DEFICIT_PER_KG_FAT_DAY = 35  # ккал/день на каждый кг текущего жира (рекомендуемый безопасный лимит)
MIN_DEFICIT_PER_KG_FAT = 5  # мин. настраиваемый лимит дефицита, ккал/кг жира/день
MAX_DEFICIT_PER_KG_FAT = 70  # макс. настраиваемый лимит дефицита, ккал/кг жира/день
DEFAULT_MAX_SAFE_DEFICIT_PER_KG_FAT = KCAL_DEFICIT_PER_KG_FAT_DAY
DEFAULT_MAX_PHYSIOLOGICAL_DEFICIT_PER_KG_FAT = MAX_DEFICIT_PER_KG_FAT
DEFAULT_GAIN_KG_PER_WEEK = 0.3
DEFAULT_SURPLUS_KCAL = 300
DEFAULT_CUT_TARGET_FAT_PCT = 12.0
DEFAULT_BULK_TARGET_WEIGHT_KG = 88.0

# Колонки БД для поиска «было …» (основная + старые имена)
BODY_FIELD_DB_ALIASES: dict[str, tuple[str, ...]] = {
    "weight_kg": ("weight_kg",),
    "body_fat_percent": ("body_fat_percent",),
    "muscle_mass_kg": ("muscle_mass_kg",),
    "chest_inhale_cm": ("chest_inhale_cm",),
    "chest_exhale_cm": ("chest_exhale_cm",),
    "chest_avg_cm": ("chest_avg_cm",),
    "bicep_tense_cm": ("bicep_tense_cm", "bicep_left_cm"),
    "bicep_relaxed_cm": ("bicep_relaxed_cm", "bicep_right_cm"),
    "bicep_avg_cm": ("bicep_avg_cm",),
    "calf_tense_cm": ("calf_tense_cm", "calf_left_cm"),
    "calf_relaxed_cm": ("calf_relaxed_cm", "calf_right_cm"),
    "calf_avg_cm": ("calf_avg_cm",),
    "thigh_tense_cm": ("thigh_tense_cm", "thigh_left_cm"),
    "thigh_relaxed_cm": ("thigh_relaxed_cm", "thigh_right_cm"),
    "thigh_avg_cm": ("thigh_avg_cm",),
    "forearm_tense_cm": ("forearm_tense_cm", "forearm_left_cm"),
    "forearm_relaxed_cm": ("forearm_relaxed_cm", "forearm_right_cm"),
    "waist_cm": ("waist_cm",),
    "hips_cm": ("hips_cm",),
    "ankle_cm": ("ankle_cm",),
    "wrist_cm": ("wrist_cm",),
    "neck_cm": ("neck_cm",),
}

# Показатели тела для таблицы и графиков
BODY_CHART_METRICS = {
    "Вес, кг": "weight_kg",
    "Жир, %": "body_fat_percent",
    "Мышцы, кг": "muscle_mass_kg",
    "Грудь вдох, см": "chest_inhale_cm",
    "Грудь выдох, см": "chest_exhale_cm",
    "Грудь ср., см": "chest_avg_cm",
    "Бицепс ср., см": "bicep_avg_cm",
    "Бицепс Н, см": "bicep_tense_cm",
    "Бицепс Р, см": "bicep_relaxed_cm",
    "Икры Н, см": "calf_tense_cm",
    "Икры Р, см": "calf_relaxed_cm",
    "Икры ср., см": "calf_avg_cm",
    "Бедро ср., см": "thigh_avg_cm",
    "Бедро Н, см": "thigh_tense_cm",
    "Бедро Р, см": "thigh_relaxed_cm",
    "Предпл. Н, см": "forearm_tense_cm",
    "Предпл. Р, см": "forearm_relaxed_cm",
    "Талия, см": "waist_cm",
    "Бёдра, см": "hips_cm",
    "Лодыжка, см": "ankle_cm",
    "Запястье, см": "wrist_cm",
    "Шея, см": "neck_cm",
}
BODY_TABLE_COLUMNS = [
    ("date", "Дата"),
    ("weight_kg", "Вес, кг"),
    ("body_fat_percent", "Жир, %"),
    ("muscle_mass_kg", "Мышцы, кг"),
    ("chest_avg_cm", "Грудь ср., см"),
    ("waist_cm", "Талия, см"),
    ("hips_cm", "Бёдра, см"),
    ("bicep_avg_cm", "Бицепс ср., см"),
    ("calf_avg_cm", "Икры ср., см"),
    ("thigh_avg_cm", "Бедро ср., см"),
    ("neck_cm", "Шея, см"),
]

API_BASE_URL = "http://localhost:8000"

# Имена заводских рационов (клонируются per-user из user 1).
STANDARD_MEAL_PLAN_NAMES: dict[str, str] = {
    "cut": "Стандартная сушка",
    "bulk": "Стандартный набор",
}
