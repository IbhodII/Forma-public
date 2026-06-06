# Mobile ↔ Desktop functional parity

Last updated: 2026-05-30. Scope: pragmatic feature matrix (Polar/FIT/GPS remain PC-primary by design).

Legend: **full** | **partial** | **missing** | **N/A** (desktop-only by design)

---

## Summary: who has what

| Category | Desktop-only | Mobile-only | Shared |
|----------|--------------|-------------|--------|
| **Import** | FIT files, Polar deep config | HC background collector 60 min | FormaSync, food, workouts |
| **Analytics** | Strength HR sub-tab, lazy sections | — | CTL/ATL/TSB, TRIMP, strength charts |
| **HC** | Hub read from `workouts.db` | Local SQLite + SDK collect | `hc_days` in FormaSync |
| **Settings** | 9-tab sidebar hub | Tab bar + Sync stack | Profile, nutrition, bike, interface |
| **Sync** | Embedded API always on | `autonomous` without PC | FormaSync Yandex |

---

## Analytics parity

| Capability | Desktop | Mobile | Status |
|------------|---------|--------|--------|
| CTL / ATL / TSB | `/analytics`, `useCtlAtlTsb(90)` | `LoadAnalyticsSection`, period selector | **full** |
| CTL window on **home** | 90 days default | `useHomeCompanion` — align with 90d (see code) | **partial** — verify `fetchCtlAtlTsb` days |
| TRIMP last workout | `CtlCards` `current.trimp` | load section | **full** |
| TRIMP today (daily sum) | `DashboardTrainingLoadPanel` | — | **partial** — desktop home only |
| Recovery advice (TSB + sleep) | `recoveryAdvice.ts` | partial | **partial** |
| Strength HR analytics tab | `/analytics` #strength-hr | — | **missing** |
| Lazy-load sections | IntersectionObserver | load on tab open | **partial** |
| `include_warmup_in_analytics` | `?tab=analytics` | Nutrition settings | **full** |
| Genetic / cycle cards | yes | yes | **full** |

**Rule:** desktop and analytics tab should use the same `days` parameter for CTL; short windows (e.g. 21) inflate CTL — see [ANALYTICS_ARCHITECTURE.md](./ANALYTICS_ARCHITECTURE.md).

---

## Health Connect parity

| Capability | Desktop | Mobile | Status |
|------------|---------|--------|--------|
| HC SDK read | N/A | `HealthConnectService` | **N/A** / mobile |
| Local SQLite `hc_*` | via sync ingest | `hc_records`, `hc_day_metrics` | mobile **full** |
| Background collect 60 min | N/A | `hc-background-collector` | mobile **full** |
| POST to PC API | receives ingest | `legacy_api` | **full** |
| FormaSync `hc_days` | apply package | export package | **full** |
| Hub UI steps/sleep/vitals | `/health-connect` | `HcHubScreen` | **full** |
| HRV / SpO₂ in UI | placeholder | placeholder | **planned** |
| Dashboard steps/sleep tiles | `/home` hero | home companion | **full** |
| Debug diagnostics | Developer Tools + HC debug | developer mode | **partial** |

Roles: [HEALTH_CONNECT.md](./HEALTH_CONNECT.md) — provider (mobile), analytics source (both), fallback (Polar/manual).

---

## Settings parity

| Desktop tab (`?tab=`) | Mobile equivalent | Status |
|----------------------|-------------------|--------|
| `profile` | Profile settings | **full** |
| `connections` | OAuth + cloud in login/sync | **partial** — split across screens |
| `data` | hints / backup import | **partial** — FIT/Polar on PC |
| `sync` | **Sync tab** + FormaSync | **full** |
| `analytics` | Nutrition settings (warmup flag) | **partial** |
| `nutrition` | Nutrition settings | **full** |
| `bike` | Bike settings | **full** |
| `interface` | Interface settings | **full** |
| `about` + Developer Tools | About + 7-tap dev mode | **partial** |

See [SETTINGS.md](./SETTINGS.md).

---

## Sync parity

| Capability | Desktop | Mobile | Status |
|------------|---------|--------|--------|
| FormaSync engine | `backend/services/forma_sync/` | `mobile/src/sync/` | **full** v1 |
| Yandex OAuth | Settings → connections | Login + cloud | **full** |
| Startup auto-download | `on_startup_forma_sync_download` | background task | **partial** |
| Progress UI | `FormaSyncProgressOverlay` | banner / hub | **partial** |
| Conflict resolution UI | limited | `food_entries` pilot | **partial** |
| Legacy LAN full sync | N/A as client | `SyncService` | mobile **full** |
| Whole-DB cloud backup | FormaBackups | optional | **partial** |
| FIT / Polar import | desktop | N/A | **N/A** desktop |

---

## Navigation map

| Desktop route | Mobile equivalent |
|---------------|-------------------|
| `/home` | Tab «Главная» (`HomeScreen`) |
| `/workouts` | Tab «Тренировки» |
| `/stretching` | Workouts / mobility |
| `/body` | Analytics → Body + settings |
| `/food/*` | Tab «Питание» |
| `/analytics` | Tab «Аналитика» |
| `/health-connect` | Tab **Health Connect** |
| `/settings?tab=sync` | Tab **Синхронизация** |
| `/cycle` | Cycle in analytics / settings |

---

## Workouts, Food, Body, Cycle

(See previous matrix — unchanged in substance.)

| Area | Desktop | Mobile | Status |
|------|---------|--------|--------|
| Strength logging | full | full | **full** |
| Cardio + Polar/FIT | full | cardio only | **partial** |
| Food forecast UI | `GoalProjectionPanel` | — | **missing** |
| Cut/bulk danger UI | full | basic week | **partial** |
| Body measurements | full | full | **full** |
| Cycle calendar | `/cycle` | `CycleScreen` | **full** |

---

## Design system

Mobile: `mobile/src/design-system/tokens.ts` — `AppScreen`, `AppCard`, tab bar clearance.  
Desktop: [UI_GUIDELINES.md](./UI_GUIDELINES.md) — `--app-*`, `--dash-*`.

No shared token file; visual parity is intentional similarity, not shared package.

---

## Regression checklist (release)

1. All tabs scroll without content under bottom nav.
2. Strength: create → save → visible on desktop (FormaSync or LAN).
3. CTL on mobile analytics matches desktop for same period (90d).
4. HC: steps after sync appear on desktop hub (legacy or FormaSync).
5. FormaSync: upload on phone → download on desktop (or reverse).
6. Food: product CRUD; day entry.
7. Settings: profile save; API URL ping (`legacy_api`).

Full mobile checklist: [../mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md).  
Desktop smoke: [RELEASE_SMOKE.md](./RELEASE_SMOKE.md).
