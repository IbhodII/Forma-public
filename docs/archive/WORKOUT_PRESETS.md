# Пресеты и вкладки тренировок

Управляемые пресеты **силовых** типов (Бицепс, Грудь, …) и архивация **кардио**-вкладок (бассейн, вело, бег). Модуль **растяжки** — отдельно: [STRETCHING.md](./STRETCHING.md).

Кардио в списках и деталях: дистанция **SoL/torch**, скорость **SoL/h**, темп **мин/SoL** при `units_system=american`. Силовые веса и 1ПМ: **Jp/Camry** — [UNITS_CONVERSION.md](./UNITS_CONVERSION.md).

Исходная правда — SQLite (`workout_presets`, `preset_exercises`) + API `/api/presets`. Существующая история в `strength_workouts` и редактор наборов `exercise_sets` **не заменяются**, а дополняются.

---

## Концепция

| Сущность | Назначение |
|----------|------------|
| **workout_presets** | Тип тренировки (название вкладки), флаг `is_active`, порядок `sort_order` |
| **preset_exercises** | Упражнения пресета: порядок, `default_sets`, `default_reps`, `default_weight` |
| **strength_workouts.preset_id** | Связь выполненной тренировки с пресетом (миграция по `workout_title`) |
| **exercise_sets** | Версионированные наборы для вкладки «Упражнения» (как раньше) |

```mermaid
flowchart LR
  subgraph ui [React /workouts]
    Tabs[Вкладки по активным пресетам]
    Hist[История StrengthSection]
    Form[WorkoutFormModal]
    Mgmt[PresetManagementPage]
  end
  subgraph api [FastAPI]
    Presets[/api/presets]
    Strength[/api/strength]
  end
  subgraph db [SQLite]
    WP[workout_presets]
    PE[preset_exercises]
    SW[strength_workouts]
  end
  Tabs --> Hist
  Tabs --> Form
  Mgmt --> Presets
  Hist --> Strength
  Form --> Strength
  Presets --> WP
  Presets --> PE
  Strength --> SW
  WP --> PE
  SW --> WP
```

---

## База данных

### `workout_presets`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK | |
| `user_id` | INTEGER | По умолчанию 1 (один пользователь) |
| `name` | TEXT | Название пресета, совпадает с `workout_title` в истории |
| `is_active` | INTEGER | 1 — вкладка в UI; 0 — архив |
| `sort_order` | INTEGER | Порядок вкладок |
| `created_at`, `updated_at` | TIMESTAMP | |

### `preset_exercises`

| Поле | Тип | Описание |
|------|-----|----------|
| `id` | INTEGER PK | |
| `preset_id` | INTEGER FK | → `workout_presets`, ON DELETE CASCADE |
| `exercise_name` | TEXT | |
| `exercise_order` | INTEGER | Порядок в пресете |
| `default_sets` | INTEGER | По умолчанию 4 |
| `default_reps` | TEXT | Например `10+10+10+10` или `8,8,6` |
| `default_weight` | REAL | Опционально |
| `notes` | TEXT | |

### `strength_workouts` — порядок подходов

| Поле | Описание |
|------|----------|
| `order_index` | Порядок выполнения подхода в сессии (1…N) при сохранении через `sets[]` |
| `is_circuit` | 1 — круговая тренировка (чередование упражнений); backfill при `order_index > 0` |
| `is_warmup` | 1 — разминочный подход; 0 — рабочий (default) |

**POST `/api/strength/workout`** с массивом `sets` (предпочтительный формат) сохраняет глобальный порядок. Legacy-формат `exercises[]` группирует по упражнению (`order_index = 0`).

Ответ **GET `/sessions/{date}/{title}`**: `uses_ordered_sets`, `ordered_sets[]` для новых тренировок.

### `strength_workouts.preset_id`

Добавлено миграцией `_ensure_workout_presets_schema()` в `database/migrations.py`.

- При первом запуске: пресеты из `WORKOUT_EXERCISES` (`utils/constants.py`).
- Существующие строки: `preset_id` заполняется по `workout_title`.
- Неизвестные названия → пресет «Другое» (`is_active=0`).

---

## API `/api/presets`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/presets` | Список; query `active_only=true|false` |
| GET | `/presets/{id}` | Детали + упражнения |
| POST | `/presets` | Создать пресет |
| PUT | `/presets/{id}` | Обновить название / состав / sort_order |
| POST | `/presets/{id}/archive` | `is_active = 0` |
| POST | `/presets/{id}/restore` | `is_active = 1` |
| DELETE | `/presets/{id}` | Только если `workout_count = 0` |

**Пример POST `/presets`:**

```json
{
  "name": "Пресс",
  "exercises": [
    {
      "exercise_name": "Скручивания",
      "exercise_order": 0,
      "default_sets": 4,
      "default_reps": "15,15,15,15",
      "default_weight": null,
      "notes": ""
    }
  ]
}
```

