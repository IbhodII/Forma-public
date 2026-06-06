# DATABASE.md

Данные Forma: desktop `workouts.db` + `shared.db`, mobile `myhealth.db`. Desktop стабилизирован вокруг import/warmup/diagnostics, strength block metadata, meal plans, exercise catalog hygiene and calibration history; mobile/HC/sync validation now drive the roadmap.

Last updated: **2026-06-05**.

---

## Базы

| DB | Контур | Назначение |
|----|--------|------------|
| `workouts.db` | Desktop / backend API | Основные пользовательские данные |
| `shared.db` | ATTACH к workouts | Общие каталоги (`food_products`, справочники) |
| Meal plans (v070+) | `workouts.db` main | `meal_templates`, `daily_meal_plans`, … — per-user; legacy копии остаются в shared |
| Strength block metadata (v071+) | `workouts.db` main | `strength_workouts.block_*` для normal/superset/circuit |
| Exercise-set block metadata (v072+) | `workouts.db` main | `exercise_set_items.block_*` для сохранения структуры шаблонов |
| Exercise catalog archive (v073+) | `workouts.db` main | `all_exercises.is_archived`, `updated_at` |
| Calorie calibration history (v074+) | `workouts.db` main | `calorie_calibration_history` — агрегаты окон adaptive calibration |
| `myhealth.db` | Mobile | Offline-first, FormaSync apply |

Desktop schema: **`SCHEMA_VERSION` = 74** в `database/migrations.py` (последний номер миграции).

---

## Слой чтения (после cleanup)

| Компонент | Путь |
|-----------|------|
| Активный путь / профиль | `backend/database/active_db.py` → `get_active_database_context()` |
| App connection | `backend/database/db_utils.py` → `get_db()` |
| Репозитории | `backend/repositories/` (`workouts_repo`, `food_repo`, `body_repo`, `steps_repo`, `analytics_repo`) |
| Diagnostics service | `backend/services/database_diagnostics_service.py` |
| Meta (app settings) | `backend/database/app_meta.py` |

**Правило:** новые read-path на backend — через `get_db()` / repositories, не `sqlite3.connect` в сервисах.

**Mobile после FormaSync:** `syncAfterPackageApply()` обновляет `food_cache` / `body_metrics_cache`; UI читает кэши, не сырые таблицы напрямую везде.

---

## Diagnostics API (desktop)

`GET /api/database/diagnostics/overview`

Возвращает:

- `activeDbPath`, `currentProfile`, `shared_attached`, `request_user_id`
- `counts` — strength/cardio/food/body/steps, snapshot analytics (passive HR samples, strength flag)
- `workout_visibility` (опционально) — почему тренировки есть в БД, но не видны в UI (период 3 мес., вкладка пресета)

UI: настройки → данные / импорт (`DatabaseImportSettings`).

**Не заменяет** импорт/warmup; помогает отладить «данные есть, экран пустой».

---

## Импорт большой БД (desktop) — без изменения контракта

Импорт **файлов** `workouts.db` + `shared.db` (ZIP или два файла):

| Клиент | Staging |
|--------|---------|
| **Electron** | IPC `pickDatabaseImportFiles` → `import-jobs/{jobId}/` |
| **admin_browser (dev)** | `POST /api/database/import/stage` (multipart ZIP или два файла) → тот же job dir |

Импорт привязан к **`user_id` текущей сессии** (`X-User-ID`), не только admin 1.  
Реализация staging: `backend/services/database_import_staging.py`.

### Staging

| Путь | Назначение |
|------|------------|
| `{FORMA_DATA_DIR}/import-jobs/{jobId}/manifest.json` | `workoutsPath`, `sharedPath`, `mode` |
| `{FORMA_DATA_DIR}/import-jobs/{jobId}/staging/` | Копии DB |
| `{FORMA_DATA_DIR}/.db-import.lock` | Блокировка API → 503 `import_in_progress` |

### API

| Метод | Путь |
|-------|------|
| `POST` | `/api/database/import/start` |
| `GET` | `/api/database/import/status/{job_id}` |

Стадии: `validating` → `backup_current` → `importing` → (`activating`) → `migrating` → `integrity_check` → `indexes` → `analyze` → `warmup` → `done` \| `error`.

Реализация: `database_import_tasks.py`, `routers/database_import.py`.  
Electron: `pickDatabaseImportFiles`, `startDatabaseImport`, `getDatabaseImportStatus`.

### Режимы

- **replace** — backup, atomic swap, `ensure_db_schema`, **user reconcile** (`import_user_reconciliation.py`), migrations, integrity, indexes, ANALYZE, light warmup.
- **merge** — backup, ATTACH staging, copy tables с `user_id` текущего пользователя.

При фатальной ошибке после backup — restore из `.pre-db-import-*.bak` (включая сброс `-wal`/`-shm`).

### Сопоставление пользователя после импорта

Источник истины для данных: **`user_id` активной сессии** (`X-User-ID`), не `users.id` из файла бэкапа.

