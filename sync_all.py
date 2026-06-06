# -*- coding: utf-8 -*-
"""Последовательный запуск всех скриптов синхронизации."""
from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PYTHON = sys.executable
FIT_FOLDER = Path(r"E:\fit activity")


def _run_script(name: str, extra_args: list[str] | None = None) -> tuple[str, int]:
    path = ROOT / name
    cmd = [PYTHON, str(path)] + (extra_args or ["--new"])
    print(f"\n{'=' * 60}\n>> {name} {' '.join(extra_args or ['--new'])}\n{'=' * 60}")
    result = subprocess.run(cmd, cwd=str(ROOT), capture_output=False)
    return name, result.returncode


def main() -> int:
    print("Синхронизация всех источников -> workouts.db")

    jobs: list[tuple[str, list[str]]] = [
        ("sync_polar.py", ["--new"]),
        ("sync_mi_fitness.py", ["--new"]),
        ("sync_xiaomi_home.py", ["--new"]),
    ]

    if FIT_FOLDER.is_dir() and any(FIT_FOLDER.glob("*.fit")) or any(FIT_FOLDER.glob("*.FIT")):
        jobs.append(("fit_importer.py", ["--folder", str(FIT_FOLDER)]))
    else:
        print(
            f"\n[i] fit_importer.py пропущен: нет .fit в {FIT_FOLDER} "
            f"(создайте папку и положите файлы Coospo)"
        )

    results: list[tuple[str, int]] = []
    for script, args in jobs:
        results.append(_run_script(script, args))

    print(f"\n{'=' * 60}\nСводка\n{'=' * 60}")
    failed = 0
    for name, code in results:
        status = "OK" if code == 0 else f"ОШИБКА (код {code})"
        print(f"  {name}: {status}")
        if code != 0:
            failed += 1

    if failed:
        print(f"\nЗавершено с ошибками: {failed} из {len(results)}")
        return 1
    print("\nВсе скрипты завершились успешно.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
