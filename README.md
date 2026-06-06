# Forma (MyHealthDashboard)

Локальный health/fitness продукт с двумя клиентами:
- `desktop` (Electron + embedded FastAPI; локальные SQLite базы создаются при запуске);
- `mobile` (React Native Android; локальная база создается на устройстве).

Desktop сейчас близок к feature-complete и находится в стабилизации. Активные приоритеты проекта: завершение mobile-приложения, Health Connect validation, sync validation, historical Xiaomi import, bugfix/cleanup, automatic calorie calibration and future analytics expansion.

## Быстрый старт

| Сценарий | Команда | Результат |
|---|---|---|
| Dev web + API | `.\start.ps1` | UI на `:5173`, API на `:8000`/`:8002` |
| Desktop release | `cd frontend && npm run desktop:dist` | `frontend/release-build/Forma Setup *.exe` |
| Android release | `cd mobile && npm run android:release` | `mobile/android/.../app-release.apk` |

Packaged desktop API: `http://127.0.0.1:18002/api/health`.

## Local Setup From Source

This public copy intentionally contains source code, configuration templates and documentation only. Runtime databases, imports, logs, backups, caches and build outputs are not part of the source distribution.

Prerequisites:
- Node.js 18+
- Python 3.11+
- Windows for the packaged desktop build
- Android Studio / SDK for future Android mobile builds

Setup:

```powershell
copy .env.example .env
python -m venv venv
.\venv\Scripts\python.exe -m pip install -r requirements.txt
npm install
npm install --prefix frontend
npm install --prefix mobile
```

Run desktop development mode:

```powershell
npm run desktop:dev
```

If API returns 500 with `no such column` / `no such table`, the local database migrations did not finish. Stop all API/Electron windows, then:

```powershell
.\start.ps1 -Stop
$env:PYTHONPATH = "."
.\venv\Scripts\python.exe scripts\migrate_db.py
.\start.ps1
```

Expected output from `migrate_db.py`: `schema_version=75`, `users_table=yes`, `cardio_duration_sec=yes`.

Build desktop installer:

```powershell
npm run desktop:dist
```

Run mobile Metro / Android:

```powershell
npm run mobile:start
npm run mobile:android
```

## Public Source Exclusions

Excluded from this GitHub-ready copy:

| Excluded item | Why it is not required for source publication |
|---|---|
| `*.db`, `*.sqlite`, WAL/SHM files | Local runtime databases. They contain user data and are recreated/migrated by the app. |
| `*.bak`, `shared.pre-*`, `workouts.pre-*` | Local backup snapshots. They are private data and not needed to build or run from source. |
| `.env`, `.api-port`, `frontend/.env.local` | Machine-specific secrets, OAuth credentials and local port state. `.env.example` is kept instead. |
| `node_modules/`, `venv/`, `.venv/` | Dependency installs. They are restored with `npm install` and `pip install`. |
| `frontend/dist/`, `frontend/backend_bin/`, `frontend/release*/`, `mobile/android/**/build/` | Generated build artifacts. They are recreated by build commands. |
| `import-jobs/`, `fit_files/`, `polar_temp/`, `mini-db-exports/`, `data/` | Import queues, exported workouts and intermediate personal data. Not source code. |
| `logs/`, `*.log`, `sync_log.txt` | Local diagnostic output. Useful for debugging one machine, not for public source. |
| `cache/`, `.pytest_cache/`, `__pycache__/`, Playwright reports/results | Tool caches and test outputs. They are generated locally. |
| Polar export ZIPs and other `*.zip` exports | Personal export archives. They are private data and not needed for builds. |
| `.cursor/`, editor caches | Local IDE state. Not required for contributors or CI. |

## Текущее состояние (2026-06-05)

- **Desktop:** dashboard, settings, workouts/food/body hub, analytics, import/warmup, FormaSync, HC hub; mostly complete, stabilization phase.
- **Mobile:** active development priority; target is standalone daily app scope, not a thin companion.
- **Health Connect:** integration/validation phase for sleep, HR, steps, calories and sync ownership.
- **Sync:** FormaSync foundation exists; validation and conflict/source ownership checks are ongoing.
- **Workouts:** обычные тренировки, суперсеты, круги, структура блоков, prefill из последней фактической тренировки, compact history.
- **Data hygiene:** безопасное управление справочником упражнений; used rows архивируются, история не переписывается.
- **Planned:** historical Xiaomi/Mi import, automatic 14-day calorie recalibration, future analytics expansion.
- **Open blockers:** body measurement edit crash (P0), exercise template block structure loss (P1).

Чеклист релиза: [`docs/RELEASE_READINESS.md`](docs/RELEASE_READINESS.md).

## Known limitations now

- `legacy_api` mobile требует доступного ПК API.
- CTL/ATL/TSB — только cardio TRIMP.
- Mobile target scope is standalone daily use; desktop-only heavy imports/deep analytics remain documented exceptions.
- HC rollups sync лучше, чем raw HC records.
- FormaSync conflicts — pilot `food_entries`.

Детали: `docs/KNOWN_ISSUES.md`, `docs/MOBILE.md`, `docs/ANALYTICS.md`, `docs/HEALTH_CONNECT.md`.

## Карта документации

| Файл | Назначение |
|---|---|
| `docs/PROJECT_CONTEXT.md` | Current desktop/mobile/HC/sync status, ownership |
| `docs/RELEASE_READINESS.md` | Release blockers, EXE/import/backup/mobile/HC gates |
| `docs/ARCHITECTURE.md` | Desktop/mobile architecture, sync, imports, calibration |
| `docs/DESKTOP_UI.md` | Shell, responsive, body hub |
| `docs/WORKOUTS.md` | Strength workouts, supersets, circuits, presets, history |
| `docs/NUTRITION.md` | Food diary, products, meal plans, forecast |
| `docs/DATABASE.md` | Import, warmup, diagnostics |
| `docs/FORMA_SYNC.md` | Yandex, FormaSync |
| `docs/HEALTH_CONNECT.md` | HC + desktop dashboard |
| `docs/MOBILE.md` | Android active development scope and gaps |
| `docs/HISTORICAL_IMPORTS.md` | Planned Xiaomi/Mi/Zepp historical import |
| `docs/ANALYTICS.md` | CTL/TRIMP, calibration, future analytics |
| `docs/KNOWN_ISSUES.md` | Limitations |
| `docs/ROADMAP.md` | Backlog |
| `docs/CHANGELOG.md` | History |
| `docs/PLATFORMS.md` | Platform boundaries |
| `docs/DOCUMENTATION_AUDIT.md` | Documentation status and archive decisions |

Архив устаревших документов и закрытых расследований: `docs/archive/`.

## Stack

React + Vite + TanStack Query, FastAPI, SQLite, Electron, React Native (Android), Health Connect, Yandex Disk (FormaSync).
