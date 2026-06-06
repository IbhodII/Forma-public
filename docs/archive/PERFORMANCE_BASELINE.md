# Performance baseline (Performance stabilization pass)

## Method

- Backend: `backend/logs/api.log` request durations (`INFO - METHOD path -> status (Nms)`).
- Frontend: DevTools Network on cold navigation after login.
- Timing header: set `FORMA_DEV_TIMING=1` for `X-Response-Time-Ms` on responses.

## Before (pre-pass)

### Slowest endpoints (from api.log samples)

| Endpoint | Observed max (ms) | Notes |
|----------|-------------------|--------|
| `GET /api/cardio/workouts` | 14 530–19 353 | N+1 `hr_stats_for_workout` per row |
| `POST /api/sync/excel-all` | 24 578–37 369 | Admin/import only |
| `GET /api/cardio/zone-time` | 11 868 | Analytics |
| `GET /api/analytics/ctl` | ~4 094 | Large history |
| `GET /api/sync/health-connect/hub` | ~111–1 540 | Heavy aggregation |
| `GET /api/sync/health-connect/debug` | errors + retries | SQL bindings (admin) |

### Home dashboard (`/home`) — frontend

| Metric | Before |
|--------|--------|
| Parallel API requests on mount | **11** (`useDashboardHome`) |
| Hero gate | Blocks all hero tiles until **6** queries finish |
| Status panel gate | Blocks until **4** queries (incl. full HC hub) |
| Duplicate global | `FormaSyncBootstrap` + dashboard both fetch `yandexCloudStatus` |

## After (implementation pass)

### Home dashboard

| Metric | After |
|--------|--------|
| Primary API on `/home` | **1** `GET /api/dashboard/home` + optional lazy `daily-expenditure` |
| Hero UX | Per-tile skeletons (no global `heroLoading` gate) |
| HC on production home | Lightweight `sync.health_connect` snapshot only |
| Full HC hub | Admin only (`include_hc_hub` / `enableHealthConnectDebug`) |

### Backend

| Change | Detail |
|--------|--------|
| `GET /api/dashboard/home` | [`backend/routers/dashboard.py`](../backend/routers/dashboard.py), [`dashboard_home_service.py`](../backend/services/dashboard_home_service.py) |
| Cardio list | `batch_hr_stats_for_workouts()` — one SQL per page |
| Indexes v060 | `idx_food_entries_user_date`, `idx_cardio_user_date_type`, `idx_cardio_user_source_date`, `idx_hc_sync_log_synced_at` |

### Frontend / mobile

| Change | Detail |
|--------|--------|
| TanStack | [`queryStaleTimes.ts`](../frontend/src/hooks/queryStaleTimes.ts); debug panels `enabled: enableDebugPanels` |
| FormaSyncBootstrap | Seeds Yandex from dashboard cache; `requestIdleCallback` / 4s defer |
| Mobile startup | `runInitialSyncIfNeeded` deferred 3s after interactions |
| Removed | Unused [`useDashboardCompanion.ts`](../frontend/src/hooks/useDashboardCompanion.ts) |

### Expected cardio list latency

| Endpoint | Before (log) | Expected after |
|----------|--------------|----------------|
| `GET /api/cardio/workouts` | 5–18 s | Sub-second to ~500 ms typical |

## §11 deliverables

1. **Slowest endpoints found:** cardio/workouts, excel-all, zone-time, ctl, HC hub (see tables above).
2. **Indexes added:** migration v060 (four indexes listed above).
3. **Duplicate requests removed:** Home 11→1 (+ expenditure); dashboard seeds `yandexCloudStatus` / `formaSyncStatus` / `polar` cache for settings.
4. **Dashboard optimization:** aggregated endpoint + per-tile skeletons.
5. **Debug fetches disabled in production:** HC hub/debug panels gated; FormaSync `debug_plan` only admin.
6. **Remaining bottlenecks:** `POST /api/sync/excel-all`, analytics CTL on very large DB, first mobile `runFullSync` still heavy but deferred off UI thread.

## Manual QA checklist

- [ ] Desktop exe: `/home` ≤2 API calls, tiles populate independently
- [ ] Admin browser: HC hub optional; settings diagnostics load when dev tools on
- [ ] Workouts: cardio tab list feels responsive
- [ ] Mobile: cold start UI not blocked 3s+ by sync
