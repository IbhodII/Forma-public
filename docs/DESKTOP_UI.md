# DESKTOP_UI.md

Desktop UI Forma: browser dev (Vite) и packaged Electron. Состояние Desktop RC после responsive polish, workout blocks, catalog hygiene and OAuth fixes.

Last updated: **2026-06-05**.

---

## Data hub — backup / restore (release)

Settings → **Данные**:

| Panel | Desktop release | Admin / dev |
|-------|-----------------|-------------|
| **Резервные копии** | Создать ZIP + восстановить из ZIP | + scheduled folder backup |
| **Импорт и экспорт** | FIT/GPX only | + DB import, JSON, mini DB (Developer Tools) |
| **Расширенное** | Скрыто | Admin или dev-tools toggle |

Автовход: `desktop_app` вызывает `POST /api/auth/desktop-login` при старте без сессии (`AuthContext`).

Чеклист: [`RELEASE_READINESS.md`](./RELEASE_READINESS.md).

---

## Desktop UX principles

1. **Laptop-first** — layouts не ломаются на 1280–1440px; ultra-wide улучшает, а не сжимает medium.
2. **Fluid data, narrow forms** — таблицы/графики `fluid`; ввод и wizard — `medium`/`narrow`.
3. **Не sidebar ради ширины** — история замеров и вторичные панели не уезжают в узкую колонку на laptop.
4. **Один источник правды для CTL на home** — `useDashboardTrainingLoad`, без второго CTL fetch.

---

## Wide / responsive layout

Токены: [`frontend/src/styles/desktop-layout.css`](../frontend/src/styles/desktop-layout.css).

| Breakpoint | Tailwind | `--desktop-content-max` (типично) |
|------------|----------|-----------------------------------|
| Desktop | `lg` 1024px | 92rem |
| Wide | `wide` 1440px | 96rem |
| Ultra-wide | `ultrawide` 1920px | 112rem |
| Super-wide | `superwide` 2560px | 120rem |

Дополнительные domain breakpoints (CSS modules): **1200**, **1536**, **1680** — food week grid, body weight/steps, goal projection (см. `food-diary-layout.css`, `body.css`, `body-layout.css`).

`AppPageShell`: `fluid` | `wide` | `medium` | `narrow`.

| Route | Layout (актуально) |
|-------|---------------------|
| `/home` | 2-col @wide; hero grid 4→6 cols |
| `/analytics` | Multi-col @wide; strength HR aside @ultrawide |
| `/workouts` | Fluid; catalog 4-col @ultrawide |
| `/food` | Week 7-col @1200px; goals side-by-side @1440px; today card **black border** |
| `/body` | Hub tabs (см. ниже); metrics: chart full width, history below |
| `/settings` | Sidebar + main; grid @ultrawide |
| `/cycle` | Calendar + insights lg grid |

Проверка: `npm run build`; `npm run check:desktop-build`.

---

## Маршруты (React Router)

Активные пути в [`frontend/src/App.tsx`](../frontend/src/App.tsx):

| Path | Страница |
|------|----------|
| `/home` | Dashboard v2 |
| `/workouts` | Workouts (strength + cardio + exercises) |
| `/stretching`, `/stretching/session/:id` | Растяжка |
| `/body` | Тело (hub, см. ниже) |
| `/food/*` | Питание |
| `/analytics` | Аналитика |
| `/health-connect` | HC hub (guard) |
| `/cycle` | Цикл (guard) |
| `/settings` | Settings hub |
| `/my-bike` | Bike |

Legacy URLs → redirect только ([`legacyRedirects.ts`](../frontend/src/routes/legacyRedirects.ts)); удалённые page modules (`CardioPage`, `AnalyticsPage`, …) **не** монтируются.

Sidebar: [`Layout.tsx`](../frontend/src/components/Layout.tsx) — HC tab скрывается если `!enableHealthConnectNav`.

---

## `/body` hub (Health / Body)

Вкладки: [`bodyHubConstants.ts`](../frontend/src/pages/Body/bodyHubConstants.ts)

| Tab id | UI |
|--------|-----|
| `overview` | Сводка, мини-тренды, ссылки на подвкладки |
| `metrics` | **Контрольные замеры** — `Body.tsx` |
| `weight` | Ежедневный вес |
| `steps` | Шаги |
| `sleep` | Сон |
| `pulse` | Пульс |
| `activity` | Активность |
| `health-connect` | HC summary (также `/health-connect`) |

**Контрольные замеры (`metrics`):**

- Динамика: график **на всю ширину** панели во всех режимах.
- История замеров: **всегда под графиком** (нет side-by-side @1680).
- Строка списка: chevron + дата + 8 ключевых метрик (как compact row).
- Раскрытие: секции `BODY_DETAIL_SECTIONS` + «Полные детали» → modal.

**Ежедневный вес / шаги:** chart + sidebar/table с **1536px** (`body-layout.css`).

---

## Что стабильно

