# API.md

> **Archived.** Packaged API default port **18002** below is outdated — use **8000** (candidates 8000–8012). See [AUTH_PKCE_AUDIT.md](../AUTH_PKCE_AUDIT.md).

REST API **MyHealthDashboard**.

- **Base URL (dev):** `http://127.0.0.1:8000/api` или `:8002` (см. `.api-port`)
- **Base URL (Forma desktop packaged):** `http://127.0.0.1:18002/api` (default; see `%APPDATA%\Forma\forma-desktop-api.json`)
- **OpenAPI:** `http://127.0.0.1:{port}/docs`
- **Health:** `GET /api/health`
- **Заголовок пользователя:** `X-User-ID` (локальный профиль)

Домены: [NUTRITION.md](./NUTRITION.md), [BIKE.md](./BIKE.md), [WORKOUT_PRESETS.md](./WORKOUT_PRESETS.md), [STRETCHING.md](./STRETCHING.md), [../SYNC.md](../SYNC.md).

---

## Общие правила

| Параметр | Описание |
|----------|----------|
| Формат | JSON, UTF-8 |
| Даты | `YYYY-MM-DD`; будущие даты отклоняются |
| Ошибки | `{ "detail": "..." }` или массив для 422 |
| Пагинация | `limit`, `offset`; ответ `{ items, meta: { total, limit, offset } }` |

| Код | Когда |
|-----|-------|
| 200 | Успех |
| 400 | Бизнес-ошибка |
| 404 | Не найдено |
| 409 | Конфликт (дубликат, импорт уже идёт) |
| 422 | Pydantic validation |

---

## Роутеры

| Префикс | Файл | Домен |
|---------|------|-------|
| `/api/strength` | `strength.py` | Силовые |
| `/api/presets` | `presets.py` | Пресеты |
| `/api/cardio` | `cardio.py` | Кардио |
| `/api/polar` | `polar.py` | Очередь Polar pending |
| `/api/sync` | `sync.py` | FIT, Polar fetch/upload |
| `/api/body` | `body.py` | Замеры тела |
| `/api/weight` | `weight.py` | Ежедневный вес |
| `/api/steps` | `steps.py` | Шаги |
| `/api/food` | `food.py` | Питание |
| `/api/nutrition`, `/api/cut-bulk` | `nutrition.py` | Сушка/набор, прогноз, дефицит (`cut-bulk` — legacy-алиас того же роутера) |
| `/api/analytics` | `analytics.py` | Калории, CTL |
| `/api/stretching` | `stretching.py` | Растяжка |
| `/api/menstrual-cycle` | `menstrual_cycle.py` | Цикл (female) |
| `/api/user` | `user.py`, `bike_settings.py` | Профиль, интеграции, велосипед, калибровка |
| `/api/auth` | `auth.py` | Текущий пользователь OAuth |
| `/api/cloud` | `cloud.py` | Yandex/Google OAuth, бэкап, restore |

---

## Strength `/api/strength`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/workout-types` | Активные пресеты |
| GET | `/workout-form-prefill` | Prefill формы |
| GET | `/exercise-set/editor` | Редактор набора |
| GET/PUT | `/exercise-set/{set_id}` | CRUD набора |
| POST | `/exercise-set` | Создать набор |
| POST | `/workout-types` | Новый тип |
| POST | `/exercises/append` | Добавить упражнение в каталог |
| GET | `/exercises` | Список упражнений |
| POST | `/exercises/rename` | Переименовать везде |
| GET | `/next-workout-suggestion` | Подсказка следующей тренировки |
| GET | `/1rm-chart` | График 1ПМ |
| GET | `/progress/{exercise}` | Прогресс |
| GET | `/volume` | Объём по дням |
| GET | `/top-exercises-progress` | Топ по 1ПМ |
| GET | `/sessions` | Список сессий (+ `duration_sec` из HR) |
| GET | `/sessions/{date}/{workout_title}` | Детали сессии |
| GET | `/sessions/{date}/{workout_title}/heart-rate` | HR сессии |
| GET | `/{workout_id}/heart-rate` | HR строки |
| POST | `/workout` | Сохранить тренировку (см. ниже) |
| POST | `/{workout_id}/attach-polar` | Attach Polar pending (см. ниже) |
| DELETE | `/sessions/{date}/{workout_title}` | Удалить сессию |

