# Contributing to Forma

Thank you for contributing to Forma (MyHealthDashboard). This document covers local setup, checks, and pull request expectations.

## Prerequisites

- Windows 10/11 (primary dev target)
- Python 3.11+ with venv at `MyHealthDashboard/venv`
- Node.js 20+ for `frontend/` and `mobile/`
- Android SDK for mobile builds (optional)

See [docs/DEVELOPER_SETUP.md](docs/DEVELOPER_SETUP.md) for full setup.

## Quick start

```powershell
# From MyHealthDashboard/
.\start.ps1          # API :8000/:8002 + Vite :5173
cd frontend && npm run desktop:dev   # Electron (after web build or dev workflow)
cd mobile && npm run android         # Android debug
```

Copy [`.env.example`](.env.example) to `.env` for OAuth and integrations. Never commit `.env`.

## Before submitting changes

### Backend

```powershell
cd MyHealthDashboard
.\venv\Scripts\python.exe -m pytest backend/tests -q
```

Focus areas for packaging/OAuth changes:

```powershell
.\venv\Scripts\python.exe -m pytest backend/tests/test_packaging_secrets.py backend/tests/test_google_oauth_pkce.py backend/tests/test_yandex_oauth_pkce.py -q
```

### Frontend (desktop)

```powershell
cd frontend
npm run build
npm run test:units
npm run check:platform-imports   # from repo root via package.json script
```

Desktop release build (includes seed + secret checks):

```powershell
cd frontend
npm run desktop:dist
```

### Mobile

```powershell
cd mobile
npm run bundle:check
```

## Code conventions

- **Platform isolation:** do not import `frontend/src` from `mobile/src` or vice versa. Shared code lives in `shared/`.
- **Units:** stored values stay metric; display uses `useUnits` / [doc/UNITS_CONVERSION.md](doc/UNITS_CONVERSION.md).
- **Secrets:** never commit OAuth secrets, tokens, or personal `workouts.db`. See [docs/PACKAGING_SECRETS.md](docs/PACKAGING_SECRETS.md).
- **Documentation:** update relevant `docs/*.md` when changing user-visible behavior, routes, or packaging.

## Pull requests

1. Describe **why** the change is needed.
2. List manual test steps (especially for desktop EXE, OAuth, sync, HC).
3. Reference related docs (`KNOWN_ISSUES`, `RELEASE_READINESS`) if fixing a listed blocker.
4. Do not include `.env`, seed databases with user data, or large binary DBs.

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities and the single-user security model.

## Documentation index

[docs/README.md](docs/README.md) — full documentation map.
