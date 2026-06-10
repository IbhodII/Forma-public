# Documentation Sync Report

**Date:** 2026-06-09  
**Dev source:** `C:\Projects\Forma\MyHealthDashboard`  
**Public target:** `C:\Projects\forma for git\Forma-Public`  
**Scope:** Documentation reconciliation only. Public release, packaging, GitHub and audit documentation was preserved.

---

## Post-Reconciliation Documentation Sync Addendum

**Run:** 2026-06-09  
**Goal:** verify and update Dev/Public migration-history documentation against actual `database/migrations.py` code after the migration reconciliation planning pass.

### Schema version found in code

| Repository | `database/migrations.py` result | Latest migration |
|------------|----------------------------------|------------------|
| Dev | `SCHEMA_VERSION=79` | `_migration_v079_strength_catalog_populate_shared` |
| Public | `SCHEMA_VERSION=80` | `_migration_v080_strength_catalog_populate_shared` |

### Migration chain found in code

| Public migration | Public purpose | Current Dev equivalent | Status |
|------------------|----------------|------------------------|--------|
| v078 | Add `cardio_workouts.duration_sec` / `distance_km`; backfill from legacy `duration` / `distance` | None | Missing in Dev |
| v079 | Meal finalization into `workouts.db`; purge shared meal tables; main meal-table hardening | Dev v078 | Mostly equivalent |
| v080 | Populate canonical `shared.strength_exercises` | Dev v079 | Logical equivalent |

### Files updated in Dev

- `README.md`
- `docs/DATABASE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/RELEASE_READINESS.md`
- `docs/ROADMAP.md`
- `docs/DOCUMENTATION_REFRESH_PLAN.md`
- `docs/DOCUMENTATION_AUDIT.md`
- `DOCUMENTATION_SYNC_REPORT.md`

### Files updated in Public

- `README.md`
- `docs/DATABASE.md`
- `docs/KNOWN_ISSUES.md`
- `docs/RELEASE_READINESS.md`
- `docs/ROADMAP.md`
- `docs/DOCUMENTATION_REFRESH_PLAN.md`
- `docs/DOCUMENTATION_AUDIT.md`
- `RELEASE_SYNC_REPORT.md`
- `DOCUMENTATION_SYNC_REPORT.md`

### Inconsistencies fixed

- Clarified that Public remains internally consistent at `SCHEMA_VERSION=80`.
- Clarified that Dev remains `SCHEMA_VERSION=79` and is not yet fully schema-equivalent with Public.
- Added/updated migration-history mapping for Public v078/v079/v080 vs Dev missing/v078/v079.
- Replaced obsolete “renumber Dev migrations” guidance with the safer appended Dev reconciliation migration strategy.
- Updated stale documentation audit notes that still said `Schema v77`.
- Added release-readiness and roadmap notes that future shared migrations should continue from v081+ only after Dev receives an appended reconciliation migration.

### Remaining documentation debt

- Historical release/audit reports still contain historical v79/v80 divergence notes; these are preserved as records.
- Archive docs may still contain older schema/port wording behind archive status.
- If a real Dev v080 reconciliation migration is later implemented, active docs and this report must be updated again to mark schema equivalence.

**DOCUMENTATION STATUS = ISSUES REMAIN**

Reason: documentation now matches verified code, but verified code does not show completed Dev/Public schema reconciliation. Dev is still v79 and lacks Public v078 cardio normalization.

---

## Executive Summary

Public documentation was reconciled against Dev docs and current Public code without a blind docs-directory overwrite.

Current Public source of truth:

- `SCHEMA_VERSION=80`
- `v078` — cardio `duration_sec` / `distance_km`
- `v079` — meal-plan finalization into `workouts.db`
- `v080` — shared strength catalog population
- Desktop installer line prepared for `0.74.0` / `release74`
- Public OAuth uses Google/Yandex PKCE; Yandex public app-folder builds can use `YANDEX_SCOPES=cloud_api:disk.app_folder`
- `shared.db` remains reference-only and must pass `audit_public_shared_db.py`

---

## Classification

### Dev should replace Public

No whole-file replacements were performed. Dev docs contain useful current wording, but several files also contain Dev-only schema numbering (`SCHEMA_VERSION=79`), so copying them directly would regress Public docs.

### Public should remain unchanged

The following Public-specific docs/reports were preserved as Public source of truth:

