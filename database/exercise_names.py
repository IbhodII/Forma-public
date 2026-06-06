# -*- coding: utf-8 -*-
"""Нормализация и дедупликация названий силовых упражнений."""
from __future__ import annotations

from typing import Iterable


def exercise_name_key(name: str) -> str:
    """Ключ для сравнения: trim + без учёта регистра."""
    return str(name).strip().casefold()


def dedupe_exercise_names_ordered(names: Iterable[str]) -> list[str]:
    """
    Уникальные упражнения в исходном порядке.
    Несколько подходов одного упражнения в истории/наборе не дают дублей в списке.
    """
    seen: set[str] = set()
    out: list[str] = []
    for raw in names:
        title = str(raw).strip()
        if not title:
            continue
        key = title.casefold()
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
    return out