**POST attach-polar body:** `{ "polar_transaction_id": "…" }`

**Поведение attach (силовые):** на всех строках сессии (date + workout_title) **перезаписываются** `avg_hr` и `calories_chest`, если Polar вернул значения. Ручные значения не сохраняются при повторном attach.

**POST `/workout` — тело запроса**

Предпочтительный формат (порядок подходов важен, можно чередовать упражнения):

```json
{
  "date": "2026-05-24",
  "workout_title": "Тяжёлая",
  "sets": [
    { "exercise": "Жим лёжа", "weight": 80, "reps": 8, "is_warmup": false },
    { "exercise": "Тяга штанги", "weight": 100, "reps": 5 },
    { "exercise": "Жим лёжа", "weight": 80, "reps": 6 }
  ],
  "avg_hr": 120,
  "preset_id": 1
}
```

Сервер сохраняет `order_index` = 1…N и `set_number` = глобальный номер подхода в сессии.

Legacy (группировка по упражнениям, `order_index` = 0):

```json
{
  "date": "2026-05-24",
  "workout_title": "Тяжёлая",
  "exercises": [
    { "exercise": "Жим", "weight": 80, "reps_list": [8, 6], "is_warmup": false }
  ]
}
```

Укажите **либо** `sets`, **либо** `exercises`, не оба.

**GET `/sessions/{date}/{workout_title}`** — в ответе `uses_ordered_sets: true` и `ordered_sets[]` для новых тренировок; старые — только `exercises[]` с группировкой.

### Strength HR analysis

| Method | Path | Описание |
|--------|------|----------|
| GET | `/sessions/{date}/{workout_title}/hr-analysis` | Peak detection + set metrics |
| GET/PUT/DELETE | `/sessions/{date}/{workout_title}/hr-block-overrides` | Legacy manual blocks |

### Strength HR analytics (`/hr-analytics`)

| Method | Path | Описание |
|--------|------|----------|
| GET | `/hr-analytics/overview` | Sessions + exercises + trends (single pass) |
| GET | `/hr-analytics/sessions` | Paginated session summaries |
| GET | `/hr-analytics/exercises` | Exercise aggregates |
| GET | `/hr-analytics/trends` | Time series |
| GET | `/hr-analytics/session` | Detail (query: date, workout_title) |
| POST | `/hr-analytics/session/mapping/verify` | «Подходы верны» |
| PUT | `/hr-analytics/session/mapping` | Save manual mapping |
| DELETE | `/hr-analytics/session/mapping` | Reset to auto |

См. [HR_ANALYTICS.md](./HR_ANALYTICS.md).

---

## Presets `/api/presets`

| Method | Path | Описание |
|--------|------|----------|
| GET | `` | Список (`active_only`) |
| GET | `/{preset_id}` | Детали |
| POST | `` | Создать |
| PUT | `/{preset_id}` | Обновить |
| POST | `/{preset_id}/archive` | Архив |
| POST | `/{preset_id}/restore` | Восстановить |
| DELETE | `/{preset_id}` | Удалить (без истории) |

---

## Cardio `/api/cardio`

| Method | Path | Описание |
|--------|------|----------|
| POST | `/workout` | Создать |
| PUT | `/{workout_id}` | Обновить (FIT: ограниченные поля) |
| GET | `/types` | Типы |
| GET | `/tab-settings` | Вкладки (`active_only`) |
| POST | `/tab-settings/{type}/archive` | Скрыть вкладку |
| POST | `/tab-settings/{type}/restore` | Вернуть вкладку |
| GET | `/recent` | Последние по типу |
| GET | `/workouts` | Список (`type`, `date_from`, `date_to`, …) |
| GET | `/availability` | HR/GPS/sensors по ids |
| GET | `/{id}/hr` | Пульс |
| GET | `/{id}/gps` | GeoJSON |
| GET | `/{id}/sensors` | Ряды для графиков (`downsample`) |
| GET | `/{id}/points` | Точки карты (`downsample`) |
| GET | `/{id}/power` | Мощность |
| POST | `/{id}/estimate-power` | Оценить мощность |
| POST | `/backfill-power` | Backfill power |
| GET | `/zone-time` | Время в зонах |
| GET | `/trimp` | TRIMP по дням |
| POST | `/{workout_id}/attach-polar` | Attach Polar (fill-empty-only, см. ниже) |
| GET | `/{workout_id}/sources` | Source resolver view (contributions, effective, conflicts) |
| DELETE | `/{workout_id}` | Удалить |

