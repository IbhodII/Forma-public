import { apiClient } from "./client";
import type { HealthConnectHubResponse } from "./sync";
import type { WeightDashboard } from "./weight";

export type BodyOverviewSummaryResponse = {
  health_connect_hub: HealthConnectHubResponse;
  weight: WeightDashboard & { days?: number };
};

export async function fetchBodyOverviewSummary(weightDays = 30) {
  const { data } = await apiClient.get<BodyOverviewSummaryResponse>(
    "/body/overview/summary",
    { params: { weight_days: weightDays } },
  );
  return data;
}
