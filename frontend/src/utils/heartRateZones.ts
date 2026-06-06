import type { HeartRateZone } from "../api/user";

/** Рекомендации по использованию зоны (аналитика). */
export const ANALYTICS_ZONE_TIPS: Record<string, string> = {
  z1: "Разминка, заминка, дни отдыха. Разговорный темп, лёгкое жжение не требуется.",
  z2: "Длительные базовые тренировки, жиросжигание, восстановление после тяжёлых дней.",
  z3: "Основной объём выносливости. Комфортно тяжело, но без «разрыва» дыхания.",
  z4: "Темповые интервалы, подготовка к соревнованиям. Держать недолго, с отдыхом между отрезками.",
  z5: "Короткие спринты и максимальные усилия. Только при хорошем восстановлении (TSB > 0).",
};

/** Основной цвет среза / акцента (Garmin / Strava style). */
export const ANALYTICS_ZONE_COLORS: Record<string, string> = {
  z1: "#8BA4B8",
  z2: "#4A9EFF",
  z3: "#3DB87A",
  z4: "#F5A623",
  z5: "#E8564F",
};

/** Мягкий фон для progress bar и карточек. */
export const ANALYTICS_ZONE_MUTED: Record<string, string> = {
  z1: "rgba(139, 164, 184, 0.22)",
  z2: "rgba(74, 158, 255, 0.2)",
  z3: "rgba(61, 184, 122, 0.2)",
  z4: "rgba(245, 166, 35, 0.22)",
  z5: "rgba(232, 86, 79, 0.2)",
};

const ANALYTICS_ZONE_DEFS: { id: string; name: string; pctMin: number; pctMax: number }[] = [
  { id: "z1", name: "Восстановление", pctMin: 50, pctMax: 60 },
  { id: "z2", name: "Лёгкая", pctMin: 60, pctMax: 70 },
  { id: "z3", name: "Аэробная", pctMin: 70, pctMax: 80 },
  { id: "z4", name: "Пороговая", pctMin: 80, pctMax: 90 },
  { id: "z5", name: "Анаэробная", pctMin: 90, pctMax: 100 },
];

/** Подпись зоны как в блоке «Анаэробная (90–100%)». */
export function formatAnalyticsZoneTitle(zone: HeartRateZone): string {
  return `${zone.name} (${zone.pct_min}–${zone.pct_max}%)`;
}

export function formatAnalyticsZoneBpm(zone: HeartRateZone): string {
  return `${zone.min_bpm}–${zone.max_bpm} уд/мин`;
}

export function buildAnalyticsHrZones(maxHr: number): HeartRateZone[] {
  const mhr = Math.max(1, Math.round(maxHr));
  return ANALYTICS_ZONE_DEFS.map((z) => {
    const lo = Math.round((mhr * z.pctMin) / 100);
    let hi = Math.round((mhr * z.pctMax) / 100);
    if (z.id === "z5") hi = mhr;
    return {
      id: z.id,
      name: z.name,
      pct_min: z.pctMin,
      pct_max: z.pctMax,
      min_bpm: lo,
      max_bpm: hi,
    };
  });
}