- `PACKAGING_SECRETS.md` — preserved and manually updated, not overwritten
- `AUTH_PKCE_AUDIT.md` — preserved and manually updated, not overwritten
- `GITHUB_CLEAN_SYNC_REPORT.md`
- `RELEASE_SYNC_REPORT.md`
- `DRIFT_RECONCILIATION_REPORT.md`
- `docs/DOCUMENTATION_REFRESH_PLAN.md`
- `docs/GITHUB_README_DRAFT.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `LICENSE`
- `SYNC.md`
- `LAUNCHERS.md`
- archive docs under `docs/archive/`
- mobile release docs under `mobile/`
- frontend icon/build docs under `frontend/`

### Manual merge required and completed

| File | Merge reason | Result |
|------|--------------|--------|
| `README.md` | Dev had current docs map/seed wording; Public needed v80 + release74 + GitHub policy | Manually merged |
| `docs/DATABASE.md` | Public schema is v80 while Dev is v79 | Manually merged v80 migration chain + seed ownership |
| `docs/ARCHITECTURE.md` | Dev had units/packaging boundary wording; Public needed v80 | Manually merged |
| `docs/CHANGELOG.md` | Public release line stale; Dev had documentation refresh wording but wrong schema for Public | Manually merged |
| `docs/PACKAGING_SECRETS.md` | Public-only packaging doc must be preserved | Manually updated Yandex scopes + httpx/httpcore guard |
| `docs/AUTH_PKCE_AUDIT.md` | Public-only OAuth audit must be preserved | Manually updated Yandex app-folder scope behavior |
| `docs/FORMA_SYNC.md` | Dev had current OAuth/scope wording; Public needed v79/v80 ownership | Manually merged |
| `docs/MOBILE.md` | Dev had units guidance | Manually merged |
| `docs/ROADMAP.md` | Dev had documentation hygiene/units completion notes | Manually merged |
| `docs/RELEASE_READINESS.md` | Dev had seed/audit gates; Public had GitHub policy | Manually merged |
| `docs/DEVELOPER_SETUP.md` | Dev had first-run/seed notes; Public needed release-output wording | Manually merged |
| `docs/README.md` | Docs index needed this report | Manually updated |

---

## Files Copied From Dev

None.

This was intentional. Dev documentation is current for the original project, but Public has a different migration chain and release surface. Blind copying would have changed Public schema documentation from v80 to v79 and risked losing GitHub/release audit context.

---

## Files Preserved From Public

Public-specific release/audit docs preserved:

- `GITHUB_CLEAN_SYNC_REPORT.md`
- `RELEASE_SYNC_REPORT.md`
- `DRIFT_RECONCILIATION_REPORT.md`
- `docs/DOCUMENTATION_REFRESH_PLAN.md`
- `docs/GITHUB_README_DRAFT.md`
- `docs/PACKAGING_SECRETS.md`
- `docs/AUTH_PKCE_AUDIT.md`
- `docs/RELEASE_READINESS.md`

General docs preserved where already aligned:

- `docs/PROJECT_CONTEXT.md`
- `docs/WORKOUTS.md`
- `docs/NUTRITION.md`
- `docs/ANALYTICS.md`
- `docs/HEALTH_CONNECT.md`
- `docs/DESKTOP_UI.md`
- `docs/PLATFORMS.md`
- `docs/POLAR_SETUP.md`
- `docs/HISTORICAL_IMPORTS.md`
- `docs/KNOWN_ISSUES.md`
- `docs/DOCUMENTATION_AUDIT.md`
- archive docs under `docs/archive/`

---

## Files Manually Merged

- `README.md`
- `docs/README.md`
- `docs/DATABASE.md`
- `docs/ARCHITECTURE.md`
- `docs/CHANGELOG.md`
- `docs/PACKAGING_SECRETS.md`
- `docs/AUTH_PKCE_AUDIT.md`
- `docs/FORMA_SYNC.md`
- `docs/MOBILE.md`
- `docs/ROADMAP.md`
- `docs/RELEASE_READINESS.md`
- `docs/DEVELOPER_SETUP.md`

---

## Remaining Documentation Drift

| Area | Status |
|------|--------|
| Dev/Public schema numbering | Intentional. Public is v80; Dev is v79. Docs now call out the difference. |
| Archived docs | Preserved as historical; some contain old port/schema references behind archive banners. |
| Public release reports | Preserved as release/audit records, not rewritten into Dev style. |
| Changelog history | Historical sections remain chronological and may mention older schema/build lines; current header and Unreleased section now reflect Public release prep. |
| Mobile units | Documented as guidance; device-level QA remains future work. |

---

## Verification Notes

Checked current Public code before merging:

- `database/migrations.py`: latest migration is `80`, `_migration_v080_strength_catalog_populate_shared`
- `frontend/package.json`: prepared for `0.74.0` / `release74`
- `backend.spec`: bundles `packaging/seed/*.db`, not dev `workouts.db`
- `scripts/check_packaging_secrets.py`: checks `httpx` / `httpcore`, public env, seed DBs
- `scripts/audit_public_shared_db.py`: validates root/seed `shared.db` reference-only policy

No code, database, migration, or packaging script changes were made for documentation reconciliation.
