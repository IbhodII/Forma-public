# SYNC.md

Скрипты и API загружают данные из внешних источников в `workouts.db`.

**FIT (подробно):** [docs/FIT_SYNC.md](docs/FIT_SYNC.md) — папка, UI, `--reimport`, ккал из Excel.  
**Polar (attach, очередь):** Swagger `/docs` или [docs/archive/API.md](docs/archive/API.md) — `/api/sync/polar/*`, `/api/polar/*`.

---

## Общий модуль `db_common.py`

| Функция | Назначение |
|---------|------------|
| `get_db_connection()` | Подключение к БД, создание таблиц при необходимости |
| `upsert_strength_workout(...)` | Силовой подход |
| `upsert_cardio_workout(...)` | Кардио (вело, бассейн, бег) |
| `upsert_body_metric(date, **fields)` | Замер тела (`body_metrics`) |
| `mark_file_imported(file_name, source)` | Отметка импортированного файла |
| `is_file_imported(file_name, source)` | Проверка, импортировался ли файл |
| `upsert_gps_track(...)` | GPS-трек (JSON) для FIT и Polar |

Таблицы `imported_files`, `gps_tracks`, `polar_pending_workouts` — в `database/migrations.py`.

---

## Установка зависимостей

```powershell
cd C:\Users\brett\Desktop\MyHealthDashboard
.\venv\Scripts\pip install -r requirements.txt
```

Для FIT: `fitdecode`. Для Polar OAuth: `authlib`, `requests` (см. `requirements.txt`).

---

## FIT-файлы (Coospo Ride) — реализовано

По умолчанию сканируется `E:\fit activity` (рекурсивно) или путь из настроек.

```powershell
.\venv\Scripts\python.exe fit_importer.py
.\venv\Scripts\python.exe fit_importer.py --folder "D:\Ride\exports"
.\venv\Scripts\python.exe fit_importer.py --reimport
```

**API (рекомендуется):**

- `POST /api/sync/fit` — фоновый импорт, poll `GET /api/sync/fit/status/{task_id}`
- `POST /api/sync/integrations` — синхронный FIT (кнопка «Все интеграции»)

**UI:** Настройки → **Синхронизация** → «Импорт FIT» или «Все интеграции» (FIT + Polar).

Результат: `cardio_workouts` (`data_source=fit_coospo`), `workout_heart_rate`, `workout_sensors`, `gps_tracks`.

---

## Polar Flow — реализовано

OAuth-токены в таблице `polar_tokens`. Конфигурация — `.env` (client id/secret, redirect URI).

### CLI

```powershell
.\venv\Scripts\python.exe sync_polar.py --fetch
.\venv\Scripts\python.exe sync_polar.py --code "AUTH_CODE"
.\venv\Scripts\python.exe import_polar_historical.py
```

### API

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/sync/polar/fetch` | Загрузить новые тренировки из Polar AccessLink → `polar_pending_workouts` |
| POST | `/api/sync/polar/upload` | Multipart: `.tcx`, `.gpx`, `.fit` (до 50 MB) → очередь pending |

### Очередь и attach

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/polar/pending/list` | Список неимпортированных (`imported=0`) |
| GET | `/api/polar/pending/{date}?type=…` | Pending за дату и тип |
| DELETE | `/api/polar/pending/manual?polar_transaction_id=upload:…` | Удалить ручную загрузку (только `upload:*`, не attach) |
| POST | `/api/cardio/{id}/attach-polar` | Привязать HR/GPS/kcal к кардио |
| POST | `/api/strength/{id}/attach-polar` | Привязать HR/kcal к силовой сессии |

**UI:** `/workouts` — баннер очереди; Настройки → **Синхронизация** — fetch и загрузка файла. Auto-attach при одной pending-записи на день — на клиенте (`usePolarAutoAttach`).

Типы pending: `бег`, `вело`, `бассейн`, `силовая`.

---

## Health Connect — реализовано (Android → API)

Мобильное приложение читает Health Connect и отправляет batch на backend.

| Method | Path | Описание |
|--------|------|----------|
| POST | `/api/sync/health-connect` | Шаги, вес, калории, сон, тренировки |
| GET | `/api/sync/health-connect/debug` | Диагностика: каталог полей, counts, last sync |

Подробно: [docs/HEALTH_CONNECT.md](docs/HEALTH_CONNECT.md).

**UI (desktop):** Настройки → Синхронизация → подвкладка «Health Connect Debug».

---

## Mi Fitness / Xiaomi Home — заглушки

```powershell
.\venv\Scripts\python.exe sync_mi_fitness.py --new
.\venv\Scripts\python.exe sync_xiaomi_home.py --new
```

Скрипты не подключены к UI и не вызываются из `POST /api/sync/integrations`.

---

## Запуск всех синхронизаций (CLI)

```powershell
.\venv\Scripts\python.exe sync_all.py
```

По очереди: Polar → Mi → Xiaomi → FIT (если есть `.fit` в `fit_files/`).

---

## Фоновый FIT (`start_sync.bat`)

```powershell
.\start_sync.bat
```

Запускает `background_sync.py` — периодический импорт FIT без открытия UI.

---

## Режимы CLI

| Скрипт | Флаги |
|--------|-------|
| `sync_polar.py` | `--fetch`, `--code`, `--new` (default) |
| `fit_importer.py` | `--folder`, `--reimport`, `--recreate` |
| `import_polar_historical.py` | `--update`, bulk historical import |

---

## Просмотр в дашборде

```powershell
.\start.ps1
```

- FIT-вело: **Тренировки → Велосипед** (карта, графики).
- Polar attach: метрики в таблицах силовых/кардио (пульс, ккал пульсометра, длительность).
