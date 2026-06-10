# GitHub Publication Audit

Target repository: `C:\Projects\forma for git\Forma-Public`  
Audit date: 2026-06-09  
Scope: audit only; no code, migration, build, release, or cleanup changes were made.

## Final Verdict

**FAIL**

The repository is close to public-ready from a secrets/database/gitignore perspective, but it should not be published as-is because tracked public assets still expose personal or machine-specific information:

- Tracked screenshots contain apparent personal health/body/workout data and a bike route map with location context.
- Tracked legacy launcher scripts contain a real local Windows username path: `C:\Users\brett\Desktop\MyHealthDashboard`.
- Archived docs also contain the same username path. These are less severe than executable launchers, but should be sanitized for a clean public repo.

No high-confidence OAuth client secrets, access tokens, refresh tokens, bearer tokens, private keys, or password literals were found in tracked source/docs/templates.

## Release Blockers

1. **Tracked screenshots expose personal/health/location data**

   Classification: **release blocker**

   Files:

   - `docs/screenshots/Главный экран формы.png`
   - `docs/screenshots/Карточка тренировки силовой.png`
   - `docs/screenshots/велотрек.png`
   - `docs/screenshots/КК.png`

   Findings:

   - `Главный экран формы.png` shows body weight, calories, CTL/fatigue-style metrics, dates, and integration state.
   - `Карточка тренировки силовой.png` shows a dated strength workout, exercise names, weights/reps, HR trace, and block details.
   - `велотрек.png` shows a bike route map with location labels, GPS route, HR/speed/cadence/elevation/temperature traces.
   - `КК.png` shows body/food metrics including weight, waist, body fat, lean mass, BMI, calories, and dated daily cards.

   Recommended cleanup:

   - Replace these with synthetic demo screenshots generated from fake data, or remove them from the public README/docs.
   - Treat route/location screenshots as sensitive even when they look like demo data.

2. **Tracked launcher scripts contain a real local username path**

   Classification: **release blocker**

   Files:

   - `start_sync.bat`
   - `start_react_only.bat`
   - `start_manual.bat`
   - `start_headless.vbs`

   Findings:

   - These files reference `C:\Users\brett\Desktop\MyHealthDashboard`.
   - Because they are executable launchers, this is more than harmless example text.

   Recommended cleanup:

   - Delete obsolete personal launchers before publication, or rewrite them to use repo-relative paths.
   - Prefer `start.ps1` as the canonical launcher if it is already repo-relative.

## Warnings

1. **Archived documentation contains personal local paths**

   Classification: **warning**

   Files:

   - `docs/archive/SETUP.md`
   - `docs/archive/FIT_SYNC.md`

   Findings:

   - Multiple examples use `C:\Users\brett\Desktop\MyHealthDashboard`.
   - These are historical docs, but public docs should not preserve a real local username unless intentionally documenting prior local state.

   Recommended cleanup:

   - Replace with generic examples such as `C:\Projects\Forma` or `%USERPROFILE%\Projects\Forma`.

2. **Tracked binary `.docx` cannot be audited as text**

   Classification: **warning**

   File:

   - `docs/Forma_Mobile_v2_Architecture_Plan.docx`

   Finding:

   - The `.docx` is tracked but could not be inspected by the text/image audit path.

   Recommended cleanup:

   - Remove it before publication or convert it to reviewed Markdown.
   - If keeping it, manually inspect document text, metadata, comments, revision history, author fields, and embedded media.

3. **README includes personal aggregate project statistics**

   Classification: **warning**

   File:

   - `README.md`

   Finding:

   - The README states aggregate historical counts such as `500+` strength workouts, `199` runs, `82` bike workouts, and `28` swims.
   - This is not a raw dataset leak, but it is personal context.

   Recommended cleanup:

   - Keep only if intentional for the public project story.
   - Otherwise generalize the wording.

4. **Support email appears in source**

   Classification: **warning / acceptable if intentional**

   File:

   - `frontend/src/modules/settings/components/SupportProjectSettings.tsx`

   Finding:

   - `Health_Dashboard@yandex.ru` is hardcoded as a support email.

   Recommended cleanup:

   - Confirm this is a public project contact address, not a private personal mailbox.

5. **Public OAuth client IDs are present in `.env.desktop.public`**

   Classification: **acceptable public config, verify ownership**

   File:

   - `.env.desktop.public` (currently untracked)

   Finding:

   - Contains public OAuth client identifiers for Polar, Yandex, and Google plus localhost redirect URIs.
   - No client secrets are present.

   Recommended cleanup:

   - Safe to keep if these are intended public app IDs.
   - If the OAuth apps are tied to a private/personal account, consider replacing with user-supplied setup instructions.

6. **Working tree is not clean**

   Classification: **publication process warning**

   Finding:

   - `git status --short -uall` reports many modified files, deleted legacy docx files, and untracked public-sync files.
   - This audit does not judge whether those code/doc changes are correct, only whether publication-sensitive artifacts are present.

   Recommended cleanup:

   - Before publishing, review the complete diff and stage only intended public files.
   - Re-run this audit after cleanup and staging.

## Secrets And Credentials

