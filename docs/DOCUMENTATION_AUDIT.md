# DOCUMENTATION_AUDIT.md

Documentation maintenance snapshot after desktop stabilization, mobile planning, Health Connect validation planning and historical import roadmap.

Last updated: **2026-06-05**.

---

## Active Documentation Status

| Document | Status | Notes |
|----------|--------|-------|
| `README.md` | актуальный | Root map for active docs |
| `docs/README.md` | актуальный | Active docs index |
| `PROJECT_CONTEXT.md` | актуальный | Current desktop/mobile/HC/sync state, schema v74, ownership |
| `ARCHITECTURE.md` | актуальный | Desktop/mobile boundaries, sync, historical imports, calibration |
| `DATABASE.md` | актуальный | Schema v74, import/warmup, backup/restore, block metadata, calibration history |
| `DESKTOP_UI.md` | актуальный | Desktop UI, responsive, workout UI, OAuth |
| `WORKOUTS.md` | актуальный | New canonical workouts/supersets/circuits/templates/history doc |
| `NUTRITION.md` | актуальный | New canonical nutrition/products/meal plans/forecast doc |
| `ANALYTICS.md` | актуальный | CTL/TRIMP, calibration, Xiaomi correction, future analytics |
| `HEALTH_CONNECT.md` | актуальный | HC ingest plus validation priorities/open questions |
| `FORMA_SYNC.md` | актуальный | Yandex/JSONL sync contract and validation priorities |
| `MOBILE.md` | актуальный | Mobile active development target scope and gaps |
| `HISTORICAL_IMPORTS.md` | актуальный | Planned Xiaomi/Mi/Zepp historical import and correction rules |
| `ROADMAP.md` | актуальный | Mobile-first priorities, P0/P1 bugs, planned systems |
| `RELEASE_READINESS.md` | актуальный | Release blockers, desktop smoke, mobile/HC/sync gates |
| `KNOWN_ISSUES.md` | актуальный | Current limitations and resolved notes |
| `CHANGELOG.md` | актуальный | Release history and RC documentation entry |
| `PLATFORMS.md` | актуальный | Platform isolation and navigation maps |

---

## Archived During This Audit

| Document | Reason | Current Source |
|----------|--------|----------------|
| `docs/CLEANUP.md` -> `docs/archive/CLEANUP.md` | Completed desktop stabilization / removed-code report | `PROJECT_CONTEXT.md`, `PLATFORMS.md`, `ANALYTICS.md`, `DESKTOP_UI.md` |

No documentation was deleted.

---

## Existing Archive Status

The existing `docs/archive/` content remains archived. Key categories:

- completed investigations: `HEALTH_CONNECT_AUDIT.md`, `FORMA_SYNC_REPAIR_RESULTS.md`, `PERFORMANCE_BASELINE.md`;
- old domain how-to docs: `WORKOUT_PRESETS.md`, old `NUTRITION.md`, `BIKE.md`, `STRETCHING.md`, `FIT_SYNC.md`;
- old architecture duplicates: `API.md`, `SERVICES.md`, `ANALYTICS_ARCHITECTURE.md`, `SOURCE_RESOLVER.md`;
- old UI/planning docs: `UI_GUIDELINES.md`, `SETTINGS.md`, `DESKTOP_IMPROVEMENTS.md`, `DESKTOP_DEV_COEXISTENCE.md`, `MOBILE_PARITY.md`.

New active replacements:

- `WORKOUTS.md` replaces the old active need for `archive/WORKOUT_PRESETS.md`;
- `NUTRITION.md` replaces the old active need for `archive/NUTRITION.md`;
- `archive/CLEANUP.md` remains historical only.

---

## Documents To Exclude From Active Cursor Context

Prefer not to load these unless investigating history:

- `docs/archive/*`;
- `.cursor/plans/*`;
- `archive/excel_import/*`;
- `backend/tests/STRENGTH_HR_V2_QA.md`;
- generated / dependency docs under `node_modules`, `.pytest_cache`, and `venv`.

Use the active docs index first: `docs/README.md`.

---

## Active Count

Active documentation after the audit:

- `docs/*.md` active files excluding `docs/archive/`: **17** including `docs/README.md`;
- canonical active source documents excluding the docs index: **16**;
- root active doc: `README.md`;
- mobile-specific active docs outside `docs/`: keep for mobile phase (`mobile/README.md`, `mobile/RELEASE_CHECKLIST.md`, `mobile/CLOUD_SYNC_ANDROID.md`, `mobile/DESIGN_SYSTEM.md`, `mobile/BUILD_EAS.md`, `mobile/docs/LOCAL_READINESS.md`).
