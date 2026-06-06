# -*- coding: utf-8 -*-
"""Синхронизация Xiaomi Home (весы: вес, % жира, мышцы и др.)."""
from __future__ import annotations

import argparse
import sys

from db_common import add_sync_mode_arguments, resolve_sync_mode


def run(mode: str) -> int:
    print(f"[Xiaomi Home] Режим: {mode}")
    print(
        "[Xiaomi Home] Заглушка: импорт замеров с весов (экспорт / облако). "
        "Данные — через db_common.upsert_body_metric."
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Синхронизация Xiaomi Home → workouts.db")
    add_sync_mode_arguments(parser)
    args = parser.parse_args()
    mode = resolve_sync_mode(args)
    return run(mode)


if __name__ == "__main__":
    sys.exit(main())
