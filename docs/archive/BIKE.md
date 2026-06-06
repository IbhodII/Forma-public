# Велотренировки (FIT, GPS, аналитика)

Полный цикл данных велотренировок: импорт FIT → SQLite → API → React (карта Leaflet + графики Plotly).

---

## Источники данных

| Источник | Что даёт |
|----------|----------|
| **FIT** (Coospo Ride) | GPS, пульс, скорость, каденс, высота, TRIMP, `calories_chest` |
| **Polar attach** | HR, GPS (бег/вело), `calories_chest`, длительность; scalar-поля кардио — fill-empty-only (см. [API.md](./API.md)) |
| **Ручной ввод** | `POST /api/cardio/workout` |

TCX/GPX/FIT для Polar — через `POST /api/sync/polar/upload` (очередь pending). FIT Coospo — `fit_importer.py` / `fitdecode`.

---

## Импорт FIT (`fit_importer.py`)

Пошаговая инструкция (папка, UI, `--reimport`, Excel): **[FIT_SYNC.md](./FIT_SYNC.md)**.

```
.fit файл → parse_fit_file()
  ├── by_second{}        — датчики 1 Гц (workout_sensors, пульс)
  ├── gps_samples[]      — все GPS-фиксации из record (в т.ч. sub-second)
  └── track_points       — gps_samples или fallback 1 Гц
       → build_enriched_geojson() → gps_tracks.track_data
       → workout_sensors, workout_heart_rate, cardio_workouts
```

**Важно:** для полной детализации GPS **переимпортируйте FIT** (`fit_importer.py --reimport` или `POST /api/sync/fit` с `"reimport": true`) после обновления импортёра.

---

## Хранение в БД

| Таблица | Содержимое |
|---------|------------|
| `cardio_workouts` | Агрегаты: дистанция, время, TRIMP, ккал, cadence |
| `workout_sensors` | 1 Гц: speed, cadence, elevation, temperature |
| `workout_heart_rate` | 1 Гц: HR + distance_m |
| `gps_tracks` | GeoJSON FeatureCollection с массивами properties |

GeoJSON properties (на точку): `elapsed_sec`, `speed_kmh`, `cadence`, `elevation_m`, `temperature_c`, `heart_rate`, `distance_m`.

Сборка: `utils/bike_track.py` → `build_enriched_geojson`, `geojson_to_track_points`.

---

## API

Базовый префикс: `/api/cardio`.

| Endpoint | Назначение |
|----------|------------|
| `GET /{id}/gps` | Полный GeoJSON (без прореживания) |
| `GET /{id}/points?downsample=` | Точки для карты |
| `GET /{id}/sensors?downsample=` | Ряды для Plotly-графиков |
| `GET /availability?ids=` | `gps_ids`, `heart_rate_ids`, `sensor_ids` |

### Прореживание (`downsample`)

| Значение | Поведение |
|----------|-----------|
| `1` | **Все точки** из GeoJSON |
| `0` | **1 точка в секунду** (рекомендуется для UI по умолчанию) |
| `N ≥ 2` | 1 точка каждые N секунд |

Логика: `utils/sensor_downsample.py` → `thin_rows_by_interval`.

Legacy-треки без properties обогащаются: `enrich_geojson_from_sensors`.

---

## Карта (`BikeGpsMap.tsx`)

Стек: **react-leaflet** + OSM tiles + **Canvas renderer** (`preferCanvas`).

### Отображение маршрута

- **Каждое ребро** между соседними GPS-точками рисуется отдельно (без пропуска вершин)
- Соседние сегменты **одного цвета объединяются** для производительности
- Раскраска: **percentile-based** внутри тренировки (не min/max)

### Раскраска: абсолютная шкала скорости

Цвет зависит от **абсолютной скорости (км/ч)**, одинаково на всех тренировках.

Конфиг: `frontend/src/config/speedColorScale.ts`

