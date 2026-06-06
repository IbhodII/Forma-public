import { apiClient } from "./client";

export type AuthSession = {
  user_id: number;
  username: string;
  cloud_provider?: string | null;
  cloud_user_id?: string | null;
  email?: string | null;
  last_sync?: string | null;
};

export type LinkCandidate = {
  suggest_link_user_id: number | null;
  reason: string;
};

export type ScopeDebug = {
  current_user_id: number;
  local_profile_id: number;
  cloud_provider?: string | null;
  cloud_user_id?: string | null;
  cloud_identity?: string | null;
  db_path: string;
  counts_current_user: Record<string, number>;
  counts_user_1: Record<string, number>;
  global_tables: Record<string, number>;
  scope_mismatch_suspected: boolean;
};

export async function fetchAuthMe(): Promise<AuthSession> {
  const { data } = await apiClient.get<AuthSession>("/auth/me");
  return data;
}

/** Локальный desktop/admin вход — создаёт профиль при необходимости. */
export async function fetchDesktopLogin(): Promise<AuthSession> {
  const { data } = await apiClient.post<AuthSession>("/auth/desktop-login");
  return data;
}

export async function fetchLinkCandidate(): Promise<LinkCandidate> {
  const { data } = await apiClient.get<LinkCandidate>("/auth/link-candidate");
  return data;
}

export async function fetchScopeDebug(): Promise<ScopeDebug> {
  const { data } = await apiClient.get<ScopeDebug>("/auth/scope-debug");
  return data;
}

export async function rebindCloudToUser(targetUserId = 1): Promise<{
  status: string;
  source_user_id: number;
  target_user_id: number;
  session_user_id: number;
  rows_moved: Record<string, number>;
}> {
  const { data } = await apiClient.post("/auth/rebind-cloud-to-user", null, {
    params: { target_user_id: targetUserId },
  });
  return data;
}
