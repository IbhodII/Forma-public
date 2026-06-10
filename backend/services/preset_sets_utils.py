# -*- coding: utf-8 -*-
"""Разбор и нормализация подходов пресетов (preset_sets)."""
from __future__ import annotations

import re
from typing import Any

_DEFAULT_SET_COUNT = 4
_DEFAULT_REP = 8


def is_plank_exercise(name: str) -> bool:
    return is_time_based_exercise(name)


def is_time_based_exercise(name: str) -> bool:
    """Упражнения на время (планка и аналоги), не по названию веса."""
    n = name.strip().lower().replace("ё", "е")
    if "планк" in n:
        return True
    if re.search(r"\bplank\b", n):
        return True
    if "wall sit" in n or "hollow hold" in n:
        return True
    return False


def parse_reps_tokens(raw: str | None) -> list[int]:
    """Разбивает '8+8+8' или '10,10,10' на список повторений."""
    if not raw or not str(raw).strip():
        return []
    result: list[int] = []
    for part in re.split(r"[,+;\s]+", str(raw).strip()):
        part = part.strip()
        if not part:
            continue
        try:
            n = int(float(part))
            if n > 0:
                result.append(n)
        except ValueError:
            continue
    return result


def legacy_default_reps_to_sets(
    default_reps: str | None,
    default_sets: int | None,
    default_weight: float | None,
    *,
    is_bodyweight: bool = False,
) -> list[dict[str, Any]]:
    """Конвертация default_reps / default_sets в список подходов."""
    sets_count = max(1, int(default_sets or _DEFAULT_SET_COUNT))
    tokens = parse_reps_tokens(default_reps)
    if tokens and ("+" in str(default_reps or "") or "," in str(default_reps or "")):
        rep_list = tokens
    elif tokens:
        rep_list = [tokens[0]] * sets_count
    elif is_bodyweight:
        rep_list = [30] * sets_count
    else:
        rep_list = [_DEFAULT_REP] * sets_count

    out: list[dict[str, Any]] = []
    for i, reps in enumerate(rep_list, start=1):
        row: dict[str, Any] = {
            "set_number": i,
            "reps": reps,
            "weight": None if is_bodyweight else default_weight,
            "is_warmup": 0,
        }
        if is_bodyweight:
            row["duration_sec"] = reps
            row["reps"] = 1
        else:
            row["duration_sec"] = None
        out.append(row)
    return out


def normalize_exercise_sets_input(ex: dict[str, Any]) -> tuple[list[dict[str, Any]], bool]:
    """
    Возвращает (sets, is_bodyweight).
    Поддержка: sets[] или legacy default_reps / default_sets.
    """
    name = str(ex.get("exercise_name") or ex.get("exercise") or "").strip()
    is_bw = bool(int(ex.get("is_bodyweight") or 0))
    if not is_bw and name and is_plank_exercise(name):
        is_bw = True

    raw_sets = ex.get("sets")
    if raw_sets and isinstance(raw_sets, list):
        normalized: list[dict[str, Any]] = []
        for i, s in enumerate(raw_sets, start=1):
            reps = int(s.get("reps") or _DEFAULT_REP)
            is_warmup = 1 if s.get("is_warmup") else 0
            duration = s.get("duration_sec")
            weight = s.get("weight")
            if is_bw:
                dur_i = int(duration if duration is not None else reps)
                normalized.append(
                    {
                        "set_number": int(s.get("set_number") or i),
                        "reps": 1,
                        "weight": None,
                        "duration_sec": dur_i,
                        "is_warmup": is_warmup,
                    }
                )
            else:
                w = float(weight) if weight is not None and str(weight).strip() != "" else None
                normalized.append(
                    {
                        "set_number": int(s.get("set_number") or i),
                        "reps": reps,
                        "weight": w,
                        "duration_sec": None,
                        "is_warmup": is_warmup,
                    }
                )
        return normalized, is_bw

    legacy_reps = ex.get("default_reps")
    if legacy_reps and ("+" in str(legacy_reps) or "," in str(legacy_reps)):
        sets = legacy_default_reps_to_sets(
            str(legacy_reps),
            ex.get("default_sets"),
            ex.get("default_weight"),
            is_bodyweight=is_bw,
        )
        return sets, is_bw

    sets = legacy_default_reps_to_sets(
        legacy_reps,
        ex.get("default_sets"),
        ex.get("default_weight"),
        is_bodyweight=is_bw,
    )
    return sets, is_bw


def default_sets_for_new_exercise(exercise_name: str) -> tuple[list[dict[str, Any]], bool]:
    """4 подхода по умолчанию; планка — 30 сек."""
    is_bw = is_plank_exercise(exercise_name)
    if is_bw:
        return (
            [
                {
                    "set_number": i,
                    "reps": 1,
                    "weight": None,
                    "duration_sec": 30,
                    "is_warmup": 0,
                }
                for i in range(1, 5)
            ],
            True,
        )
    return (
        [
            {
                "set_number": i,
                "reps": _DEFAULT_REP,
                "weight": 0.0,
                "duration_sec": None,
                "is_warmup": 0,
            }
            for i in range(1, 5)
        ],
        False,
    )
