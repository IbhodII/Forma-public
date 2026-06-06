# FORMA_SYNC.md

FormaSync — инкрементный **local-first** sync через **Yandex Disk** (`app:/FormaSync/{yandex_uid}/`).  
**Не** whole-DB backup (`FormaBackups/`) и **не** LAN `legacy_api` full sync.

Last updated: **2026-06-05**.

---

## Каналы (mental model)

| Канал | Когда | Данные |
|-------|-------|--------|
| **FormaSync** | Mobile `cloud`, desktop + Yandex | JSONL entities в контракте |
| **Legacy API** | Mobile `legacy_api` | `SyncService` + HC POST к ПК |
| **Server cloud backup** | Desktop / mobile API | Legacy server-mediated `.db` → reconcile к `X-User-ID` |
| **Native backup** | Android | `FormaBackups/*.db` (локальная замена без server reconcile) |
| **Desktop ZIP import** | Desktop only | Полная замена/merge `workouts.db` + `shared.db` |

---

## Auth и profile mapping

| Шаг | Поведение |
|-----|-----------|
| Yandex OAuth | Tokens в `cloud_account_service`; Disk API → `user.uid` |
| Папка sync | `FormaSync/{yandex_uid}/` — общая для всех устройств с тем же Yandex |
| Локальный `users.id` | Отдельно от `yandex_uid`; привязка через login / `link_user=1` |
| Импорт `.db` из другого аккаунта | Данные remapped на **текущий** `X-User-ID`; cloud identity сессии сохраняется (не подменяется uid из бэкапа) |
| Data scope bug | Новый `users.id` без rebind → «пустая» история на id≥2 — см. [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) |
| Desktop | Settings → Connections; startup download `on_startup_forma_sync_download()` |
| Mobile | Login в `autonomous`/`cloud`; `yandexUid` для cloud only |

**Backup/sync:** upload baseline → revision bump; download → SHA256 verify → `package_applier` → refresh caches (`syncAfterPackageApply` на mobile).

**Ограничения:** conflict UI pilot (`food_entries`); raw HC records не sync entity; сеть/retry влияют на UX.

**Диагностика:** pending counts, last error, last upload/download; не смешивать FormaSync errors с `legacy_api`.

**Current status:** implemented foundation, **validation phase**. The next work is not another sync architecture rewrite; it is multi-device validation, conflict behavior verification and HC day-rollup verification.

---

## FormaSync Cloud Contract v1

---

## Architecture overview

| Principle | Behavior |
|-----------|----------|
| **Local-first** | Writes go to SQLite first; `sync_status=pending` until exported |
| **Incremental** | JSONL lines in ZIP packages; manifest `revision` monotonic |
| **Multi-device** | Same `yandex_uid` → same `app:/FormaSync/{uid}/` folder |
| **Conflict** | LWW by `updated_at`; ties → `sync_conflicts` table |

### Sync channels (priority mental model)

| Channel | When | Data |
|---------|------|------|
| **FormaSync** | Cloud modes, desktop with Yandex | Entities in contract (food, workouts, `hc_days`, …) |
| **Legacy LAN** | `legacy_api` mobile | Full `SyncService` + HC POST |
| **HC POST only** | Legacy, no FormaSync | Batch days to `workouts.db` |
| **FIT/Polar** | Desktop | Files → desktop DB (not FormaSync) |
| **FormaBackups** | Manual | Whole `.db` ZIP |

Desktop UI: [DESKTOP_UI.md](./DESKTOP_UI.md) → `?tab=sync` (`FormaSyncPanel`, progress overlay).  
Mobile UI: **Sync** tab (`SyncHubScreen`).

### Yandex OAuth

- Login via Yandex → tokens in `cloud_account_service`
- `GET https://cloud-api.yandex.net/v1/disk/` → `user.uid` = folder key
- Desktop: `?tab=connections` ([DESKTOP_UI.md](./DESKTOP_UI.md))
- Mobile: login screen in `autonomous` / `cloud`

### Import / export (within FormaSync)

- **Export:** pending rows → `export_changes` → ZIP → upload → bump revision
- **Import:** download → SHA256 verify → `package_applier` → update `last_seen_revision`
- **Baseline:** no remote manifest + local data → first upload rev 1

### Desktop startup sync

`backend/main.py` → `on_startup_forma_sync_download()` when Yandex connected and auto enabled.

---

## Mobile engine structure (v1)

```
mobile/src/sync/
  FormaSyncEngine.ts      # getStatus, sync, uploadOnly, downloadOnly
  downloadFlow.ts         # manifest → download → SHA256 → apply
  uploadFlow.ts           # export → ZIP → upload → markExported
  exportChanges.ts        # pending rows → JSONL groups
  changeTracker.ts        # sync_status / markExported / pending counts
  packageBuilder.ts       # ZIP assembly
  packageApplier.ts       # idempotent upsert + conflicts
  syncState.ts            # in-flight mutex
  formaSyncBackgroundTask.ts + formaSyncScheduler.ts  # auto sync (~4h)
```

## Folder layout

