# KNOWN_ISSUES.md

Актуальные ограничения Forma. Backlog — [ROADMAP.md](./ROADMAP.md), release gates — [RELEASE_READINESS.md](./RELEASE_READINESS.md).

Last updated: **2026-06-05**.

---

## P0 / Critical

| Проблема | Где | Статус | Workaround |
|----------|-----|--------|------------|
| Body measurements chart/history edit crash | `/body`, measurements chart/history edit action | **Open** | Do not edit measurements from chart/history view until fixed; use safe entry/edit flow if available |

Expected: measurements should be editable directly from chart/history without crashing.

---

## P1 / High

| Проблема | Где | Статус | Workaround |
|----------|-----|--------|------------|
| Exercise template creation loses block structure | Workout exercise templates / sets | **Open** | Manually repair in Block Structure editor |
| Goal deficit validation rejects >60 kcal/kg fat | Nutrition / goal system | **Open** | Keep value ≤60 until frontend/backend/schema limit is fixed |
| Health Connect validation incomplete | Mobile HC, desktop hub, sync | **Open** | Use HC diagnostics and verify source app sync manually |
| FormaSync validation incomplete | Desktop/mobile cloud sync | **Open** | Avoid simultaneous edits to same entity; inspect sync status/errors |
| Historical Xiaomi/Mi import | Import tools | **Planned** | No production import yet |

Exercise template expected behavior: preserve block order, block names, exercise assignments and generated workout structure. Current behavior may merge exercises into one block, lose names and require manual repair.

Historical Xiaomi import details: [HISTORICAL_IMPORTS.md](./HISTORICAL_IMPORTS.md).

Goal deficit expected behavior: values up to **70 kcal/kg fat** should save successfully; values above 70 should be rejected with a user-friendly validation message. Current behavior rejects values above approximately 60 with HTTP 422. Investigation must verify frontend validation limits, backend validation limits, API schema constraints and settings persistence logic.

---

## Medium

| Проблема | Где | Статус | Workaround |
|----------|-----|--------|------------|
| ~~После cloud restore / replace import — «Пользователь не найден»~~ | `POST /api/cloud/backup/restore`, desktop replace | **Resolved (2026-06-03)** | Reconcile к session `user_id`; см. [DATABASE.md](./DATABASE.md) |
| Импорт очень больших БД долгий / чувствителен к I/O | Desktop import/warmup | **Partial → improved (v0.54)** | **Replace** для БД >150 МБ; poll 300s; `status.json`; не считать stall ошибкой |
| Расхождение analytics desktop vs mobile | Desktop API vs local compute | Open | Для CTL/TRIMP сверять desktop `GET /api/analytics/ctl`; mobile — local-first |
| `legacy_api` vs ожидания автономного режима | Mobile | Open | Проверить operating mode перед triage |
| HC background нерегулярный | Mobile (OEM/battery) | Open | Ручной sync в HC |
| OFF неполные/шумные данные | Mobile food | Open | Ручная коррекция продукта |
| FormaSync conflict UX узкий | Desktop/Mobile | Open | Pilot только `food_entries`; избегать параллного редактирования |
| Warmup долгий после крупного импорта | Desktop | Partial fix | Отдельный прогрев; увеличенные таймауты на lock |
| ~~Desktop `npm run build` (`tsc -b`) падает~~ | Frontend | **Resolved (2026-06 desktop v1 cleanup)** | `npm run build` / `check:desktop-build` green |
| Mobile ESLint errors | Mobile | Open | ~31 error (pre-existing); `bundle:check` OK |
| Mobile Jest navigation suites | Mobile tests | Open | Часть suites fail в RN env; unit-тесты analytics/engine — отдельно |
| HR graph manual point editing | Workout HR graph editor | Low / Open | Do not use manual HR point editing; graph display/import works |

---

## Cosmetic

| Проблема | Где | Статус |
|----------|-----|--------|
| Рассинхрон текстов/лейблов | Desktop/Mobile | Open |
| Разная детализация статусов | Settings / sync / HC | Open |

---

## Продукт и безопасность

| Issue | Notes |
|-------|-------|
| Нет hosted deploy | Vite + API или Forma.exe |
| `X-User-ID` без JWT | Не для публичного multi-tenant |
| Single-user default | `user_id=1` в большинстве настроек |

---

