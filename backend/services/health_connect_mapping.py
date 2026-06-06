# -*- coding: utf-8 -*-

"""Каталог полей Health Connect → целевые таблицы БД (подготовка к отладке маппинга)."""

from __future__ import annotations



from typing import Any



FIELD_CATALOG: list[dict[str, Any]] = [

    {

        "hc_field": "steps",

        "target_table": "steps_history",

        "target_column": "steps",

        "notes": "UPSERT по date; берётся MAX(steps)",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["Steps"],

    },

    {

        "hc_field": "total_calories",

        "target_table": "daily_bracelet_calories",

        "target_column": "total_calories",

        "notes": "Приоритет над active_calories",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["TotalCaloriesBurned"],

    },

    {

        "hc_field": "active_calories",

        "target_table": "daily_bracelet_calories",

        "target_column": "total_calories",

        "notes": "Используется если total_calories отсутствует",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["ActiveCaloriesBurned"],

    },

    {

        "hc_field": "weight_kg",

        "target_table": "daily_weight",

        "target_column": "weight_kg",

        "notes": "save_daily_weight по date",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["Weight"],

    },

    {

        "hc_field": "sleep",

        "target_table": "sleep_data",

        "target_column": "duration/light/deep/rem",

        "notes": "UPSERT по external_id или start/end",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["SleepSession"],

    },

    {

        "hc_field": "workouts",

        "target_table": "cardio_workouts",

        "target_column": "multiple",

        "notes": "Маппинг exercise_type → тип кардио; силовые (70) пропускаются",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["ExerciseSession"],

    },

    {

        "hc_field": "heart_rate_samples",

        "target_table": "passive_heart_rate_samples",

        "target_column": "bpm",

        "notes": "Дневной continuous HR (time+bpm); workout elapsed_sec — в workout_heart_rate",

        "analytics_used": True,

        "saved_by_backend": True,

        "required_permissions": ["HeartRate"],

    },

    {

        "hc_field": "heart_rate",

        "target_table": "passive_heart_rate_samples",

        "target_column": "bpm",

        "notes": "Alias для continuous passive HR timeline",

        "analytics_used": True,

        "saved_by_backend": True,

        "required_permissions": ["HeartRate"],

    },

    {

        "hc_field": "basal_metabolic_rate",

        "target_table": None,

        "target_column": None,

        "notes": "BasalMetabolicRate — audit only на телефоне, не сохраняется",

        "analytics_used": False,

        "saved_by_backend": False,

        "required_permissions": ["BasalMetabolicRate"],

    },

    {

        "hc_field": "distance",

        "target_table": "cardio_workouts",

        "target_column": "distance_km",

        "notes": "Часть workout payload; нужен READ Distance на Android",

        "analytics_used": False,

        "saved_by_backend": True,

        "required_permissions": ["Distance", "ExerciseSession"],

    },

]



EXERCISE_TYPE_MAP: list[dict[str, Any]] = [

    {"exercise_type": 70, "action": "skip", "label": "STRENGTH_TRAINING"},

    {"exercise_type": 8, "action": "cardio", "db_type": "вело", "label": "BIKING"},

    {"exercise_type": 9, "action": "cardio", "db_type": "вело", "label": "STATIONARY_BIKING"},

    {"exercise_type": 37, "action": "cardio", "db_type": "бег", "label": "HIKING"},

    {"exercise_type": 56, "action": "cardio", "db_type": "бег", "label": "RUNNING"},

    {"exercise_type": 73, "action": "cardio", "db_type": "бассейн", "label": "SWIMMING_POOL"},

    {"exercise_type": 74, "action": "cardio", "db_type": "бассейн", "label": "SWIMMING_OPEN_WATER"},

]





def get_field_catalog() -> list[dict[str, Any]]:

    return list(FIELD_CATALOG)





def get_exercise_type_map() -> list[dict[str, Any]]:

    return list(EXERCISE_TYPE_MAP)


