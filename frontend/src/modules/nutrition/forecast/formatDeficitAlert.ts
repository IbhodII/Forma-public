import type { NutritionForecastResult } from "../../../api/cutBulk";

function roundKcal(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value);
}

/** Normalize API error `detail` from JSON object or legacy Python repr string. */
export function normalizeErrorDetail(detail: unknown): Record<string, unknown> | null {
  if (typeof detail === "object" && detail !== null && !Array.isArray(detail)) {
    return detail as Record<string, unknown>;
  }
  if (typeof detail !== "string") return null;

  const trimmed = detail.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      /* legacy Python repr below */
    }
    return parsePythonDictRepr(trimmed);
  }

  return { message: trimmed };
}

function parsePythonDictRepr(s: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const messageMatch = s.match(/'message'\s*:\s*'((?:[^'\\]|\\.)*)'/);
  if (messageMatch) {
    out.message = messageMatch[1].replace(/\\'/g, "'");
  }
  const statusMatch = s.match(/'deficit_status'\s*:\s*'(\w+)'/);
  if (statusMatch) out.deficit_status = statusMatch[1];
  const extraMatch = s.match(/'recommended_additional_calories'\s*:\s*(\d+(?:\.\d+)?)/);
  if (extraMatch) out.recommended_additional_calories = Number(extraMatch[1]);
  const currentMatch = s.match(/'current_deficit_kcal'\s*:\s*([\d.]+)/);
  if (currentMatch) out.current_deficit_kcal = Number(currentMatch[1]);
  const physMatch = s.match(/'physiological_limit_kcal'\s*:\s*([\d.]+)/);
  if (physMatch) out.physiological_limit_kcal = Number(physMatch[1]);
  const safeMatch = s.match(/'current_deficit_limit_safe_kcal'\s*:\s*([\d.]+)/);
  if (safeMatch) out.current_deficit_limit_safe_kcal = Number(safeMatch[1]);
  const physLimitMatch = s.match(/'current_deficit_limit_physiological_kcal'\s*:\s*([\d.]+)/);
  if (physLimitMatch) out.current_deficit_limit_physiological_kcal = Number(physLimitMatch[1]);
  return out;
}

export function isDeficitOverPlanned(forecast: NutritionForecastResult): boolean {
  if (forecast.deficit_over_planned) return true;
  const targetPerKg = forecast.target_deficit_per_kg_fat ?? forecast.max_deficit_per_kg_fat;
  const realPerKg =
    forecast.average_real_deficit_per_kg_fat ?? forecast.observed_deficit_per_kg_fat;
  if (realPerKg != null && targetPerKg != null && Number.isFinite(realPerKg) && Number.isFinite(targetPerKg)) {
    return realPerKg > targetPerKg + 0.5;
  }
  const realDay = forecast.real_avg_deficit_per_day;
  const safeLimit = forecast.current_deficit_limit_safe_kcal;
  if (realDay != null && safeLimit != null && Number.isFinite(realDay) && Number.isFinite(safeLimit)) {
    return realDay > safeLimit + 0.5;
  }
  return forecast.deficit_status === "warning" || forecast.deficit_status === "danger";
}

export function formatDangerDeficitLines(payload: Record<string, unknown>): string[] {
  const status = payload.deficit_status;
  const lines: string[] = [];

  if (status === "danger") {
    lines.push("Опасный уровень дефицита: вероятна потеря мышц, а не только жира.");
  } else if (status === "warning") {
    lines.push("Дефицит больше планового.");
  }

  const deficit = roundKcal(
    (payload.current_deficit_kcal as number | undefined) ??
      (payload.real_avg_deficit_per_day as number | undefined),
  );
  const safeLimit = roundKcal(payload.current_deficit_limit_safe_kcal as number | undefined);
  const physLimit = roundKcal(
    (payload.physiological_limit_kcal as number | undefined) ??
      (payload.current_deficit_limit_physiological_kcal as number | undefined),
  );
  const extra = roundKcal(payload.recommended_additional_calories as number | undefined);

  if (deficit != null) {
    lines.push(`Фактический дефицит: ${deficit} ккал/день`);
  }
  const realPerKg = payload.average_real_deficit_per_kg_fat ?? payload.observed_deficit_per_kg_fat;
  const targetPerKg = payload.target_deficit_per_kg_fat ?? payload.max_deficit_per_kg_fat;
  if (realPerKg != null && typeof realPerKg === "number") {
    lines.push(`Реально: ${realPerKg.toFixed(1)} ккал/кг жира`);
  }
  if (targetPerKg != null && typeof targetPerKg === "number") {
    lines.push(`Цель: ${targetPerKg.toFixed(0)} ккал/кг жира`);
  }
  if (safeLimit != null) {
    lines.push(`Безопасный предел: ${safeLimit} ккал/день`);
  } else if (physLimit != null && status === "danger") {
    lines.push(`Физиологический предел: ${physLimit} ккал/день`);
  }
  if (extra != null && extra > 0) {
    lines.push(`Рекомендуем увеличить калорийность на ${extra} ккал/день.`);
  }

  if (lines.length === 0 && typeof payload.message === "string" && payload.message.trim()) {
    return [payload.message.trim()];
  }

  return lines;
}

