# Документация (папка `doc/`)

Полный набор Markdown — в **[`../docs/`](../docs/)**.

Эта папка — **справочник единиц** и указатель.

Last updated: **2026-06-09**.

---

## Справочник единиц

| Файл | Описание |
|------|----------|
| [UNITS_CONVERSION.md](./UNITS_CONVERSION.md) | Метрика → «american» (SoL, Jp, iCharge, …) |
| [../docs/archive/UNITS_CONVERSION.md](../docs/archive/UNITS_CONVERSION.md) | Расширенная копия в `docs/archive/` |

---

## Остальная документация → `docs/`

| Тема | Путь |
|------|------|
| Оглавление | [../README.md](../README.md) |
| Разработчик | [../docs/DEVELOPER_SETUP.md](../docs/DEVELOPER_SETUP.md) |
| Контекст | [../docs/PROJECT_CONTEXT.md](../docs/PROJECT_CONTEXT.md) |
| Packaging / OAuth | [../docs/PACKAGING_SECRETS.md](../docs/PACKAGING_SECRETS.md), [../docs/AUTH_PKCE_AUDIT.md](../docs/AUTH_PKCE_AUDIT.md) |
| БД | [../docs/DATABASE.md](../docs/DATABASE.md) |
| Архив установки | [../docs/archive/SETUP.md](../docs/archive/SETUP.md) (устарел) |

---

## Word

```powershell
cd /path/to/Forma-Public
.\venv\Scripts\python.exe scripts\generate_docx_docs.py
```
