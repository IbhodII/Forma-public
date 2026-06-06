# Settings architecture

Архитектура экрана **Настройки** на desktop Forma: sidebar hub, URL-driven tabs, разделение подключений / данных / синхронизации.

**UI entry:** `/settings`  
**Code:** `frontend/src/pages/SettingsPage.tsx`, `frontend/src/modules/settings/`

Last updated: 2026-05-30.

---

## Purpose

Раньше импорт, облако и синхронизация были в одной вкладке. Сейчас:

- **Подключения** — OAuth и статус интеграций
- **Данные и импорт** — FIT, Polar, файлы
- **Синхронизация** — FormaSync, бэкап, приоритет источников
- **Developer Tools** — LAN, debug (не в production sidebar)

---

## Sections

| Tab ID | UI (RU) | Component | Responsibility |
|--------|---------|-----------|----------------|
| `profile` | Профиль | `ProfileSettingsHub` | Display name, account, logout, sync status pills |
| `connections` | Подключения | `ConnectionsSettings` | Yandex/Google OAuth, Polar link, cloud connection cards |
| `data` | Данные и импорт | `DataImportSettings` | FIT import, Polar upload, data management |
| `sync` | Синхронизация | `SyncSettings` | FormaSync panel, cloud backup, source priority (collapsible) |
| `analytics` | Аналитика | `AnalyticsSettings` | `include_warmup_in_analytics`, analytics prefs |
| `nutrition` | Питание | `GeneralSettings`, `NutritionSettings` | Goals, cut/bulk, week start |
| `bike` | Велосипед | `BikeSettingsForm` | Bike profile, power estimation |
| `interface` | Интерфейс | `InterfaceHub` | Theme (light/dark/system), units |
| `about` | О приложении | `SupportProjectSettings`, `CycleHealthSettings`, `DeveloperToolsSettings` | Support, cycle (if enabled), **Developer Tools** |

Icons and i18n keys: `frontend/src/modules/settings/constants.ts` → `shared/i18n/locales/ru.json`.

---

## URL and persistence

| Mechanism | Value |
|-----------|-------|
| Query param | `/settings?tab={id}` |
| Optional panel | `/settings?tab=connections&panel=…` |
| localStorage | `health-dashboard-settings-tab` |
| Default tab | `profile` |

### Legacy aliases (`resolveSettingsSectionId`)

| Old `?tab=` | Maps to |
|-------------|---------|
| `sync_cloud`, `cloud` | `sync` |
| `integrations` | `connections` |
| `account` | `profile` |
| `experimental`, `cycle` | `about` |
| `analytics_settings` | `analytics` |

Bookmarks with `sync_cloud` continue to work.

---

## Key subcomponents

| Component | Tab | Role |
|-----------|-----|------|
| `FormaSyncPanel` | `sync` | Upload/download, status, auto sync |
| `FormaSyncProgressOverlay` | `sync` | Staged progress during sync |
| `ConnectionIntegrationCard` | `connections` | Per-integration status |
| `FitImportBlock` | `data` | FIT file import |
| `LanMobileDevBlock` | `about` → Dev Tools | LAN API, mobile pairing hints |
| `SyncAndCloudSettings` | — | Thin wrapper → `SyncSettings` (compat) |

---

## Capabilities gating

`useClientCapabilities()` hides or shows:

- Health Connect nav link (desktop)
- Developer Tools block
- Experimental sections

---

## Mobile mapping

Mobile uses tab bar + stacks, not the same 9 IDs. See [MOBILE_PARITY.md](./MOBILE_PARITY.md#settings-parity).

| Desktop | Mobile |
|---------|--------|
| `connections` + `sync` | Sync tab + login OAuth |
| `data` | Backup import hints |
| `analytics` | Warmup flag under nutrition settings |
| Developer Tools | 7 taps on version in About |

---

## Related docs

- [FORMA_SYNC.md](./FORMA_SYNC.md) — FormaSync contract
- [DESKTOP_UI.md](./DESKTOP_UI.md) — shell and quick actions links to `?tab=data|sync`
- [FIT_SYNC.md](./FIT_SYNC.md) — FIT operational guide
- [DEVELOPER_TOOLS.md](./DEVELOPER_TOOLS.md) — diagnostics behind About