Списки обогащаются: Polar/FIT → `calories_chest`, `avg_hr`, `duration_sec`. См. [BIKE.md](./BIKE.md).

**Поведение attach (кардио):** scalar-поля (`avg_hr`, `max_hr`, `calories_chest`, `calories`, `duration_sec`) обновляются **только если пусты** в записи. Для перезаписи — очистить поле вручную или удалить тренировку.

**`downsample`:** `1` = все точки, `0` = 1 Гц, `N≥2` = каждые N сек (default 2).

### Мощность

**GET `/{id}/power`** — `WorkoutPowerResponse`: `has_real`, `has_estimated`, `avg_power`, `source` (`real` | `estimated_advanced` | `estimated_basic` | `estimated`), `series` (только real).

**POST `/{id}/estimate-power`** — пересчёт оценки; 400 если уже real.

**POST `/backfill-power`** — body `{ "limit": 500 }` → `{ estimated, skipped, already_had_power }`.

Подробнее: [BIKE.md](./BIKE.md).

---

## Polar `/api/polar`

Токены и очередь pending привязаны к **локальному пользователю** (`X-User-ID` → `polar_tokens.local_user_id`).  
OAuth popup из настроек: `GET /api/polar/auth?link_user={id}` (публичный маршрут).

| Method | Path | Описание |
|--------|------|----------|
| GET | `/status` | `{ connected, local_user_id, polar_user_id?, … }` |
| GET | `/auth` | Редирект на Polar OAuth; query `link_user` (опционально) |
| GET | `/callback` | OAuth callback (HTML popup → `postMessage` `polar-auth`) |
| DELETE | `/disconnect` | Удалить токены текущего пользователя |
| GET | `/pending/list` | Pending текущего пользователя (`imported=0`) |
| GET | `/pending/{date}` | Pending за дату; query `type` |
| DELETE | `/pending/manual` | Удалить upload; query `polar_transaction_id` (`upload:*` only) |

---

## Sync `/api/sync`

| Method | Path | Описание |
|--------|------|----------|
| POST | `/fit` | FIT import (фон); `?sync=true` — синхронно |
| GET | `/fit/status/{task_id}` | Прогресс FIT |
| POST | `/integrations` | FIT (синхронно) + Polar fetch |
| POST | `/polar/fetch` | Polar AccessLink → pending |
| POST | `/polar/upload` | Multipart `.tcx`/`.gpx`/`.fit` → pending |
| POST | `/health-connect` | Batch: шаги, вес, калории, сон, тренировки с Android Health Connect |
| GET | `/health-connect/debug` | Диагностика HC: каталог полей, counts, last sync, warnings |
| GET | `/health-connect/hub` | Hub aggregate для `/health-connect` UI |

**POST `/fit` body (опционально):** `{ "folder": "…", "reimport": false }`

**POST `/polar/upload`:** `multipart/form-data`, поле `file`, max 50 MB.

---

## Auth `/api/auth`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/me` | Текущий пользователь (OAuth / `X-User-ID`) |

---

## Cloud `/api/cloud`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/status/yandex`, `/status/google` | Статус OAuth |
| GET | `/auto-backup` | Настройки авто-бэкапа |
| GET | `/auth/yandex`, `/callback/yandex` | OAuth Yandex Disk |
| GET | `/auth/google`, `/callback/google` | OAuth Google Drive |
| POST | `/backup`, `/backup/google`, `/backup/auto` | Создать бэкап |
| GET | `/backup/list`, `/backup/remote-status` | Список / статус на облаке |
| POST | `/backup/restore`, `/sync` | Восстановление БД |
| POST | `/revoke/yandex`, `/revoke/google` | Отключить облако |

---

## User `/api/user`

| Method | Path | Описание |
|--------|------|----------|
| GET/POST | `/profile` | Профиль (`sex`, `units_system`, зоны HR, `fit_folder_path`, …) |
| GET/POST | `/nutrition-settings` | Нормы г/кг |
| GET | `/calibration-factor` | Коэффициент калибровки калорий браслета (`factor`, `last_calibration_date`, `calibration_stale`) |
| POST | `/recalculate-calibration` | Пересчёт коэффициента за N дней (`?days=14&phase=cut`) |
| POST | `/calculate-level` | BMR/TDEE без сохранения |
| GET/POST | `/integration-settings` | FIT-папка, облако |
| GET/POST | `/analytics-settings` | Разминка в аналитике |
| GET/POST | `/bike-settings` | Параметры велосипеда |
| GET/PUT | `/source-priorities` | Source resolver priority prefs per metric |

