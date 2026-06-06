# -*- coding: utf-8 -*-
"""Доступ к функциям менструального цикла (только пол «женский» в профиле)."""
from __future__ import annotations

from backend.services import settings_service


def is_female_profile() -> bool:
    return settings_service.get_sex() == "female"
