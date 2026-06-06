import { apiClient } from "./client";

export type ApiHealthStatus = {
  ok: boolean;
  status?: string;
};

export async function fetchApiHealth(): Promise<ApiHealthStatus> {
  try {
    const { data, status } = await apiClient.get<{ status?: string }>("/health", {
      timeout: 5_000,
    });
    return { ok: status >= 200 && status < 300, status: data?.status ?? "ok" };
  } catch {
    return { ok: false };
  }
}
