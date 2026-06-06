export type MetricStatus = "ok" | "caution" | "danger" | "unknown" | string;

export interface KcalPerKgMetric {
  value?: number | null;
  status: MetricStatus;
  ranges?: Record<string, number>;
  tooltips?: Record<string, string>;
  note?: string;
  avg_daily_expenditure_kcal?: number | null;
  deficit_per_kg_body?: number | null;
  expenditure_without_tef_kcal?: number | null;
  fat_mass_kg?: number | null;
  deficit_per_kg_fat?: number | null;
}

export interface BodyFatCategory {
  key: string;
  label: string;
  min: number;
  max: number;
  color: string;
}

export interface BodyFatScale {
  sex: string;
  percent?: number | null;
  category?: BodyFatCategory | null;
  position_in_category?: number | null;
  status: string;
  categories: BodyFatCategory[];
}

export interface HealthWarning {
  level: "yellow" | "orange" | "danger" | string;
  code: string;
  message: string;
}

export interface TefMacroCoefficient {
  key: string;
  label: string;
  min_pct: number;
  max_pct: number;
  rate_used: number;
}

export interface TefHelp {
  description: string;
  macro_coefficients: TefMacroCoefficient[];
  tef_kcal_in_calculation?: number | null;
}

export interface WeekNutritionAnalytics {
  kcal_per_kg_body?: KcalPerKgMetric | null;
  kcal_per_kg_fat?: KcalPerKgMetric | null;
  body_fat_scale?: BodyFatScale | null;
  tef_help?: TefHelp | null;
  health_warnings: HealthWarning[];
}

export interface ForecastTarget {
  target_value: number;
  current_value: number;
  rate_per_week?: number | null;
  estimated_days?: number | null;
  estimated_weeks?: number | null;
  estimated_date?: string | null;
}

export interface ProgressConfidence {
  level: "low" | "medium" | "high" | string;
  score?: number | null;
  message?: string | null;
}

export interface ProgressForecast {
  phase: string;
  sufficient_data: boolean;
  observation_count: number;
  confidence: ProgressConfidence;
  avg_daily_calories?: number | null;
  avg_daily_expenditure?: number | null;
  weight_trend_per_week?: number | null;
  fat_trend_per_week?: number | null;
  forecasts: Record<string, ForecastTarget>;
}

export interface CutBulkProgressResponse {
  snapshot: Record<string, unknown>;
  plan: Record<string, unknown>;
  progress: ProgressForecast;
  body_fat_scale?: BodyFatScale | null;
  health_warnings?: HealthWarning[];
}