| Шаг | Модуль |
|------|--------|
| Snapshot `users` до replace | `get_user_by_id` в worker / cloud restore |
| Detect source `user_id` в файле | `detect_import_user_id` |
| Ensure строка `users.id = target` | `ensure_target_user_row` (сохраняет cloud identity dev) |
| Remap scoped tables | `reassign_user_ids_to_target` |
| Profile `user_profile.id = target` | `reconcile_user_profile` |
| Post-check | `database_post_verify` → check `auth_user` |

Реализация: [`backend/services/import_user_reconciliation.py`](../backend/services/import_user_reconciliation.py), [`db_import_safety.py`](../backend/services/db_import_safety.py).

### Cloud restore (`workouts.db` only)

`POST /api/cloud/backup/restore` — [`cloud_backup_service.restore_database_from_cloud`](../backend/services/cloud_backup_service.py):

1. Pre-backup `.pre-cloud-restore-*.bak`
2. Download + `quick_check`
3. Atomic replace `workouts.db`
4. `ensure_db_schema` + `reconcile_after_db_import`
5. `assert_post_db_verification` (в т.ч. `auth_user`)
6. При ошибке — rollback из backup

Ответ API: `session_user_id`, `user_id_remap`, `profile_reconciled`.  
`shared.db` не заменяется (в отличие от desktop ZIP import).

Тесты: `backend/tests/test_import_user_reconciliation.py`.

### Universal import conflict resolver

Слой для импорта без цепочки `UNIQUE constraint failed`:

| Модуль | Назначение |
|--------|------------|
| [`db_import_unique_inventory.py`](../backend/services/db_import_unique_inventory.py) | Scan UNIQUE/PK; классы: `user_scoped`, `global_catalog`, `child`, `cloud_auth` |
| [`db_import_preflight.py`](../backend/services/db_import_preflight.py) | **Hard block** до backup, если в staging есть `user_scoped` таблица с UK без handler |
| [`db_import_natural_merge.py`](../backend/services/db_import_natural_merge.py) | `NATURAL_KEY_HANDLERS`, `assert_safe_main_table_import` |
| [`db_import_conflict_handlers.py`](../backend/services/db_import_conflict_handlers.py) | Handlers: `cardio_type_settings`, presets, exercise_sets, bike/cycle, catalog, cloud skip |

**Запрещено:** blind `INSERT OR REPLACE` по `id` и blind `UPDATE user_id` для таблиц с composite UNIQUE на `user_id`.

**Preflight report:** `import_preflight.tables_upsert`, `tables_blocked`, `conflict_counts`.

**Merge report:** `merge_stats.natural_key.{table}` (+ legacy `{table}_detail`), `user_id_remap.reassign_natural_key`.

**Cloud/auth:** `cloud_tokens`, `user_cloud_links`, `users` — `preserve_target` (не перетирать live tokens). User identity reconcile (`yandex_uid`, `cloud_user_id`) без изменений.

| Таблица | Natural key | Merge-правило |
|---------|-------------|---------------|
| `steps_history` | `(user_id, date)` | `steps = MAX`; source как HC sync |
| `body_metrics` | `(user_id, date)` | incoming non-null; skip if identical |
| `daily_bracelet_calories` | `(user_id, date)` | `total_calories = MAX` |
| `passive_heart_rate_samples` | `(user_id, recorded_at)` | `bpm = MAX` |
| `sleep_data` | `(user_id, external_id)` | upsert по external_id |
| `cardio_type_settings` | `(user_id, type)` | incoming newer/richer (`is_active`, `sort_order`) |
| `workout_presets` | `(user_id, name)` | metadata merge; child `preset_id` remap |
| `exercise_sets` | `(user_id, workout_type, effective_from)` | incoming newer |
| `bike_settings` / `menstrual_cycle_*` | `user_id` or `(user_id, date)` | newer / coalesce |
| `strength_hr_session_meta` / `block_mappings` / `block_overrides` | session keys | richer wins |
| `weekly_meal_schedule` | `(user_id, day_of_week)` | incoming plan_id |
| `account_warmup_checkpoint` | `user_id` (inline PK) | singleton merge; newer `updated_at` / richer progress |
| `food_products` (shared) | `name` | catalog merge, not by `id` |

**Singleton user-scoped** (одна строка на `user_id`): `account_warmup_checkpoint`, `bike_settings`, `menstrual_cycle_settings`. Inventory детектирует inline `user_id INTEGER PRIMARY KEY` через PRAGMA + DDL. Preflight блокирует таблицу **по наличию в схеме staging**, даже если пустая (remap после replace всё равно опасен).

| Этап | Поведение |
|------|-----------|
| `validating` | `run_import_preflight` → fail if `tables_blocked` |
| `_merge_from_staging` | registry + catalog handlers; skip cloud_auth |
| `reassign_user_ids_to_target` | все main-таблицы с `user_id` → remap или safe UPDATE |
| Post-import | `_post_import_natural_key_dedupe` |

