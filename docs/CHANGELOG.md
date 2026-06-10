# CHANGELOG

История значимых изменений **MyHealthDashboard / Forma**.  
Версия установщика десктопа: `frontend/package.json` (текущая public desktop build line: **0.74.0**, output `release74`).

Формат: [Keep a Changelog](https://keepachangelog.com/ru/1.1.0/).  
Схема БД: `SCHEMA_VERSION` в `database/migrations.py` — сверять с кодом.

Last updated: **2026-06-09**.

---

## [0.54.0] — 2026-06-03

### Large SQLite DB import (desktop)

- **Replace-first** для staging >150 МБ; merge с per-table `commit` + post-merge reconcile.
- **Safety:** WAL checkpoint, `replace_both_databases`, persisted `import-jobs/{id}/status.json`, exclusive `.db-import.lock` с `import_job_id` в 503.
- **Post-import:** light `ANALYZE` / light `assert_post_db_verification` на large; `stage_timings` в report.
- **Staging:** streaming ZIP upload (browser); SQL dedupe HR meta на больших таблицах.
- **UI:** poll 300s + db lock retry; stall hint; replace recommendation; Electron staging progress IPC.
- **Tests:** `test_large_database_import.py` (22 import tests green).
- **Installer:** `frontend/release54/Forma Setup 0.54.0.exe`.
- **Installer (release readiness build):** `frontend/release55/Forma Setup 0.54.0.exe` (2026-06-03).

---

## [Unreleased]

### Documentation reconciliation and release 0.74 prep (2026-06-09)

- **Docs:** reconciled Public docs against Dev without overwriting Public-only release/audit reports.
- **Schema docs:** confirmed Public `SCHEMA_VERSION=80` (`v078` cardio duration/distance, `v079` meal-plan finalization, `v080` shared strength catalog).
- **OAuth docs:** clarified desktop Google/Yandex PKCE default, redirect URI runtime port alignment, Yandex app-folder scopes, and Polar confidential-client exception.
- **Packaging docs:** documented `packaging/seed/` generation, public `shared.db` audit, `httpx`/`httpcore` bundle guard, and forbidden secret checks.
- **Units docs:** documented current `metric` / `american` profile flag and presentation-only conversion layer.
- **Report:** added `DOCUMENTATION_SYNC_REPORT.md`.

---

## [0.69.0] — 2026-06-09

### Strength HR block editing stability

- **Fix:** clicking blocks in the strength HR graph editor no longer crashes the desktop app or leaves dev stuck on loading spinners.
- **Frontend:** safe block palette indexing (`block_index` 0 / malformed intervals), normalized editable blocks, guarded set mapping, Plotly axis-mapping dedupe, and Plotly load-failure message instead of infinite chart spinner.
- **UX:** invalid or missing block data shows a fallback message; loading indicators only appear when cached HR/analysis data is absent.

### Running route map tooltip telemetry (2026-06-09)

- **Fix:** running route tooltips showed clock time only while pace colorization worked — telemetry was in `workout_sensors` / `workout_heart_rate` but not merged into running GeoJSON points.
- **Backend:** `merge_telemetry_into_track_points`, improved `enrich_geojson_from_sensors`, `get_points` / `get_gps` always merge when properties incomplete.
- **Frontend:** shared `RoutePointTelemetry` component; `enrichTrackPoints` derives GPS speed client-side as fallback.
- **Tests:** `test_bike_track_telemetry.py`.

### Exercise category separation & catalog cleanup (2026-06-09)

- **Schema v077:** `exercise_category` (`strength` \| `stretching`) on `shared.strength_exercises`, `shared.stretching_exercises`, and `user_strength_exercises`.
- **Migration:** backfills categories from free-exercise-db JSON + stretching library; removes unreferenced English bulk import from strength shared catalog; preserves names referenced in workouts, templates, and exercise sets.
- **Queries:** strength APIs/catalog filter `exercise_category = strength`; stretching APIs filter `exercise_category = stretching` (data-level, not UI-only).
- **Imports:** `import_free_exercise_db.py` and seed helpers tag stretching rows explicitly; automatic free-exercise-db seeding into strength catalog disabled.
- **Tests:** `test_exercise_category_filter.py`.
- **Docs:** [WORKOUTS.md](./WORKOUTS.md) exercise catalog section updated.

### Documentation refresh (2026-06-09)

- Packaging/OAuth docs: `PACKAGING_SECRETS.md`, `POLAR_SETUP.md`, `AUTH_PKCE_AUDIT.md`; port 8000 story; FormaSync/HC UI paths.
- **ANALYTICS.md / ROADMAP.md:** route telemetry phase 1 marked shipped; phase 2 planned.

### Documentation maintenance and roadmap update (2026-06-05)

- **Docs:** refreshed project state after testing, bug discovery, Health Connect work and mobile planning.
- **Priorities:** documented current order: mobile completion, HC validation, sync validation, historical Xiaomi import, bugfix/cleanup, automatic calibration, future analytics.
- **Known issues:** added P0 body measurements chart/history edit crash, P1 exercise template block-structure loss; goal deficit limit fixed at 70 kcal/kg fat.
- **Roadmap:** added historical Xiaomi/Mi/Zepp import scope, Xiaomi step duplication correction, automatic 14-day calorie calibration workflow and future analytics ideas.
- **Architecture:** added historical import pipeline, raw-vs-corrected import rules, Xiaomi correction algorithm, HC/sync validation questions.
- **Mobile:** updated target from companion/parity wording to standalone daily app scope with required domains.
- **Analytics docs:** added planned P2 Recovery-Aware Analytics Layer and Metric Explainability & Transparency; no formulas or code behavior changed.

### Adaptive calorie calibration (2026-06-04)

- **Fix:** bracelet calibration no longer divides estimated expenditure by sparse `daily_bracelet_calories`; recalculation now uses `observed_deficit / predicted_deficit` with 14-day quality gates.
- **Preserved:** workout calories still follow `bracelet daily calories - bracelet workout calories + Polar/chest effective workout calories`; calibration is applied after that replacement to avoid double-counting.
- **Data:** added `calorie_calibration_history` (schema v074) for aggregate window history; raw device/Polar calories are not overwritten. Legacy pre-v074 calibration factors are reset to `1.0` during migration.

### Polar HR parsing (2026-06-04)

- **Fix:** Polar AccessLink HR parser no longer relies only on `sample-type`; it inspects `samples[].data` content and `heart-rate` metadata.
- **New:** HR CSV samples with `sample-type: 0` are supported; unknown HR-like sample blocks are parsed instead of silently dropped.
- **Data:** `recording-rate` is used for `elapsed_sec`, invalid HR values are filtered, and parsed points are saved to `workout_heart_rate` for charts/strength HR analytics.
- **Verified:** real Polar transaction `489813358` produced `2511` HR points (`0s=84`, `1s=85`, `2s=86`, `3s=86`, `4s=87`).

### Desktop RC documentation and workout UX (2026-06-04)

- **Docs:** active source of truth refreshed for Desktop RC; added [WORKOUTS.md](./WORKOUTS.md) and [NUTRITION.md](./NUTRITION.md).
- **Docs audit:** completed cleanup report moved to [archive/CLEANUP.md](./archive/CLEANUP.md); docs index updated.
- **Workouts:** documented normal/superset/circuit block model, template structure persistence, latest-history prefill including warmup, compact history rendering, and exercise catalog hygiene.
- **Release readiness:** smoke checklist now includes workout blocks, exercise catalog, nutrition and meal plans.
- **Database docs at that time:** schema updated to `SCHEMA_VERSION=74` (`v071` block metadata, `v072` exercise-set block metadata, `v073` exercise catalog archive, `v074` calorie calibration history).

### Desktop release readiness — 2 phases (2026-06-03)

**Phase 1:** `clientCapabilities` release flags; Data hub — ZIP backup/restore primary; FIT-only import in desktop; JSON/2-file/mini → admin Developer Tools; desktop auto `fetchDesktopLogin`; docs [`RELEASE_READINESS.md`](./RELEASE_READINESS.md), [`DESKTOP_UI.md`](./DESKTOP_UI.md).

**Phase 2:** v070 meal plan tables `shared` → `workouts.db` (ids preserved, shared not dropped); `food_service` + import merge via `mq()`; tests `test_meal_plans_v070_migration.py`.

### Desktop Yandex OAuth (packaged exe, 2026-06-03)

- **Fix:** Electron OAuth popup relay — не помечать callback обработанным до чтения `#forma-oauth-data` (retry + только `did-finish-load`).
- **Fix:** после успеха — `applyCloudOAuthResult` обновляет session, invalidates cloud queries, toast при ошибке.
- **Logs:** `[forma-oauth]` в main + renderer; backend `oauth token_exchange_*` / `token_saved`.
- **Installer:** `frontend/release56/Forma Setup 0.54.0.exe`.

### Import / cloud restore user identity (2026-06-03)

- **Fix:** после импорта или `POST /api/cloud/backup/restore` данные привязываются к активному `X-User-ID`, а не к `users.id` из файла бэкапа; dev cloud identity сохраняется из snapshot до replace.
- **New:** `import_user_reconciliation.py`, `db_import_safety.py` (pre-backup, rollback, WAL cleanup).
- **Cloud restore:** pre-backup, atomic swap, migrate, reconcile, post-verify `auth_user`; HTTP 500 + rollback при ошибке.
- **Desktop replace import:** `ensure_db_schema` → reconcile (`users`, `user_profile`, scoped tables).
- **Tests:** `test_import_user_reconciliation.py`, `test_replace_import_keeps_session_user`.
- **Docs:** [DATABASE.md](./DATABASE.md), [FORMA_SYNC.md](./FORMA_SYNC.md), [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

### Desktop stabilization & documentation (2026-06-02)

- Docs refresh: architecture, ownership, import, Yandex, body hub, responsive UX, mobile v2 roadmap, [RELEASE_READINESS.md](./RELEASE_READINESS.md).
- Body metrics tab: chart full width; history always below; collapsible summary row (8 key metrics) + expanded sections.
- Responsive: removed history side-by-side @1680; food today **black** border; breakpoints 1200/1536/1680 domain tuning.
- Browser DB import staging (`admin_browser`); import scoped to session `user_id`.
- FORMA_SYNC / HEALTH_CONNECT deduplicated doc headers.

### Documentation post-cleanup (2026-06)

- Обновлены: `ARCHITECTURE`, `DATABASE`, `ANALYTICS`, `MOBILE`, `DESKTOP_UI`, `KNOWN_ISSUES`, `ROADMAP`, `CHANGELOG`.
- Добавлены/актуализированы: `PLATFORMS.md`, historical cleanup notes now archived in `archive/CLEANUP.md`.

### Wide desktop layout (2026-06)

- Breakpoints: `wide` 1440, `ultrawide` 1920, `superwide` 2560; tokens in `desktop-layout.css`.
- Multi-column layouts on home, analytics, food, body, workouts, settings, cycle.
- `AppPageShell width="fluid"` on data-heavy pages; forms keep max-width.

### Desktop v1 cleanup — desktop/core (2026-06)

- `npm run build` (`tsc -b && vite build`) green: Window globals in `vite-env.d.ts`, job types in `types/desktopJobs.ts`, `AuthContext` `fetchAuthMe()` fix, warmup summary types.
- Removed 14 orphan frontend files (dead hook, settings placeholder, nutrition analytics cluster, unused UI primitives).
- Trimmed deprecated exports (stretching tab constants, `MarkupSourcePill`, americanUnits aliases, `weekStartSaturday`).
- Root script `npm run check:desktop-build`. Docs: historical cleanup notes in [archive/CLEANUP.md](./archive/CLEANUP.md).

### Analytics cleanup (2026-06) — формулы CTL/ATL/TSB/TRIMP не менялись

**Backend**

- Новый read-layer: `backend/services/analytics_query.py` (`has_cardio_trimp_data`, `get_ctl_atl_tsb_series`, `build_ctl_current`).
- TRIMP refresh только при `count_missing_trimp() > 0`; early exits для zone time, passive HR, strength HR overview.
- Тесты: `backend/tests/test_analytics_query_empty.py`.

**Desktop**

- `frontend/src/hooks/analytics/useAnalyticsQueries.ts`; error/empty states на `/analytics`.
- Home: CTL из `GET /dashboard/home` (`useDashboardTrainingLoad`), без второго параллельного CTL fetch.
- Удалён мёртвый `AthleteDashboardHero.tsx`; исправлена invalidation passive HR (`["analytics", "passive-hr"]`).

**Mobile**

- Facade `mobile/src/analytics/analyticsQuery.ts`; единые React Query keys (`queryKeys.analyticsCtl`).
- Убраны write в `saveAnalyticsCache`; `periodReady` gating; empty states CTL/progress.
- Fix: `initDB` import в `localAnalyticsAdapter.ts`.

### Platform boundaries cleanup (2026-06)

- Metro: `watchFolders` = `shared/` only; blockList `frontend/`, `backend/`, …
- ESLint `no-restricted-imports` mobile ↔ frontend; `npm run check:platform-imports`.
- Удалён orphan UI (mobile: 7 components; desktop: legacy pages/cards, `GpsMap`, deprecated page wrappers).
- Документирована навигация: 6 tabs, embedded `CycleScreen`, reuse `HealthConnectDiagnosticsScreen`.

### Desktop import/warmup (ранее в цикле стабилизации — контракт без изменений в cleanup)

- Pipeline: backup, integrity, indexes, `ANALYZE`, warmup, rollback; UI без технического жаргона warmup.
- Защита от дублей workout tabs (data + UI guard).
- Diagnostics: `GET /api/database/diagnostics/overview`.

### Mobile stabilization (ранее)

- Cardio selector: `бег` / `вело` / `бассейн`; OFF search; sync tab → Settings; `autonomous` без cloud pending banner.
- Исправления food/workouts/start training; HC status в UI.

### Known gaps after cleanup (not fixed in this pass)

- ~~`npm run build` (`tsc -b`) on frontend~~ — resolved in desktop v1 cleanup (2026-06).
- Mobile ESLint errors (~31); часть Jest navigation suites.
- Analytics parity desktop API vs mobile local — open.
- HRV/SpO₂ ingest — not shipped.

### Documentation consolidation (2026-06, earlier)

- Сокращена структура docs до основных файлов + [docs/archive/](./archive/)
- Слиты дубли: analytics pipeline, UI/settings, parity, limitations
- Обновлены ROADMAP, PROJECT_CONTEXT, ARCHITECTURE; корневой README — карта документации

### Desktop — dashboard v2 and settings hub (2026-05-30)

- **Dashboard v2** (`/home`): hero, 6 metric tiles, «Сегодня», training load card, quick actions, integrations panel
- **Settings redesign:** 9 tabs — Profile, Connections, Data & Import, Sync, Analytics, Nutrition, Bike, Interface, About (+ Developer Tools)
- Legacy URLs: `?tab=sync_cloud` → `sync`, `integrations` → `connections`
- **Health Connect** hub `/health-connect` (steps, sleep, vitals)
- **FormaSync UX:** progress overlay on sync/upload/download

### Analytics — training load parity

- Unified **CTL/ATL/TSB** via `useCtlAtlTsb()` (default **90** days)
- Home labels: Нагрузка=CTL, Усталость=ATL, Баланс=TSB
- **TRIMP сегодня** from daily `items[]`, not `current.trimp` (last workout)
- Dashboard home `_ctl_block` window 21 → **90** days
- Docs: [ANALYTICS.md](./ANALYTICS.md) (pipeline в основном файле)

### Documentation refresh (2026-05-30)

- Rewritten: [DESKTOP_UI.md](./DESKTOP_UI.md), [MOBILE.md](./MOBILE.md), [ANALYTICS.md](./ANALYTICS.md)
- Expanded: [HEALTH_CONNECT.md](./HEALTH_CONNECT.md), [FORMA_SYNC.md](./FORMA_SYNC.md)
- Вспомогательные файлы позже перенесены в [archive/](./archive/) (SETTINGS, UI_GUIDELINES, MOBILE_PARITY, ANALYTICS_ARCHITECTURE)
- Root [README.md](../README.md) and [docs/README.md](./README.md) index updated

### Mobile — autonomous and operating modes

- Режимы `autonomous`, `cloud`, `legacy_api`, `local_hc_test` ([`operatingMode.ts`](../mobile/src/mode/operatingMode.ts))
- Вход Яндекс без ПК; local-first UI paths ([MOBILE.md](./MOBILE.md))

### Mobile — FormaSync v1

- `FormaSyncEngine`, `packageApplier` with safe per-line JSONL and structured SHA/schema errors
- `fetchRemoteManifestDetailed` — missing vs invalid manifest messages
- Revision bump only on full successful apply
- Background task `forma-sync-background` (~240 min), battery gate on FormaSync
- Desktop participant: `backend/routers/forma_sync.py` ([FORMA_SYNC.md](./FORMA_SYNC.md))

### Mobile — sync UX and reliability

- `manualSyncNow` → `{ ok, message }`; banner shows truncated `last_error`
- `syncOrchestrator` try/catch on `processQueue` / `refreshBannerCounts`
- `OfflineContext`: DB init mutex, `DbInitErrorBanner`, guard sync when `!dbReady`
- Conflict pilot: `conflictResolution.ts` for `food_entries`

### Mobile — Health Connect local pipeline

- Background collector `hc-background-collector` (60 min, WorkManager via Expo)
- Tables `hc_records`, `hc_day_metrics`, `hc_sync_runs`
- HR continuous samples + `heartRateNormalize` dedupe; incremental window 36h + 4h overlap
- Hub `HcHubScreen`, `HcTrendsPanel`; `permission_denied` path; stale provider badges 48h

### Mobile — release hardening v1

- Developer mode (`app:developer_mode`, 7 taps on version)
- Transactional ZIP backup import; narrowed migration catch; `schema_version` in `sync_meta`
- [RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md)

### Documentation (2026-05-30)

- Docs refresh: mobile autonomy, HC local pipeline, FormaSync, limitations, roadmap

### Schema v50–v55 (desktop)

- **v50:** HC sync log audit columns (`audit_json`, `mobile_audit_json`, `device_label`)
- **v51–52:** `strength_hr_block_overrides` + training signal columns
- **v54:** Source resolver (`workout_source_contributions`, `workout_source_links`, `source_priority_prefs`)
- **v55:** Strength HR mappings (`strength_hr_block_mappings`, `strength_hr_session_meta`)

### Strength HR analytics v4

- Cross-session `/api/strength/hr-analytics/*` + overview endpoint
- «Подходы верны» verified mappings
- Analytics sub-tab «Пульс в силовых»

### Analytics performance

- Lazy-load sections on `/analytics` (`useAnalyticsSectionActive`)
- Single-pass HR overview; TRIMP dedupe

### Source resolver v1

- Effective source per metric; HC write protection; diagnostics panel

### Health Connect hub

- Production page `/health-connect`; `GET /api/sync/health-connect/hub`

### Documentation (2026-05-30)

- Full docs refresh: `HR_ANALYTICS.md`, `IMPORT_SYSTEM.md`, `SOURCE_RESOLVER.md`, `DESKTOP_UI.md`, `CURRENT_LIMITATIONS.md`, `DEVELOPER_TOOLS.md`

---

## [Previous Unreleased notes — shipped]

### Dashboard и Health Connect

- **Главная `/home`:** companion-карточки (нагрузка, питание сегодня, шаги, тело, интеграции, сон)
- **HC debug:** подвкладка в Настройках → Синхронизация; `GET /api/sync/health-connect/debug`
- **HC sync log:** таблица `health_connect_sync_log` (v48)

### Питание (UI и прогноз)

- **Danger deficit:** прогноз при `deficit_status: danger` — HTTP 200, capped projection + красный баннер и график (не fatal 400)
- **Forecast readiness:** скан до 8 недель назад; `GET /nutrition/forecast-readiness`; инвалидация кэша при сохранении дня
- **WeeklyDeficitSection:** убран дублирующий 7-дневный mini-strip; только `CutDeficitControlPanel` / `BulkGainGoalPanel`
- **Подсветка «Сегодня»:** мягче в карусели недели
- **Редактирование записей дня:** desktop drawer + portal `ModalFrame` на `document.body`
- **`default_portion_g`** в справочнике продуктов (v49)

### Тренировки

- **Разминка:** флаг `is_warmup` у силовых подходов
- **Фильтр периода:** подписи «3 месяца» вместо «Последние 3 месяца»

### Документация

- Новые: `HEALTH_CONNECT.md`, `ANALYTICS.md`, `ROADMAP.md`
- Полное обновление каталога `docs/` под схему v49 и текущий UI

### Мобильное (Android, LAN)

- Вход **admin** по Wi‑Fi (`user_id=1`), настройка URL API в приложении
- Forma: переключатель **«API для телефона»** (`0.0.0.0` + QR)
- `start.ps1 -MobileLan` / `-BindApiHost 0.0.0.0` — строки Mobile API в консоли

### Десктоп (Electron)

- Режим LAN: `start.ps1 -DesktopLan` — не перезапускает встроенный API на порту 8002
- Починка legacy-колонок в `shared.db` при каждом подключении (`repair_shared_schema`)
- Логи API в `%APPDATA%\Forma\logs\api.log` при packaged-режиме

### Polar

- Расширенный разбор среднего/макс. пульса (`heartRate`, `average-heart-rate`, расчёт из samples)

### Исправлено

- **Polar attach (силовые):** `POST /api/strength/{id}/attach-polar` перезаписывает `avg_hr` и `calories_chest` на всех строках сессии, если Polar вернул значения (приоритет Polar). Кардио по-прежнему заполняет только пустые поля.
- **Очистка дня питания:** `DELETE /api/food/entries?date=YYYY-MM-DD&phase=cut|bulk` — без 500, удаление scoped по `user_id`, ответ `{ deleted, date, phase, message }`.
- **Применение рациона:** корректный `day_offset` для недельных рационов; КБЖУ и клетчатка не перемешиваются между днями (live JOIN + snapshot refresh).
- **Схема v047:** снят legacy FK `food_entries.product_id → main.food_products` (после split в `shared.db`).
- **Даты питания:** будущие даты разрешены для apply-meal-plan и food entries (`_normalize_food_date`); исправлен 422 при «Применить расписание на неделю» на Sat/Sun.

### Документация

- `DESKTOP_IMPROVEMENTS.md`, обновление всего каталога `docs/`

---

## [1.0.0] — 2026-05 — Forma Desktop (Electron)

### Добавлено

- Десктопное приложение **Forma** (Electron + встроенный `backend.exe`, NSIS)
- Локальный вход admin без облака
- Кастомная title bar
- Запуск внешнего dev-сервера для LAN (`start.ps1` из настроек)
- Убийство зомби `backend.exe` при старте, retry порта 8002

### Питание

- Микронутриенты: `/food/micros`, цели, недельная сводка
- Клетчатка `fiber_g` в продуктах и дневнике
- Флаг `is_alcohol` у продуктов
- Open Food Facts: поиск по штрихкоду, кэш `openfoodfacts_cache`, вклад в каталог

### Питание / прогноз

- Динамический прогноз сушки `POST /api/nutrition/forecast/dynamic`
- Лимиты дефицита (safe / physiological) в профиле
- Калибровка калорий браслета: `calibration-factor`, `recalculate-calibration`
- `daily_bracelet_calories` в аналитике

### Тренировки

- Группировка подходов: `order_index`, `is_circuit` в силовых
- Оценка мощности вело: `power_source` (`real`, `estimated_advanced`, `estimated_basic`)

### Растяжка

- Иллюстрации `images_json` (free-exercise-db)
- Загрузка картинок в UI, редактирование упражнений в UI
- Удалён JSON-импорт из UI

### Polar / пользователи

- Таблица `users`, OAuth Yandex/Google
- Polar per-user: `polar_tokens.local_user_id`, `polar_pending_workouts.local_user_id`

### Мобильное (Android)

- React Native, Health Connect (`POST /api/sync/health-connect`)
- OAuth, офлайн-кэш → тот же API

### Облако

- Yandex Disk / Google Drive: бэкап, восстановление, авто-бэкап

---

## [0.x] — до Electron (веб-only)

- Миграция UI Streamlit → React + FastAPI
- Polar AccessLink, FIT Coospo, attach HR/GPS
- Пресеты, кардио, растяжка, менструальный цикл
- Единицы UI `metric` / `american`
- Excel-импорт перенесён в `archive/excel_import/`

---

## Как обновлять этот файл

При релизе десктопа или крупной фиче:

1. Перенести пункты из `[Unreleased]` в новую секцию с версией и датой.
2. Указать номер сборки (`release33`, …) в примечании к десктопу при необходимости.
3. Перегенерировать Word: `.\venv\Scripts\python.exe scripts\generate_docx_docs.py`
