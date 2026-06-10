# Developer setup (Forma / MyHealthDashboard)

Last updated: **2026-06-09**.

Replaces archived [archive/SETUP.md](./archive/SETUP.md) for active development.

---

## Requirements

| Tool | Version | Purpose |
|------|---------|---------|
| Windows | 10/11 | Primary dev OS |
| Python | 3.11+ | FastAPI backend |
| Node.js | 20+ | Frontend + mobile tooling |
| Git | recent | Source control |
| Android Studio | optional | Mobile APK builds |

---

## First-time setup

After cloning the public repo, `venv/`, `node_modules/`, and `*.db` are **not** in git. Either:

```powershell
cd C:\path\to\MyHealthDashboard
.\start.ps1 -Install          # creates venv, .env, pip + npm deps
```

or double-click **`start.vbs`** — `start.ps1` auto-creates `venv` and `.env` on first run, then installs dependencies.

Manual equivalent:

```powershell
cd C:\path\to\MyHealthDashboard

# Python venv
python -m venv venv
.\venv\Scripts\pip install -r requirements.txt

# Frontend
cd frontend
npm install
cd ..

# Mobile (optional)
cd mobile
npm install
cd ..
```

### Environment

```powershell
copy .env.example .env
# Edit .env — OAuth client ids, secrets (dev only), FIT folder, etc.
```

**Never commit `.env`.** Packaged desktop uses [`.env.desktop.public`](../.env.desktop.public) (no secrets) — [PACKAGING_SECRETS.md](./PACKAGING_SECRETS.md).

---

## Daily development

### Web + API (admin browser mode)

```powershell
.\start.ps1
```

- UI: `http://127.0.0.1:5173`
- API: `http://127.0.0.1:8000/api` or `:8002` (see repo `.api-port`)
- Developer Tools, OAuth debug UI, DB import available

Stop: `.\start.ps1 -Stop`

### Electron desktop (dev)

```powershell
cd frontend
npm run build          # or npm run dev in another terminal
npm run desktop:dev
```

### Packaged desktop build

```powershell
cd frontend
npm run desktop:dist
```

Runs `desktop:prepare-seed` → `desktop:build:all` → `desktop:check-secrets` → `electron-builder`.

Output follows `frontend/package.json` (`version` and `build.directories.output`), e.g. `frontend/release74/Forma Setup 0.74.0.exe` for the 0.74 line.

Packaged API default port: **8000** (`%APPDATA%\Forma\forma-desktop-api.json`). Health check: `http://127.0.0.1:8000/api/health`.

Clean-install seed notes:

- `desktop:prepare-seed` writes `packaging/seed/workouts.db` and `packaging/seed/shared.db`.
- `desktop:check-secrets` rejects forbidden OAuth secrets, missing public client ids, missing/large seed DBs, bad `backend.spec` seed paths and missing `httpx` bundle support.
- Public GitHub `shared.db` is a separate artifact: build with `scripts/build_public_shared_db.py`, verify with `scripts/audit_public_shared_db.py`.

### Mobile

```powershell
cd mobile
npm run android        # debug on device/emulator
npm run android:release
npm run bundle:check
```

---

## OAuth setup (dev)

| Provider | Doc | Notes |
|----------|-----|-------|
| Yandex / Google | [AUTH_PKCE_AUDIT.md](./AUTH_PKCE_AUDIT.md) | Default PKCE; register redirect URIs for ports 8000–8012 |
| Polar | [POLAR_SETUP.md](./POLAR_SETUP.md) | Requires `POLAR_CLIENT_SECRET` in `.env` |

Debug API: `GET /api/cloud/oauth-debug` (works in packaged build; UI hidden in `desktop_app`).

Public Yandex app-folder builds should use `YANDEX_SCOPES=cloud_api:disk.app_folder` when the Yandex app is configured for app-folder access.

---

## Tests

```powershell
# Backend
.\venv\Scripts\python.exe -m pytest backend/tests -q

# Frontend units
cd frontend && npm run test:units

# Platform import boundaries
npm run check:platform-imports
```

Release regression subset: [RELEASE_READINESS.md](./RELEASE_READINESS.md).

---

## Coexistence: dev + packaged Forma.exe

| Runtime | API port | UI |
|---------|----------|-----|
| `start.ps1` dev | 8000 or 8002 | Vite 5173 |
| Packaged Forma.exe | 8000 default (8000–8012) | Electron embedded |

Both can run in parallel on different ports.

---

## Related

- [CONTRIBUTING.md](../CONTRIBUTING.md)
- [README.md](../README.md)
- [PROJECT_CONTEXT.md](./PROJECT_CONTEXT.md)
