# Release smoke test (daily-driver)

> **Актуальный чеклист desktop EXE:** [../RELEASE_READINESS.md](../RELEASE_READINESS.md) (2026-06-02).  
> Этот файл — расширенный historical smoke (desktop + mobile).

Consolidated checklist for packaged **Forma.exe** and **Android release APK**. See also [DESKTOP_DEV_COEXISTENCE.md](DESKTOP_DEV_COEXISTENCE.md), [mobile/RELEASE_CHECKLIST.md](../../mobile/RELEASE_CHECKLIST.md), [FORMA_SYNC.md](../FORMA_SYNC.md), [DATA_BACKUP.md](DATA_BACKUP.md).

## 1. Build commands

### Desktop (Windows)

**Pre-flight:** Python venv with backend deps; `npm ci` in `frontend/`; root `.env` present (copied into installer).

```powershell
cd frontend
npm run desktop:dist
```

**Artifacts:**

| Output | Path |
|--------|------|
| Installer | `frontend/release-build/Forma Setup *.exe` |
| Unpacked app | `frontend/release-build/win-unpacked/Forma.exe` |
| Embedded API | `win-unpacked/resources/backend.exe` |
| User data | `%APPDATA%/Forma/` (`FORMA_DATA_DIR`) |
| API port (default) | `18002` — config `%APPDATA%/Forma/forma-desktop-api.json` |

**Quick health check:** `http://127.0.0.1:18002/api/health` → 200 after launching Forma.exe.

### Mobile (Android release APK)

**Pre-flight:** Copy `mobile/.env.example` → `mobile/.env`; set `EXPO_PUBLIC_YANDEX_CLIENT_ID` (and optional API URLs for Legacy only). Rebuild after changing `.env`.

```powershell
cd mobile
npm run android:release
```

JDK: script uses `C:\Program Files\Microsoft\jdk-17.0.19.10-hotspot` — edit `mobile/scripts/android-release.ps1` if needed.

**Artifact:** `mobile/android/app/build/outputs/apk/release/app-release.apk`

---

## 2. Startup smoke

| Runtime | Check | Pass |
|---------|-------|------|
| Forma.exe | Starts without dev server / Vite | |
| Forma.exe | `/home` loads; data from userData DB | |
| Forma.exe | No HC debug nav / Developer Tools in production UI | |
| Forma.exe + dev | `start.ps1` on 8000/5173 still works; Forma on 18002 | |
| Admin browser | `.\start.ps1 -Source`; Developer Tools; HC hub/debug | |
| Mobile APK | Cold start; SQLite init | |
| Mobile APK | «Продолжить локально» without OAuth | |
| Mobile APK | Yandex login when client id configured | |

---

## 3. Auth / Yandex

| Check | Pass |
|-------|------|
| Mobile: local data survives Yandex re-login (same device user id `1`) | |
| Mobile: `yandexUid` stored for cloud / FormaSync only | |
| Mobile: missing client id shows rebuild steps, not dead buttons only | |
| Desktop: OAuth `link_user` keeps local workouts on user 1 | |

---

## 4. FormaSync smoke

| Step | Expected | Pass |
|------|----------|------|
| Yandex connected + local data | Baseline upload; manifest on Disk; not «0 files» if data exists | |
| Empty local DB | «Нет локальных данных» / no-op | |
| Second client | Download applies; revision updates | |
| Conflicts | Count visible in UI | |

---

## 5. Basic CRUD

| Action | Desktop exe | Mobile APK |
|--------|-------------|------------|
| Add food entry | | |
| Add workout | | |
| Add body metric | | |
| Kill app → data visible | | |
| Sync again → no duplicates | | |

---

## 6. Health Connect

| Check | Mobile | Desktop |
|-------|--------|---------|
| HC disabled / enable path | | |
| Manual read | | |
| Background collector (physical device) | | |
| Records in local DB | | |
| Sync package includes `hc_days` when enabled | | |
| Received records visible (admin / settings) | | |

---

## 7. Error states (actionable)

Verify messages are not bare «Network Error»:

- Missing Yandex client id (build instructions)
- Offline / no API URL
- OAuth cancelled
- Sync failed (with reason)
- Empty cloud / corrupt package

---

## 8. Known blockers

- Empty `EXPO_PUBLIC_YANDEX_CLIENT_ID` in release APK → Yandex OAuth disabled until rebuild
- Legacy conflict merge: food only
- Cleartext HTTP for LAN/Tailscale API
- JDK path hardcoded in `android-release.ps1`
- If `desktop:dist` fails with **app.asar in use**, close Forma.exe (and any process holding `frontend/release-build/`) or build to a fresh output: `npx electron-builder --config.directories.output=release-build-new`

---

## 9. Build version

| Component | Version |
|-----------|---------|
| Desktop (frontend package.json) | 1.0.0 |
| Mobile (app.config.js) | 1.0.0 (versionCode 1) |

---

## 10. Output (sign-off)

_Agent build run: 2026-05-30. UI smoke rows marked **manual** — run on device/desktop after install._

### 10.1 Build commands verified

| Artifact | Path | Built (date) | OK |
|----------|------|--------------|-----|
| Forma installer | `frontend/release-build-new/Forma Setup 1.0.0.exe` | 2026-05-30 | yes |
| Forma unpacked | `frontend/release-build-new/win-unpacked/Forma.exe` | 2026-05-30 | yes |
| Embedded API | `frontend/release-build-new/win-unpacked/resources/backend.exe` | 2026-05-30 | yes |
| app-release.apk | `mobile/android/app/build/outputs/apk/release/app-release.apk` (~84 MB) | 2026-05-30 | yes |

Notes: canonical `npm run desktop:dist` failed once because `release-build/win-unpacked/resources/app.asar` was locked; rebuild used `release-build-new`. PyInstaller `backend.exe` also at `frontend/backend_bin/backend.exe`.

### 10.2 Desktop smoke

| Area | Result | Notes |
|------|--------|-------|
| Startup / home | manual | Launch `Forma.exe`; confirm `/home` and `%APPDATA%/Forma` data |
| API health :18002 | manual | `http://127.0.0.1:18002/api/health` after start |
| No debug UI | manual | No HC debug routes without Developer Tools |
| Coexistence with dev | manual | `start.ps1` on 8000/5173 + Forma on 18002 |

### 10.3 Mobile smoke

| Area | Result | Notes |
|------|--------|-------|
| Startup / local login | manual | Install APK; **Продолжить локально** |
| Yandex OAuth | manual | Requires `.env` client id + rebuild if missing |
| FormaSync | manual | Cloud screen after Yandex Disk connect |

### 10.4 Auth fixes shipped

- Stable `LOCAL_DEVICE_USER_ID` for SQLite in autonomous/cloud/HC test modes
- `loginAutonomousLocal()` without OAuth
- `formatUserFacingError()` for actionable messages (Login, CloudSync, sync, HC)

### 10.5 FormaSync smoke

| Step | Result |
|------|--------|
| Baseline | manual |
| Download | manual |
| Empty DB | manual — expect «Нет локальных данных для отправки» |

### 10.6 Remaining release blockers

- Close running Forma before `desktop:dist` to default `release-build/` output
- Manual install smoke not executed in CI agent session
- Yandex client id still required in `mobile/.env` for OAuth APK builds