Тесты: `test_db_import_unique_conflicts.py`, `test_db_import_natural_merge.py`, `test_import_user_reconciliation.py`, `test_database_import_tasks.py`.

---

## Warmup после импорта

Фоновый worker; UI poll ~800 ms, timeout ~15 s.

| Метод | Путь |
|-------|------|
| `POST` | `/api/account/warmup/start` |
| `GET` | `/api/account/warmup/status/{task_id}` |
| `POST` | `/api/account/warmup/cancel` |
| `POST` | `/api/account/warmup/retry` |

Секции full warmup: TRIMP, aggregates, steps, body, workouts, cardio, food, products, **CTL/ATL/TSB** (через `analytics_query` с guards), sleep, pulse, cycle, и др.

`database_post_verify` перед `completed`: quick_check, индексы, smoke по доменам; CTL smoke **пропускается**, если нет cardio TRIMP в окне.

---

## Видимость тренировок после импорта

API/UI по умолчанию: период ~3 мес., вкладка = активный preset.

Отчёт: `workout_visibility` в import report и `GET /api/database/diagnostics/workout-visibility`.

После **replace:** `user_id_remap` + `user_reconcile` (users/profile + scoped tables).

---

## Индексы и пресеты

- Индексы — только если отсутствуют.
- `workout_presets`: дедуп `(user_id, name COLLATE NOCASE)`, переназначение дочерних строк.
- Strength templates: `exercise_set_items` сохраняет block metadata; шаблон задаёт состав/порядок/структуру, а не приоритет рабочих значений.
- Exercise catalog: used rows in `all_exercises` are archived on delete instead of rewriting/deleting history.

---

## Экспорт (аварийный)

ZIP `workouts.db` + `shared.db` + `manifest.json` — тот же формат, что принимает импорт ZIP.

`POST /api/database/export/*`, Electron `exportDatabaseZip`.  
Отдельно: `forma_backup_v1.json` — логический бэкап, не побайтовая копия DB.

---

## Duplicate handling (import / presets)

- **Workout presets:** dedup по имени (case-insensitive), переназначение дочерних строк.
- **Workout tabs UI:** guard против дублей preset tabs (миграция + UI).
- **Strength HR meta:** dedup после merge (см. выше).
- **Food / body:** merge по table rules в `database_import_tasks` (user_id remap).

## Large DB behavior

- **Режим по умолчанию для крупных БД:** `replace` (порог ~150 МБ `workouts.db` + `shared.db` в staging). `merge` оставлен для малых/частичных сценариев; UI предупреждает и блокирует merge при превышении порога.
- **Replace pipeline:** pre-backup (`.pre-db-import-*.bak`) → WAL `FULL` checkpoint на live → `replace_both_databases` → `ensure_db_schema` → `reconcile_after_db_import` (без изменения логики identity) → `assert_post_db_verification` (light при large) → post-import indexes / light `ANALYZE` / фоновый warmup.
- **Merge:** `commit()` после каждой таблицы; после merge — тот же `reconcile_after_db_import`; dedupe `strength_hr_session_meta` (Python до 20k строк, SQL dedupe выше).
- Lock file `.db-import.lock` (exclusive, JSON: `task_id`, `pid`, `started_at`) → API **503** `import_in_progress` + `import_job_id`; status poll **не** блокируется.
- Persisted job state: `import-jobs/{jobId}/status.json` (переживает рестарт backend; UI может показать «задача прервана»).
- Stages: `backup_current`, `importing`, `activating`, `migrating`, `integrity_check`, `indexes`, `analyze`, `verifying`, `warmup`; отчёт `stage_timings`, `duration_sec`, `workouts_bytes`.
- Browser ZIP staging: потоковая запись на диск (не `read()` целиком); лимит ZIP — `FORMA_DB_IMPORT_MAX_ZIP_BYTES` (по умолчанию 4 ГБ).
- UI: poll timeout **300s**, retry на `db_locked` / `import_in_progress`; stall warning без fail если прогресс >10 мин не меняется; desktop IPC `database-import-stage-progress` при копировании в staging.
- Не прерывать warmup на production DB без backup.
- Diagnostics: если `counts` > 0, а UI пустой — `workout_visibility` (период 3 мес., active preset).

## Known import issues

| Issue | Status |
|-------|--------|
| Very large DB duration | Partial — replace + light verify; UI не падает на 60s poll |
| `db_locked` under load | Partial — retries в backend |
| Wrong user after OAuth | Documented — `link_user` / Data scope |
| UNIQUE on strength_hr meta | **Resolved** — idempotent merge + dedup |
| «Пользователь не найден» после cloud restore | **Resolved (2026-06-03)** — reconcile к session `user_id` |

## Ограничения (актуальные)

- Крупный импорт на слабом диске/CPU остаётся долгим.
- До завершения warmup возможна latency на тяжёлых экранах.
- Mobile не выполняет desktop import/warmup.
