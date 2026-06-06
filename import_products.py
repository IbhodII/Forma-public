# -*- coding: utf-8 -*-
"""
Импорт продуктов и шаблонов питания из Excel (точка входа из корня проекта).

DEPRECATED: только ручной ops / первичное наполнение. См. archive/excel_import/README.md
и docs/CLEANUP.md. Не используется runtime API/UI.

Реализация: archive/excel_import/import_products.py

Запуск:
    .\\venv\\Scripts\\python.exe import_products.py
    .\\venv\\Scripts\\python.exe import_products.py --xlsx "путь\\Калькулятор калорий.xlsx"
"""
from __future__ import annotations

import runpy
import sys
from pathlib import Path

_SCRIPT = Path(__file__).resolve().parent / "archive" / "excel_import" / "import_products.py"

if __name__ "__main__":
    if not _SCRIPT.is_file():
        print(f"Не найден скрипт импорта: {_SCRIPT}", file=sys.stderr)
        sys.exit(1)
    runpy.run_path(str(_SCRIPT), run_name="__main__")