> `units_system`, тема и скрытие блоков — в **`/profile`**, не отдельный `/interface-settings`.

---

## Body `/api/body`

| Method | Path |
|--------|------|
| GET | `/latest`, `/summary`, `/genetic-limit`, `/metrics`, `/metrics/weekly` |
| POST | `/metrics` |
| DELETE | `/metrics/{date}` |

## Weight `/api/weight`

| Method | Path |
|--------|------|
| GET/POST | `/daily` |

## Steps `/api/steps`

| Method | Path |
|--------|------|
| GET | `/history` |

---

## Food `/api/food`

См. [NUTRITION.md](./NUTRITION.md). Основное:

| Method | Path |
|--------|------|
| GET/POST | `/products`, `/composite` |
| PUT | `/products/{product_id}` — простой продукт |

Поле **`is_alcohol`** (`boolean`, в БД `INTEGER` 0/1) у продукта: калории учитываются в дневном балансе, белки/жиры/углеводы — нет; при создании/обновлении не проверяется расхождение ккал с формулой 4/9/4. Тело `POST /products`: `name`, `protein`, `fat`, `carbs`, `calories?`, `is_alcohol?`. При расхождении ккал и макросов &gt;10% без `is_alcohol` — **400** с подсказкой отметить алкоголь.
| GET/POST/PUT/DELETE | `/entries`, `/entries/{id}`, `/entries/week` |
| DELETE | `/entries?date=&phase=` | Очистка дня (см. ниже) |
| POST | `/apply-meal-plan`, `/entries/from_plan` | Применить рацион к дате или неделе |
| POST | `/meal-plans/{plan_id}/apply` | Применить рацион к диапазону дат |
| GET/POST | `/weekly-schedule` | Расписание рационов по дням недели |
| GET/POST | `/goals/{date}` |
| GET/POST/PUT/DELETE | `/templates`, `/meal-plans`, … |
| GET | `/micros/week/{date}` | Микронутриенты за неделю (`phase`) — [NUTRITION.md](./NUTRITION.md) |
| GET | `/micros/day/{date}` | Микронутриенты за день |
| GET/PUT | `/micros/goals` | Суточные нормы микронутриентов |

`PUT /products/{id}` и `POST /products` / `POST /composite` поддерживают поля микронутриентов на 100 г (опционально).

Поле **`external_id`** — штрихкод Open Food Facts (8–14 цифр). Уникален в справочнике; при дубликате **409** `Product with this barcode already exists`.

### Валидация дат (food)

Эндпоинты дневника и рационов используют `_normalize_food_date`: формат `YYYY-MM-DD`, **будущие даты разрешены** (планирование недели). Эндпоинты тренировок (`/strength`, `/cardio`) по-прежнему запрещают будущие даты.

### Очистка дня

**DELETE** `/api/food/entries?date=YYYY-MM-DD&phase=cut|bulk`

Удаляет все записи текущего пользователя (`user_id` из `X-User-ID`) за указанную дату и фазу.

Ответ (`FoodClearDayResponse`):

```json
{
  "deleted": 12,
  "date": "2026-05-28",
  "phase": "cut",
  "message": "ok"
}
```

Если записей не было: `deleted: 0`, `message: "Записей не было"`.

### Применение рациона

**POST** `/api/food/apply-meal-plan` (алиас: `/entries/from_plan`)

Тело (`ApplyMealPlanRequest`):

| Поле | Тип | Описание |
|------|-----|----------|
| `plan_id` | int | ID рациона (`daily_meal_plans`) |
| `date` | string | Якорная дата (YYYY-MM-DD); будущие даты OK |
| `phase` | string | `cut` \| `bulk` |
| `apply_week` | bool | default true — применить на всю неделю от якоря |
| `replace_existing` | bool | default true — очистить день перед apply |

Ответ (`ApplyMealPlanResponse`): `total_added`, `days_cleared`, `meals[]`, `days[]`, `entries[]`, …

**POST** `/api/food/meal-plans/{plan_id}/apply` — диапазон (`ApplyMealPlanRangeRequest`): `start_date`, `end_date`, `phase`, `overwrite`.

