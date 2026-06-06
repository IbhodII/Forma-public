# Питание

Дневник питания, справочник продуктов, составные блюда, шаблоны, рационы, нормы БЖУ, прогноз сушки/набора.

API: [API.md](./API.md) (`/api/food`, `/api/nutrition`), расчёт уровня активности — `/api/user/calculate-level`.  
Штрихкод: `/api/food/openfoodfacts/*` (кэш `openfoodfacts_cache`, поле `external_id`).

---

## Концепция

| Слой | Описание |
|------|----------|
| **Справочник** | Единая таблица `food_products` (без привязки к фазе cut/bulk) |
| **Записи** | `food_entries` с полем `phase` — отдельные дневники сушки и набора |
| **Нормы на день** | `daily_nutrition_goals` (date + phase) |
| **Нормы г/кг** | `user_profile` — настройки активности и целевых макросов на кг веса |
| **Шаблоны / рационы** | Из Excel: `meal_templates`, `daily_meal_plans` (с phase) |
| **Прогноз** | Линейный и динамический (`POST /nutrition/forecast`, `/forecast/dynamic`) |

### Единицы в UI

При `units_system = american` (Настройки → Интерфейс):

- вес продуктов и БЖУ: **граны / бандлы / мешки**;
- калории и расход: **iCharge**;
- вес тела в блоке дня: **Jp** / **Camry**.

Ввод количества в дневнике остаётся в **граммах** и **ккал**. См. [UNITS_CONVERSION.md](./UNITS_CONVERSION.md).

---

## Единый справочник продуктов

С **2026** продукты хранятся в одной таблице:

- `UNIQUE(name)` — одно имя на весь справочник
- Поля: `unit` (default `'g'`), `is_composite` (0/1), `fiber_g` (клетчатка на 100 г, default 0)
- `default_portion_g` (v49) — порция по умолчанию в граммах для быстрого ввода
- Колонка `phase` **удалена**; дубликаты «Сушка» / «Массонабор» объединяются при импорте

### Простой продукт

`POST /api/food/products` — БЖУ, клетчатка (`fiber_g`), калории на 100 г, опционально `default_portion_g`.

### Многосоставное блюдо

`POST /api/food/composite`:

```json
{
  "name": "Омлет",
  "components": [
    { "product_id": 12, "quantity_g": 200 },
    { "product_id": 5, "quantity_g": 50 }
  ],
  "total_weight_g": 240
}
```

- Суммируются макросы компонентов
- На 100 г: `totals × (100 / total_weight_g)`
- Сохраняется с `is_composite=1`, состав — в `food_product_components`

UI: **«Создать блюдо»** в дневнике (`CompositeProductModal.tsx`).

---

## Дневник (`/food`)

Единая страница **без вкладок «День» / «Неделя»**:

| Элемент | Описание |
|---------|----------|
| Шапка | Фаза (сушка/набор), «+ Добавить приём», навигация по неделям |
| **Цели и прогноз** | Premium-блок: `GoalProjectionSection` — целевой вес/% жира, динамический прогноз, график веса |
| **Контроль дефицита/набора** | `WeeklyDeficitSection` — только `CutDeficitControlPanel` (сушка) или `BulkGainGoalPanel` (набор); дублирующий 7-дневный mini-strip **убран** |
| Аналитика недели | Сводка по 7 дням в сетке |
| Сетка недели | 7 ячеек: Б/Ж/У, клетчатка, ккал, расход, баланс; мягкая подсветка «Сегодня»; клик → drawer дня |
| Drawer дня | CRUD приёмов, **редактирование и удаление записей**, калории браслета, БЖУ и клетчатка по приёмам |

Фазы: `?phase=cut` | `?phase=bulk`. Отдельная страница `/cut-bulk` перенаправляется на `/food`.

### Готовность данных для прогноза

`GET /api/nutrition/forecast-readiness?phase=cut|bulk`:

- Требуются **2 календарные недели** с минимум **3 днями** с ненулевым потреблением калорий в каждой
- Скан **до 8 недель** назад от текущей (не только две последние подряд)
- При сохранении дня (`FoodDiary`) инвалидируются query-ключи `forecastReadiness` и `["nutrition", "forecast"]`
- `useNutritionGoalProjection`: `refetchOnWindowFocus: true` для readiness

### Прогноз сушки (динамический)

`POST /api/nutrition/forecast/dynamic` — пошаговая модель по жировой массе с лимитами дефицита.

**Зоны дефицита (`deficit_status`):**

