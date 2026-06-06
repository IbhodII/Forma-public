# Health Connect — audit and diagnostics

Сквозная диагностика Health Connect: что отдаёт телефон, что попадает в локальную БД на Android, что уходит на backend (legacy), что экспортируется в FormaSync.

**Важно:** на **десктопе** ingest в `workouts.db` по-прежнему **не подключён** к движку recovery/deficit/expenditure как единый analytics engine. На **мобильном** local-first режимах шаги и тренды читаются из `hc_day_metrics` (`HcTrendsPanel`, `useStepsHistory`).

См. [HEALTH_CONNECT.md](./HEALTH_CONNECT.md), [FORMA_SYNC.md](./FORMA_SYNC.md), [mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md).

---

## Где смотреть

| Платформа | Путь |
|-----------|------|
| Mobile hub | Вкладка **Health Connect** → «Синхронизировать сейчас», `HcTrendsPanel` |
| Mobile diagnostics | `HealthConnectDiagnosticsScreen` — **режим разработчика** (7 нажатий на версию в «О проекте») или режим `local_hc_test` |
| Mobile Settings | `HealthConnectSettings` → кнопка «Диагностика» (только dev mode) |
| Desktop | `/health-connect` → вкладки слоёв |
| API | `GET /api/sync/health-connect/debug` |

---

## Слои данных

### Mobile local-first (`autonomous` / `cloud` / `legacy_api` collect)

| # | Слой | Где |
|---|------|-----|
| L1 | **Raw HC** | Health Connect SDK на устройстве |
| L2 | **`hc_records`** | SQLite после `hcRecordStore` (dedupe key) |
| L3 | **`hc_day_metrics`** | Rollup `hcStore`, `providers_json`, stale flags |
| L4 | **Legacy POST** (optional) | `runHealthConnectSync` → `POST /api/sync/health-connect` только при `legacy_api` + доступный API |
| L5 | **FormaSync JSONL** (optional) | `exportChanges` → `hc_days` в ZIP при `autonomous` / `cloud` |

Журнал collect: `hc_sync_runs`; debug state: [`healthConnectSyncDebug.ts`](../mobile/src/services/healthConnectSyncDebug.ts) — фазы `idle` | `reading` | `done` | `error` | **`permission_denied`**.

### Desktop backend (после POST)

| # | Слой | Описание |
|---|------|----------|
| 1 | Prepared payload | Дневные пакеты в POST |
| 2 | Backend received | `items[]` |
| 3 | Backend saved | `steps_history`, `daily_weight`, … |
| 4 | Backend skipped | reason codes |
| 5 | Analytics usage (desktop) | многие поля `used: false` в audit UI |

---

## Поля: mobile local vs desktop backend

| HC field | Mobile `hc_day_metrics` / records | Desktop `workouts.db` | Mobile UI analytics |
|----------|-----------------------------------|----------------------|---------------------|
| steps | rollup + records | `steps_history` | **yes** (trends, steps tab local-first) |
| total/active kcal | day payload | `daily_bracelet_calories` | partial |
| sleep | day payload | `sleep_data` | partial (trends) |
| workouts | records + cache | `cardio_workouts` | partial |
| heart_rate samples | per-day samples in payload | workout HR / skip day-level | cardio detail |
| weight | **planned** in main collect | `daily_weight` | audit probe only |

---

## Skip reasons (backend POST)

| Reason | Meaning |
|--------|---------|
| `unsupported_type` | e.g. strength workout (exercise_type=70) |
| `protected_existing` | FIT/Polar/manual/excel row blocks HC insert |
| `existing_health_connect` | dedup same date+type HC row |
| `duplicate` | sleep external_id already exists |
| `missing_required_fields` | invalid sleep/workout payload |
| `negative_value` | steps < 0 |
| `hr_without_workout` | day-level HR samples without saved workout |
| `permission_missing` | from mobile audit (not backend) |

---

## Mobile-local issues (diagnostics)

| Симптом | Вероятная причина |
|---------|------------------|
| `permission_denied` в debug | Разрешения HC отозваны — hub badge «Нет разрешений» |
| Stale badge на тренде | `computeStaleFlags` 48 h, Mi Fitness не пушил в HC |
| Steps завышены | Несколько step records суммируются без source dedup |
| Пустой фон офлайн | WorkManager constraint NETWORK_CONNECTED |
| HR «дыры» | Нет сэмплов в HC за интервал; не minute aggregates |

---

## Что можно подключить к аналитике позже

**Desktop backend** (кандидаты без изменения mobile):

- steps, kcal, weight, sleep — уже в таблицах; нужна wiring в `/analytics`

**Mobile** (уже частично):

- steps / sleep / kcal trends из `hc_day_metrics`
- **Planned:** HRV, readiness, полный каталог полей HC

---

## Warnings (structured)

- `sync_log_table_missing` — migration v048+ (desktop)
- `permission_missing` — mobile permissions incomplete
- `permission_denied` — mobile collect phase (revoked)
- `no_records` — batch has no field data
- `records_skipped` — skipped_totals.total > 0
- `backend_accepted_but_saved_0` — POST ok but zero fields saved

---

## Миграции

**Desktop `workouts.db`:**

- v048 — `health_connect_sync_log`
- v050 — `audit_json`, `mobile_audit_json`, `device_label`

**Mobile `myhealth.db`:** см. [`mobile/src/database/index.ts`](../mobile/src/database/index.ts) — `SCHEMA_VERSION`, таблицы `hc_*`.

---

## TODO / FUTURE

- Пользовательский приоритет HC-источников (не только dominant by count)
- Dedup шагов между overlapping records
- `BOOT_COMPLETED` / boot-time collect (**planned**)
- Синхронизация сырых `hc_records` в FormaSync package (**not in v1** — только day rollup `hc_days`)
