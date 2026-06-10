# Drift Reconciliation Report

**Date:** 2026-06-09  
**Source (dev):** `C:\Projects\Forma\MyHealthDashboard`  
**GitHub-clean:** `C:\Projects\forma for git\Forma-Public`  
**Status:** **RECONCILED** (incidental drift files converged; migrations intentionally differ)

---

## Executive summary

Manual reconciliation completed per the drift analysis plan. Neither repo received a blind sync. Instead:

1. **Public release fixes** were ported into dev (null guards, portable paths, bootstrap scripts).
2. **Dev feature logic** was ported into public (strength catalog architecture, `meal_plan_schema` routing, `import_main` handling).
3. **`db_utils.py`** was manually merged in both repos: dev gained public's shared meal-plan `CREATE TABLE` bootstrap blocks; public gained dev's dynamic `meal_plan_schema()` column routing.
4. **Migration numbering was not rewritten** — public remains SCHEMA_VERSION 80; dev remains 79. Tests reference repo-appropriate migration symbols (`_migration_v079_*` vs `_migration_v080_*`).

### Final recommendation (post-reconciliation)

| Before | After |
|--------|-------|
| **C) Manual merge required** | **Converged** for all incidental-drift files listed below |

Remaining intentional divergence (do not blind-sync):

- Migration chain numbering (dev v79 vs public v80)
- Public-only packaging seed pipeline, Yandex `app_folder`, `package.json` version
- `test_exercise_category_filter.py` migration symbol (`v079` dev / `v080` public)

---

## Path corrections (original audit)

| Requested | Actual |
|-----------|--------|
| `backend/services/meal_service.py` | Does not exist — logic in `backend/services/food_service.py` |
| `backend/services/on_import_conflict_handlers.py` | Does not exist — actual file is `backend/services/db_import_conflict_handlers.py` |
| `scripts/backup_to_excel.py` | Root `backup_to_excel.py` in both repos |

---

## Reconciliation actions performed

### Ported public → dev

| File | Change |
|------|--------|
| `backend/core/nutrition_analytics.py` | Null guard on `body_fat_class` before essential-fat check |
| `backend/services/nutrition_analytics_service.py` | `get_profile() or {}` |
| `backup_to_excel.py` | `BACKUP_DIR = SCRIPT_DIR / "backups"` |
| `scripts/import_free_exercise_db.py` | Portable `DEFAULT_ZIP = ROOT / "free-exercise-db-main.zip"` |
| `frontend/electron/main.cjs` | Generic `FORMA_EXTERNAL_START_SCRIPT` example path |
| `start.ps1` | `Ensure-DevBootstrap`, `Ensure-DatabaseSchema` |
| `start.vbs` | First-clone `-Install` instructions in error dialog |
| `scripts/ensure_db_schema_cli.py` | Copied from public (required by `start.ps1`) |
| `backend/database/db_utils.py` | Added shared meal-plan `CREATE TABLE` blocks in `_ensure_shared_minimal_fallback` |

### Ported dev → public

| File | Change |
|------|--------|
| `backend/services/exercise_catalog_service.py` | Full dev version: `_insert_shared_strength_name`, shared-DB sync, archived-name filtering |
| `backend/services/food_service.py` | `meal_plan_schema(conn) == "main"` early return |
| `backend/services/database_import_tasks.py` | `import_shared` or `import_main` source detection for meal plans |
| `backend/services/db_import_conflict_handlers.py` | `dest_schema = meal_plan_schema(conn)` |
| `backend/database/db_utils.py` | Dynamic `meal_plan_schema()` column ensures (main or shared) |
| `backend/tests/test_exercise_catalog_dedupe.py` | Dev fixture with shared DB bootstrap |
| `backend/tests/test_exercise_category_filter.py` | Added `_migration_v080_strength_catalog_populate_shared` (public migration name) |
| `requirements.txt` | `pytcx>=1.0.0` |

### No change required

| File | Reason |
|------|--------|
| `frontend/src/pages/Body/**` (31 files) | Already functionally identical |
| `frontend/src/pages/FoodDiary/DeficitPerKgFatCard.tsx` | Content identical (EOL only) |
| `backend/tests/test_exercise_sets_user_scope.py` | Byte-identical |

---