| Статус | Поведение |
|--------|-----------|
| `safe` | Дефицит ≤ 35 ккал/кг жира/день (настраивается в профиле) |
| `warning` | Между safe и физиологическим пределом; прогноз + рекомендация добавить ккал |
| `danger` | Выше 70 ккал/кг жира/день; **прогноз всё равно возвращается** (HTTP 200), дефицит в модели **ограничен** физиологическим потолком; UI — красный баннер + график (`GoalProjectionPanel`, `WeightProjectionChart`) |

Профиль: `max_deficit_per_kg_fat` (35), `max_physiological_deficit_per_kg_fat` (70).

Контроль текущего дефицита: `GET /api/nutrition/cut/deficit-control` (7 дней).

### Ответ дня `GET /api/food/entries`

`daily_totals` и `current_fiber` включают сумму клетчатки из `food_products.fiber_g` (алкоголь в БЖУ/клетчатку не входит):

```json
{
  "daily_totals": { "protein": 120, "fat": 50, "carbs": 200, "calories": 2100, "fiber": 18 },
  "daily_fiber_target": { "recommended_grams": 30, "current_grams": 18 },
  "current_fiber": 18
}
```

### Неделя

- Якорь: `user_profile.week_start_day`
- `GET /api/food/entries/week?date=...&phase=...` — `daily_totals` с `fiber` на каждый день
- Расход: `GET /api/analytics/weekly-expenditure` (скорректированный активити + fallback)
- Браслет: `GET /api/analytics/daily-bracelet-calories`
- Воскресенье: без обеда; ужин → шаблон «Ужин (вс)»

---

## Очистка дня

Удаление всех записей дневника за конкретную дату и фазу.

| Слой | Описание |
|------|----------|
| **API** | `DELETE /api/food/entries?date=YYYY-MM-DD&phase=cut\|bulk` |
| **Сервис** | `food_service.clear_day_entries` — фильтр `date`, `phase`, `user_id` |
| **Ответ** | `{ deleted, date, phase, message }` — число удалённых строк |

Используется перед «Применить рацион» (`replace_existing=true`) и во вкладке **«Расписание»** при опции очистки.

**Схема v047:** снят FK `food_entries.product_id → main.food_products`; очистка больше не падает с 500 на legacy БД.

---

## Рационы и недельное расписание

| Сущность | Таблица | Описание |
|----------|---------|----------|
| Рацион | `daily_meal_plans` + `meal_plan_items` | Позиции по `day_offset` (0…6) для `is_weekly=1` |
| Расписание | `weekly_meal_schedule` | Какой `meal_plan_id` на каждый `day_of_week` (0=пн … 6=вс) |

### API

| Method | Path | Описание |
|--------|------|----------|
| GET/POST | `/api/food/weekly-schedule` | Чтение / сохранение расписания |
| POST | `/api/food/apply-meal-plan` | Применить рацион к дате или неделе |
| POST | `/api/food/meal-plans/{id}/apply` | Диапазон дат |

### UI (`WeeklyScheduleTab.tsx`)

1. Настроить рацион на каждый день недели.
2. «Применить расписание на неделю» — для каждого настроенного дня: optional clear → `applyMealPlan(date=weekStart+day_of_week)`.
3. Будущие дни недели (Sat/Sun) допустимы — валидация food-дат не запрещает будущее.
4. При ошибке одного дня цикл продолжается; ошибки агрегируются в toast.

### Макросы при apply

- **`_meal_plan_day_offset`:** для недельного рациона выбирает `day_offset` по позиции даты в неделе пользователя (`week_start_day`).
- **`_ENTRY_SELECT`:** при чтении — `COALESCE(live food_products, snapshot per100)`; клетчатка из live `fiber_g`.
- При add/update записи snapshot-колонки (`protein_per100`, …) обновляются из справочника.

---

## Целевые нормы питания (настройки)

Раздел **«Питание и расчёты»** в `/settings?tab=nutrition` (вертикальное меню настроек).

### API `/api/user`

| Method | Path | Описание |
|--------|------|----------|
| GET | `/nutrition-settings` | Нормы г/кг и уровень активности (NULL → дефолты) |
| POST | `/nutrition-settings` | Сохранить настройки |
| POST | `/calculate-level` | Расчёт BMR/TDEE и рекомендаций (без автосохранения) |

Колонки в `user_profile`:

| Колонка | Описание |
|---------|----------|
| `protein_gram_per_kg` | Белки, г/кг |
| `fat_gram_per_kg` | Жиры, г/кг |
| `carbs_gram_per_kg` | Углеводы, г/кг |
| `activity_level` | `sedentary` \| `active` |
| `max_deficit_per_kg_fat` | Безопасный лимит дефицита (default 35) |
| `max_physiological_deficit_per_kg_fat` | Физиологический потолок (default 70) |

**Дефолты** (`get_default_nutrition_grams_per_kg`):

