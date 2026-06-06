import type { BodyMetricsSummary } from "../../../api/body";
import type { BodyMetricRow } from "../../../types";
import { calcMetricDelta, sortRowsByDateAsc } from "../../../utils/bodyMetrics";

/** Простые эвристики без ML — только сравнение последних замеров. */
export function buildBodyInsights(
  summary: BodyMetricsSummary | undefined,
  chartRows: BodyMetricRow[],
): string[] {
  const tips: string[] = [];
  const m = summary?.metrics;

  const wDelta = m?.weight_kg
    ? calcMetricDelta(m.weight_kg.value, m.weight_kg.previous_value, false)
    : null;
  const fatDelta = m?.body_fat_percent
    ? calcMetricDelta(m.body_fat_percent.value, m.body_fat_percent.previous_value, false)
    : null;
  const muscleDelta = m?.muscle_mass_kg
    ? calcMetricDelta(m.muscle_mass_kg.value, m.muscle_mass_kg.previous_value, true)
    : null;
  const waistDelta = m?.waist_cm
    ? calcMetricDelta(m.waist_cm.value, m.waist_cm.previous_value, false)
    : null;

  if (
    wDelta &&
    waistDelta &&
    wDelta.diff !== 0 &&
    waistDelta.diff !== 0 &&
    waistDelta.improved &&
    Math.abs(waistDelta.pct) > Math.abs(wDelta.pct) * 1.15
  ) {
    tips.push("Талия уменьшается быстрее, чем вес — часто это признак перераспределения жира, а не только «сухого» снижения весов.");
  }

  if (muscleDelta && Math.abs(muscleDelta.diff) < 0.3 && muscleDelta.pct > -2) {
    tips.push("Мышечная масса по замерам стабильна — при дефиците это хороший знак сохранения мышц.");
  }

  if (fatDelta && fatDelta.improved && fatDelta.pct < -3) {
    tips.push(`Доля жира снизилась примерно на ${Math.abs(fatDelta.pct).toFixed(1)}% относительно прошлого замера.`);
  }

  if (wDelta && wDelta.improved && Math.abs(wDelta.pct) >= 0.3 && Math.abs(wDelta.pct) <= 1.2) {
    tips.push("Скорость изменения веса близка к умеренной (~0,5–1% в неделю при регулярных замерах) — обычно это комфортный темп для долгосрочного прогресса.");
  }

  const sorted = sortRowsByDateAsc(chartRows);
  if (sorted.length >= 3) {
    const last = sorted.slice(-3);
    const fats = last.map((r) => Number(r.body_fat_percent)).filter((n) => n > 0);
    if (fats.length === 3 && fats[0] > fats[1] && fats[1] > fats[2]) {
      tips.push("За последние три замера % жира снижается последовательно — тренд состава тела положительный.");
    }
  }

  if (!tips.length && m?.weight_kg) {
    tips.push("Добавьте ещё один контрольный замер через 1–2 недели, чтобы увидеть устойчивые тренды по весу и обхватам.");
  }

  return tips.slice(0, 4);
}
