# Forma Mobile — pre-release checklist (v1)

**Full release smoke (desktop exe + APK):** [../docs/RELEASE_SMOKE.md](../docs/RELEASE_SMOKE.md)

## Environment and build

- [ ] Copy `mobile/.env.example` → `.env`; no personal Tailscale/LAN IP in store builds
- [ ] **`EXPO_PUBLIC_YANDEX_CLIENT_ID` set before `npm run android:release`** (empty → cloud login disabled)
- [ ] Redirect URI registered: `myhealthdashboard://oauth/yandex`
- [ ] EAS secrets match production Yandex OAuth client IDs and redirect URIs
- [ ] `app.config.js` `versionCode` / version bumped
- [ ] Release build: `apiBase.ts` does not use `10.0.2.2` (only `__DEV__`)
- [ ] `AndroidManifest.xml` `usesCleartextTraffic` documented for Play (LAN/Tailscale)
- [ ] Background tasks registered: Forma sync ~240m, HC collect ~60m (physical device)

## OAuth and cloud

- [ ] Yandex Disk connected on test account; token refresh path verified
- [ ] SHA-1 / package name match OAuth app (see `CLOUD_SYNC_ANDROID.md` if present)

## Manual QA matrix

| Scenario | Pass |
|----------|------|
| Fresh install — login, DB init, empty dashboard | |
| Forma.exe (desktop) — parallel smoke per RELEASE_SMOKE.md | |
| «Продолжить локально» — no OAuth, data scoped to device user 1 | |
| Offline — local food/workout writes, offline banner | |
| HC enabled — hub trends, sync now | |
| HC disabled — enable path, analytics steps | |
| HC permission revoked — hub warning, no background crash | |
| No Yandex auth — Forma sync soft message | |
| Sync conflicts — banner + modal, pick side | |
| Two devices — download or conflict recorded | |
| Corrupt package (test) — message, app usable | |
| Stale Mi Fitness badge | |
| Large DB / long HR — cardio detail &lt;3s | |
| Cardio tab scroll + load more | |
| Background sync — airplane toggle, no stuck lock | |

## Known release blockers (document, not fixed in v1)

- OAuth client IDs may be empty in local `.env`
- Conflict merge pilot: `food_entries` only; other types mark resolved without merge
- Cleartext HTTP for self-hosted API
- ZIP backup is partial subset of SQLite tables

## Developer mode (internal)

- Seven taps on version in **О проекте** toggles `app:developer_mode`
- When off: HC diagnostics link, FormaSync advanced screen, raw JSON dumps hidden