### Недельное расписание

**GET** `/api/food/weekly-schedule` — список `WeeklyScheduleItem[]` (`day_of_week` 0…6, `meal_plan_id`, `meal_plan_name`).

**POST** `/api/food/weekly-schedule` — тело `{ "days": [{ "day_of_week": 0, "meal_plan_id": 3 }, …] }`.

UI: вкладка **«Расписание»** → «Применить расписание на неделю» (цикл apply по настроенным дням).

### Open Food Facts

| Method | Path | Описание |
|--------|------|----------|
| GET | `/openfoodfacts/by-barcode?barcode=` | Поиск по штрихкоду: сначала `food_products.external_id`, затем кэш `openfoodfacts_cache`, затем API OFF (~1 req/s) |
| GET | `/openfoodfacts/search?query=` | Поиск по названию (кэш → API), до 20 вариантов; параллельно `local_matches` из справочника |
| POST | `/openfoodfacts/contribute` | Отправка продукта в Open Food Facts (мобильный/десктоп) |
| GET | `/openfoodfacts/contribute/status` | Статус последней отправки |

Ответ **`/by-barcode`**: `found`, `source` (`local` \| `cache` \| `api` \| `none`), `preview` (поля для формы), `existing_product` (если уже в БД), `local_name_matches`, `message` (если не найден).

Ответ **`/search`**: `found`, `source`, `items[]` (превью), `local_matches`, `message`.

Превью (`OpenFoodFactsPreview`): `name`, `external_id`, `brand`, `image_url`, БЖУ, `fiber_g`, `calories`, микронутриенты на 100 г.

---

## Nutrition `/api/nutrition` (сушка / набор, прогноз)

| Method | Path |
|--------|------|
| GET | `/snapshot` — вес и % жира |
| GET/POST | `/plan/{phase}` |
| POST | `/cut/forecast`, `/bulk/forecast` |
| GET | `/analytics/progress` |
| GET | `/cut/deficit-control` — лимит дефицита ккал/кг жира (7 дней) |
| GET | `/forecast-readiness?phase=cut\|bulk` — готовность данных (2 недели с ≥3 днями записей; скан до 8 недель назад) |
| GET | `/bulk/gain-control` — цель набора г/неделю vs текущий профицит |
| POST | `/forecast` — линейный прогноз (набор и сушка без динамики); тело: `phase`, `target_weight_kg`, `target_body_fat_percent?`, `prefer_chest_workout?`, `target_bulk_grams_per_week?`, `balance_period?`, `persist_plan?` |
| POST | `/forecast/dynamic` — **сушка**: пошаговый прогноз с лимитом дефицита `max_deficit_per_kg_fat × текущий_жир_кг` |

### POST `/forecast/dynamic` (сушка)

Тело (`DynamicForecastRequest`):

| Поле | Тип | Описание |
|------|-----|----------|
| `phase` | `"cut"` | только сушка |
| `target_weight_kg` | number? | целевой вес (хотя бы одно из двух целей обязательно) |
| `target_body_fat_percent` | number? | целевой % жира |
| `prefer_chest_workout` | bool | приоритет пульсометра в расходе |
| `balance_period` | `previous_week` \| `rolling_7` | период для среднего дефицита |
| `persist_plan` | bool | сохранить цель и дату в `nutrition_plan` |
| `max_deficit_per_kg_fat` | number? | лимит ккал/кг жира/день (иначе из профиля, по умолчанию 35) |

Логика (`nutrition_service.calculate_dynamic_cut_forecast`):

1. Сухая масса фиксируется от текущих веса и % жира.
2. Целевой жир (кг): из пары вес+% жира, или вес при неизменной сухой массе, или % при неизменной сухой массе.
3. Каждую неделю: `effective_deficit = min(фактический_дефицит, max_deficit_per_kg_fat × текущий_жир_кг)`, потеря жира `effective_deficit × 7 / 7700`, вес = сухая масса + жир.
4. Срок — число недель до `target_fat_kg` (макс. 52, флаг `approximate`).

Ответ (дополнительно к полям линейного прогноза): `model: "dynamic_cut"`, `weeks_log[]`, `linear_weeks_to_target`, `weeks_longer_than_linear`, `deficit_warning`, `deficit_over_limit_now`, `dynamic_explanation`, `approximate`.

