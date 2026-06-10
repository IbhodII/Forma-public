# Security Policy

## Supported versions

Forma is a **local-first, single-user** desktop and mobile application. There is no hosted multi-tenant deployment. Security focus: protect local health data and prevent accidental secret leakage in installers.

| Component | Notes |
|-----------|--------|
| Desktop (Forma.exe) | Current development line — see `frontend/package.json` version |
| Mobile (APK) | Release builds per [mobile/RELEASE_CHECKLIST.md](mobile/RELEASE_CHECKLIST.md) |

## Security model (important)

- **Authentication:** Desktop API uses `X-User-ID` header without JWT. Suitable for localhost / single-user use only.
- **Not designed for:** public internet exposure, multi-user hosted API, or untrusted networks without additional hardening.
- **Data storage:** SQLite files under `%APPDATA%\Forma` (desktop) and app-private storage (mobile).
- **OAuth:** Google/Yandex use PKCE on public installs (no client secret in installer). Polar requires user-added confidential secret — [docs/POLAR_SETUP.md](docs/POLAR_SETUP.md).

## Packaging secrets

Desktop installers must **never** ship:

- `YANDEX_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `POLAR_CLIENT_SECRET`
- Open Food Facts contributor credentials
- Developer `workouts.db` / personal backups

Build guard: `npm run desktop:check-secrets`. Details: [docs/PACKAGING_SECRETS.md](docs/PACKAGING_SECRETS.md).

## Reporting a vulnerability

If you discover a security issue:

1. **Do not** open a public issue with exploit details or live secrets.
2. Contact the repository maintainer privately with:
   - Description and impact
   - Steps to reproduce
   - Affected component (desktop / mobile / backend)
3. Allow reasonable time for a fix before public disclosure.

## Recommended practices for developers

- Keep `.env` gitignored; use [`.env.example`](.env.example) as template.
- Rotate OAuth client secrets if accidentally committed.
- Use `admin_browser` mode for developer tools; packaged `desktop_app` hides dangerous import/export paths by design.
- Review `FORBIDDEN_DESKTOP_ENV_KEYS` in `frontend/electron/main.cjs` before changing packaging.

## Related

- [CONTRIBUTING.md](CONTRIBUTING.md)
- [docs/AUTH_PKCE_AUDIT.md](docs/AUTH_PKCE_AUDIT.md)
- [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — product security notes
