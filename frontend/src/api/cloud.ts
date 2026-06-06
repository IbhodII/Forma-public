import { apiClient } from "./client";
import { resolveApiBaseUrl, resolveApiOrigin } from "./runtimeBaseUrl";

export type CloudProvider = "yandex" | "google";

export type CloudConnectionStatus = {
  connected: boolean;
  expires_at: string | null;
  account_email?: string | null;
  account_name?: string | null;
  account_label?: string | null;
};

export type AutoBackupStatus = {
  enabled: boolean;
};

export type CloudBackupEntry = {
  filename: string;
  cloud_path?: string | null;
  file_id?: string | null;
  created_at?: string | null;
  source_user_id?: number | null;
  legacy?: boolean;
};

export async function fetchYandexCloudStatus(): Promise<CloudConnectionStatus> {
  const { data } = await apiClient.get<CloudConnectionStatus>("/cloud/status/yandex");
  return data;
}

export async function fetchGoogleCloudStatus(): Promise<CloudConnectionStatus> {
  const { data } = await apiClient.get<CloudConnectionStatus>("/cloud/status/google");
  return data;
}

export async function revokeYandexCloud(): Promise<void> {
  await apiClient.post("/cloud/revoke/yandex");
}

export async function revokeGoogleCloud(): Promise<void> {
  await apiClient.post("/cloud/revoke/google");
}

export async function startCloudBackup(
  provider: CloudProvider,
  backupType: "database" | "workouts",
): Promise<{ status: string; message: string; user_id?: number }> {
  const path = provider === "google" ? "/cloud/backup/google" : "/cloud/backup";
  const { data } = await apiClient.post<{ status: string; message: string; user_id?: number }>(
    path,
    {
      provider,
      backup_type: backupType,
    },
  );
  return data;
}

export async function syncCloudWorkouts(
  provider: CloudProvider,
  direction: "upload" | "download",
): Promise<{ status: string; uploaded?: number; downloaded?: number; user_id?: number }> {
  const { data } = await apiClient.post("/cloud/sync", {
    provider,
    direction,
  });
  return data;
}

export async function fetchAutoBackupStatus(): Promise<AutoBackupStatus> {
  const { data } = await apiClient.get<AutoBackupStatus>("/cloud/auto-backup");
  return data;
}

export async function setAutoBackupEnabled(
  enable: boolean,
): Promise<{ status: string; enabled: boolean }> {
  const { data } = await apiClient.post<{ status: string; enabled: boolean }>("/cloud/backup/auto", {
    enable,
  });
  return data;
}

export type OAuthProviderDebug = {
  configured: boolean;
  client_id_present: boolean;
  client_secret_present: boolean;
  client_id_preview?: string | null;
  callback_path: string;
  redirect_uri?: string | null;
  redirect_source: string;
  env_redirect_uri?: string | null;
  auth_url_preview?: string | null;
  legacy_redirect_ignored?: boolean;
};

export type OAuthDebugInfo = {
  api_base_url?: string | null;
  runtime_mode: string;
  env_file_loaded: boolean;
  env_file_path?: string | null;
  public_api_base_url?: string | null;
  yandex: OAuthProviderDebug;
  google: OAuthProviderDebug;
  polar: OAuthProviderDebug;
  alternate_redirect_uris: string[];
  warnings: string[];
};

export async function fetchCloudOAuthDebug(redirectBase?: string): Promise<OAuthDebugInfo> {
  const { data } = await apiClient.get<OAuthDebugInfo>("/cloud/oauth-debug", {
    params: redirectBase ? { redirect_base: redirectBase } : undefined,
  });
  return data;
}

export type OAuthUserStatus = {
  user_id: number;
  yandex: CloudConnectionStatus & {
    has_token_row: boolean;
    has_cloud_link: boolean;
    cloud_link: {
      storage_provider: string;
      account_cloud_provider: string;
      account_cloud_user_id: string;
      updated_at: string;
    } | null;
  };
};

/** Desktop debug: token/link rows for current X-User-ID. */
export async function fetchOAuthStatus(): Promise<OAuthUserStatus> {
  const { data } = await apiClient.get<OAuthUserStatus>("/cloud/oauth-status");
  return data;
}

function cloudAuthClientMode(): string | undefined {
  if (typeof window !== "undefined" && window.desktopApp?.isDesktop) {
    return "desktop_app";
  }
  return undefined;
}