Ошибки **400**: нет дефицита за период; цель недостижима без потери мышц (в т.ч. вес ниже ~3% жира при сохранении сухой массы).

### Физиологический предел дефицита

| Параметр | Значение по умолчанию | Где хранится |
|----------|----------------------|--------------|
| Безопасный лимит (рекомендация) | **35** ккал/кг жира/день | `user_profile.max_deficit_per_kg_fat` |
| Физиологический предел (жёсткий) | **70** ккал/кг жира/день | `user_profile.max_physiological_deficit_per_kg_fat` |

На каждой неделе прогноза: `deficit_limit_safe = 35 × жир_кг`, `deficit_limit_physiological = 70 × жир_кг`, `effective_deficit = min(фактический_дефицит, физиологический_лимит)`.

**Зоны (`deficit_status`):**

- `safe` — дефицит ≤ безопасного лимита; прогноз строится.
- `warning` — дефицит между 35 и 70 ккал/кг жира; прогноз строится, в ответе `deficit_warning_message` и `recommended_additional_calories` (сколько ккал/день добавить до safe).
- `danger` — дефицит > 70 ккал/кг жира; прогноз **всё равно строится** (HTTP **200**), но с `deficit_status: "danger"`, `deficit_capped_at_start: true` и ограничением `effective_deficit` физиологическим потолком; UI показывает красное предупреждение и график веса.

Поля профиля (`POST /api/user/profile`): `max_deficit_per_kg_fat` (35), `max_physiological_deficit_per_kg_fat` (70, опционально 50–100), `target_bulk_grams_per_week` (300), `use_chest_strap_priority` (true).

Старый URL `/cut-bulk` во фронтенде редиректит на `/food?phase=cut`.

---

## Analytics `/api/analytics`

| Method | Path |
|--------|------|
| GET | `/calories` |
| GET/POST | `/daily-bracelet-calories` — калории браслета за день (`from`/`to`, POST: `date`, `total_calories`) |
| GET | `/daily-expenditure` — BMR + TEF + скорректированная активность (`date`, `phase`, `prefer_chest`, `bracelet_calories?`). Формула: `браслет × calibration_factor − Σчасы + Σ(пульсометр или часы при отсутствии пульсометра)`. Коэффициент — `GET /api/user/calibration-factor`. Поля: `has_fallback`, `fallback_used_for[]` (тренировки без `calories_chest`) |
| GET | `/daily-expenditure/week` — неделя (`anchor_date`, `phase`, `prefer_chest`) |
| GET | `/workout-expenditure` |
| GET | `/ctl` |
| GET | `/genetic-potential` | legacy |

1ПМ-графики — в `/api/strength` (`/1rm-chart`, `/progress/{exercise}`).

---

## Stretching `/api/stretching`

| Method | Path |
|--------|------|
| GET/POST/PUT/DELETE | `/exercises`, `/exercises/{id}` |
| GET/POST/PUT/DELETE | `/presets`, `/presets/{id}` |
| POST | `/presets/{id}/archive`, `/restore` |
| GET/POST/DELETE | `/log`, `/log/{log_id}` |
| GET | `/activity` |

См. [STRETCHING.md](./STRETCHING.md).

---

## Menstrual cycle `/api/menstrual-cycle`

Требует `sex=female` в профиле.

| Method | Path |
|--------|------|
| GET/POST | `/settings` |
| GET | `/log`, `/phases`, `/impact` |
| POST | `/log` |
| DELETE | `/log/{day}` |

---

## Health

`GET /api/health` → `{ status, database, food_products_count, … }`

---

## Frontend → API

| Module | Prefix |
|--------|--------|
| `api/strength.ts` | `/strength` |
| `api/cardio.ts` | `/cardio` |
| `api/polar.ts` | `/polar` |
| `api/sync.ts` | `/sync` |
| `api/presets.ts` | `/presets` |
| `api/food.ts` | `/food` |
| `api/user.ts` | `/user` |
| `api/stretching.ts` | `/stretching` |
| `api/menstrualCycle.ts` | `/menstrual-cycle` |
| `api/cutBulk.ts` | `/nutrition` (десктоп; префикс `/api/cut-bulk` на backend — алиас) |
| `api/analytics.ts` | `/analytics` |

Клиент: `frontend/src/api/client.ts`, proxy в `vite.config.ts`.
