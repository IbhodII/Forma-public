# Current Limitations — известные ограничения

Центральный реестр **актуальных** ограничений системы. Для backlog см. [ROADMAP.md](./ROADMAP.md).

Старый файл [KNOWN_ISSUES.md](./KNOWN_ISSUES.md) сохранён для истории; при расхождении приоритет у этого документа.

---

## Легенда

| Severity | Meaning |
|----------|---------|
| **operational** | Влияет на ежедневное использование |
| **analytical** | Данные приблизительны или неполны |
| **performance** | Медленно, но работает |
| **platform** | Desktop vs mobile gap |
| **security** | Auth / multi-user |
| **quality** | Testing / reliability |

| Status | Meaning |
|--------|---------|
| **accepted** | Осознанное ограничение v1 |
| **tracked** | В ROADMAP NEXT/FUTURE |

---

## Health Connect

### Mi Fitness / lazy manual sync providers

| | |
|---|---|
| **Severity** | operational |
| **Status** | accepted |

**Проблема:** провайдеры в стиле Mi Fitness / Xiaomi **не пушат** данные в Health Connect автоматически. Пользователь должен открыть приложение-источник и вручную инициировать sync.

**Impact:** Forma видит stale или пустые дни до ручного sync на телефоне.

**Workaround:** hub `/health-connect` — last sync timestamp; повторный sync на mobile; warnings в debug.

**Не решается на backend** без свежих HC records.

### HC provider inconsistency

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

Разные приложения пишут разные поля, units и exercise types. Mapping layer skip'ает unsupported types (strength HC type 70).

### HC analytics not fully connected

| | |
|---|---|
| **Severity** | analytical |
| **Status** | tracked |

**Partial:** bracelet kcal in expenditure, sleep in recovery advice, steps on dashboard.

**Not connected:** HRV/readiness recovery engine, full HC field catalog on `/analytics`.

---

## Strength HR block analysis

### Approximate detection

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

Peak detection ≠ exact set boundaries. См. disclaimer в [HR_ANALYTICS.md](./HR_ANALYTICS.md).

### Supersets / alternating exercises

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

Ambiguous block ↔ set mapping; medium confidence; no auto mapping.

### Recompute on read + session cap

| | |
|---|---|
| **Severity** | performance |
| **Status** | accepted |

Cross-session overview: max **100 HR sessions**; `truncated: true`. No DB materialized snapshots.

---

## Source resolver

### Approximate calorie matching

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

Conflict threshold **25 kcal**; не учитывает все edge cases multi-device.

### Conflict UI not in main flow

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

Conflicts visible in developer diagnostics, not prominent in workout UI.

---

## Mobile operating modes

| Mode | PC API | Daily standalone | Sync |
|------|--------|------------------|------|
| `legacy_api` | **required** | No | `SyncService` + HC POST |
| `autonomous` / `cloud` | not required | **Yes** (local DB) | FormaSync on Yandex Disk |
| `local_hc_test` | disabled | HC QA only | none |

См. [MOBILE.md](./MOBILE.md), [АВТОНОМНОЕ_ПРИЛОЖЕНИЕ_ANDROID.md](./АВТОНОМНОЕ_ПРИЛОЖЕНИЕ_ANDROID.md).

---

## Health Connect (mobile)

### Step double-count risk

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

Несколько `Steps` records за день **суммируются** без dedup по источнику. Overlapping apps in HC may inflate totals.

### HR sample gaps

| | |
|---|---|
| **Severity** | analytical |
| **Status** | accepted |

HR — discrete samples (25–240 BPM), not minute aggregates. Gaps if provider did not write samples to HC.

### Background execution (OEM / WorkManager)

| | |
|---|---|
| **Severity** | operational |
| **Status** | accepted |

HC worker uses Expo `NetworkType.CONNECTED` — may defer offline. Battery saver on Xiaomi/Samsung may kill tasks; **no** foreground service fallback.

### Permission revoke

| | |
|---|---|
| **Severity** | operational |
| **Status** | accepted |

After revoke: hub badge «Нет разрешений», `permission_denied` debug phase; background exits without crash loop.

### Sync lock race (FormaSync)

| | |
|---|---|
| **Severity** | quality |
| **Status** | accepted |

Concurrent `manualSyncNow` + background may show «уже выполняется»; `syncState` mutex — rare stuck if process killed mid-flight (**mitigated** in release v1 `finally` paths).

---

## FormaSync v1 (mobile)

| Limitation | Status |
|------------|--------|
| Conflict merge only `food_entries` | accepted |
| Partial ZIP backup (subset tables) | accepted |
| Cleartext HTTP for self-hosted API in legacy | accepted |
| Corrupt JSONL lines skipped; revision not bumped on error | implemented |
| No raw `hc_records` in package — day rollup only | accepted |

См. [FORMA_SYNC.md](./FORMA_SYNC.md), [../mobile/RELEASE_CHECKLIST.md](../mobile/RELEASE_CHECKLIST.md).

---

## Mobile platform

### Analytics parity incomplete

| | |
|---|---|
| **Severity** | platform |
| **Status** | tracked |

No strength HR analytics sub-tab; simpler charts vs desktop Plotly; food forecast UI missing.

### Weight CSV export

| | |
|---|---|
| **Severity** | platform |
| **Status** | tracked |

Desktop yes, mobile no.

---

## Auth

### Single-user header auth

| | |
|---|---|
| **Severity** | security |
| **Status** | tracked |

`X-User-ID` middleware, default user 1. JWT auth **planned**.

---

## Import

### No universal pre-import preview

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

FIT has progress polling only; no diff UI for all sources before write.

### Mi / Xiaomi CLI stubs

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

Stubs in sync scripts; not real import.

---

## Testing

### Minimal E2E

| | |
|---|---|
| **Severity** | quality |
| **Status** | tracked |

Backend pytest exists; Playwright desktop coverage **planned**.

---

## Desktop

### No electron-updater

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

Manual reinstall for updates.

### Dev external API mode

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

Embedded `backend.exe` only in production Electron; dev uses uvicorn separately.

---

## Manual CdA UI

| | |
|---|---|
| **Severity** | operational |
| **Status** | tracked |

Bike power estimation works; manual CdA input in UI **not implemented** ([BIKE.md](./BIKE.md)).

---

## См. также

- [ROADMAP.md](./ROADMAP.md) — NEXT / FUTURE items
- [HEALTH_CONNECT.md](./HEALTH_CONNECT.md) — HC partial vs planned
- [HR_ANALYTICS.md](./HR_ANALYTICS.md) — HR limitations detail
- [STUBS_AND_PLACEHOLDERS.md](./STUBS_AND_PLACEHOLDERS.md) — code stubs list