function cloudAuthPopupUrl(segment: "yandex" | "google", linkUserId?: number): string {
  const base = resolveApiBaseUrl();
  const prefix = base.endsWith("/") ? base : `${base}/`;
  const params = new URLSearchParams();
  if (linkUserId) params.set("link_user", String(linkUserId));
  const origin = resolveApiOrigin();
  if (origin) params.set("redirect_base", origin);
  const mode = cloudAuthClientMode();
  if (mode) params.set("client_mode", mode);
  const qs = params.toString();
  return `${prefix}cloud/auth/${segment}${qs ? `?${qs}` : ""}`;
}

/** Подключение облака из настроек — привязка к текущему локальному профилю. */
export function yandexAuthPopupUrl(linkUserId?: number): string {
  return cloudAuthPopupUrl("yandex", linkUserId);
}

export function googleAuthPopupUrl(linkUserId?: number): string {
  return cloudAuthPopupUrl("google", linkUserId);
}

export type RemoteBackupStatus = {
  found: boolean;
  count?: number;
  latest?: CloudBackupEntry | null;
  filename?: string;
  provider: string;
  cloud_path?: string;
};

export async function fetchCloudBackupList(
  provider: CloudProvider,
): Promise<{ backups: CloudBackupEntry[]; user_id: number }> {
  const { data } = await apiClient.get<{ backups: CloudBackupEntry[]; user_id: number }>(
    "/cloud/backup/list",
    { params: { provider } },
  );
  return data;
}

export async function fetchRemoteBackupStatus(
  provider: CloudProvider,
): Promise<RemoteBackupStatus> {
  const { data } = await apiClient.get<RemoteBackupStatus>("/cloud/backup/remote-status", {
    params: { provider },
  });
  return data;
}

export async function restoreCloudBackup(
  provider: CloudProvider,
  filename?: string,
): Promise<{ status: string; message: string; filename?: string; bytes?: number }> {
  const { data } = await apiClient.post<{
    status: string;
    message: string;
    filename?: string;
    bytes?: number;
  }>("/cloud/backup/restore", { provider, filename: filename ?? null });
  return data;
}

export type FormaSyncDebugPlan = {
  client_type: string;
  db_path: string;
  current_user_id: number;
  yandex_uid: string | null;
  yandex_connected: boolean;
  cloud_path: string | null;
  manifest_exists: boolean;
  local_revision: number;
  remote_revision: number | null;
  pending_entities_count: number;
  baseline_required: boolean;
  local_has_data: boolean;
  package_path: string | null;
  package_size: number | null;
  upload_target: string | null;
  download_target: string | null;
};

export type FormaSyncStatus = {
  yandex_connected: boolean;
  yandex_uid: string | null;
  local_revision: number;
  remote_revision: number | null;
  pending_changes: number;
  conflict_count: number;
  last_upload_at: string | null;
  last_download_at: string | null;
  last_error: string | null;
  sync_in_flight: boolean;
  auto_enabled: boolean;
  baseline_required?: boolean;
  /** Путь в веб-интерфейсе Диска, например /FormaSync/123456789 */
  cloud_folder_web?: string | null;
  debug_plan?: FormaSyncDebugPlan | null;
};

export type FormaSyncActionResult = {
  uploaded: boolean;
  downloaded: boolean;
  message: string;
};

export type FormaSyncConflict = {
  id: number;
  entity_type: string;
  entity_label: string;
  local_payload_json: string;
  server_payload_json: string | null;
  created_at: string;
  winner: string | null;
};

export async function fetchFormaSyncStatus(): Promise<FormaSyncStatus> {
  const { data } = await apiClient.get<FormaSyncStatus>("/cloud/forma-sync/status");
  return data;
}

export async function formaSyncSync(): Promise<FormaSyncActionResult> {
  const { data } = await apiClient.post<FormaSyncActionResult>("/cloud/forma-sync/sync");
  return data;
}

export async function formaSyncUpload(force = false): Promise<FormaSyncActionResult> {
  const { data } = await apiClient.post<FormaSyncActionResult>("/cloud/forma-sync/upload", null, {
    params: { force },
  });
  return data;
}

export async function formaSyncDownload(): Promise<FormaSyncActionResult> {
  const { data } = await apiClient.post<FormaSyncActionResult>("/cloud/forma-sync/download");
  return data;
}

export async function fetchFormaSyncConflicts(): Promise<FormaSyncConflict[]> {
  const { data } = await apiClient.get<FormaSyncConflict[]>("/cloud/forma-sync/conflicts");
  return data;
}

export async function resolveFormaSyncConflict(conflictId: number): Promise<void> {
  await apiClient.post(`/cloud/forma-sync/conflicts/${conflictId}/resolve`);
}

export async function setFormaSyncAutoEnabled(enabled: boolean): Promise<void> {
  await apiClient.post("/cloud/forma-sync/auto", { enabled });
}