## Reconciliation matrix (final)

| File | Source of Truth | Port Dev→Public | Port Public→Dev | Manual Merge | Post-merge status |
|------|-----------------|-----------------|-----------------|--------------|-------------------|
| `nutrition_analytics.py` | Public | — | Done | No | **Converged** |
| `food_service.py` | Dev | Done | — | Yes | **Converged** |
| `nutrition_analytics_service.py` | Public | — | Done | No | **Converged** |
| `exercise_catalog_service.py` | Dev | Done | — | Yes | **Converged** |
| `database_import_tasks.py` | Dev | Done | — | Yes | **Converged** |
| `db_import_conflict_handlers.py` | Dev | Done | — | Yes | **Converged** |
| `db_utils.py` | Both | Partial | Partial | **Yes** | **Converged** |
| `Body/**` | Either | — | — | No | **Converged** |
| `DeficitPerKgFatCard.tsx` | Either | — | — | No | **Converged** |
| `electron/main.cjs` | Public | — | Done | No | **Converged** |
| `backup_to_excel.py` | Public | — | Done | No | **Converged** |
| `import_free_exercise_db.py` | Public | — | Done | No | **Converged** |
| `start.ps1` | Public | — | Done | Light | **Converged** |
| `start.vbs` | Public | — | Done | No | **Converged** |
| `requirements.txt` | Dev | Done | — | Verify | **Converged** |
| `test_exercise_catalog_dedupe.py` | Dev | Done | — | With catalog | **Converged** |
| `test_exercise_category_filter.py` | Dev | Done (v080) | — | Migration ref | **Aligned** (repo-specific symbol) |
| `test_exercise_sets_user_scope.py` | N/A | — | — | No | **Converged** |

---

## Test results (post-reconciliation)

### Dev (`MyHealthDashboard`)

```
backend/tests/test_exercise_catalog_dedupe.py     — passed
backend/tests/test_exercise_category_filter.py      — passed
backend/tests/test_exercise_sets_user_scope.py      — passed
backend/tests/test_meal_plans_user_scope.py         — passed
Total exercise tests: 7 passed
Total meal plan tests: 3 passed
```

### Public (`Forma-Public`)

```
backend/tests/test_exercise_catalog_dedupe.py     — passed
backend/tests/test_exercise_category_filter.py      — passed
backend/tests/test_exercise_sets_user_scope.py      — passed
backend/tests/test_meal_plans_user_scope.py         — passed
Total exercise tests: 7 passed
Total meal plan tests: 3 passed
```

---

## Intentional divergence preserved

These were **not** merged (per rules 7–8):

| Area | Dev | Public |
|------|-----|--------|
| `database/migrations.py` SCHEMA_VERSION | 79 | 80 |
| Migration chain | v078 meal finalize, v079 strength | v078 cardio, v079 meal, v080 strength |
| Packaging seed pipeline | Dev-specific | Public release scripts |
| Yandex OAuth scopes | `disk.read/write` (dev) | `disk.app_folder` only (public) |
| `frontend/package.json` | 0.72.0 | 0.73.0 |
| Databases / `.env` | Not copied | Not copied |

See also [`RELEASE_SYNC_REPORT.md`](RELEASE_SYNC_REPORT.md) for release-readiness context.

---

## Verification command

Normalized-text comparison of all reconciled key files:

```
backend/core/nutrition_analytics.py          CONVERGED
backend/services/food_service.py             CONVERGED
backend/services/nutrition_analytics_service.py CONVERGED
backend/services/exercise_catalog_service.py CONVERGED
backend/services/database_import_tasks.py    CONVERGED
backend/services/db_import_conflict_handlers.py CONVERGED
backend/database/db_utils.py                 CONVERGED
requirements.txt                             CONVERGED
start.ps1                                    CONVERGED
start.vbs                                    CONVERGED
backup_to_excel.py                           CONVERGED
scripts/import_free_exercise_db.py           CONVERGED
frontend/electron/main.cjs                   CONVERGED
backend/tests/test_exercise_catalog_dedupe.py CONVERGED
```

---

## Out of scope (honored)

- No blind repo sync
- No migration number rewrites
- No dev database or `.env` copies
- No changes to intentional public-only release fixes (packaging, Yandex, httpx edge)