```
app:/FormaSync/{yandex_uid}/
  manifest.json
  packages/
    000001-mobile.zip
    000002-desktop.zip
  history/
    manifest-1.json          # optional archive
```

`yandex_uid` from `GET https://cloud-api.yandex.net/v1/disk/` (`user.uid`).

## manifest.json (schema_version 1)

```json
{
  "schema_version": 1,
  "revision": 1,
  "updated_at": "2026-05-30T12:00:00Z",
  "source_device": "mobile",
  "source_device_id": "uuid",
  "package": "packages/000001-mobile.zip",
  "package_sha256": "hex",
  "entities_summary": {
    "food_entries": 3,
    "body_metrics": 1,
    "strength_workouts": 0,
    "stretching_log": 0,
    "bracelet_calories": 0,
    "hc_days": 0,
    "cardio_workouts": 0,
    "food_products": 0,
    "strength_presets": 0,
    "user_preferences": 0
  }
}
```

Mobile stores `forma_sync:last_seen_revision` in `sync_meta`.

## Package ZIP layout

```
package/
  meta.json
  changes/
    food_entries.jsonl
    body_metrics.jsonl
    strength_workouts.jsonl
    stretching_log.jsonl
    bracelet_calories.jsonl
    hc_days.jsonl
    cardio_workouts.jsonl
    food_products.jsonl
    strength_presets.jsonl
    user_preferences.jsonl
```

### meta.json

```json
{
  "schema_version": 1,
  "device_id": "uuid",
  "source": "mobile",
  "created_at": "2026-05-30T12:00:00Z",
  "base_revision": 0
}
```

### JSONL row

```json
{
  "id": "food:mobile:15",
  "server_id": 120,
  "updated_at": "2026-05-27T12:00:00Z",
  "deleted_at": null,
  "source": "mobile",
  "device_id": "uuid",
  "payload": {}
}
```

Global id format: `{prefix}:{origin}:{localKey}` (e.g. `product:desktop:42`, `prefs:mobile:default`).

## Local change tracking

Syncable SQLite rows carry:

| Column | Purpose |
|--------|---------|
| `updated_at` | LWW timestamp |
| `deleted_at` | Tombstone (nullable) |
| `sync_status` | `pending` \| `synced` \| `conflict` |
| `device_id` | Originating device UUID |
| `last_synced_revision` | Last successful FormaSync upload revision |

Export query (indexed): `sync_status IN ('pending','conflict') OR (deleted_at IS NOT NULL AND last_synced_revision IS NULL)`.

Legacy `synced` / `deleted` columns remain for PC API `SyncService`; FormaSync uses `sync_status`.

## sync_meta keys

| Key | Purpose |
|-----|---------|
| `forma_sync:last_seen_revision` | Last applied remote revision |
| `forma_sync:last_upload_at` | Last successful upload ISO |
| `forma_sync:last_download_at` | Last successful download ISO |
| `forma_sync:export_watermark` | Legacy export cursor (fallback) |
| `forma_sync:device_id` | Stable mobile device UUID |
| `forma_sync:last_error` | Last sync error message |
| `forma_sync:auto_enabled` | `'1'` / `'0'` — background auto sync |
| `forma_sync:auto_last_run_at` | Last background sync ISO |

## Conflict policy v1

1. Newer `updated_at` wins
2. `deleted_at` tombstone wins over older non-deleted row
3. Equal `updated_at` + different payload → `sync_conflicts` row with `previous_payload_json`, `winner`, `remote_updated_at` (no silent loss)

## Entity matrix v1 (mobile)

| Entity | Export | Import | Notes |
|--------|--------|--------|-------|
| food_entries | Yes | Yes | |
| body_metrics | Yes | Yes | |
| strength_workouts | Yes | Yes | Sets embedded in payload |
| stretching_log | Yes | Yes | |
| bracelet_calories | Yes | Yes | |
| hc_days | Yes (HC module on) | Yes | Day rollup only |
| cardio_workouts | Yes | Yes | `cardio_workouts_cache` |
| food_products | Yes | Yes | `food_products_local` |
| strength_presets | Yes | Yes | Full JSON in cache |
| user_preferences | Yes | Yes | Single blob `forma_sync_preferences` |

**Skipped:** `food_cache`, `exercises_catalog_cache`, `hc_records`, `hc_sync_runs`, analytics snapshots.

### hc_days payload

Exported only when `sync_meta` → `hc:module_enabled` = `'1'`.

```json
{
  "id": "hc:health_connect:2026-05-30",
  "source": "mobile",
  "payload": {
    "source": "health_connect",
    "provider": "com.google.android.apps.fitness",
    "providers": {"steps": "com.google.android.apps.fitness"},
    "date": "2026-05-30",
    "steps": 8420
  }
}
```

## Client matrix (production vs admin)