| Диапазон | Цвет |
|----------|------|
| 0–10 | тёмно-синий |
| 10–18 | голубой |
| 18–25 | зелёный |
| 25–32 | жёлтый |
| 32–40 | оранжевый |
| 40+ | красный |

Плавная RGB-интерполяция между stops; квантизация 0,5 км/ч для merge сегментов.

Профили `road` / `mtb` / `indoor` / `commuting` — заготовка (пока = `global`).

Реализация: `speedToColor()` → `buildSpeedSegments()` → `BikeGpsMap.tsx` (legend + overlay).

### Взаимодействие

| Действие | Результат |
|----------|-----------|
| Наведение на линию | Tooltip: время, скорость (**SoL/h**), дистанция (**SoL/torch**), высота (**рашморы**), каденс, температура (**°Rj**), пульс |
| Клик по линии / точке | Закреплённый popup |
| Клик на графике | Фокус карты на точке (`FocusPoint`) |

При >1200 точках интерактивные маркеры скрыты — работает hover по линии.

### Режим «Все точки»

UI: `CardioDataIntervalSelect` → `downsample=1`.

- Загружает `GET /points?downsample=1`
- Fallback на GeoJSON при пустом ответе API
- Предупреждение при большом числе точек

---

## Графики (`BikeWorkoutCharts.tsx`)

Plotly: скорость, каденс, высота (по дистанции), температура, пульс. Подсказки при наведении — контрастные (`plotTheme.ts`, `hoverlabel` + CSS в `index.css`); на карточках силовых/кардио — `HeartRateChart.tsx`.

- Ось времени: метки каждые 10 мин
- Синхронизация с картой через `onFocusPoint`
- Высота: прореживание ~25 м (`downsampleElevationByDistance`)

### Единицы на графиках (`units_system = american`)

| Ось / величина | Метрика | American |
|----------------|---------|----------|
| Дистанция по X | км | **SoL** (`convertArrayKmToSol`) |
| Скорость | км/ч | **SoL/h** |
| Высота | м | **рашморы** (1745 м) |
| Температура | °C | **°Rj** |

Легенда скорости на карте: подписи тиков в **SoL/h** при american (внутренняя шкала остаётся км/ч). См. [UNITS_CONVERSION.md](./UNITS_CONVERSION.md).

---

## Метрики в списке

`cardio_service.enrich_cardio_from_device` / `enrich_bike_workout`: ккал пульсометра (`calories_chest`), пульс и длительность из Polar/FIT и таблицы `workout_heart_rate`. При attach Polar scalar-поля кардио обновляются только если были пусты.

---

## Оценка мощности без датчика

Если в FIT или `workout_sensors` есть **реальная мощность** (`power_watts` > 0), она **не пересчитывается**: `power_source = 'real'`, `avg_power_watts` заполняется, `estimated_avg_power_watts = NULL`.

Иначе — оценка по скорости, уклону из GPS и настройкам велосипеда (`bike_power_service.py`, `utils/power_estimation.py`).

### Модели оценки

| `power_source` | Условие | Физика |
|----------------|---------|--------|
| `real` | Датчик в FIT / посекундные `power_watts` | Среднее по положительным точкам |
| `estimated_advanced` | Есть **вес** (body_metrics / daily_weight / bike_settings) и **рост** (`user_profile.height_cm`) | CdA = Cd × A; полная формула с аэродинамикой |
| `estimated_basic` | Нет пары вес+рост | Только качение + гравитация (без CdA) |
| `estimated` | Legacy | Старые записи до разделения advanced/basic |

**Advanced:** фронтальная площадь A (м²) ≈ `0.053 × weight_kg^0.425 × height_m^0.725` (формула Барри, рост в метрах).  
**Cd:** шоссе (`road_slick`, `semi_slick`) — 0.88 (муж.), 0.90 (жен.); MTB-покрышки (`gravel`, `cx`) — 1.0.

**Мощность на точке:**

```
P = v × (m·g·(Crr + уклон%) + ½·ρ·CdA·v²)
```

