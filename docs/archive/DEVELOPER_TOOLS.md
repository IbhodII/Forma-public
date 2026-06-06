# Developer Tools — диагностика

Технические инструменты отладки, **намеренно скрытые** от обычного UI, но сохранённые для support и разработки.

Статус: **experimental** (opt-in toggle).

См. также: [DESKTOP_UI.md](./DESKTOP_UI.md), [HEALTH_CONNECT_AUDIT.md](./HEALTH_CONNECT_AUDIT.md).

---

## Включение

| Механизм | Детали |
|----------|--------|
| Toggle | Settings → **Диагностика / Developer Tools** → checkbox |
| Storage | `localStorage` key `health-dashboard-developer-tools` |
| Hook | `useDeveloperTools()` |
| Deep link | `/settings?tab=about` → Developer Tools; HC debug in hub when enabled |

Компонент: [`DeveloperToolsSettings.tsx`](../frontend/src/modules/settings/components/DeveloperToolsSettings.tsx).

**Без toggle:** обычные статусы (HC sync ok/error, Polar connected) остаются в production settings.

---

## Panels

### OAuth diagnostics

| | |
|---|---|
| **API** | `GET /api/cloud/oauth-debug` |
| **Panel** | `OAuthDebugPanel` |
| **Shows** | Redirect URIs, masked client ids, Yandex + Polar config warnings, callback paths |

Query enabled only when dev tools on (`staleTime: 30s`).

### Health Connect diagnostics

| | |
|---|---|
| **API** | `GET /api/sync/health-connect/debug` |
| **Panel** | `HealthConnectDiagnosticsPanel` |
| **Shows** | Field catalog, exercise type map, sync log, DB counts, warnings, audit JSON |

Deep matrix: [HEALTH_CONNECT_AUDIT.md](./HEALTH_CONNECT_AUDIT.md).

**Production hub** (without raw JSON): `/health-connect` via `GET /api/sync/health-connect/hub`.

### Source resolver diagnostics

| | |
|---|---|
| **API** | `GET /api/cardio/{id}/sources`, user priorities |
| **Panel** | `SourceResolverDiagnosticsPanel` |
| **Shows** | Contributions, effective sources, conflicts |

См. [SOURCE_RESOLVER.md](./SOURCE_RESOLVER.md).

### Import diagnostics

| | |
|---|---|
| **API** | FIT task status, import stats |
| **Panel** | `ImportDiagnosticsPanel` |
| **Shows** | Last FIT import task, folder path, error messages |

См. [IMPORT_SYSTEM.md](./IMPORT_SYSTEM.md).

### Polar diagnostics

| | |
|---|---|
| **API** | Polar pending list, connection status |
| **Panel** | `PolarDiagnosticsPanel` |
| **Shows** | Pending queue, attach debug fields from last attach |

Attach responses include inline debug: received/parsed/inserted HR counts (`polar_attach_service`).

### Sync logs

| | |
|---|---|
| **Data** | `health_connect_sync_log` (+ v50 audit columns) |
| **Panel** | `SyncLogsPanel` |
| **Shows** | Recent HC batches, skip/save reasons |

---

## Backend debug endpoints (no dev toggle required)

| Endpoint | Purpose |
|----------|---------|
| `GET /api/health` | API up, DB paths, food product count |
| `GET /api/sync/health-connect/debug` | Full HC debug payload |
| `GET /api/sync/health-connect/hub` | Hub aggregate (also used by production UI) |
| `GET /api/cloud/oauth-debug` | OAuth config snapshot |
| `POST /api/sync/fit?sync=true` | Blocking FIT import (debug) |
| `GET /docs`, `/redoc` | FastAPI OpenAPI (public, no auth) |

Strength HR analysis returns optional `debug` object in `/hr-analysis` response (thresholds, merge meta).

---

## Mobile diagnostics

| Screen | Location |
|--------|----------|
| `HealthConnectDiagnosticsScreen` | Settings stack |
| `LocalHcTestStack` | Test auth mode (`isLocalHcTestMode`) — **dev only** |
| `ConflictCenterModal` | Offline sync conflicts — **production** (not dev-gated) |

---

## Security note

Debug panels may expose:

- Sync audit JSON with field-level skip reasons
- OAuth redirect URIs (secrets masked)
- Internal DB counts

Не включать dev tools на shared/demo machines без необходимости.

---

## CLI / scripts (outside UI)

| Tool | Purpose |
|------|---------|
| `fit_importer.py --reimport` | Force re-parse FIT files |
| `backend/scripts/backfill_workout_sources.py` | Backfill source contributions |
| `sync_polar.py` | CLI Polar sync |
| pytest | `backend/tests/` including HR analytics, source resolver |

---

## См. также

- [HEALTH_CONNECT.md](./HEALTH_CONNECT.md)
- [CURRENT_LIMITATIONS.md](./CURRENT_LIMITATIONS.md)
