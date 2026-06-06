# Документация в формате Word (`.docx`)

Готовые файлы Microsoft Word — для печати и обмена.

## Файлы

| Документ | Источник Markdown |
|----------|-------------------|
| `MyHealthDashboard_Обзор_проекта.docx` | `PROJECT_CONTEXT.md` |
| `MyHealthDashboard_API_и_данные.docx` | `API.md` + `DATABASE.md` + `SERVICES.md` |
| `MyHealthDashboard_Пресеты_тренировок.docx` | `WORKOUT_PRESETS.md` (вкл. Polar) |
| `MyHealthDashboard_Растяжка.docx` | `STRETCHING.md` |
| `MyHealthDashboard_Велотренировки.docx` | `BIKE.md` + `FIT_SYNC.md` |
| `MyHealthDashboard_Питание.docx` | `NUTRITION.md` |
| `MyHealthDashboard_Единицы_измерения.docx` | `UNITS_CONVERSION.md` |

## Обновление

Исходная правда — Markdown в `docs/*.md`.

```powershell
cd C:\Users\brett\Desktop\MyHealthDashboard
.\venv\Scripts\python.exe scripts\generate_docx_docs.py
```

Зависимость: `python-docx` (`requirements-docs.txt`).

## Важно

Правки в `.docx` перезаписываются при генерации. Изменения вносите в соответствующий `.md`.

После обновления Markdown (микронутриенты, оценка мощности, API) пересоберите `.docx` этой командой.