/** Human-readable lines for forecast deficit zones — no backend field names. */
export function formatForecastDeficitAlert(forecast: NutritionForecastResult): string[] {
  const status = forecast.deficit_status;
  const overPlanned = isDeficitOverPlanned(forecast);
  if ((!status || status === "safe") && !overPlanned) return [];

  const effectiveStatus =
    status === "danger" ? "danger" : overPlanned ? "warning" : status ?? "warning";

  return formatDangerDeficitLines({
    deficit_status: effectiveStatus,
    current_deficit_kcal: forecast.real_avg_deficit_per_day,
    real_avg_deficit_per_day: forecast.real_avg_deficit_per_day,
    observed_deficit_per_kg_fat: forecast.observed_deficit_per_kg_fat,
    average_real_deficit_per_kg_fat: forecast.average_real_deficit_per_kg_fat,
    target_deficit_per_kg_fat: forecast.target_deficit_per_kg_fat ?? forecast.max_deficit_per_kg_fat,
    max_deficit_per_kg_fat: forecast.max_deficit_per_kg_fat,
    current_deficit_limit_safe_kcal: forecast.current_deficit_limit_safe_kcal,
    current_deficit_limit_physiological_kcal: forecast.current_deficit_limit_physiological_kcal,
    recommended_additional_calories: forecast.recommended_additional_calories,
  });
}

/** Parse FastAPI structured error detail into readable text (no raw JSON). */
export function formatApiErrorDetail(detail: unknown): string | null {
  if (typeof detail === "string" && detail === "Not Found") {
    return "Эндпоинт API не найден. Перезапустите бэкенд через start.ps1 (возможен устаревший процесс на порту 8000).";
  }

  const normalized = normalizeErrorDetail(detail);
  if (!normalized) return null;

  const status = normalized.deficit_status;
  if (status === "danger" || status === "warning") {
    const lines = formatDangerDeficitLines(normalized);
    if (lines.length > 0) return lines.join("\n");
  }

  if (typeof normalized.message === "string" && normalized.message.trim()) {
    return normalized.message.trim();
  }

  return null;
}

export function extractAxiosErrorDetail(err: unknown): unknown {
  if (typeof err === "object" && err !== null && "response" in err) {
    const ax = err as { response?: { data?: { detail?: unknown } } };
    return ax.response?.data?.detail;
  }
  return null;
}

/** Multi-line human-readable forecast error (danger/warning or generic). */
export function parseForecastErrorLines(err: unknown): string[] {
  const detail = extractAxiosErrorDetail(err);
  const normalized = detail != null ? normalizeErrorDetail(detail) : null;

  if (normalized?.deficit_status === "danger" || normalized?.deficit_status === "warning") {
    const lines = formatDangerDeficitLines(normalized);
    if (lines.length > 0) return lines;
  }

  const formatted = detail != null ? formatApiErrorDetail(detail) : null;
  if (formatted) return formatted.split("\n").filter(Boolean);

  if (err instanceof Error && err.message && !err.message.includes("deficit_status:")) {
    const fromMsg = normalizeErrorDetail(err.message);
    if (fromMsg?.deficit_status) {
      const lines = formatDangerDeficitLines(fromMsg);
      if (lines.length > 0) return lines;
    }
    if (!err.message.startsWith("[object ") && !err.message.startsWith("{")) {
      return [err.message];
    }
  }

  return ["Не удалось построить прогноз. Проверьте данные питания и перезапустите API через start.ps1."];
}

export function isLegacyDangerForecastError(err: unknown): boolean {
  const detail = extractAxiosErrorDetail(err);
  const normalized = detail != null ? normalizeErrorDetail(detail) : null;
  return normalized?.deficit_status === "danger";
}