### Изменения в `/api/strength`

| Endpoint | Изменение |
|----------|-----------|
| `GET /workout-types` | Возвращает имена **активных** пресетов; fallback — `exercise_sets` + константы |
| `GET /workout-form-prefill` | Упражнения из `preset_exercises`; в ответе `preset_id`, `default_sets`, `default_reps` |
| `POST /workout` | Принимает опциональный `preset_id`; иначе lookup по `workout_title` |

---

## Интерфейс (React)

| Компонент | Путь / вкладка | Поведение |
|-----------|----------------|-----------|
| `WorkoutsPage` | `/workouts` | Вкладки = активные пресеты; чекбокс «Показать архивные пресеты» |
| `StrengthSection` | вкладка типа | История по `workout_title`; кнопка «Добавить тренировку» |
| `StrengthSection` | архивная вкладка | Только просмотр (`readOnly`) |
| `PresetManagementPage` | вкладка «Пресеты» | CRUD силовых пресетов; архивация/восстановление кардио-вкладок |
| `CardioSection` | вкладка кардио | История; архивная вкладка — только просмотр (`readOnly`) |
| `WorkoutFormModal` | модалка | Выбор активного пресета; prefill из пресета + последняя сессия |

Файлы:

- `frontend/src/pages/PresetManagementPage.tsx`
- `frontend/src/pages/WorkoutsPage.tsx`
- `frontend/src/pages/StrengthPage.tsx`
- `frontend/src/api/presets.ts`
- `frontend/src/api/cardio.ts` — `fetchCardioTabSettings`, archive/restore

Backend:

- `backend/services/preset_service.py`
- `backend/routers/presets.py`
- `backend/services/cardio_type_service.py`
- `backend/routers/cardio.py` — `/tab-settings`

---

## Кардио-вкладки

Таблица `cardio_type_settings`, API `/api/cardio/tab-settings`. Архивация скрывает вкладку на `/workouts`, но история остаётся доступна через «Показать архивные вкладки» (режим read-only). Управление — секция «Кардио» на `PresetManagementPage`.

| Method | Path | Описание |
|--------|------|----------|
| GET | `/cardio/tab-settings` | Список; query `active_only` |
| POST | `/cardio/tab-settings/{type}/archive` | `is_active = 0` |
| POST | `/cardio/tab-settings/{type}/restore` | `is_active = 1` |

---

## Правила бизнес-логики

1. **Редактирование пресета** не меняет уже сохранённые подходы в истории.
2. **Архивация** скрывает вкладку; записи в `strength_workouts` остаются.
3. **Удаление** запрещено при наличии тренировок — только архивация.
4. **Новый пресет** сразу `is_active=1` и появляется во вкладках (история пустая до первой тренировки).

---

## Миграция и откат

Миграция идемпотентна: `ensure_db_schema()` при старте API.

Проверка в SQLite:

```sql
SELECT name, is_active FROM workout_presets ORDER BY sort_order;
SELECT COUNT(*) FROM strength_workouts WHERE preset_id IS NULL;
```

Откат вручную (осторожно): удалить колонку `preset_id` и таблицы пресетов только на копии БД; в продакшене не рекомендуется.

---

## Polar на странице `/workouts`

Очередь неимпортированных тренировок Polar (`polar_pending_workouts`, `imported=0`).

### UI

| Элемент | Файл | Описание |
|---------|------|----------|
| Баннер «N в очереди» | `WorkoutsPage.tsx` | Открывает `PolarPendingModal` |
| Список pending | `PolarPendingSection.tsx` | Attach, создать тренировку, удалить upload |
| Auto-attach | `usePolarAutoAttach.ts` | 1 pending + 1 manual на день → attach |
| Модалки | `PolarSameDateModal`, `PolarAttachExistingModal`, `PolarPickPendingModal` | Неоднозначные случаи |

### API

| Method | Path |
|--------|------|
| GET | `/api/polar/pending/list` |
| DELETE | `/api/polar/pending/manual?polar_transaction_id=…` |
| POST | `/api/cardio/{id}/attach-polar` |
| POST | `/api/strength/{id}/attach-polar` |

Body attach: `{ "polar_transaction_id": "…" }`.

### Отображение после attach

- **Силовые:** колонки «Длительность», «Ср. пульс», «Ккал пульсометр» (`calories_chest`). Attach **перезаписывает** `avg_hr` и `calories_chest` на всех строках сессии, если Polar вернул значения.
- **Кардио:** приоритет `calories_chest` и HR из Polar/FIT и `workout_heart_rate`; scalar-поля обновляются только если были пусты.

См. [ARCHITECTURE.md](./ARCHITECTURE.md), [../SYNC.md](../SYNC.md).