| Capability | admin_browser (Vite + `start.ps1`) | desktop_app (Forma.exe) | mobile_app (APK release) |
|------------|--------------------------------------|-------------------------|---------------------------|
| FormaSync via `app:/FormaSync/{yandex_uid}/` | Yes | Yes (backend engine) | Yes (local SQLite engine) |
| OAuth / FIT / LAN / HC debug UI | Yes (developer tools) | Hidden | Hidden |
| `debug_plan` in API status | Yes (`X-Forma-Client: admin_browser`) | No | No |
| Legacy FIT/GPX `POST /cloud/sync` | Admin settings | Hidden | Hidden |
| Mobile `legacy_api` (PC Wi‑Fi API) | Dev/QA only | N/A | Hidden in release (`__DEV__` only) |
| Coexistence with dev API | Uses ports 8000/8002 + Vite 5173 | Uses packaged API ~18002 | Independent |

FormaSync is **not** LAN sync and **not** “main PC only”: all cloud-mode clients read/write the same Yandex folder keyed by `yandex_uid`. LAN/legacy_api are separate admin/dev paths.

## Auto sync (mobile)

- Background task `forma-sync-background` via `expo-background-task`
- Minimum interval: **240 minutes**
- Requires: auto enabled, Yandex token, autonomous/cloud mode, online, battery ≥20% (or charging)
- Never runs parallel with manual sync (`syncInFlight` mutex)

## Desktop participant (v1)

Desktop backend implements the same contract as mobile:

```
backend/services/forma_sync/
  engine.py              # getStatus, sync, uploadOnly, downloadOnly
  download_flow.py       # manifest → download → SHA256 → apply
  upload_flow.py         # export → ZIP → upload → markExported
  export_changes.py      # pending rows → JSONL (strength sessions aggregated)
  change_tracker.py      # sync_status / markExported / pending counts
  package_builder.py     # ZIP assembly, source=desktop
  package_applier.py     # idempotent upsert + conflicts
  entity_mappers.py      # desktop row ↔ contract payload
  yandex_api.py          # app:/FormaSync/{uid}/ via Yandex Disk API
  sync_meta.py           # app_meta keys (same as mobile sync_meta)
```

REST: `GET/POST /api/cloud/forma-sync/*` (status, sync, upload, download, conflicts).

**Startup:** backend fire-and-forget `download_only` when Yandex connected and `forma_sync:auto_enabled != '0'`; frontend bootstrap calls status + background download after login.

**Strength export:** desktop `strength_workouts` rows are aggregated by `(date, workout_title)` into mobile-compatible session payloads (`sets[]` / `exercises[]`).

**hc_days import:** maps mobile HC day rollups to `steps_history`, `daily_bracelet_calories`, and sleep fields where present.

Legacy whole-DB backup (`CloudStorageSection`) and LAN sync remain unchanged (admin browser only in production UI).

**First upload (baseline):** when remote `manifest.json` is missing but local DB has data and `last_seen_revision == 0`, clients export all active rows once (rev 1), without requiring `sync_status=pending` on legacy rows.

## QA checklist

| Scenario | Expected |
|----------|----------|
| Autonomous + Yandex, no remote manifest | Creates folder, uploads rev 1 |
| Remote rev N, local last_seen N-1 | Download, apply, last_seen = N |
| SHA256 mismatch | Import aborted, DB unchanged |
| Local edit + sync | Package uploaded, revision +1, rows `sync_status=synced` |
| Repeated sync | No duplicate exports (pending count → 0) |
| Equal timestamps, different payload | Conflict recorded with previous payload |
| Delete food entry | Tombstone in next package |
| Second device download | Cross-origin insert (`food:desktop:N`) |
| Legacy API mode | FormaSync UI hidden |
| `.db` backup | Independent, still works |

## Current Validation Priorities

| Area | Required check |
|------|----------------|
| Mobile → cloud → desktop | Create/edit food, body, workouts, bracelet calories; verify desktop applies once |
| Desktop → cloud → mobile | Create/edit supported entities; verify mobile import and caches refresh |
| HC day rollups | `hc_days` maps to desktop steps, bracelet calories and sleep without raw record flooding |
| Conflict visibility | Equal timestamp / divergent payload creates visible conflict, not silent loss |
| Tombstones | Deletes export/import once and remain idempotent |
| Source ownership | FIT/Polar/manual records must not be overwritten by HC/bracelet sync |
| Multi-device baseline | First upload/download does not duplicate historical rows |

Open questions for stabilization:

- Which entities need richer conflict UI beyond `food_entries`.
- Whether HC day rollups need provider-priority metadata in the sync contract.
- How to surface source attribution in mobile/desktop UI without exposing raw internal payloads.
- How historical imports should mark raw vs corrected values before entering FormaSync.

## Remaining limitations (v1)

- Desktop participant: **implemented** (`backend/routers/forma_sync.py`, startup download) — mobile and desktop both publish/consume packages; feature parity still evolving
- Custom product create still API-first in `legacy_api` mode
- No raw `hc_records` sync (day rollup `hc_days` only)
- Conflict merge: pilot **`food_entries`** only — see `conflictResolution.ts`
- Full preset exercise trees may need v2 merge rules
- Mobile release QA: [../mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md)
- Release smoke (exe): [RELEASE_READINESS.md](./RELEASE_READINESS.md); historical smoke notes: [archive/RELEASE_SMOKE.md](./archive/RELEASE_SMOKE.md)
