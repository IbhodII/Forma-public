import { apiClient } from "./client";
import type { TopExerciseProgress } from "../types";

export async function fetchTopExercisesProgress(params?: {
  limit?: number;
  current_days?: number;
  past_days?: number;
  active_days?: number;
  include_warmup?: boolean;
}) {
  const { data } = await apiClient.get<{ items: TopExerciseProgress[] }>(
    "/strength/top-exercises-progress",
    {
      params: {
        ...params,
        include_warmup: params?.include_warmup ?? false,
      },
    },
  );
  return data.items;
}
