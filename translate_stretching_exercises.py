#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Однократный перевод названий и описаний упражнений растяжки в workouts.db через MyMemory API.

Скрипт идемпотентен: переводит только записи с translated = 0 / description_translated = 0,
сохраняет прогресс после каждого упражнения. При прерывании можно запустить снова.

Запуск из корня проекта:
    python translate_stretching_exercises.py
    python translate_stretching_exercises.py --delay 0.5
    python translate_stretching_exercises.py --descriptions-only
    python translate_stretching_exercises.py --names-only
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from database.migrations import ensure_db_schema  # noqa: E402
from backend.services.stretching_service import (  # noqa: E402
    translate_descriptions_in_db,
    translate_exercises_in_db,
)


def _log(msg: str) -> None:
    print(msg, flush=True)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Перевести упражнения растяжки на русский (однократный CLI-запуск)",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=0.5,
        help="Пауза между запросами к API перевода, сек (по умолчанию 0.5; для описаний лучше 1.0)",
    )
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument(
        "--names-only",
        action="store_true",
        help="Перевести только названия",
    )
    mode.add_argument(
        "--descriptions-only",
        action="store_true",
        help="Перевести только описания",
    )
    args = parser.parse_args()

    translate_names = not args.descriptions_only
    translate_descriptions = not args.names_only

    _log("Подключение к workouts.db и проверка схемы...")
    ensure_db_schema()

    exit_code = 0

    if translate_names:
        _log("Запуск перевода названий (MyMemory API, en-ru)...")
        name_stats = translate_exercises_in_db(delay_sec=args.delay, log=_log)
        if name_stats.get("warnings"):
            for warning in name_stats["warnings"]:
                _log(f"Предупреждение: {warning}")
        if name_stats.get("update_errors", 0) > 0:
            exit_code = 1

    if translate_descriptions:
        _log("Запуск перевода описаний (MyMemory API, en-ru)...")
        desc_stats = translate_descriptions_in_db(delay_sec=args.delay, log=_log)
        if desc_stats.get("warnings"):
            for warning in desc_stats["warnings"]:
                _log(f"Предупреждение: {warning}")
        if desc_stats.get("update_errors", 0) > 0:
            exit_code = 1

    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
