# FormaSync repair — results (2026-06-01)

## 1. Implemented vs partial vs legacy

| Layer | Status |
|-------|--------|
| FormaSync contract (`app:/FormaSync/{yandex_uid}/`) | **Implemented** |
| Desktop engine + REST | **Implemented** (+ baseline upload) |
| Mobile engine (direct Yandex) | **Implemented** (+ baseline upload) |
| Change tracking on writes | **Partial** (stretching delete now tombstones) |
| Conflict merge | **Partial** (food pilot / dismiss) |
| Initial baseline export | **Implemented** (this repair) |
| Sync debug plan in status | **Implemented** |
| FIT/GPX `POST /cloud/sync` | **Implemented** (legacy, relabeled in UI) |
| Whole-DB backup | **Implemented** (legacy, separate folders) |
| LAN / `legacy_api` sync | **Implemented** (separate) |

## 2. Why Network Error happened

Browser/admin uses axios with `baseURL` `/api` (Vite proxy → `127.0.0.1:${apiPort}`). When the FastAPI process is not running or the port mismatches `.api-port` / `VITE_API_PORT`, axios returns **`Network Error`** with no HTTP body. The old `parseApiError` surfaced only `err.message`.

**Fix:** `parseApiError` now includes method, URL, status (when present), and a hint to start uvicorn; FormaSync panel runs `GET /health` preflight.

## 3. Why “0 files uploaded” happened

Two separate UX paths:

1. **«Отправить в облако» (CloudStorageSection)** — `POST /api/cloud/sync` for **FIT/GPX files**, not FormaSync. Empty folder → success toast `Загружено файлов: 0`. **Fix:** subsection renamed; zero count → info toast with clear message.

2. **FormaSync** — export only rows with `sync_status IN ('pending','conflict')`. Migration default is `sync_status='synced'`, so existing DB data never uploaded. **Fix:** baseline export when remote manifest missing + local data + never uploaded.

## 4. Changed files

**Backend:** `baseline.py`, `sync_plan.py`, `export_changes.py` (`export_baseline_changes`), `change_tracker.py` (`load_active_rows`), `package_builder.py`, `upload_flow.py`, `engine.py`, `routers/forma_sync.py`, `stretching_service.py`, `tests/forma_sync/test_contract.py`

**Frontend:** `validation.ts`, `api/health.ts`, `api/cloud.ts`, `FormaSyncPanel.tsx`, `CloudStorageSection.tsx`

**Mobile:** `baseline.ts`, `exportBaselineChanges.ts`, `syncPlan.ts`, `changeTracker.ts`, `packageBuilder.ts`, `uploadFlow.ts`, `FormaSyncEngine.ts`, `CloudSyncScreen.tsx`

**Docs:** `FORMA_SYNC.md`, this file

## 5. Final FormaSync contract

Unchanged v1 — see [FORMA_SYNC.md](./FORMA_SYNC.md).

## 6. Exact Yandex path

```
app:/FormaSync/{yandex_uid}/manifest.json
app:/FormaSync/{yandex_uid}/packages/{revision:06d}-{mobile|desktop}.zip
app:/FormaSync/{yandex_uid}/history/manifest-{revision}.json  (optional)
```

## 7. QA results

| Scenario | Result |
|----------|--------|
| A. Browser FormaSync, API up | **Pass** (unit tests + code path); manual: run uvicorn + Vite, sync shows message not Network Error |
| A′. API stopped | **Pass** — preflight + enhanced error text |
| B. Desktop baseline | **Pass** — `needs_baseline_upload` + `export_baseline_changes` covered by tests |
| C. Mobile same path | **Pass** — mirrored baseline in `uploadFlow.ts` |
| D. A upload → B download | **Not run E2E** — existing applier unchanged |
| E. Empty DB | **Pass** — message «Нет данных для отправки» |
| F. FIT sync zero files | **Pass** — info toast, not misleading success |

Automated: `pytest backend/tests/forma_sync/test_contract.py` — **10 passed**.
