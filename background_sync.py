#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Фоновая синхронизация велотренировок из .fit.

Каждый час (в :00) запускает fit_importer.py для папки из user_profile.fit_folder_path
(или каталога по умолчанию). Логи — в sync_log.txt рядом со скриптом.

Запуск:
  python background_sync.py          — с консолью (дублирование лога)
  pythonw background_sync.py         — без окна (только файл)
  start_sync.bat                     — автозагрузка через pythonw
"""
from __future__ import annotations

import subprocess
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

# --- Пути (относительно расположения этого файла) ---
PROJECT_ROOT = Path(__file__).resolve().parent
LOG_PATH = PROJECT_ROOT / "sync_log.txt"
FIT_IMPORTER = PROJECT_ROOT / "fit_importer.py"
PYTHON_EXE = PROJECT_ROOT / "venv" / "Scripts" / "python.exe"


def _ensure_project_on_path() -> None:
    root = str(PROJECT_ROOT)
    if root not in sys.path:
        sys.path.insert(0, root)


def get_fit_folder_from_profile() -> str | None:
    """Путь из user_profile.fit_folder_path (без fallback)."""
    _ensure_project_on_path()
    from utils.fit_folder_config import get_fit_folder_from_profile as _read_profile_path

    return _read_profile_path()


def resolve_fit_folder_for_sync() -> Path | None:
    """
    Эффективный каталог FIT для фонового импорта.
    None — папка не существует, импорт нужно пропустить.
    """
    _ensure_project_on_path()
    from utils.fit_folder_config import get_fit_folder_path

    stored = get_fit_folder_from_profile()
    folder = get_fit_folder_path(on_default=lambda msg: log(f"ПРЕДУПРЕЖДЕНИЕ: {msg}"))

    if stored:
        log(f"Папка FIT из user_profile: {folder}")
    elif not folder.is_dir():
        log(
            f"ПРЕДУПРЕЖДЕНИЕ: fit_folder_path не задан в user_profile; "
            f"каталог по умолчанию не найден: {folder} — синхронизация пропущена"
        )
        return None

    if not folder.is_dir():
        log(f"ПРЕДУПРЕЖДЕНИЕ: папка FIT не существует ({folder}) — синхронизация пропущена")
        return None

    return folder


def _use_console() -> bool:
    """В pythonw.exe stdout не интерактивен — пишем только в файл."""
    try:
        return sys.stdout is not None and sys.stdout.isatty()
    except (AttributeError, ValueError):
        return False


def log(message: str) -> None:
    """Запись строки с меткой времени в sync_log.txt (+ консоль при отладке)."""
    line = f"{datetime.now().strftime('%Y-%m-%d %H:%M:%S')} {message}"
    try:
        with LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
    except OSError as err:
        if _use_console():
            print(f"Не удалось записать лог: {err}", file=sys.stderr)
    if _use_console():
        print(line, flush=True)


def seconds_until_next_hour() -> float:
    """
    Секунды до ближайшего «ровного» часа (минуты и секунды = 0).
    Например, 14:25:10 → до 15:00:00 остаётся 2090 с.
    """
    now = datetime.now()
    next_hour = now.replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
    return max(0.0, (next_hour - now).total_seconds())


def run_fit_import() -> None:
    """Один запуск fit_importer.py; ошибки не роняют цикл."""
    if not PYTHON_EXE.is_file():
        log(f"ОШИБКА: не найден интерпретатор {PYTHON_EXE}")
        return
    if not FIT_IMPORTER.is_file():
        log(f"ОШИБКА: не найден {FIT_IMPORTER}")
        return

    fit_folder = resolve_fit_folder_for_sync()
    if fit_folder is None:
        return

    log(f"Старт импорта FIT из «{fit_folder}»")
    try:
        completed = subprocess.run(
            [str(PYTHON_EXE), str(FIT_IMPORTER), "--folder", str(fit_folder)],
            cwd=str(PROJECT_ROOT),
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
        )
    except Exception as err:
        log(f"ОШИБКА запуска subprocess: {err}")
        return

    if completed.returncode == 0:
        summary = (completed.stdout or "").strip().splitlines()
        tail = summary[-1] if summary else "код 0, без вывода"
        log(f"Импорт завершён успешно. {tail}")
    else:
        log(f"Импорт завершился с кодом {completed.returncode}")
        if completed.stdout and completed.stdout.strip():
            for line in completed.stdout.strip().splitlines()[-5:]:
                log(f"  stdout: {line}")
        if completed.stderr and completed.stderr.strip():
            for line in completed.stderr.strip().splitlines()[-10:]:
                log(f"  stderr: {line}")


def run_polar_sync() -> None:
    """Загрузка новых тренировок Polar для всех локальных пользователей с токенами."""
    _ensure_project_on_path()
    try:
        from sync_polar import sync_new_workouts_all_users
    except Exception as err:
        log(f"Polar: не удалось импортировать sync_polar: {err}")
        return

    log("Polar: старт синхронизации для всех подключённых пользователей")
    try:
        results = sync_new_workouts_all_users()
    except Exception as err:
        log(f"Polar: ошибка синхронизации: {err}")
        return

    if not results:
        log("Polar: нет подключённых аккаунтов")
        return

    for row in results:
        uid = row.get("local_user_id")
        if row.get("status") == "ok":
            log(f"Polar: user_id={uid} — новых тренировок: {row.get('new_count', 0)}")
        else:
            log(f"Polar: user_id={uid} — ошибка: {row.get('message', 'unknown')}")


def main() -> None:
    log("=== background_sync запущен ===")
    log(f"Корень проекта: {PROJECT_ROOT}")
    log(f"Python: {PYTHON_EXE}")
    log(f"Профиль FIT: {get_fit_folder_from_profile() or '(не задан)'}")
    log(f"Следующий импорт в начале каждого часа (:00); Polar — вместе с FIT")

    while True:
        wait_sec = seconds_until_next_hour()
        next_run = datetime.now() + timedelta(seconds=wait_sec)
        log(
            f"Ожидание {int(wait_sec)} с до {next_run.strftime('%H:%M:%S')} "
            f"({next_run.strftime('%d.%m.%Y')})"
        )
        try:
            time.sleep(wait_sec)
        except KeyboardInterrupt:
            log("Остановка по Ctrl+C")
            break

        run_fit_import()
        run_polar_sync()

    log("=== background_sync остановлен ===")


if __name__ == "__main__":
    main()
