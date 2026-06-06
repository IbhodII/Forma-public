# Растяжка

Модуль учёта гибкости: упражнения, пресеты, журнал, календарь активности, сессия с таймером.

API: [API.md](./API.md) (`/api/stretching`). Маршруты UI: [README.md](./README.md).

---

## Концепция

| Сущность | Таблица | Назначение |
|----------|---------|------------|
| Упражнения | `stretching_exercises` | Справочник (~200+ из **free-exercise-db**, иллюстрации в `images_json`) |
| Пресеты | `stretching_presets` + `stretching_preset_exercises` | Наборы упражнений с временем удержания и повторами |
| Журнал | `stretching_log` | Выполненные сессии по дате |

Перевод названий и описений — **CLI-скрипт** (`translate_stretching_exercises.py`), не через UI.

Длительность в UI при `units_system=american`: **FEP** / **SB** — [UNITS_CONVERSION.md](./UNITS_CONVERSION.md).

---

## Маршруты React

| Маршрут | Компонент | Описание |
|---------|-----------|----------|
| `/stretching?tab=history` | `StretchingHistoryTab` | Журнал, месячный календарь, ручное добавление записи |
| `/stretching?tab=presets` | `StretchingPresetsTab` | CRUD пресетов, кнопка «Начать тренировку» |
| `/stretching?tab=exercises` | `StretchingExercisesTab` | Справочник упражнений |
| `/stretching/session/:presetId` | `StretchingSession` | Пошаговая тренировка с таймером |
| `/stretch` | redirect | → `/stretching` |

Файлы: `frontend/src/pages/Stretching/*`, API — `frontend/src/api/stretching.ts`.

---

## Режим тренировки (`StretchingSession`)

1. Загрузка пресета: `GET /api/stretching/presets/{id}`.
2. Упражнения по очереди: удержание (`hold_seconds`, 15–120 с), повторы (`reps`).
3. Таймер: старт / пауза / сброс; переход к следующему упражнению.
4. Выход без завершения — подтверждение (прогресс не сохраняется).
5. По завершении всех упражнений — `POST /api/stretching/log` и возврат в журнал.

Кнопка «Начать тренировку» в пресетах **не** пишет в журнал сразу — только навигация на `/stretching/session/:presetId`.

---

## Календарь активности

`StretchingMonthCalendar.tsx` + `GET /api/stretching/activity`:

- Данные за последние N дней (default 365).
- **Первый день недели** берётся из настроек (`useWeekStartDay` → `user_profile.week_start_day`, default **суббота**).
- Логика сетки: `backend/core/week_calendar.py`, `frontend/src/utils/weekCalendar.ts`.
- Библиотека: `react-activity-calendar`.

---

## API `/api/stretching`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/exercises` | Список; query `muscle_group` |
| POST | `/exercises` | Добавить упражнение |
| PUT | `/exercises/{id}` | Обновить (название, описание, группа мышц) |
| DELETE | `/exercises/{id}` | Удалить |
| POST | `/upload-image` | Загрузить иллюстрацию (multipart); обновляет `images_json` |
| GET | `/presets` | Список; query `active_only` |
| GET | `/presets/{id}` | Детали + упражнения |
| POST | `/presets` | Создать |
| PUT | `/presets/{id}` | Обновить |
| POST | `/presets/{id}/archive` | Архивировать |
| POST | `/presets/{id}/restore` | Восстановить |
| DELETE | `/presets/{id}` | Удалить private preset |
| GET | `/log` | Журнал; query `days`, `date_from`, `date_to` |
| POST | `/log` | Записать выполненный пресет |
| DELETE | `/log/{id}` | Удалить запись |
| GET | `/activity` | Календарь; query `days` (30–730) |

Backend: `backend/routers/stretching.py`, `backend/services/stretching_service.py`.

---

## База данных

### `stretching_exercises`

| Поле | Описание |
|------|----------|
| `name` | Отображаемое название (может быть переведено) |
| `original_name` | Исходное EN из JSON |
| `translated` | 1 — название переведено |
| `target_muscle_group` | Группа мышц (RU) |
| `description` | Описание |
| `original_description` | Исходное EN описание |
| `description_translated` | 1 — описание переведено |
| `images_json` | TEXT | JSON-массив URL/путей к картинкам (free-exercise-db + загрузки UI) |

Редактирование упражнений и превью картинок — во вкладке **«Упражнения»** в UI. Импорт JSON из UI **удалён** (только CLI `import_free_exercise_db.py`).

### `stretching_presets`

`name`, `is_active`, `sort_order`, `user_id` (default 1).

### `stretching_preset_exercises`

`preset_id`, `exercise_id`, `hold_seconds` (default 30), `reps` (default 1), `notes`, `exercise_order`.

### `stretching_log`

`date`, `preset_id`, `duration_minutes`, `notes`, `user_id`.

Сид при первом запуске: `_seed_stretching_exercises`, `_seed_stretching_presets` в `database/migrations.py`.

---

## CLI и импорт

### Первичный импорт из Free Exercise DB

```powershell
.\venv\Scripts\python.exe scripts\import_free_exercise_db.py
```

Скачивает архив free-exercise-db и наполняет `shared.stretching_exercises` (фильтр по растяжке/мобильности).

### Перевод названий и описаний (идемпотентный)

```powershell
.\venv\Scripts\python.exe translate_stretching_exercises.py
.\venv\Scripts\python.exe translate_stretching_exercises.py --descriptions-only --delay 2.0
.\venv\Scripts\python.exe translate_stretching_exercises.py --names-only --delay 0.5
```

- Переводит только записи с `translated = 0` / `description_translated = 0`.
- API: MyMemory (en→ru); при 429 — retry и паузы (`--delay`).
- Прогресс сохраняется после каждого упражнения; при прерывании можно запустить снова.

Перевод **не доступен** из UI (кнопка и `POST /translate-exercises` удалены).

---

## Связанные документы

- [API.md](./API.md) — полный список endpoints
- [DATABASE.md](./DATABASE.md) — схема таблиц
- [SERVICES.md](./SERVICES.md) — `stretching_service.py`
- [SETUP.md](./SETUP.md) — установка и CLI
