# MOBILE.md

Android-клиент Forma (React Native). После Desktop RC desktop считается близким к feature-complete, а mobile — основной активный продуктовый фокус. Цель: самостоятельное daily-driver приложение, а не простое companion-приложение к desktop.

Last updated: **2026-06-09**.

---

## Позиционирование

| Было (устаревшее ожидание) | Сейчас |
|------------------------------|--------|
| «Mobile = урезанный companion» | **Отменено**; mobile должен закрывать ежедневные сценарии автономно |
| «Mobile должен копировать desktop UI 1:1» | Не цель; нужна near feature parity по ежедневным возможностям, но mobile-native UX |
| Desktop = единственный daily-driver | Desktop остаётся reference для import/deep analytics; mobile становится active development priority |
| Одинаковые экраны | Разные деревья UI (`mobile/src` ≠ `frontend/src`) |

Desktop-only возможности: [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md), [ARCHITECTURE.md](./ARCHITECTURE.md).

---

## Статус по доменам (текущий клиент)

| Домен | Статус | Комментарий |
|-------|--------|-------------|
| Запуск | Working | Startup watchdog, DB init |
| Dashboard | Partial | Needs near desktop everyday summary coverage |
| Workouts | Partial | Workout execution, set entry, weight entry and cardio entry are required |
| Cardio types | Partial | Running, cycling, swimming; swimming must support SWOLF |
| Food | Partial | Daily calorie tracking, OFF integration, food logging |
| Health Connect | Integration / validation | Sleep, HR, steps, kcal and sync behavior need validation |
| Body | Partial | Measurements, history and charts required |
| Analytics | Partial | Must be usable without desktop; no requirement for desktop Plotly/deep parity |
| Cycle | Partial | Available when female profile selected |
| Cloud / sync | Partial | `FormaSyncEngine` + `syncOrchestrator` / queue; conflicts — pilot `food_entries` |

---

## Required Mobile Scope

Mobile completion scope for the current roadmap:

| Домен | Required behavior |
|-------|-------------------|
| Dashboard | Near feature parity for daily status: activity, food, body, workouts, sync/HC health |
| Nutrition | Daily calorie tracking, OpenFoodFacts integration, food logging |
| Workouts | Workout execution, set entry, weight entry, cardio entry |
| Cardio types | Running, cycling, swimming; swimming includes SWOLF |
| Body | Measurements, history, charts |
| Analytics | Accessible without desktop; local-first calculations where possible |
| Cycle | Available when female profile selected |
| Calendar | Week start default is Saturday |
| Health Connect | Stable local ingest, diagnostics and sync/export behavior |
| Sync | FormaSync status, upload/download, conflict visibility appropriate for mobile |
| Units | Respect profile `units_system` where implemented; storage/sync payloads stay metric/SI |

**Остаётся desktop-only for now:** FIT/Polar import pipeline, large DB import/warmup, strength HR deep sub-tab, advanced food forecast UI, developer DB tools, packaged analytics export.

Roadmap приоритеты: [ROADMAP.md](./ROADMAP.md).

---

## Operating modes

| Mode | Поведение |
|------|-----------|
| `autonomous` | Локальная БД; без cloud pending banner |
| `cloud` | Local DB + FormaSync |
| `legacy_api` | REST к ПК (`SyncService`) |
| `local_hc_test` | QA HC |

---

## Units and profile sync

Desktop backend exposes `user_profile.units_system` as `metric` / `american`. The current desktop frontend uses `frontend/src/utils/americanUnits.ts` for presentation/input conversion while database columns remain metric (`kg`, `cm`, meters, seconds).

Mobile should treat unit preference as a user preference, not a storage schema change:

- persist/sync the profile preference through FormaSync when user preferences are included;
- keep local domain values metric/SI internally;
- convert at UI boundaries only;
- avoid reintroducing removed aliases such as `imperial` unless a migration/compatibility plan is added.

---

## Навигация (6 tabs)

[`mobile/src/navigation/routes.ts`](../mobile/src/navigation/routes.ts):

| Tab | Screen |
|-----|--------|
| Dashboard | `HomeScreen` |
| Workouts | `WorkoutsStack` |
| Food | `FoodScreen` |
| Analytics | `AnalyticsScreen` (+ embedded `CycleScreen`) |
| HealthConnect | `HcStack` |
| Settings | `SettingsStack` (sync hub, cloud advanced) |

Sync **не** отдельная bottom tab — только Settings.

---

## Platform isolation

- Metro: `shared/` only; block `frontend/`, `backend/`
- `npm run check:platform-imports`
- Analytics: `analyticsQuery.ts`, `queryKeys.analyticsCtl(days)`

См. [PLATFORMS.md](./PLATFORMS.md), historical cleanup notes in [archive/CLEANUP.md](./archive/CLEANUP.md).

---

## Remaining Gaps vs Target Scope

- Dashboard needs full daily summary validation.
- Nutrition needs robust food logging/OFF UX validation.
- Workout execution and template/preset flows need mobile-native completion.
- Swimming/SWOLF is required but not considered validated.
- Body charts/history/editing need validation.
- Analytics must work without desktop; local numbers may still diverge from desktop API.
- Future analytics should include explainable metric cards and recovery-aware interpretation after HC/sync validation; this is planned, not implemented.
- Cycle visibility must depend on female profile.
- Saturday week start: implemented in `mobile/src/utils/formaWeek.ts` (`formaWeek.test.ts`); needs device QA.
- Recovery analytics: `analytics-engine/recovery.ts` stub exists; no UI yet.
- Health Connect and FormaSync require end-to-end validation.

Expected desktop-only gaps remain: FIT/Polar import, large DB import/warmup, strength HR deep analytics, developer tools.

---

## Сборка

```powershell
cd mobile
npm run bundle:check
npm run android:release
```

Release checklist: [mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md).

---

## Известные нестабильности

[KNOWN_ISSUES.md](./KNOWN_ISSUES.md) — HC background, `legacy_api`, OFF, FormaSync conflicts.
