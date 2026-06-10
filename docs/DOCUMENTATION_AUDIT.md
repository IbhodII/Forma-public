# DOCUMENTATION_AUDIT.md

Documentation status after the 2026-06-09 refresh pass (packaging, PKCE OAuth, sync/HC routing, route telemetry).

Last updated: **2026-06-09**.

Refresh scope: [DOCUMENTATION_REFRESH_PLAN.md](./DOCUMENTATION_REFRESH_PLAN.md).

---

## Active Documentation Status

| Document | Status | Notes |
|----------|--------|-------|
| `README.md` | current | Port 8000, packaging commands, doc map + OAuth docs |
| `docs/README.md` | current | 20 active docs indexed |
| `PROJECT_CONTEXT.md` | current | 2026-06-09; packaging, PKCE, settings IA |
| `ARCHITECTURE.md` | current | HC redirect, sync orchestrator, packaging boundary |
| `DATABASE.md` | current | Public schema v80; Dev v79 equivalence warning |
| `DESKTOP_UI.md` | current | Body HC tab, data/cloud FormaSync, port 8000 |
| `WORKOUTS.md` | current | Exercise category v077 |
| `NUTRITION.md` | current | Goal deficit limit 70 |
| `ANALYTICS.md` | current | Route telemetry phase 1 shipped |
| `HEALTH_CONNECT.md` | current | Body tab hub; reliability module removed |
| `FORMA_SYNC.md` | current | `?tab=data&panel=cloud`; mobile modules |
| `MOBILE.md` | current | See spot-check notes below |
| `HISTORICAL_IMPORTS.md` | current | Planned import scope |
| `ROADMAP.md` | current | Route telemetry tiered |
| `RELEASE_READINESS.md` | current | Packaging/OAuth gates; migration mismatch note |
| `KNOWN_ISSUES.md` | current | P0/P1 blockers; route telemetry fixed; migration mismatch tracked |
| `CHANGELOG.md` | current | `[0.69.0]` section |
| `PLATFORMS.md` | current | Packaging boundary added |
| `PACKAGING_SECRETS.md` | current | Public keys, port model |
| `POLAR_SETUP.md` | current | Debug API path; ports |
| `AUTH_PKCE_AUDIT.md` | current | New canonical OAuth doc |
| `DOCUMENTATION_REFRESH_PLAN.md` | current | Refresh record |
| `CONTRIBUTING.md` | current | New |
| `SECURITY.md` | current | New |
| `DEVELOPER_SETUP.md` | current | New |

---

## Partial / watch

| Document | Notes |
|----------|-------|
| `MOBILE.md` | Saturday week start implemented; full HC validation still open |
| `doc/UNITS_CONVERSION.md` | Subsidiary units reference; not in main docs index |
| `docs/archive/*` | Historical; many cite port 18002 — banner added, not rewritten |

---

## Archived

| Document | Reason |
|----------|--------|
| `docs/archive/CLEANUP.md` | Desktop stabilization report — historical only |
| Other `docs/archive/*` | Superseded by active docs — see archive banners |

---

## Active Count

- `docs/*.md` active (excluding `archive/`): **21** including `docs/README.md`
- Canonical domain docs: **20** + onboarding (`CONTRIBUTING`, `SECURITY`, `DEVELOPER_SETUP`)

---

## Verification (2026-06-09)

- Active docs: no `18002` except historical cross-references in KNOWN_ISSUES / archive
- `AUTH_PKCE_AUDIT.md` linked from `PACKAGING_SECRETS.md`
- FormaSync desktop path: `?tab=data&panel=cloud`
- HC canonical path: `/body?tab=health-connect`
