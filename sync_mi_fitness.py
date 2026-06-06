# -*- coding: utf-8 -*-
"""Синхронизация Mi Fitness (браслет/часы: пульс, сон, шаги, тренировки)."""
from __future__ import annotations

import argparse
import sys

from db_common import add_sync_mode_arguments, resolve_sync_mode


def run(mode: str) -> int:
    print(f"[Mi Fitness] Режим: {mode}")
    print(
        "[Mi Fitness] Заглушка: импорт из экспорта Mi Fitness / Zepp Life или API. "
        "Кардио и метрики — через db_common."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Синхронизация Mi Fitness → workouts.db")
    add_sync_mode_arguments(parser)
    args = parser.parse_args()
    mode = resolve_sync_mode(args)
    return run(mode)


if __name__ == "__main__":
    sys.exit(main())
