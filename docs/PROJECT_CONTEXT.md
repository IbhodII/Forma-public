# Project Context

Статусный документ для разработки, ревью и передачи проекта новому разработчику.  
Срез: **2026-06-09**. Desktop schema: **`SCHEMA_VERSION` = 80** (`database/migrations.py`; v078 cardio columns; v079 meal plans finalized in workouts + shared purge; v080 strength catalog in shared).

См. также: [ARCHITECTURE.md](./ARCHITECTURE.md), [RELEASE_READINESS.md](./RELEASE_READINESS.md).

---

## Продукт в одном абзаце

**Forma** — local-first учёт тренировок, питания, тела, Health Connect и синхронизации. **Desktop** сейчас в фазе стабилизации: функционально он близок к feature-complete относительно текущих desktop-целей. **Mobile** — активная фаза разработки и главный приоритет: автономный Android-клиент должен закрыть dashboard, питание, тренировки, тело, аналитику, цикл, Health Connect и sync без обязательной зависимости от desktop.

---

## Current Project State

| Область | Состояние | Что важно дальше |
|---------|-----------|-------------------|
| Desktop | Mostly complete; stabilization phase | Fix P0/P1 regressions, smoke installer, avoid new large features |
| Mobile | Active development; highest priority | Complete autonomous app scope, not just companion flows |
| Health Connect | Integration / validation phase | Validate sleep, HR, steps, kcal, source attribution and duplicate prevention |
| Synchronization | Validation phase | Verify FormaSync roundtrips, conflict behavior, HC day rollups |
| Historical imports | Planned | Xiaomi/Mi Fitness/Zepp Life import and correction rules |
| Automatic calibration | Planned automation; manual/adaptive foundation exists | 14-day scheduled recalculation, confidence/status UI |
| Code cleanup | Planned after stabilization | Do after P0/P1 bugs and validation gates |

Границы кода: [PLATFORMS.md](./PLATFORMS.md), `npm run check:platform-imports`.

---

## Mode-driven behavior (критично)

| Mode | Где | Что важно |
|------|-----|-----------|
| `desktop_app` | Packaged Forma.exe | `FORMA_DATA_DIR`, API default **8000** (candidates 8000–8012, `%APPDATA%\Forma\forma-desktop-api.json`), `X-User-ID` из сессии; ships [`.env.desktop.public`](../.env.desktop.public) only |
| `admin_browser` | `start.ps1` / Vite | Dev import, mini-DB export, HC debug, diagnostics |
| `autonomous` | Mobile | Локальная БД; без ложного cloud pending UI |
| `cloud` | Mobile | Local-first + FormaSync |
| `legacy_api` | Mobile | REST к ПК; не смешивать с autonomous triage |

---

## Current Priorities

1. **Mobile application completion** — dashboard, nutrition, workouts, cardio types, body, analytics, cycle.
2. **Health Connect validation and stabilization** — sleep, HR, steps, calories, workouts, source attribution.
3. **Synchronization validation** — FormaSync, cloud/mobile/desktop roundtrips, conflict and ownership checks.
4. **Historical Xiaomi import** — Mi Fitness / Zepp Life / Xiaomi exports with dedupe and correction.
5. **Bug fixing and cleanup** — especially body measurement edit crash and workout template structure loss.
6. **Automatic calorie calibration** — scheduled 14-day recalculation and confidence display.
7. **Future analytics expansion** — steps, sleep, resting HR, long-term trends.

---

## Desktop status (v1)

### Готово / стабильно

- Shell и маршруты: `/home`, `/workouts`, `/food`, `/analytics`, `/body`, `/settings`, `/cycle`; `/health-connect` → redirect на `/body?tab=health-connect`.
- Settings hub: профиль, подключения, **данные** (локальная БД, импорт, бэкапы, **облако/FormaSync**), **sync** (приоритет источников), аналитика, питание, велосипед, интерфейс, about.
- Desktop packaging: public OAuth template, seed DB (`desktop:prepare-seed`), secret checks (`desktop:check-secrets`); Google/Yandex **PKCE** by default — [AUTH_PKCE_AUDIT.md](./AUTH_PKCE_AUDIT.md).
- Import → integrity → indexes → warmup → rollback; diagnostics overview.
- Workouts / food / body CRUD; training load (CTL/ATL/TRIMP) с guards на пустой БД.
- Workouts: normal/superset/circuit blocks, compact template structure editor, inline workout-data editing for supersets/circuits.
- Prefill: latest actual exercise history wins for weight/reps/working sets/warmup; templates define composition/order/structure.
- Exercise catalog hygiene: edit catalog row, archive used rows on delete, quick remove from current exercise set.
- **Тело** hub: обзор + контрольные замеры + вес/шаги/сон/пульс/активность + HC tab.
- FormaSync v1 (desktop + mobile cloud); Yandex/Google OAuth PKCE on public install; `link_user` для data scope при Yandex.
- `npm run build` / `check:desktop-build` green.

