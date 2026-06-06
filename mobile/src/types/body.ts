export interface BodyMetricRow {
  date: string;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  muscle_mass_kg?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  chest_inhale_cm?: number | null;
  bicep_relaxed_cm?: number | null;
  bmi?: number | null;
}

export interface PaginatedMeta {
  total: number;
  limit: number;
  offset: number;
}

export interface BodyMetricsResponse {
  items: BodyMetricRow[];
  meta: PaginatedMeta;
}

export interface BodyMetricCreatePayload {
  date: string;
  allow_replace?: boolean;
  weight_kg?: number | null;
  body_fat_percent?: number | null;
  muscle_mass_kg?: number | null;
  chest_inhale_cm?: number | null;
  waist_cm?: number | null;
  hips_cm?: number | null;
  bicep_relaxed_cm?: number | null;
}

export interface WeightDailyRow {
  date: string;
  weight_kg: number;
  body_fat_percent: number | null;
  source?: string | null;
}

export interface WeightDailyResponse {
  items: WeightDailyRow[];
  weekly: Array<Record<string, unknown>>;
  current_week: Record<string, unknown>;
}

export interface StepsHistoryPoint {
  date: string;
  steps: number;
  step_length_m: number | null;
  distance_km: number | null;
  source?: string | null;
}

export interface StepsHistoryResponse {
  items: StepsHistoryPoint[];
  yearly: Array<Record<string, unknown>>;
  summary: {
    count: number;
    min_date: string | null;
    max_date: string | null;
  };
}
