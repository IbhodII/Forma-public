# GitHub Clean Sync Report

**Date:** 2026-06-09  
**Source (read-only):** `C:\Projects\Forma\MyHealthDashboard`  
**Target (updated):** `C:\Projects\forma for git\Forma-Public`  
**Scope:** Post v078/v079 `shared.db` cleanup — documentation + sanitized `shared.db`

Current status note: this is a historical cleanup report. Active Public schema documentation is now `SCHEMA_VERSION=80` in `docs/DATABASE.md`; Dev remains `SCHEMA_VERSION=79` until a future appended reconciliation migration. Older v79 references below describe the state at the time of this cleanup.

---

## Executive summary

| Item | Result |
|------|--------|
| Documentation updated | **Yes** — see §1 |
| Dev `shared.db` raw copy | **No** — failed safety audit |
| Sanitized `shared.db` deployed | **Yes** — from `shared.public.db` |
| `workouts.db` in target | **Removed** |
| `.env` / `*.bak` in target | **Removed** |
| `.gitignore` DB policy | **Updated** (`**/*.db` + `!/shared.db`) |
| Secret / personal scan | **PASS** (see §4) |
| **Final recommendation** | **READY FOR GITHUB** |

---

## 1. Documentation files updated

| File | Changes |
|------|---------|
| `README.md` | Added **Public Repository Data Policy** table; schema v79 note |
| `docs/DATABASE.md` | Two-DB model, v078/v079, mermaid diagram, **Public Repository Data Policy** |
| `docs/ARCHITECTURE.md` | Ownership split (reference vs personal), storage table |
| `docs/FORMA_SYNC.md` | Database split vs FormaSync; shared reference-only after v078 |
| `docs/PROJECT_CONTEXT.md` | SCHEMA_VERSION 79; shared vs workouts ownership |
| `docs/RELEASE_READINESS.md` | **Public Repository Data Policy** gate before publish |
| `docs/PACKAGING_SECRETS.md` | `build_public_shared_db.py` + audit step; dev shared warning |
| `docs/NUTRITION.md` | Meal plans workouts-only after v078 purge |
| `docs/WORKOUTS.md` | Strength catalog canonical in `shared.strength_exercises` (v079) |
| `docs/README.md` | DATABASE.md description updated |
| `doc/README.md` | Generic clone path (no `C:\Users\brett\...`) |
| `scripts/audit_public_shared_db.py` | **Added** — local audit helper |
| `scripts/build_public_shared_db.py` | Default source → repo `shared.db` (no hardcoded dev path) |
| `.gitignore` | `**/*.db` + `!/shared.db`; `packaging/**/*.db` |

**Outdated statements removed / corrected:**

- Meal plans “legacy copies remain in shared” → **purged in v078**
- SCHEMA_VERSION 77 → **79**
- Dev `shared.db` safe to commit → **rejected**; only sanitized build
- Empty meal-plan table shells in root `shared.db` → **replaced**

---

## 2. `shared.db` — source audit (why raw dev file was NOT copied)

### `MyHealthDashboard\shared.db` (requested source path)

**Result: NOT READY FOR GITHUB**

| table | rows | issue |
|-------|-----:|-------|
| `food_products` | 21 | OK |
| `food_product_components` | 0 | OK |
| `stretching_exercises` | 123 | OK |
| `strength_exercises` | 53 | OK |
| `tire_coefficients` | 364,904 | bloated duplicates (dedupe → 4 in public build) |
| `surface_multipliers` | 364,904 | bloated duplicates (dedupe → 4) |
| `meal_plan_items` | 0 | **forbidden** — personal meal plan table |
| `openfoodfacts_cache` | 2 | **forbidden** — runtime cache |
| `daily_meal_plans_v063` | 0 | **suspicious** legacy migration artifact |

Failed checks: `no_meal_plans`, `no_runtime_cache`, `all_tables_reference`.

### `MyHealthDashboard\shared.public.db` (sanitized build artifact)

Built by `scripts/build_public_shared_db.py` from dev `shared.db` (whitelist copy + tire/surface dedupe).

**Result: READY FOR GITHUB**

| table | rows |
|-------|-----:|
| `food_products` | 21 |
| `food_product_components` | 0 |
| `stretching_exercises` | 123 |
| `strength_exercises` | 53 |
| `tire_coefficients` | 4 |
| `surface_multipliers` | 4 |

All verification checks: **PASS** (no tokens, no meal plans, no workouts, no personal tables).

### Copy action

| Step | Action |
|------|--------|
| Copy dev `shared.db` directly | **Skipped** — failed audit |
| Copy `shared.public.db` → `Forma-Public\shared.db` | **Done** (147,456 bytes) |
| Post-copy audit on target | **READY FOR GITHUB** |

---

## 3. `.gitignore` status

```gitignore
**/*.db
!/shared.db
packaging/**/*.db
*.bak
.env
.env.*
```

- Only **root** `shared.db` may be tracked.
- `workouts.db`, `packaging/seed/*.db`, `packaging/seed-template/*.db` are ignored.
- Matches task requirement: `*.db` + `!/shared.db` pattern (extended with `**/` for subfolders).

---

## 4. Secret and personal data scan (target)

| Check | Result |
|-------|--------|
| `workouts.db` on disk | **Absent** (removed) |
| `*.bak` on disk | **Absent** (removed `shared.db.pre-split.bak`, `workouts.db.pre-split.bak`) |
| Root `.env` | **Removed** (empty placeholders only; gitignored) |
| `import-jobs/` | **Absent** |
| Non-empty `CLIENT_SECRET` / `OFF_PASSWORD` in tracked env templates | **None** (`.env.desktop.public` empty ids) |
| Token columns in `shared.db` | **None** (audit PASS) |
| Real local IPs in active docs | **Generic** (`192.168.x.x` in examples only) |
| Personal absolute paths in active docs | **Scrubbed** in `doc/README.md`; archive `SETUP.md` retains historical paths (acceptable) |

`scripts/build_public_shared_db.py` previously defaulted to `C:\Projects\Forma\MyHealthDashboard\shared.db` — **fixed** to repo-relative default.

---

## 5. Architecture reminder (published docs)

| Store | Contents | GitHub |
|-------|----------|--------|
| `shared.db` | Food catalog, stretching catalog, strength exercise catalog, tire/surface lookups | **Yes** (sanitized) |
| `workouts.db` | Workouts, sets, history, body metrics, **meal plans/rations**, tokens, sync | **Never** |

Strength exercise **catalog** → `shared.db`. Workout **performance/history** → `workouts.db`.

---

## 6. Remaining manual checks before `git push`

1. `git status` — confirm only intended files staged (`shared.db`, docs, scripts, `.gitignore`).
2. `python scripts/audit_public_shared_db.py shared.db` — expect **READY FOR GITHUB**.
3. Confirm no `workouts.db`, `.env`, `*.bak`, `venv/`, `node_modules/`, `frontend/release*/` tracked.
4. Optional: run `npm run desktop:check-secrets` after `desktop:prepare-seed` when building installer locally.
5. Review diff of `shared.db` binary in PR description (table list above).

---

## 7. Final recommendation

### **READY FOR GITHUB**

Root `shared.db` is sanitized reference data only. Personal databases, backups, and local `.env` were removed from the target tree. Documentation reflects v078/v079 database ownership.

**Do not copy** dev `MyHealthDashboard\shared.db` directly to GitHub — always use `build_public_shared_db.py` + `audit_public_shared_db.py`.

---

*Report generated after shared.db migration cleanup. Dev project `C:\Projects\Forma\MyHealthDashboard` was inspected read-only; not modified.*
