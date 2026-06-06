import { readDeveloperToolsEnabled, writeDeveloperToolsEnabled } from "../utils/developerTools";

export type ClientMode = "admin_browser" | "desktop_app" | "mobile_app";

export type ClientCapabilities = {
  mode: ClientMode;
  enableDeveloperTools: boolean;
  enableDebugPanels: boolean;
  enableRawSyncViews: boolean;
  enableOAuthDebug: boolean;
  /** Hub-экран и вкладка Health Connect (всегда для desktop/mobile). */
  enableHealthConnectNav: boolean;
  /** Raw/debug-панели Health Connect (admin / dev tools). */
  enableHealthConnectDebug: boolean;
  enableLanControls: boolean;
  enableLegacyImportTools: boolean;
  enableLocalAdminLogin: boolean;
  /** Уменьшенная тестовая БД для проверки импорта (dev / admin). */
  enableMiniDatabaseExport: boolean;
  /** Импорт workouts.db / shared.db / ZIP (Electron или dev-браузер). */
  enableDatabaseImport: boolean;
  /** Полный ZIP backup/restore (release desktop). */
  enableZipBackupRestore: boolean;
  /** JSON account backup forma_backup_v1 (dev / admin only). */
  enableJsonAccountBackup: boolean;
  /** Импорт пары workouts.db + shared.db без ZIP (dev / admin). */
  enableTwoFileDatabaseImport: boolean;
  /** Ежемесячный локальный ZIP в папку (desktop). */
  enableScheduledLocalBackup: boolean;
};

const ADMIN_BROWSER: ClientCapabilities = {
  mode: "admin_browser",
  enableDeveloperTools: true,
  enableDebugPanels: true,
  enableRawSyncViews: true,
  enableOAuthDebug: true,
  enableHealthConnectNav: true,
  enableHealthConnectDebug: true,
  enableLanControls: true,
  enableLegacyImportTools: true,
  enableLocalAdminLogin: true,
  enableMiniDatabaseExport: true,
  enableDatabaseImport: true,
  enableZipBackupRestore: true,
  enableJsonAccountBackup: true,
  enableTwoFileDatabaseImport: true,
  enableScheduledLocalBackup: true,
};

const DESKTOP_APP: ClientCapabilities = {
  mode: "desktop_app",
  enableDeveloperTools: false,
  enableDebugPanels: false,
  enableRawSyncViews: false,
  enableOAuthDebug: false,
  enableHealthConnectNav: true,
  enableHealthConnectDebug: false,
  enableLanControls: false,
  enableLegacyImportTools: false,
  /** Packaged desktop: programmatic login; no admin button in UI. */
  enableLocalAdminLogin: false,
  enableMiniDatabaseExport: false,
  enableDatabaseImport: true,
  enableZipBackupRestore: true,
  enableJsonAccountBackup: false,
  enableTwoFileDatabaseImport: false,
  enableScheduledLocalBackup: true,
};

function isLocalBrowserHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "localhost" || host === "127.0.0.1";
}

function envClientMode(): ClientMode | null {
  const raw = import.meta.env.VITE_CLIENT_MODE?.trim();
  if (raw === "admin_browser" || raw === "desktop_app" || raw === "mobile_app") {
    return raw;
  }
  return null;
}

export function resolveClientMode(): ClientMode {
  if (typeof window !== "undefined" && window.desktopApp?.isDesktop) {
    return window.desktopApp.clientMode ?? "desktop_app";
  }
  const fromEnv = envClientMode();
  if (fromEnv) return fromEnv;
  if (import.meta.env.DEV) return "admin_browser";
  // vite preview / dist на localhost — те же dev-инструменты, что при npm run dev
  if (isLocalBrowserHost()) return "admin_browser";
  return "desktop_app";
}

export function resolveClientCapabilities(): ClientCapabilities {
  const mode = resolveClientMode();
  if (mode === "admin_browser") {
    const devToolsOn = readDeveloperToolsEnabled();
    return {
      ...ADMIN_BROWSER,
      enableOAuthDebug: devToolsOn,
      enableRawSyncViews: devToolsOn,
      enableDebugPanels: devToolsOn,
    };
  }
  return { ...DESKTOP_APP };
}

/** Strip persisted dev-tools flag in production desktop (exe). */
export function initClientCapabilities(): ClientCapabilities {
  const caps = resolveClientCapabilities();
  if (caps.mode !== "admin_browser" && readDeveloperToolsEnabled()) {
    writeDeveloperToolsEnabled(false);
  }
  return resolveClientCapabilities();
}

export function clientModeHeaderValue(mode: ClientMode = resolveClientMode()): string {
  return mode;
}