- Shell, dashboard v2, workouts/food/body hub/analytics
- Settings hub (import, sync, connections, analytics prefs)
- Workouts: compact normal exercises, expandable supersets/circuits for current workout data, separate structure editor for block layout
- Exercise set editor: simple list by default; structure mode shows only block organization and autocomplete
- Exercise catalog management: edit/delete/archive without touching workout history
- Training load на home из **одного** запроса dashboard home (`useDashboardTrainingLoad`)
- Responsive pass: medium desktop не cramped; wide не режет history

---

## Workouts UI

Route: `/workouts`.

| Surface | Behavior |
|---------|----------|
| Workout modal simple view | Normal exercises are editable cards; supersets/circuits are compact and expandable |
| Expanded superset/circuit | Edit weight, reps, warmup and working sets for current workout only |
| Structure mode | Changes block type/order/rounds/exercise composition; not needed for routine set edits |
| Exercise set editor | `Простой список` by default; `Структура блоков` is compact and does not show weight/reps |
| Catalog panel | Add/remove exercise from current set; edit/delete catalog entry safely |

Details: [WORKOUTS.md](./WORKOUTS.md).

---

## Analytics UI (2026-06)

- Hooks: [`useAnalyticsQueries`](../frontend/src/hooks/analytics/useAnalyticsQueries.ts)
- Lazy sections: `useAnalyticsSectionActive` (layout не переписывали)
- Error states: TRIMP, zones, passive HR, sleep
- Home: убран параллельный `useCtlAtlTsb()` — CTL из `useDashboardHome` + cache seed `queryKeys.ctlAtlTsb(90)`

---

## Import / warmup UI

Поток: Settings → Data/Backup → import → poll → warmup.

- Пользовательские подписи этапов (не «Warmup include vacuum» в основном UI)
- Долгие job через Electron IPC + backend poll (**300s** timeout, retry на `db_locked` / `import_in_progress`)
- Modal overlay: `pending`, `backup_current`, `running` (не только running)
- Большая БД (>150 МБ): подсказка **Replace**, merge disabled; stall warning >10 мин без fail
- Desktop staging: IPC `database-import-stage-progress` (копирование / распаковка до `attachJob`)
- Diagnostics panel: counts / `activeDbPath` после data-layer cleanup

**v0.54:** стабилизация large DB import (replace-first, WAL, persisted `status.json`) — см. [DATABASE.md](./DATABASE.md).

---

## Удалённый мёртвый код (2026-06)

Примеры (0 importers):

- `pages/CardioPage.tsx`, `pages/Analytics/AnalyticsPage.tsx`
- Pre-dashboard cards: `pages/Home/components/*Card.tsx` (7 файлов)
- FoodDiary premium orphans, `GpsMap`, `ActiveMarker`, `HcDebugSection`, `StrengthProgressTable`
- Re-export shells: `BodyMetricsView`, `MealPlansTab`, `SyncAndCloudSettings`

Deprecated wrappers removed: `StrengthPage`, `WeightPage`, `ProfilePage` exports — остались `*Section` для `WorkoutsPage` / `BodyPage`.

---

## Тема

Канонические токены: `--app-*` в [`frontend/src/index.css`](../frontend/src/index.css).  
UI primitives: [`frontend/src/components/ui/`](../frontend/src/components/ui/).

---

## Electron

- User data: `%APPDATA%\Forma`
- Embedded API: `backend.exe`, порт по умолчанию **18002**
- Сборка: `cd frontend && npm run desktop:dist`
- `npm run desktop:dev` — запуск Electron (нужен собранный `dist` или dev workflow)

### OAuth (Яндекс / Google)

Packaged desktop uses `client_mode=desktop_app` on `/api/cloud/auth/*` so the callback HTML does **not** navigate to `myhealthdashboard://` (unregistered in Electron — popup hang). Result delivery: `postMessage` + main-process IPC (`oauth-popup-result` after `/api/cloud/callback/*`).

On first start, `%APPDATA%\Forma\.env` gets `YANDEX_REDIRECT_URI`, `GOOGLE_REDIRECT_URI`, and `PUBLIC_API_BASE_URL` aligned to the actual API port when missing or port-mismatched.

Register the same callback URL in [oauth.yandex.ru](https://oauth.yandex.ru): `http://127.0.0.1:{port}/api/cloud/callback/yandex` (`127.0.0.1` ≠ `localhost`). Diagnostics: `GET /api/cloud/oauth-debug` (desktop + admin browser).

---

## Сборка и проверки

| Check | 2026-06 |
|-------|---------|
| `npm run build` (`tsc -b` + vite) | OK (2026-06 desktop v1 cleanup) |
| `npm run desktop:dev` | Electron starts (manual UI smoke recommended) |

---

## Regression risks

- Дубли preset tabs (миграция + dedup — не отменять)
- Параллельный import + warmup без lock awareness в UI
- Не восстанавливать удалённые legacy routes как реальные страницы