| Активность | Белки | Жиры | Углеводы |
|------------|-------|------|----------|
| sedentary | 1.2 г/кг | 0.8 | 3.5 |
| active | 1.6 г/кг | 0.8 | 3.5 |

**«Рассчитать уровень»** — Mifflin-St Jeor, TDEE (×1.2 / ×1.55), активность по TRIMP и объёму силовых за 30 дней. Рекомендации можно **применить** к форме и сохранить вручную.

Панель «г/кг» в дневнике использует `get_effective_nutrition_grams_per_kg`.

---

## Микронутриенты (`/food/micros`)

Учёт **9 нутриентов** на 100 г в справочнике продуктов и **недельная сводка** потребления.

| Ключ (БД) | Название | Ед. | Дефолт / сутки |
|-----------|----------|-----|----------------|
| `vitamin_c_mg` | Витамин C | мг | 90 |
| `vitamin_d_mcg` | Витамин D | мкг | 15 |
| `vitamin_b12_mcg` | Витамин B12 | мкг | 2.4 |
| `calcium_mg` | Кальций | мг | 1000 |
| `iron_mg` | Железо | мг | 18 |
| `magnesium_mg` | Магний | мг | 400 |
| `zinc_mg` | Цинк | мг | 11 |
| `potassium_mg` | Калий | мг | 3500 |
| `sodium_mg` | Натрий | мг | 2000 |

Справочник: `utils/micro_nutrients.py`. Сервис: `backend/services/micro_nutrients_service.py`.

### API

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/food/micros/week/{date}` | Сводка за неделю (якорь — `week_start_day` из профиля); норма × 7 |
| GET | `/api/food/micros/day/{date}` | Сводка за день (совместимость) |
| GET | `/api/food/micros/goals` | Текущие суточные нормы |
| PUT | `/api/food/micros/goals` | Сохранить нормы в `user_profile.micro_goals_json` |

Query: `phase=cut|bulk` — как в дневнике.

### UI

- Навигация по неделям (`useWeekStartDay`, `formatWeekLabel`);
- Таблица: потреблено за неделю / норма × 7 дн. / %;
- «Данные не введены», если по нутриенту нет записей в продуктах дня;
- В `AddProductModal` — опциональный блок микронутриентов на 100 г.

Миграция **v33**: колонки в `food_products`, `micro_goals_json` в профиле.

---

## Frontend

| Файл | Назначение |
|------|------------|
| `pages/FoodDiary/FoodDiary.tsx` | Недельная сетка, premium-блоки, инвалидация forecast |
| `pages/FoodDiary/premium/GoalProjectionSection.tsx` | Обёртка прогноза |
| `pages/FoodDiary/premium/GoalProjectionPanel.tsx` | Прогноз, danger-баннер, chart |
| `pages/FoodDiary/premium/WeeklyDeficitSection.tsx` | Cut/Bulk control (без mini-strip) |
| `pages/FoodDiary/useNutritionGoalProjection.ts` | React Query: forecast + readiness |
| `pages/FoodDiary/WeeklyOverviewCarousel.tsx` | Карусель недели, подсветка «Сегодня» |
| `pages/FoodDiary/WeeklyScheduleTab.tsx` | Расписание рационов, apply на неделю |
| `pages/FoodDiary/WeekNutritionGrid.tsx` | Ячейки недели (БЖУ, клетчатка, баланс) |
| `pages/FoodDiary/DayModal.tsx`, `DayModalContent.tsx` | Drawer дня, edit/delete записей |
| `components/ui/modal.tsx` | `ModalFrame` — portal на `document.body` |
| `modules/nutrition/cutBulk/CutDeficitControlPanel.tsx` | Панель дефицита 7 дней |
| `pages/FoodDiary/CompositeProductModal.tsx` | Создание блюда |
| `pages/FoodDiary/AddProductModal.tsx` | Простой продукт (`fiber_g`, `default_portion_g`) |
| `pages/FoodDiary/MicrosTab.tsx` | Вкладка микронутриентов (неделя) |
| `modules/settings/components/NutritionSettings.tsx` | Нормы во вкладке «Питание и расчёты» |

---

## Mobile parity

Полный дневник, продукты, micros, рационы — **full** на Android.  
Прогноз сушки с danger-баннером и редактирование отдельной записи дня — **partial** (desktop-only UI). См. [MOBILE_PARITY.md](./MOBILE_PARITY.md).

---

## Связанные документы

- [API.md](./API.md) — endpoints
- [DATABASE.md](./DATABASE.md) — таблицы питания
- [SERVICES.md](./SERVICES.md) — `food_service.py`, `nutrition_service.py`, `nutrition_balance_service.py`
- [MOBILE_PARITY.md](./MOBILE_PARITY.md)
