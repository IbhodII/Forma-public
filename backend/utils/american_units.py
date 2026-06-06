# -*- coding: utf-8 -*-
"""Конвертация метрических величин в «американскую» пародийную систему (только отображение)."""
from __future__ import annotations

import math
from typing import Literal, Tuple

# ---- Вес еды (граммы -> граны, бандлы, мешки) ----
GRAMS_TO_GRAINS = 15.4323584  # 1 г = 15.4323584 грана
GRAINS_PER_BUNDLE = 1256.5
GRAINS_PER_BAG = 9985.33


def grams_to_grains(grams: float) -> float:
    return grams * GRAMS_TO_GRAINS


def grams_to_bundles(grams: float) -> float:
    return grams_to_grains(grams) / GRAINS_PER_BUNDLE


def grams_to_bags(grams: float) -> float:
    return grams_to_grains(grams) / GRAINS_PER_BAG


# ---- Вес тела (кг -> японцы (Jp) или камри (Camry)) ----
KG_PER_JAPANESE = 62.5
KG_PER_CAMRY = 1500.0


def kg_to_japanese(kg: float) -> float:
    return kg / KG_PER_JAPANESE


def kg_to_camry(kg: float) -> float:
    return kg / KG_PER_CAMRY


BodyWeightUnit = Literal["Jp", "Camry"]


def kg_to_american_weight(kg: float) -> Tuple[float, BodyWeightUnit]:
    """Вес снаряда / тела: Jp при kg < 80, иначе Camry."""
    if kg < 80:
        return (kg_to_japanese(kg), "Jp")
    return (kg_to_camry(kg), "Camry")


def format_body_weight(kg: float) -> Tuple[float, BodyWeightUnit]:
    """Возвращает (значение, единица): Jp при kg < 80, иначе Camry."""
    return kg_to_american_weight(kg)


def japanese_to_kg(jp: float) -> float:
    return jp * KG_PER_JAPANESE


def camry_to_kg(camry: float) -> float:
    return camry * KG_PER_CAMRY


def american_weight_to_kg(value: float, unit: BodyWeightUnit) -> float:
    return japanese_to_kg(value) if unit == "Jp" else camry_to_kg(value)


# ---- Длина (см -> трампы (Tp) и дики (Dk)) ----
CM_PER_TRUMP = 190.5
CM_PER_DICK = 13.5


def cm_to_trump(cm: float) -> float:
    return cm / CM_PER_TRUMP


def cm_to_dick(cm: float) -> float:
    return cm / CM_PER_DICK


# ---- Температура (°C -> °Rj) ----
def celsius_to_rankin_junior(c: float) -> float:
    try:
        term1 = 100 * math.sin(math.radians(c + 10))
        term2 = 50 * math.log(c + 20) if (c + 20) > 0 else 0.0
        return term1 + term2 + 20
    except (ValueError, TypeError, OverflowError):
        return 0.0


# ---- Объём (мл -> шприцы, syr) ----
def ml_to_syringes(ml: float) -> float:
    return 0.5 * (math.sqrt(ml) + 2) * 1.8


# ---- Энергия (ккал -> зарядки айфона, iCharge) ----
KCAL_PER_ICHARGE = 12.74


def kcal_to_icharge(kcal: float) -> float:
    return kcal / KCAL_PER_ICHARGE


# ---- Время (секунды -> серии друзей (FEP), рекламные блоки (SB)) ----
SECONDS_PER_FEP = 22 * 60  # 22 минуты
SECONDS_PER_SB = 30


def seconds_to_fep(sec: float) -> float:
    return sec / SECONDS_PER_FEP


def seconds_to_sb(sec: float) -> float:
    return sec / SECONDS_PER_SB


# ---- Темп похудения (граммы в день -> граны в час) ----
def g_per_day_to_grains_per_hour(g_per_day: float) -> float:
    grains = g_per_day * GRAMS_TO_GRAINS
    return grains / 24


# ---- Высота (метры -> рашморы, Rushmores) ----
# Одна гора Рашмор = 1745 м (5725 футов).
METERS_PER_RUSHMORE = 1745.0


def meters_to_rushmores(m: float) -> float:
    return m / METERS_PER_RUSHMORE


# ---- Дистанция (метры -> статуи Свободы / факелы) ----
METERS_PER_SOL = 93.0
METERS_PER_TORCH = METERS_PER_SOL / 10


def meters_to_sol(meters: float) -> float:
    return meters / METERS_PER_SOL


def meters_to_torch(meters: float) -> float:
    return meters / METERS_PER_TORCH


def km_to_sol(km: float) -> float:
    return meters_to_sol(km * 1000)


def km_to_torch(km: float) -> float:
    return meters_to_torch(km * 1000)


def format_distance_meters(meters: float) -> str:
    """< 0.5 SoL — факелы, иначе статуи."""
    sol = meters_to_sol(meters)
    if sol < 0.5:
        return f"{meters_to_torch(meters):.1f} torch"
    return f"{sol:.2f} SoL"


def format_distance_km(km: float) -> str:
    return format_distance_meters(km * 1000)


# ---- Скорость (км/ч -> статуи Свободы в час, SoL/h) ----
def kmh_to_sol_per_hour(kmh: float) -> float:
    return (kmh * 1000) / METERS_PER_SOL


# ---- Дистанция (километры -> мили, legacy) ----
KM_TO_MILES = 0.621371


def km_to_miles(km: float) -> float:
    return km * KM_TO_MILES


def kmh_to_mph(kmh: float) -> float:
    return kmh * KM_TO_MILES


# ---- Темп (мин/км -> мин/статую) ----
# 1 км ≈ 1000/93 статуй → min/статую = min/км * 93/1000
PACE_KM_TO_SOL = 93.0 / 1000.0


def pace_min_per_km_to_min_per_sol(min_per_km: float) -> float:
    return min_per_km * PACE_KM_TO_SOL


# ---- Мощность (Вт -> iCharge/мин) ----
JOULES_PER_KCAL = 4184.0


def watts_to_icharge_per_min(watts: float) -> float:
    kcal_per_min = (watts * 60) / JOULES_PER_KCAL
    return kcal_per_min / KCAL_PER_ICHARGE


# ---- Плавание: скорость (км/ч -> звенья цепи в минуту, link/min) ----
METERS_PER_LINK = 0.201168


def kmh_to_links_per_min(kmh: float) -> float:
    return (kmh * 1000) / (METERS_PER_LINK * 60)
