# Desktop packaging — public config vs secrets

Forma desktop installers must never ship developer OAuth secrets, contributor credentials, or personal database backups.

Last updated: **2026-06-09** (post v080 schema; audited `shared.db` workflow).

## Safe to ship (public runtime config)

These may appear in [`.env.desktop.public`](../.env.desktop.public), which electron-builder copies to `resources/.env`:

| Key | Purpose |
|-----|---------|
| `YANDEX_CLIENT_ID` | Public OAuth app id |
| `YANDEX_REDIRECT_URI` | Callback URL (port adjusted on first launch for Yandex/Google) |
| `YANDEX_SCOPES` | Optional scope override |
| `YANDEX_EXTRA_SCOPES` | Optional extra scopes |
| `YANDEX_OAUTH_MODE` | Optional mode hint (flow resolved by `YANDEX_OAUTH_FLOW` in code) |
| `YANDEX_OAUTH_FLOW` | Optional `pkce` / `confidential`; public default is `pkce` |
| `GOOGLE_CLIENT_ID` | Public OAuth app id |
| `GOOGLE_REDIRECT_URI` | Callback URL |
| `POLAR_CLIENT_ID` | Public Polar client id |
| `POLAR_API_REDIRECT_URI` | Polar callback URL (backend may resolve port at runtime) |
| `POLAR_REDIRECT_URI` | Legacy alias when it ends with `/api/polar/callback` |
| `POLAR_SCOPE` | Optional Polar scope |
| `PUBLIC_API_BASE_URL` | API origin for redirect resolution |
| `FRONTEND_URL` | Optional frontend origin |

On first run, Electron copies the public template to `%APPDATA%/Forma/.env` and aligns **Yandex/Google** redirect URIs and `PUBLIC_API_BASE_URL` with the embedded API port. **Polar** redirect is not rewritten by Electron — see [AUTH_PKCE_AUDIT.md](AUTH_PKCE_AUDIT.md).

Yandex scopes are product-mode dependent. Public app-folder builds should request `cloud_api:disk.app_folder` only if the Yandex app is registered for app-folder access. Dev/full-disk builds may request `cloud_api:disk.read` / `cloud_api:disk.write`.

### Packaged API port

- **Default:** `8000` ([`frontend/electron/main.cjs`](../frontend/electron/main.cjs))
- **Candidates:** `8000`, `8002`, `8003` … `8012`
- **Persisted:** `%APPDATA%\Forma\forma-desktop-api.json`
- **Template URIs:** `.env.desktop.public` examples use port **8002**; runtime may select **8000** on first launch

## Never ship (private secrets)

| Key | Why |
|-----|-----|
| `YANDEX_CLIENT_SECRET` | Only for `YANDEX_OAUTH_FLOW=confidential` (legacy dev); desktop default is PKCE |
| `GOOGLE_CLIENT_SECRET` | Only for `GOOGLE_OAUTH_FLOW=confidential` (legacy dev); desktop default is PKCE |
| `POLAR_CLIENT_SECRET` | Polar confidential client |
| `OFF_USER_ID` / `OFF_PASSWORD` | Private Open Food Facts contributor account |
| Access / refresh tokens | User or developer credentials |
| Developer `workouts.db` | Personal health data (~GB dev DBs) — **never publish** |
| Dev `shared.db` whole file | May contain legacy tables; use sanitized build for GitHub |

Secrets belong only in:

- Developer machine: repo-root `.env` (gitignored)
- Optional per-install override: `%APPDATA%/Forma/.env` (user-added, not in installer)

## Build guardrails

1. **`python scripts/build_public_shared_db.py`** — writes sanitized reference DB (whitelist 6 tables). Audit: `python scripts/audit_public_shared_db.py shared.db` must print **READY FOR GITHUB**.
2. **`npm run desktop:prepare-seed`** — creates `packaging/seed/*.db`. Uses audited `packaging/seed-template/shared.db` or root `shared.db`; builds `workouts.db` from migrations via `build_packaging_workouts_seed.py` (never copies repository-root `workouts.db`).
3. **`npm run desktop:check-secrets`** — fails the build if:
   - `package.json` references developer `.env`
   - `.env.desktop.public` contains forbidden keys with values
   - forbidden token patterns appear in packaged env files
   - seed databases are missing or larger than 100 MB
   - `backend.spec` does not bundle seed paths correctly
   - `backend.spec` or the built backend is missing `httpx` / `httpcore` required by Yandex PKCE runtime
4. **`backend.spec`** bundles `packaging/seed/`, not repository `workouts.db`.

Public repo policy: [DATABASE.md § Public Repository Data Policy](DATABASE.md#public-repository-data-policy).

Desktop `desktop:pack` / `desktop:dist` run `desktop:check-secrets` automatically after `desktop:build:all`.

Shared rules: [`scripts/packaging_secrets.py`](../scripts/packaging_secrets.py).

## Runtime behavior

- A clean install starts without a developer `.env`; optional integrations without secrets log a warning and return HTTP 503 on sign-in — the app does not crash.
- `GET /api/cloud/oauth-debug` shows `setup_required` only when required fields are missing (for Google/Yandex PKCE, `client_secret` is not required).
- Electron strips forbidden keys if an old installer copied secrets into userData ([`FORBIDDEN_DESKTOP_ENV_KEYS`](../frontend/electron/main.cjs)).
- Runtime Yandex authorize diagnostics may log mode, scopes and authorize URL for troubleshooting, but must not log client secrets or tokens.

## Related

- Polar local setup (client secret): [POLAR_SETUP.md](POLAR_SETUP.md)
- OAuth / PKCE audit: [AUTH_PKCE_AUDIT.md](AUTH_PKCE_AUDIT.md)
- Env template for developers: [`.env.example`](../.env.example)
- Release gates: [RELEASE_READINESS.md](RELEASE_READINESS.md)
