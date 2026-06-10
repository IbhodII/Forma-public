# Forma platform boundaries (mobile vs desktop)

Mobile and desktop are **separate client apps**. They share the Python backend API and `shared/i18n` only. Do not import `frontend/src` from `mobile/src` or vice versa.

Last updated: **2026-06-09**.

## Client modes (desktop)

| Mode | Where | Packaging / OAuth |
|------|-------|-------------------|
| `admin_browser` | `start.ps1`, Vite dev | Developer Tools, OAuth debug UI, DB import |
| `desktop_app` | Packaged Forma.exe | Public `.env.desktop.public` only; PKCE for Google/Yandex — [PACKAGING_SECRETS.md](./PACKAGING_SECRETS.md), [AUTH_PKCE_AUDIT.md](./AUTH_PKCE_AUDIT.md) |

See [`frontend/src/config/clientCapabilities.ts`](../frontend/src/config/clientCapabilities.ts).

## Layer map

| Layer | Mobile (`mobile/src`) | Desktop (`frontend/src`) | Shared |
|-------|----------------------|--------------------------|--------|
| UI | `design-system/`, screens | `components/`, `pages/` | — |
| Navigation | React Navigation tabs + stacks | React Router (`App.tsx`) | — |
| Local DB | `database/`, SQLite | — (server DB / import) | — |
| API client | `api/` | `api/` | REST contract (`backend/`) |
| i18n | `i18n/locales.ts` → JSON | `@forma/i18n` alias | [`shared/i18n`](../shared/i18n) |
| Heavy charts | chart-kit, `analytics-engine/` | Plotly, Leaflet, Recharts | — |

**Note:** `VITE_CLIENT_MODE=mobile_app` in the desktop app is unused. The React Native app is not bundled by Vite; see [`frontend/src/config/clientCapabilities.ts`](../frontend/src/config/clientCapabilities.ts) (`admin_browser` / `desktop_app` only).

## Build isolation

- Metro ([`mobile/metro.config.js`](../mobile/metro.config.js)): `watchFolders` = `shared/` only; `blockList` excludes `frontend/`, `backend/`, `e2e/`, `venv/`, `archive/`.
- Lint: [`mobile/.eslintrc.js`](../mobile/.eslintrc.js), [`frontend/eslint.config.mjs`](../frontend/eslint.config.mjs).
- CI script: `npm run check:platform-imports` ([`scripts/check-platform-imports.mjs`](../scripts/check-platform-imports.mjs)).

## Mobile navigation

### Bottom tabs (`TAB` in [`mobile/src/navigation/routes.ts`](../mobile/src/navigation/routes.ts))

| Tab | Screen / stack | Icons [`tabBarIcons.ts`](../mobile/src/navigation/tabBarIcons.ts) |
|-----|----------------|---------------------------------------------------------------------|
| Dashboard | `HomeScreen` | yes |
| Workouts | `WorkoutsStack` | yes |
| Food | `FoodScreen` | yes |
| Analytics | `AnalyticsScreen` | yes |
| HealthConnect | `HcStack` | yes |
| Settings | `SettingsStack` | yes |

### Stacks

- **WorkoutsStack:** home, history, session detail, record, cardio detail, stretching session.
- **SettingsStack:** settings home, HC diagnostics, sync hub, `CloudSyncAdvanced` (single cloud screen; no duplicate `CloudSync` route).
- **HcStack:** hub + HC diagnostics (same diagnostics component as settings path).

### Root-only screens (not on a tab)

- `LoginScreen`, `StartupRecoveryScreen` — [`App.tsx`](../mobile/App.tsx).
- `LocalHcTestStack` — when `isLocalHcTestMode`.

### Embedded (no tab)

- `CycleScreen` — only via [`AnalyticsCyclePanel`](../mobile/src/components/analytics/AnalyticsCyclePanel.tsx) on Analytics.

### Shared screen component (intentional)

`HealthConnectDiagnosticsScreen` is registered in **HcStack**, **SettingsStack**, and **LocalHcTestStack** — one implementation, three entry points.

## Desktop navigation

See [`frontend/src/App.tsx`](../frontend/src/App.tsx) and [`legacyRedirects.ts`](../frontend/src/routes/legacyRedirects.ts). Legacy paths (`/strength`, `/cardio`, …) redirect only; they do not mount removed page modules.

## Future shared logic

New cross-platform **pure TypeScript** (no RN/DOM) may go under `shared/` with tests. Do not copy the same helper into both `mobile/src/utils` and `frontend/src/utils`. Do not move Plotly, Electron, or `analytics-engine` into shared in boundary PRs.
