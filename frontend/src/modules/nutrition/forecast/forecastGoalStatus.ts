import type { NutritionForecastResult } from "../../../api/cutBulk";

const WEIGHT_TOLERANCE_KG = 0.05;

/** UI: цель по весу (не только по жиру из backend). */
export function isForecastGoalReached(
  forecast: NutritionForecastResult,
  phase: "cut" | "bulk",
): boolean {
  const current = forecast.current_weight_kg;
  const target = forecast.target_weight_kg;
  if (current == null || target == null || !Number.isFinite(current) || !Number.isFinite(target)) {
    return Boolean(forecast.goal_reached);
  }
  if (phase === "cut") {
    return current <= target + WEIGHT_TOLERANCE_KG;
  }
  return current >= target - WEIGHT_TOLERANCE_KG;
}

export function forecastWeeksHint(forecast: NutritionForecastResult): string {
  const parts = [`~${forecast.weeks_to_target.toFixed(1)} нед.`];
  if (forecast.model === "dynamic_cut") {
    parts.push("динам.");
  } else if (Number.isFinite(forecast.change_per_week_kg)) {
    parts.push(`${forecast.change_per_week_kg.toFixed(2)} кг/нед`);
  }
  if (forecast.approximate) {
    parts.push("до 52 нед.");
  }
  return parts.join(" · ");
}
