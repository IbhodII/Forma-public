# Packaged Forma vs browser dev coexistence

> **Archived.** Packaged default port **18002** is outdated — current default **8000**. See [../AUTH_PKCE_AUDIT.md](../AUTH_PKCE_AUDIT.md).

## Ports

| Runtime | API | UI |
|---------|-----|-----|
| **Dev** (`start.ps1`) | `8000` or `8002` (written to repo `.api-port` + `frontend/.env.local`) | Vite `5173` |
| **Packaged Forma.exe** | **`18002`** (default, stored in `%APPDATA%/Forma/forma-desktop-api.json`) | Embedded server on that API port |

Packaged Forma does **not** read `VITE_API_PORT`, repo `.api-port`, or dev `.env.local` for its own backend.

## Rules

1. Starting **Forma.exe** does not run global `taskkill` on all `backend.exe` — only stale listeners on the packaged API port.
2. Packaged app does **not** attach to dev uvicorn on `8000`/`8002` (`usingExternalBackend` is dev-Electron-only).
3. **LAN server** in Forma runs `start.ps1 -DesktopLan -SkipApiPortConfig` — starts Vite only if needed, does not overwrite `.api-port` / `.env.local`.
4. **Mobile API LAN** in Forma restarts only the packaged embedded backend, not dev uvicorn.

## Typical workflow

- Daily dev: `.\start.ps1` → browser `http://127.0.0.1:5173`
- Packaged app: run `Forma.exe` in parallel — uses `http://127.0.0.1:18002` internally
- Optional LAN for phone with dev UI: Forma settings → enable external LAN server (Vite on 5173, API from existing `.api-port`) — **admin browser only** (developer tools / `admin_browser` client mode).

## Coexistence smoke test

Run both runtimes on the same PC:

1. Start dev stack: `.\start.ps1 -Source` (or `start.vbs`) — browser at `http://127.0.0.1:5173`, API on `8000` or `8002`.
2. Start packaged **Forma.exe** without closing dev windows.
3. Verify:
   - `http://127.0.0.1:5173/api/health` responds (dev API).
   - `http://127.0.0.1:18002/api/health` responds (packaged API default port).
   - Dev `.api-port` and `frontend/.env.local` unchanged after opening Forma.exe.
   - Vite on `5173` keeps running if it was already up before enabling Forma LAN.
4. Stop dev only: `.\start.ps1 -Stop` — must not kill Forma embedded API on `18002`.