Result: **PASS with warnings**

Scans performed:

- Secret-like source/doc scan for OAuth client secrets, API keys, access tokens, refresh tokens, bearer tokens, passwords, and private key headers.
- Tracked-file scan with `git grep` for populated secret-style assignments and private path patterns.
- Env template review for `.env.example`, `frontend/.env.example`, `mobile/.env.example`, and `.env.desktop.public`.

Findings:

- No high-confidence private keys, API keys, bearer tokens, access tokens, refresh tokens, or real OAuth client secrets were found in tracked source/docs/templates.
- `.env` is ignored.
- `.env.*` is ignored except `.env.example`, nested `.env.example`, and `.env.desktop.public`.
- `frontend/.env.local` and `mobile/.env` are ignored.
- `.env.example` includes empty private-secret placeholders:
  - `POLAR_CLIENT_SECRET=`
  - `YANDEX_CLIENT_SECRET=`
  - `GOOGLE_CLIENT_SECRET=`
  - `OFF_USER_ID=`
  - `OFF_PASSWORD=`
- Documentation references secret names intentionally in security/packaging docs.
- Test/example emails were found (`example.com`, `test.com`) and are acceptable.
- Package-lock metadata contains maintainer contact strings from third-party package metadata; not project secrets.

Local ignored sensitive files currently exist:

- `.env`
- `frontend/.env.local`
- `frontend/release74/win-unpacked/resources/.env`

These are ignored and not tracked, but should be deleted locally before a final publication snapshot to avoid accidental manual upload.

## Personal Data

Result: **FAIL**

Tracked database/data files:

- No tracked `workouts.db`, `myhealth.db`, FIT/GPX/TCX files, CSV/XLSX exports, backups, logs, SQLite WAL/SHM files, or release-output files were found.
- Root `shared.db` is currently untracked, allowed by `.gitignore`, and passed the public DB audit.

Tracked screenshots:

- Several screenshots contain apparent personal health, workout, body, and route/location data. See release blockers above.

Ignored local personal/generated data currently present:

- `workouts.db`
- `workouts.db.pre-split.bak`
- `shared.db.pre-split.bak`
- `shared.db-wal`
- `shared.db-shm`
- `packaging/seed/*.db`
- `packaging/seed-template/*.db`
- `backend/logs/api.log`
- `frontend/release74/**`
- `frontend/backend_bin/backend.exe`
- `frontend/dist/**`
- `frontend/build/backend_py/**`

These are ignored, but should be removed from the working directory before publication packaging or manual archive creation.

## Machine-Specific Paths

Result: **FAIL**

Release blockers:

- `start_sync.bat`
- `start_react_only.bat`
- `start_manual.bat`
- `start_headless.vbs`

These contain `C:\Users\brett\Desktop\MyHealthDashboard`.

Warnings:

- `docs/archive/SETUP.md`
- `docs/archive/FIT_SYNC.md`
- `mobile/BUILD_EAS.md` uses generic `Desktop\MyHealthDashboard\...` text without username; acceptable example text.

Acceptable references:

- `%APPDATA%\Forma\...` runtime paths in docs.
- Localhost OAuth redirect URIs.
- Generic repo examples such as `MyHealthDashboard/`.

## Git Hygiene

Result: **PASS with process warnings**

`.gitignore` covers:

- `.env`, `.env.*`, while allowing `.env.example` and `.env.desktop.public`
- `frontend/.env.local`
- `mobile/.env`
- `venv/`, `.venv/`, `__pycache__/`, `.pytest_cache/`, `*.py[cod]`
- `node_modules/`
- `frontend/dist/`
- `frontend/build/backend_py*/`
- `frontend/backend_bin/`
- `frontend/release*/`
- `mobile/android/.gradle/`, mobile build outputs, Expo/Gradle outputs
- `coverage/`, test/cache outputs
- `**/*.db` except root `shared.db`
- `*.db-*`, `*.sqlite`, `*.sqlite3`, `*.bak`, `*.wal`, `*.shm`
- `backups/`, `import-jobs/`, `logs/`, `mini-db-exports/`, `fit_files/`, `polar_temp/`, `data/`
- `*.log`, `*.zip`, `*.xlsx`, `*.csv`, `*_export*`, `sync_log.txt`

Verification:

- `git ls-files -ci --exclude-standard` returned no tracked ignored files.
- `git check-ignore -v` confirmed ignore coverage for `.env`, `frontend/.env.local`, `backend/logs/api.log`, release resources `.env`, packaging seed DBs, WAL/SHM files, `workouts.db`, `myhealth.db`, `node_modules`, frontend dist/build, and backend binaries.

Process warnings:

- Many ignored files exist locally. They are not tracked but should be deleted before making a public source archive outside Git.
- Many modified/untracked files are present. Review and stage intentionally.

## Generated Artifacts

Result: **PASS for tracked files; cleanup recommended for local ignored files**

No tracked files were found with these generated/data extensions:

- `*.log`
- `*.bak`
- `*.tmp`
- `*.zip`
- `*.xlsx`
- `*.csv`
- `*.fit`
- `*.gpx`
- `*.tcx`
- `*.sqlite`
- `*.sqlite3`
- `*.db-wal`
- `*.db-shm`

