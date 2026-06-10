# Documentation Refresh Plan (Forma / MyHealthDashboard)

**Status:** Executed 2026-06-09. This file records the audit and update scope; see git history for individual doc changes.

**Scope:** Full documentation refresh against codebase after Phase A packaging, PKCE OAuth migrations, sync/HC routing updates, and v0.69.0 desktop release work.

## Summary

Documentation was refreshed in four phases:

1. **P0 truth fixes** — port 8000 story, AUTH_PKCE_AUDIT, packaging doc indexes, KNOWN_ISSUES contradictions
2. **P1 surfaces** — FORMA_SYNC, DESKTOP_UI, HEALTH_CONNECT, ARCHITECTURE, POLAR_SETUP paths
3. **P2 release state** — RELEASE_READINESS gates, ANALYTICS/ROADMAP/CHANGELOG v0.69.0, DOCUMENTATION_AUDIT
4. **P3 onboarding** — CONTRIBUTING, SECURITY, LICENSE, DEVELOPER_SETUP, archive banners

## Verification checklist

- [x] Active docs use packaged API port **8000** default (not 18002)
- [x] `AUTH_PKCE_AUDIT.md` created; `PACKAGING_SECRETS` link fixed
- [x] Packaging docs indexed in README and `docs/README.md`
- [x] FormaSync UI path: `?tab=data&panel=cloud`
- [x] HC hub: `/body?tab=health-connect` (redirect from `/health-connect`)
- [x] Route telemetry phase 1 marked shipped in ANALYTICS/ROADMAP
- [x] CONTRIBUTING, SECURITY, LICENSE added for public-repo readiness
- [x] `docs/DEVELOPER_SETUP.md` created; archive banners on SETUP/API/DESKTOP_DEV_COEXISTENCE/RELEASE_SMOKE/CLEANUP
- [x] `doc/README.md` fixed (broken SYNC.md link removed)

## Source of truth (code)

| Topic | Reference |
|-------|-----------|
| Packaged API port | `frontend/electron/main.cjs` — default 8000, candidates 8000–8012 |
| OAuth PKCE | `backend/core/env.py`, `backend/services/oauth_redirect.py` |
| Packaging secrets | `scripts/packaging_secrets.py`, `scripts/check_packaging_secrets.py` |
| FormaSync UI | `frontend/src/modules/settings/components/FormaSyncPanel.tsx` |
| Schema version | `database/migrations.py` — Public `SCHEMA_VERSION=80` (v078 cardio, v079 meal purge, v080 strength catalog). Dev remains `SCHEMA_VERSION=79` until a future appended reconciliation migration is implemented. |

For the full per-document audit inventory, see the approved plan in `.cursor/plans/` (not edited during execution).
