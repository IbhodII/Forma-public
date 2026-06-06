import { apiClient } from "./client";

export type DatabaseOverview = {
  activeDbPath: {
    workouts: string;
    shared: string;
    data_root: string;
    forma_data_dir: string | null;
  };
  currentProfile: {
    user_id: number;
    found: boolean;
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
    sex?: string | null;
  };
  shared_attached: boolean;
  request_user_id: number;
  counts: {
    strength_workouts: number;
    cardio_workouts: number;
    food_entries: number;
    food_products_shared: number;
    body_metrics: number;
    daily_weight: number;
    steps_days: number;
    analytics: Record<string, number | boolean>;
  };
  workout_visibility?: Record<string, unknown>;
};

export async function fetchDatabaseOverview(): Promise<DatabaseOverview> {
  const { data } = await apiClient.get<DatabaseOverview>("/database/diagnostics/overview");
  return data;
}