Ignored local generated artifacts found:

- `backend/logs/api.log`
- `frontend/release74/**`
- `frontend/dist/**`
- `frontend/build/backend_py/**`
- `frontend/backend_bin/backend.exe`
- `__pycache__/**`
- `shared.db-wal`
- `shared.db-shm`
- `*.bak`
- `packaging/seed/*.db`
- `packaging/seed-template/*.db`

Recommended cleanup:

- Delete ignored generated artifacts before any manual upload or zip archive.
- Do not commit them.

## Database Audit

Result: **PASS**

Command:

```powershell
python scripts/audit_public_shared_db.py shared.db
```

Result:

- `READY FOR GITHUB`
- Tables found:
  - `food_product_components`: 0 rows, reference
  - `food_products`: 21 rows, reference
  - `strength_exercises`: 53 rows, reference
  - `stretching_exercises`: 123 rows, reference
  - `surface_multipliers`: 1248 rows, reference
  - `tire_coefficients`: 1248 rows, reference
- Checks passed:
  - no cloud tokens
  - no polar tokens
  - no oauth credentials
  - no workouts
  - no measurements
  - no user profiles
  - no meal plans
  - no user exercise history
  - no runtime cache
  - all tables reference
  - no token columns with data

Important status:

- `shared.db` is intentionally public and safe by audit.
- `shared.db` is currently untracked; add it only after confirming this audited file is the intended public reference DB.
- No user databases are tracked.

## Documentation Review

Result: **PASS with warnings**

Safe / intentional:

- `docs/PACKAGING_SECRETS.md`, `docs/AUTH_PKCE_AUDIT.md`, `SECURITY.md`, `CONTRIBUTING.md`, `README.md`, and `docs/DATABASE.md` correctly document that `.env`, OAuth secrets, tokens, and `workouts.db` must never be published.
- Secret names in docs are policy references, not leaked values.
- `%APPDATA%` paths are acceptable runtime documentation.

Warnings:

- `docs/archive/SETUP.md` and `docs/archive/FIT_SYNC.md` contain personal local path examples.
- `docs/Forma_Mobile_v2_Architecture_Plan.docx` is a binary document that should be removed or manually inspected.
- README screenshots should be replaced with sanitized public demo images.

## Files That Should Be Deleted Or Replaced Before GitHub Publication

Delete, sanitize, or replace:

- `docs/screenshots/Главный экран формы.png`
- `docs/screenshots/Карточка тренировки силовой.png`
- `docs/screenshots/велотрек.png`
- `docs/screenshots/КК.png`
- `start_sync.bat`
- `start_react_only.bat`
- `start_manual.bat`
- `start_headless.vbs`
- `docs/Forma_Mobile_v2_Architecture_Plan.docx`

Sanitize path examples:

- `docs/archive/SETUP.md`
- `docs/archive/FIT_SYNC.md`

Delete locally before final publication snapshot, but do not need git deletion if ignored/untracked:

- `.env`
- `frontend/.env.local`
- `backend/logs/api.log`
- `frontend/release74/**`
- `frontend/backend_bin/**`
- `frontend/dist/**`
- `frontend/build/backend_py/**`
- `packaging/seed/*.db`
- `packaging/seed-template/*.db`
- `workouts.db`
- `*.bak`
- `shared.db-wal`
- `shared.db-shm`
- `__pycache__/**`
- `node_modules/**`

## Files Safe To Keep

Safe public templates and policy files:

- `.env.example`
- `frontend/.env.example`
- `mobile/.env.example`
- `.env.desktop.public` if the public OAuth client IDs are intentional
- `docs/PACKAGING_SECRETS.md`
- `docs/AUTH_PKCE_AUDIT.md`
- `SECURITY.md`
- `CONTRIBUTING.md`

Safe database artifact:

- `shared.db`, after confirming the audited untracked file is the intended public reference DB.

Safe images/assets:

- `docs/screenshots/Архитектура.jpg`
- `docs/screenshots/дорожная карта.jpg`
- `frontend/public/favicon.png`
- `frontend/public/logo.png`
- `mobile/assets/icon.png`
- `mobile/assets/splash.png`
- Android launcher icons under `mobile/android/app/src/main/res/mipmap-*`

## Recommended Cleanup Order

1. Replace or remove personal-data screenshots.
2. Delete or rewrite personal-path launcher scripts.
3. Sanitize archived docs with `C:\Users\brett\...`.
4. Remove or manually inspect `docs/Forma_Mobile_v2_Architecture_Plan.docx`.
5. Delete ignored local artifacts from the working tree before taking any source archive.
6. Review the large current git diff and stage only intended public files.
7. Add intended safe publication assets, especially `.env.desktop.public` and audited `shared.db`, if they are meant to be in the public repo.
8. Re-run:

```powershell
git status --short --ignored -uall
python scripts/audit_public_shared_db.py shared.db
git grep -n -F "C:\Users\brett" -- .
```

Final status after this audit: **FAIL until the release blockers above are removed or sanitized.**
