import { apiClient } from "./client";
import type { FoodPhase, FoodDayResponse } from "./food";
import type { CtlAtlTsbResponse, PaginatedResponse, StrengthSession } from "../types";
import type { StepsHistoryResponse } from "./steps";
import type { HealthConnectHubResponse } from "./sync";
import type { PolarConnectionStatus } from "./polar";
import type { FormaSyncStatus } from "./cloud";

export type DashboardHcStatusSnapshot = {
  last_sync_at: string | null;
  sync_status: string | null;
  warnings: string[];
  steps_today: number | null;
  steps_today_source: string | null;
  stale: boolean;
};

export type DashboardCloudStatus = {
  connected: boolean;
  expires_at?: string | null;
  account_email?: string | null;
  account_name?: string | null;
  account_label?: string | null;
};

export type DashboardWeightWeekPoint = {
  date: string;
  weight_kg: number;
};

export type DashboardWeightWeekResponse = {
  items: DashboardWeightWeekPoint[];
};

export type DashboardHomeResponse = {
  date: string;
  phase: FoodPhase;
  ctl: CtlAtlTsbResponse;
  food: FoodDayResponse;
  body: Record<string, unknown>;
  steps_today: StepsHistoryResponse;
  steps_week: StepsHistoryResponse;
  weight_week: DashboardWeightWeekResponse;
  sleep: Record<string, unknown>;
  latest_strength: PaginatedResponse<StrengthSession>;
  sync: {
    polar: PolarConnectionStatus;
    cloud: DashboardCloudStatus;
    forma_sync: FormaSyncStatus;
    health_connect: DashboardHcStatusSnapshot;
  };
  health_connect_hub: HealthConnectHubResponse | null;
};

export type DashboardHomeExtensions = {
  ctl?: CtlAtlTsbResponse;
};

export async function fetchDashboardHomeSummary(params: {
  phase?: FoodPhase;
}): Promise<DashboardHomeResponse> {
  const { data } = await apiClient.get<DashboardHomeResponse>("/dashboard/home/summary", {
    params: { phase: params.phase ?? "cut" },
  });
  return data;
}

export async function fetchDashboardHomeExtensions(
  parts: string[] = ["ctl"],
): Promise<DashboardHomeExtensions> {
  const { data } = await apiClient.get<DashboardHomeExtensions>("/dashboard/home/extensions", {
    params: { parts: parts.join(",") },
  });
  return data;
}

/** Полный home (summary + CTL); для warmup / admin hub. */
export async function fetchDashboardHome(params: {
  phase?: FoodPhase;
  includeHcHub?: boolean;
}): Promise<DashboardHomeResponse> {
  const { data } = await apiClient.get<DashboardHomeResponse>("/dashboard/home", {
    params: {
      phase: params.phase ?? "cut",
      ...(params.includeHcHub ? { include_hc_hub: true } : {}),
    },
  });
  return data;
}
