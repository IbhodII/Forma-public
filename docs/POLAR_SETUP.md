# Polar AccessLink setup (local / private builds)

Polar Flow integration in Forma uses **OAuth 2.0 with a confidential client**: both a **client id** and a **client secret** are required to complete sign-in. Public desktop installers ship only the public Polar config (`POLAR_CLIENT_ID`, redirect URI). **`POLAR_CLIENT_SECRET` is never included** in the installer.

This guide is for developers and advanced users who run Forma locally or add credentials to their own machine after install.

Last updated: **2026-06-09**.

## 1. Create a Polar AccessLink application

1. Open [Polar AccessLink admin](https://admin.polaraccesslink.com) and sign in.
2. Register an OAuth client for your Forma instance.
3. Note the **Client ID** and **Client secret** Polar issues for that client.
4. Register a **redirect URL** that matches your API callback (see below). The path must be exactly:

   ```
   /api/polar/callback
   ```

   Full URL examples:

   | Environment | Typical redirect URL |
   |-------------|----------------------|
   | Dev (browser / `uvicorn` on port 8000) | `http://127.0.0.1:8000/api/polar/callback` |
   | Packaged Forma desktop (default port 8000) | `http://127.0.0.1:8000/api/polar/callback` |
   | Packaged (alternate candidate port 8002) | `http://127.0.0.1:8002/api/polar/callback` |

   Packaged API port: default **8000**, candidates **8000–8012**, stored in `%APPDATA%\Forma\forma-desktop-api.json`. Register every port you may use. `127.0.0.1` and `localhost` are different OAuth hosts.

   Backend may resolve Polar redirect port at runtime via [`resolve_polar_redirect_uri()`](../backend/services/polar_oauth_service.py) when the API port differs from `.env` template values.

Optional: if Polar shows scope errors in the browser, set `POLAR_SCOPE=accesslink.read_all` in `.env` (see [`.env.example`](../.env.example)).

## 2. Environment variables

| Variable | Required | Packaged in installer? | Purpose |
|----------|----------|------------------------|---------|
| `POLAR_CLIENT_ID` | Yes | Yes (public) | OAuth client id from Polar admin |
| `POLAR_CLIENT_SECRET` | Yes | **No** | Confidential client secret |
| `POLAR_API_REDIRECT_URI` | Recommended | Yes (public template) | Full callback URL registered in Polar |
| `POLAR_REDIRECT_URI` | Legacy fallback | — | Used only if `POLAR_API_REDIRECT_URI` is unset **and** the value ends with `/api/polar/callback` |
| `PUBLIC_API_BASE_URL` | Optional | Yes (desktop) | Helps resolve redirect when port differs from `.env` |

**Prefer `POLAR_API_REDIRECT_URI`.** The legacy `POLAR_REDIRECT_URI` name is ignored if it points at the old CLI callback (for example `http://localhost:8080/callback`).

Copy [`.env.example`](../.env.example) to `.env` and fill in the private section:

```env
POLAR_CLIENT_ID=your-client-id
POLAR_CLIENT_SECRET=your-client-secret
POLAR_API_REDIRECT_URI=http://127.0.0.1:8000/api/polar/callback
```

For packaged desktop after install, add the secret to the user config file (not the installer):

```
%APPDATA%\Forma\.env
```

On first run, Forma copies the public template from the installer into that file and adjusts **Yandex/Google** redirect ports. **Polar** redirect is not rewritten by Electron — add `POLAR_CLIENT_SECRET` manually; do not put secrets in [`.env.desktop.public`](../.env.desktop.public).

## 3. Verify

1. Restart the Forma API / desktop app after editing `.env`.
2. **Packaged desktop:** call `GET /api/cloud/oauth-debug` or use **admin browser** with Developer Tools → Polar diagnostics. Packaged Settings does **not** expose OAuth debug UI (`enableOAuthDebug: false`).
3. Check Polar: `client_id` present, `client_secret` present (after user-added secret), redirect URI matches Polar admin.
4. Connect Polar Flow from the app. Callback is handled at `GET /api/polar/callback` (Electron popup on desktop).

Startup logs show `Polar OAuth: ready` when both id and secret are loaded.

## Security warnings

- **Never commit** `POLAR_CLIENT_SECRET` (or any `.env` with secrets) to git.
- **Never package** the secret into the desktop installer or `resources/.env` — see [PACKAGING_SECRETS.md](PACKAGING_SECRETS.md).
- **Never share** the client secret publicly (forums, screenshots, issue trackers).
- Treat the secret like a password: only on your dev machine or in your private `%APPDATA%\Forma\.env`.

Polar does not support a public-client / PKCE-only flow for AccessLink; see [AUTH_PKCE_AUDIT.md](AUTH_PKCE_AUDIT.md) for Google/Yandex PKCE contrast.

## Related

- [PACKAGING_SECRETS.md](PACKAGING_SECRETS.md) — what may ship in desktop builds
- [AUTH_PKCE_AUDIT.md](AUTH_PKCE_AUDIT.md) — Google/Yandex PKCE (Polar exception)
- [`.env.example`](../.env.example) — full env template