## Data scope (Yandex OAuth)

**Symptom:** OAuth создал `users.id` ≥ 2, история на `user_id=1`.  
**Fix:** login с `link_user=1` или Developer Tools → **Data scope** → rebind.

**Resolved (v62–v65):** cardio TRIMP/CTL, steps, bracelet calories, HC sync log, meal plans — по `X-User-ID`. Рационы не клонируются с user 1.

---

## Health Connect

| Issue | Notes |
|-------|-------|
| Mi Fitness lazy sync | Сначала sync в источнике → HC → Forma |
| Step double-count | Несколько HC records за день суммируются |
| HR gaps | Нет minute aggregates у всех провайдеров |
| Background delay | OEM battery / WorkManager |
| HRV / SpO₂ / stress | Placeholder в hub — **ingest not shipped** |
| Recovery engine | Сон partial; нет HRV readiness |
| Validation open | Sleep, HR, steps and calories need device/provider validation |
| Source attribution open | Need final provider priority/dominant-source rules |
| Conflict resolution open | HC vs FIT/Polar/manual ownership must be verified after sync |

---

## Analytics

| Issue | Notes |
|-------|-------|
| CTL только кардио TRIMP | Силовые не в CTL/ATL/TSB |
| **Resolved (2026-06):** зависание CTL на пустой БД | Guards + `analytics_query`; TRIMP refresh только при missing > 0 |
| Strength HR approximate | Пики ≠ границы подходов |
| HR overview cap | 100 sessions per request |
| Короткое окно CTL | <90 дней — использовать 90d default |
| Дублирующая логика desktop/mobile | `recoveryAdvice`, week utils — не в `shared/` yet |
| Automatic calibration scheduling | Manual/adaptive foundation exists; 14-day automatic workflow planned |

---

## Desktop

| Issue | Notes |
|-------|-------|
| Schema migrations | Auto on startup; `SCHEMA_VERSION` **74**; `%APPDATA%\Forma` repair |
| No electron-updater | Ручная переустановка |
| Packaged API port | Default **18002** |
| Cold UI после импорта | **Настройки → Бэкап → Прогрев данных** |
| Удалённые legacy routes | Только redirect — не восстанавливать как страницы |
| **Resolved:** body history cramped @1680 | History always below chart; collapsible row |
| **Resolved:** `strength_hr_session_meta` UNIQUE on import | Idempotent merge + dedup |

---

## Workouts

| Issue | Notes |
|-------|-------|
| CTL не учитывает силовые блоки | By design: CTL = cardio TRIMP only |
| Template values are fallback | Last actual workout values win for weight/reps/sets/warmup |
| Exercise template creation can lose block structure | P1 open; preserve order, names, assignments, generated structure |
| Catalog delete for used exercise | Soft archive only; history remains unchanged |
| **Resolved:** Polar HR graph missing with `sample-type: 0` | AccessLink can provide HR series in `samples[].data`; parser now uses content-based HR detection and saves points to `workout_heart_rate` |

---

## Mobile

| Issue | Notes |
|-------|-------|
| Нет FIT/import/warmup desktop DB | By design |
| Food forecast UI | Desktop only |
| Strength HR analytics tab | Desktop only |
| **Resolved:** SQLite `duplicate column trigger_type` | PRAGMA + `ensureColumn` |
| **Resolved:** Yandex OAuth cancel Android | Intent filter + redirect — [CLOUD_SYNC_ANDROID.md](../mobile/CLOUD_SYNC_ANDROID.md) |
| **Resolved:** вечная загрузка после миграций | Deadlock `setMeta`; timeout; `DataStateShell` |

---

## Stubs

| Issue | Notes |
|-------|-------|
| Historical Xiaomi import | Planned P1; see [HISTORICAL_IMPORTS.md](./HISTORICAL_IMPORTS.md) |

---

## Verification gaps (2026-06-02)

Автоматически проверено: `check:platform-imports`, `check:desktop-build` (`tsc -b` + vite), mobile `bundle:check`, pytest `test_analytics_query_empty`, `test_database_import_tasks` (strength_hr meta).

**Не проверено в CI/agent:** полный EXE smoke — см. [RELEASE_READINESS.md](./RELEASE_READINESS.md).

---

## Reporting

Новое ограничение: строка здесь + при необходимости пункт в ROADMAP.
