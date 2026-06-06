# Mobile local readiness audit

Status as of Autonomous Android Architecture Foundation (v1).

| Domain | Store / API | Local write | Local read fallback | API-only gaps |
|--------|-------------|-------------|---------------------|---------------|
| Strength workouts | `strengthStore`, `api/workouts.ts` | enqueue pending | cache sessions/types | history merge, analytics |
| Strength sets | via workouts API | partial queue | cache | live session edits |
| Cardio | `cardioStore`, `api/cardio.ts` | cache only | read cache | create/edit, HR blocks |
| Food entries | `foodStore`, `api/food.ts` | enqueue | day/week cache | products CRUD, barcode, expenditure |
| Products | API | — | food_cache partial | catalog search (OFF) |
| Body metrics | `bodyStore`, `api/body.ts` | enqueue | cache | photos, advanced charts |
| Weight daily | API | — | body_metrics_cache | dedicated weight API |
| Steps | `api/steps.ts` | — | — | **API-only** |
| Sleep | `api/sleep.ts` | — | — | **API-only** |
| HC snapshots | AsyncStorage, `healthConnectSync.ts` | local debug | HC test mode | backend sync (legacy only) |
| HC local module | `hcStore`, `hc_day_metrics`, `hc_records` | toggle-gated read | SQLite + FormaSync `hc_days` | background WorkManager ~1h when enabled |
| Sync metadata | `sync_meta`, `conflictStore` | yes | yes | conflicts need legacy API |

## Screen readiness

| Screen | Readiness | Notes |
|--------|-----------|-------|
| Settings | local_ready | Always available; mode chip in About |
| Food (day) | partial | `localFoodRepository` pilot |
| Body (metrics) | partial | `localBodyRepository` pilot |
| Stretching | partial | offline queue exists |
| Workouts | partial | cached history; record needs API/partial |
| Home | partial | aggregate cards API-dependent |
| Analytics | api_required | fallback UI |
| Cycle | api_required | fallback UI |
| HC diagnostics | local_ready | `local_hc_test` shell |

## Operating modes

| Mode | PC API | Primary data | Cloud |
|------|--------|--------------|-------|
| Autonomous | No | `myhealth.db` | Manual `.db` backup (Yandex) |
| Cloud | No | `myhealth.db` | Same as autonomous |
| Legacy API | Yes (sync) | cache + queue | optional server/native backup |

Phone and PC do not discover each other. FormaSync path: `app:/FormaSync/{yandex_uid}/` (see [FORMA_SYNC.md](../../docs/FORMA_SYNC.md)).