### Experimental / partial / open

- FormaSync conflict UI (pilot `food_entries`).
- Browser DB import (`POST /api/database/import/stage`) — **admin_browser** only.
- Mini-database export (dev tools).
- Historical Xiaomi/Mi Fitness import is planned, not shipped.
- Automatic calorie calibration scheduling is planned; current backend stores factor/history and manual recalculation path.

### Known issues (кратко)

- **P0:** body measurements edit from chart/history can crash the app.
- **P1:** creating a new exercise template/set can lose block names/order/assignments.
- Health Connect validation is incomplete across sleep, HR, steps and sync ownership.
- Analytics desktop API ≠ mobile local compute.
- Нет `electron-updater` (ручная переустановка).

Полный список: [KNOWN_ISSUES.md](./KNOWN_ISSUES.md).

---

## Ownership / data isolation (кратко)

- Запросы desktop API scoped по **`X-User-ID`** → `get_current_user_id()` (не публичный multi-tenant).
- **Профиль / настройки** — per user (`user_preferences`, nutrition targets, …).
- **Workout presets** — `(user_id, name)`; дедуп при импорте; дочерние `preset_exercises` / sets с `user_id`.
- **Exercise groups / catalog** — user-scoped наборы там, где таблица имеет `user_id`; `all_exercises` поддерживает soft archive (`is_archived`) для безопасного удаления из поиска без изменения истории.
- **Import merge** — копирование в staging с remap на **текущего** пользователя сессии; **replace** — `user_id_remap` после swap.
- **Import в dev-браузере** — привязан к текущему `user_id` сессии, не только admin 1.
- **Reference / shared** — `shared.db`: продукты, stretching/strength catalogs, bike lookups; **без** meal plans, tokens, workouts (v079+). Публичная копия: `scripts/build_public_shared_db.py` + audit.
- **Personal** — всё остальное в `workouts.db`; **никогда** не публиковать в GitHub.
- **Yandex OAuth:** новый `users.id` без `link_user=1` → пустая история; Developer Tools → Data scope / rebind на user 1.

Детали импорта: [DATABASE.md](./DATABASE.md).

---

## Навигация по документации

| Задача | Документ |
|--------|----------|
| Архитектура, sync, import pipeline | [ARCHITECTURE.md](./ARCHITECTURE.md) |
| Desktop UI, wide/responsive | [DESKTOP_UI.md](./DESKTOP_UI.md) |
| Тренировки, суперсеты, круги, пресеты | [WORKOUTS.md](./WORKOUTS.md) |
| Питание, продукты, рационы, прогноз | [NUTRITION.md](./NUTRITION.md) |
| Импорт, warmup, diagnostics | [DATABASE.md](./DATABASE.md) |
| FormaSync / Yandex | [FORMA_SYNC.md](./FORMA_SYNC.md) |
| Health Connect | [HEALTH_CONNECT.md](./HEALTH_CONNECT.md) |
| Historical Xiaomi / Mi import | [HISTORICAL_IMPORTS.md](./HISTORICAL_IMPORTS.md) |
| Mobile active scope / roadmap | [MOBILE.md](./MOBILE.md), [ROADMAP.md](./ROADMAP.md) |
| Cleanup / удалённый код (история) | [archive/CLEANUP.md](./archive/CLEANUP.md) |
| Release / EXE checklist | [RELEASE_READINESS.md](./RELEASE_READINESS.md) |
| Desktop packaging / OAuth | [PACKAGING_SECRETS.md](./PACKAGING_SECRETS.md), [AUTH_PKCE_AUDIT.md](./AUTH_PKCE_AUDIT.md), [POLAR_SETUP.md](./POLAR_SETUP.md) |
| Changelog | [CHANGELOG.md](./CHANGELOG.md) |

---

## Architectural Decisions Already Made

- Local-first data model remains the default: desktop uses `workouts.db` + `shared.db`, mobile uses `myhealth.db`.
- Desktop and mobile UI code stay isolated; shared code is limited and explicit.
- Imported raw values are preserved. Corrections use separate coefficients/fields/logs where possible.
- Workout calorie source priority remains: Polar/chest/manual sources must not be overwritten by bracelet/HC values.
- FormaSync is incremental JSONL over Yandex Disk; it is not the same thing as whole-DB backup or legacy LAN sync.
- Health Connect is a provider and fallback source, not the single source of truth when FIT/Polar/manual records exist.
