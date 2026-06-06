# Forma cleanup reference

Archived historical reference after the desktop stabilization audit on **2026-06-02**.

Current source of truth:

- [PROJECT_CONTEXT.md](../PROJECT_CONTEXT.md)
- [ARCHITECTURE.md](../ARCHITECTURE.md)
- [DESKTOP_UI.md](../DESKTOP_UI.md)
- [DATABASE.md](../DATABASE.md)
- [ANALYTICS.md](../ANALYTICS.md)
- [PLATFORMS.md](../PLATFORMS.md)

---

## Stabilization pass (2026-06-02) — summary

| Area | Changes |
|------|---------|
| **Ownership** | Import/browser staging -> session `user_id`; Yandex data scope documented |
| **UI** | Wide layout balanced; body history stacked; settings/body/food restructure retained |
| **Import** | `strength_hr_session_meta` idempotent merge; diagnostics overview |
| **Dev** | Mini-database export; browser import stage API |
| **Removed** | Orphan UI; duplicate doc headers in FORMA_SYNC/HEALTH_CONNECT |
| **Not changed** | CTL/ATL/TRIMP formulas; mobile HC core; backend analytics math |

## Sync paths (mobile + desktop)

| Path | When | Format |
|------|------|--------|
| `legacy_api` -> `mobile/src/services/SyncService.ts` | PC API reachable, operating mode `legacy_api` | Full REST sync |
| FormaSync -> `mobile/src/sync/FormaSyncEngine.ts`, `backend/services/forma_sync/` | Default mobile/cloud incremental | JSONL packages on Yandex `FormaSync/` |
| Native cloud backup -> `mobile/src/services/CloudSyncService.ts` | Android OAuth, emergency | Single `.db` in `FormaBackups/` |
| Server cloud -> `frontend/src/api/cloud.ts`, `backend/services/cloud_backup_service.py` | Desktop settings | Legacy server-mediated `.db` + FIT folder |

## Backup / import formats

| Format | Module | UI |
|--------|--------|-----|
| SQLite ZIP | `database_export_service.build_database_zip` | DB export/import, local backup folder |
| JSON `forma_backup_v1` | `backup_json_service` | Full account JSON import/export |
| FIT folder | `fit_importer.py` via `fit_import_runner` | Sync settings, async `fit_importer_service` |

## API compatibility

- Nutrition: `/api/nutrition` (current) and `/api/cut-bulk` (legacy alias in `backend/main.py`) were kept until clients migrated.
- Bookmarks: `frontend/src/routes/legacyRedirects.ts`.

## Deprecated / removed in cleanup PRs

### Desktop v1 cleanup (2026-06, phase 2 — desktop/core only)

Removed files with zero importers:

- `frontend/src/hooks/useCtlAtlTsb.ts` — replaced by analytics hooks.
- `frontend/src/modules/settings/index.ts`, `modules/settings/components/AccountSettings.tsx`.
- `frontend/src/components/page-shell/StickyActionBar.tsx`.
- `frontend/src/components/analytics/AnalyticsMetricRow.tsx`.
- Nutrition analytics cluster: `ProgressForecastPanel.tsx`, `WeekAnalyticsSection.tsx`, `BodyFatScaleBar.tsx`, `HealthWarningsBanner.tsx`, `TefHelpTooltip.tsx`.
- Unused UI primitives: `switch.tsx`, `input.tsx`, `page-header.tsx`, `badge.tsx`.

Trimmed deprecated exports:

- `StretchingPage.tsx` tab constants.
- `StrengthHrBySetPanel.tsx` `MarkupSourcePill`.
- `americanUnits.ts` snake_case aliases and miles helpers.
- `weekCalendar.ts` / `weeklyAggregation.ts` deprecated Saturday helpers.
- `recoveryAdvice.ts` internalized `buildRecoveryAdvice`.

Consolidated:

- Job IPC types -> `frontend/src/types/desktopJobs.ts`.
- `vite-env.d.ts` window globals.
- `plotly.d.ts` ambient module declaration.
- `AuthContext.tsx` `fetchAuthMe()` fix.
- `accountWarmup.ts` optional `workout_visibility` type.

Not merged by design:

- `get_calories_by_day` vs `food_service._workout_calories_for_range`.
- `recoveryAdvice` / week utils -> future `shared/domain/`.
- `analytics_service.get_ctl_atl_tsb` delegator kept for warmup call sites.

Earlier cleanup PRs:

- Dead mobile screens: `BarcodeScannerScreen`, `BodyScreen`, `StretchingScreen`, `SyncStack`.
- Dead mobile components: `ApiDependentFallback`, `ApiUnavailableNotice`, `PostWorkoutInsightCard`, `AnalyticsSectionShell`, `HealthConnectSettings`, `ProductFormModal`, `PcConnectionSettings`.
- Dead desktop modules: legacy `CardioPage`, `AnalyticsPage`, pre-dashboard home cards, unused FoodDiary premium blocks, `GpsMap`, `ActiveMarker`, deprecated page wrappers.
- Dead backend: `health_connect_reliability.py`; `find_duplicate_candidates` moved to `source_resolver_service`.
- Excel import: [archive/excel_import/](../../archive/excel_import/) — ops-only.

## Data layer notes retained for history

New backend reads were standardized around `get_db()` and repositories. Direct file/SQLite operations stayed limited to import/export workers.

Mobile FormaSync applies packages to local tables and refreshes UI caches with `syncAfterPackageApply()`.

## Analytics notes retained for history

CTL/ATL/TSB reads moved to `backend/services/analytics_query.py`; TRIMP refresh is guarded by `cardio_service.count_missing_trimp`. Formulas were not changed in this cleanup pass.