`ρ = 1.225` кг/м³, уклон из разницы `elevation_m` между соседними секундами, Crr и масса — из `bike_settings_service`.

**Basic:** `P = m·g·v·(Crr + уклон%)` (без члена CdA).

Средняя по тренировке — mean положительных мгновенных оценок; результат в `estimated_avg_power_watts`.

### Логирование

В `backend/logs/api.log` (уровень INFO):

- `Rider CdA: …` — при успешном расчёте CdA (вес, рост, Cd, tire);
- `Workout N: estimated power … W — model=advanced|basic, source=…` — итог пересчёта;
- `Workout N: real power from sensors` — если в рядах уже есть датчик.

### API

| Method | Path | Описание |
|--------|------|----------|
| GET | `/api/cardio/{id}/power` | Реальная / оценочная мощность, `source`, серия (только real) |
| POST | `/api/cardio/{id}/estimate-power` | Пересчёт (ошибка, если уже `real`) |
| POST | `/api/cardio/backfill-power` | Массовый backfill без мощности |

### Настройки (`bike_settings`)

UI: **Настройки → Мой велосипед** или `/my-bike`.

| Параметр | Описание |
|----------|----------|
| `bike_weight_kg` | Масса велосипеда |
| `rider_weight_kg` | Масса райдера (fallback — последний вес из body); в UI при american ввод в **Jp**, хранение в кг |
| `tire_type` | `road_slick`, `semi_slick`, `gravel`, `cx` — влияет на Cd |
| `default_route_surface` | `asphalt`, `cobblestone`, `gravel`, `mixed` — множитель Crr |

`GET/POST /api/user/bike-settings`.

Ручной **CdA** в UI — запланирован отдельно; пока только автоматический расчёт.

### Точки входа кода

| Функция | Файл |
|---------|------|
| `apply_power_from_import` | После FIT-импорта |
| `_try_save_estimated_power` | Оценка + запись в БД |
| `_get_rider_cda` | CdA из body + profile |
| `estimate_workout_power` | API пересчёта |
| `backfill_missing_bike_power` | CLI / backfill endpoint |

Тесты: `backend/tests/test_power_estimation.py`.

---

## Frontend файлы

| Файл | Роль |
|------|------|
| `components/BikeGpsMap.tsx` | Карта, легенда, hover, popup |
| `components/BikeWorkoutCharts.tsx` | Plotly-графики |
| `components/CardioWorkoutPanel.tsx` | Оркестрация данных |
| `components/CardioDataIntervalSelect.tsx` | Выбор детализации |
| `utils/bikeTrack.ts` | Парсинг, сегменты, цвета |
| `utils/cardioDataInterval.ts` | localStorage интервала |
| `components/BikeSettingsForm.tsx` | Форма настроек велосипеда |
| `api/cardio.ts` | HTTP-клиент |

---

## Производительность

| Техника | Где |
|---------|-----|
| Canvas renderer | Leaflet polylines |
| Merge same-color segments | `mergeAdjacentSegments` |
| Stride + refine nearest point | `findNearestPoint` на mousemove |
| 1 Гц по умолчанию | UI `downsample=0` |

---

## Troubleshooting

| Симптом | Решение |
|---------|---------|
| Нет графиков каденса/температуры | Переимпорт FIT |
| Карта «рваная» / мало точек | Режим «Все точки»; переимпорт FIT для gps_samples |
| Один цвет на всём маршруте | Нет speed_kmh — проверьте workout_sensors |
| Лаги на длинном маршруте | Использовать 1 Гц вместо «Все точки» |

---

## Связанные документы

- [API.md](./API.md) — Cardio endpoints
- [DATABASE.md](./DATABASE.md) — gps_tracks, workout_sensors
- [SERVICES.md](./SERVICES.md) — cardio_service, fit_importer
- [UNITS_CONVERSION.md](./UNITS_CONVERSION.md) — SoL, SoL/h, рашморы
