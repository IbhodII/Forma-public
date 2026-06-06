/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_API_PORT?: string;
  readonly VITE_CLIENT_MODE?: "admin_browser" | "desktop_app" | "mobile_app";
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare global {
  interface Window {
    desktopApp?: {
      platform: string;
      isDesktop: boolean;
      clientMode?: "desktop_app";
      apiBaseUrl: string;
    };
    electronAPI?: {
      closeWindow: () => void;
      minimizeWindow: () => void;
      maximizeWindow: () => void;
      close: () => void;
      minimize: () => void;
      maximize: () => void;
      onWindowState: (callback: (payload: { isMaximized: boolean }) => void) => () => void;
      getLanServerStatus: () => Promise<{
        enabled: boolean;
        managed: boolean;
        port: number;
        lanIp: string | null;
        url: string | null;
        tailscaleIp: string | null;
        tailscaleUrl: string | null;
        apiPort: number;
        apiLanEnabled: boolean;
        apiHost: string;
        apiLanUrl: string | null;
        apiTailscaleUrl: string | null;
        apiHealthUrl: string | null;
        mobileApiLanEnabled: boolean;
      }>;
      enableLanServer: () => Promise<{ ok: boolean; message: string }>;
      setMobileApiLan: (enabled: boolean) => Promise<{
        ok: boolean;
        message: string;
        apiLanUrl?: string | null;
        apiHealthUrl?: string | null;
        apiPort?: number;
      }>;
      pickDatabaseImportFiles: (
        kind: "zip" | "files",
      ) => Promise<
        | { kind: "zip"; path: string }
        | { kind: "files"; workoutsPath: string; sharedPath: string }
        | null
      >;
      startDatabaseImport: (payload: {
        source:
          | { kind: "zip"; path: string }
          | { kind: "files"; workoutsPath: string; sharedPath: string };
        mode: "merge" | "replace";
        userId: number;
      }) => Promise<{ jobId: string }>;
      getDatabaseImportStatus: (payload: {
        jobId: string;
        userId: number;
      }) => Promise<import("./types/desktopJobs").DatabaseImportJobStatus>;
      onDatabaseImportStageProgress: (
        callback: (payload: { percent?: number; message?: string }) => void,
      ) => () => void;
      startDatabaseWarmup: (payload: {
        mode?: "light" | "full";
        includeVacuum?: boolean;
        resume?: boolean;
        userId: number;
      }) => Promise<{ jobId: string }>;
      getDatabaseWarmupStatus: (payload: {
        jobId: string;
        userId: number;
      }) => Promise<import("./types/desktopJobs").DatabaseWarmupJobStatus>;
      cancelDatabaseWarmup: (payload: { userId: number }) => Promise<{
        status: string;
        task_id?: string | null;
        message?: string;
      }>;
      exportDatabaseZip: (payload: { userId: number }) => Promise<string | null>;
      onOAuthPopupResult?: (
        callback: (payload: {
          type?: string;
          status?: string;
          user_id?: number | null;
          email?: string;
          provider?: string | null;
          linked_only?: boolean;
          message?: string;
          error?: string;
        }) => void,
      ) => () => void;
      logOAuthFlow?: (event: string, detail?: unknown) => void;
    };
  }
}

export {};
