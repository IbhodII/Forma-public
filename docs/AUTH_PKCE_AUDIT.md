# OAuth / PKCE audit (Google & Yandex desktop)

Audit of desktop OAuth flows after Phase B PKCE migration. Polar AccessLink is **out of scope** here — it remains a confidential client; see [POLAR_SETUP.md](POLAR_SETUP.md).

Last updated: **2026-06-09**.

---

## Flow modes

| Provider | Default mode | Env override | Secret required? |
|----------|--------------|--------------|------------------|
| Yandex Disk | **pkce** | `YANDEX_OAUTH_FLOW=confidential` | Only in confidential mode |
| Google Drive | **pkce** | `GOOGLE_OAUTH_FLOW=confidential` | Only in confidential mode |
| Polar AccessLink | confidential only | — | Always (`POLAR_CLIENT_SECRET`) |

Implementation: [`backend/core/env.py`](../backend/core/env.py) — `yandex_oauth_flow_mode()`, `google_oauth_flow_mode()`.

PKCE primitives: [`backend/core/pkce.py`](../backend/core/pkce.py) (RFC 7636 S256).

---

## Public install matrix

| Provider | Ships in `.env.desktop.public` | Clean install connectable? | Missing secret behavior |
|----------|-------------------------------|----------------------------|------------------------|
| Yandex | `YANDEX_CLIENT_ID`, redirect URI | Yes, if client id + redirect configured | HTTP 503 on sign-in; app does not crash |
| Google | `GOOGLE_CLIENT_ID`, redirect URI | Yes, if client id + redirect configured | HTTP 503 on sign-in |
| Polar | `POLAR_CLIENT_ID`, redirect URI | **No** — needs user-added secret | HTTP 503 until `POLAR_CLIENT_SECRET` in `%APPDATA%\Forma\.env` |

`connectable` vs `ready`:

- **connectable** — enough to start OAuth (PKCE: id + redirect; no secret).
- **ready** — token exchange can complete (confidential: also secret).

Debug shape: `GET /api/cloud/oauth-debug` via [`backend/services/oauth_redirect.py`](../backend/services/oauth_redirect.py) (`oauth_flow_mode`, `pkce_available`, `setup_required`).

Packaged desktop **does not** expose OAuth debug in Settings UI (`enableOAuthDebug: false` in [`frontend/src/config/clientCapabilities.ts`](../frontend/src/config/clientCapabilities.ts)). Use admin browser with Developer Tools, or call the debug API directly.

### Yandex scopes

Current public app-folder release mode should use:

- `YANDEX_SCOPES=cloud_api:disk.app_folder` when the Yandex application is registered for app-folder access.

General code behavior in [`backend/services/cloud_storage_service.py`](../backend/services/cloud_storage_service.py):

- `YANDEX_OAUTH_MODE=disk` or unset → disk scopes from code/default env.
- `YANDEX_OAUTH_MODE=login` → login scopes only; Disk backup/sync will not work.
- `YANDEX_SCOPES` → full override.
- `YANDEX_EXTRA_SCOPES` → appended to disk mode, or used as login-mode replacement.

Scope mismatch is a common cause of `unauthorized_client`.

Runtime Yandex authorize diagnostics log flow, client id presence/masked id, scopes and authorize URL. They must not log client secrets, access tokens or refresh tokens.

---

## Redirect URI registration

Packaged API port selection ([`frontend/electron/main.cjs`](../frontend/electron/main.cjs)):

- **Default:** `8000`
- **Candidates:** `8000`, `8002`, `8003` … `8012` (OAuth callback ports registered in provider consoles)
- **Persisted:** `%APPDATA%\Forma\forma-desktop-api.json`

Public template [`.env.desktop.public`](../.env.desktop.public) uses port **8002** in example URIs. On first run Electron copies the template to `%APPDATA%\Forma\.env` and syncs **Yandex/Google** redirect URIs + `PUBLIC_API_BASE_URL` to the chosen API port.

**Polar:** Electron does not rewrite `POLAR_API_REDIRECT_URI`. Backend resolves port drift at request time via [`backend/services/polar_oauth_service.py`](../backend/services/polar_oauth_service.py) `resolve_polar_redirect_uri()`.

Register in each provider console:

| Callback path | Full URL pattern |
|---------------|------------------|
| Yandex | `http://127.0.0.1:{port}/api/cloud/callback/yandex` |
| Google | `http://127.0.0.1:{port}/api/cloud/callback/google` |
| Polar | `http://127.0.0.1:{port}/api/polar/callback` |

Register every port you may use (at minimum **8000** and **8002**; recommended full candidate range **8000–8012**). `127.0.0.1` and `localhost` are different hosts for OAuth.

---

## Implementation map

| Area | File |
|------|------|
| Yandex authorize + token | [`backend/services/cloud_storage_service.py`](../backend/services/cloud_storage_service.py) |
| Google authorize + token | [`backend/services/google_drive_service.py`](../backend/services/google_drive_service.py) |
| Callback routing | [`backend/routers/cloud.py`](../backend/routers/cloud.py) |
| Redirect resolution/debug | [`backend/services/oauth_redirect.py`](../backend/services/oauth_redirect.py) |
| Startup logs | [`backend/main.py`](../backend/main.py) — `ready (pkce)` when connectable |

---

## Tests

| Test | Coverage |
|------|----------|
| [`backend/tests/test_yandex_oauth_pkce.py`](../backend/tests/test_yandex_oauth_pkce.py) | Yandex PKCE exchange |
| [`backend/tests/test_google_oauth_pkce.py`](../backend/tests/test_google_oauth_pkce.py) | Google PKCE exchange |
| [`backend/tests/test_packaging_secrets.py`](../backend/tests/test_packaging_secrets.py) | `test_oauth_pkce_connectable_without_secret` |
| [`backend/tests/test_oauth_redirect.py`](../backend/tests/test_oauth_redirect.py) | Debug API provider status |

---

## Developer migration (confidential → PKCE)

1. Remove `YANDEX_CLIENT_SECRET` / `GOOGLE_CLIENT_SECRET` from packaged trees (never ship — [PACKAGING_SECRETS.md](PACKAGING_SECRETS.md)).
2. Ensure `YANDEX_CLIENT_ID` / `GOOGLE_CLIENT_ID` and redirect URIs are set (public template or dev `.env`).
3. Optional: set `YANDEX_OAUTH_FLOW=confidential` / `GOOGLE_OAUTH_FLOW=confidential` only on legacy dev machines that still use server-side secret exchange.
4. Re-register redirect URIs for ports 8000–8012 if moving from old **18002** documentation assumptions.

---

## Related

- [PACKAGING_SECRETS.md](PACKAGING_SECRETS.md) — forbidden keys, seed DB, build guardrails
- [POLAR_SETUP.md](POLAR_SETUP.md) — Polar confidential client (no PKCE)
- [`.env.example`](../.env.example) — developer env template
