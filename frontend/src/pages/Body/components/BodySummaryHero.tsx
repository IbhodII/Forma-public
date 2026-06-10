import type { BodyMetricsSummary } from "../../../api/body";
import type { BodyMetricRow } from "../../../types";
import {
  calcMetricDelta,
  formatBodyMetricSigned,
  formatMetricNum,
  type BodyUnitsFormatProps,
} from "../../../utils/bodyMetrics";
import {
  deriveComposition,
  sparklineValues,
  sparklineWaistHipsRatio,
} from "../utils/bodyComposition";
import { Sparkline } from "./Sparkline";

type HeroMetric = {
  key: string;
  label: string;
  value: string;
  sparkKey: string;
  color: string;
  delta: ReturnType<typeof calcMetricDelta>;
};

function DeltaLine({
  delta,
  formatDiff,
}: {
  delta: ReturnType<typeof calcMetricDelta>;
  formatDiff?: (n: number) => string;
}) {
  if (!delta || (delta.diff === 0 && delta.pct === 0)) {
    return <span className="body-hero-metric__delta text-[rgb(var(--app-text-muted))]">без изменений</span>;
  }
  const sign = delta.diff > 0 ? "+" : "";
  const arrow = delta.diff > 0 ? "↑" : "↓";
  const tone = delta.improved ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const diffText = formatDiff
    ? formatDiff(delta.diff)
    : formatBodyMetricSigned(delta.diff);
  return (
    <span className={`body-hero-metric__delta ${tone}`}>
      {arrow} {diffText} ({sign}
      {delta.pct.toFixed(1)}%)
    </span>
  );
}

export function BodySummaryHero({
  summary,
  chartRows,
  units,
}: {
  summary: BodyMetricsSummary | undefined;
  chartRows: BodyMetricRow[];
  units: BodyUnitsFormatProps;
}) {
  const { formatBodyWeight, formatWeightChange, formatCircumference, formatCircumferenceChange } =
    units;
  const m = summary?.metrics;
  const comp = deriveComposition(summary, null);

  const waist = m?.waist_cm;
  const hips = m?.hips_cm;
  const ratio =
    waist?.value && hips?.value && waist.value > 0 && hips.value > 0
      ? (waist.value / hips.value).toFixed(2)
      : null;

  const metrics: HeroMetric[] = [
    {
      key: "weight",
      label: "Вес",
      value: m?.weight_kg ? formatBodyWeight(m.weight_kg.value) : "—",
      sparkKey: "weight_kg",
      color: "#22C55E",
      delta: m?.weight_kg ? calcMetricDelta(m.weight_kg.value, m.weight_kg.previous_value, false) : null,
    },
    {
      key: "fat",
      label: "% жира",
      value: m?.body_fat_percent ? formatMetricNum(m.body_fat_percent.value, "%") : "—",
      sparkKey: "body_fat_percent",
      color: "#EAB308",
      delta: m?.body_fat_percent
        ? calcMetricDelta(m.body_fat_percent.value, m.body_fat_percent.previous_value, false)
        : null,
    },
    {
      key: "lean",
      label: "Сухая масса",
      value: comp.leanMassKg != null ? formatBodyWeight(comp.leanMassKg) : "—",
      sparkKey: "weight_kg",
      color: "#3b82f6",
      delta: null,
    },
    {
      key: "muscle",
      label: "Мышцы",
      value: m?.muscle_mass_kg ? formatBodyWeight(m.muscle_mass_kg.value) : "—",
      sparkKey: "muscle_mass_kg",
      color: "#6366f1",
      delta: m?.muscle_mass_kg
        ? calcMetricDelta(m.muscle_mass_kg.value, m.muscle_mass_kg.previous_value, true)
        : null,
    },
    {
      key: "waist",
      label: ratio ? "Талия / бёдра" : "Талия",
      value: ratio ?? (waist ? formatCircumference(waist.value) : "—"),
      sparkKey: "waist_cm",
      color: "#8b5cf6",
      delta: waist ? calcMetricDelta(waist.value, waist.previous_value, false) : null,
    },
    {
      key: "hips",
      label: "Бёдра",
      value: hips ? formatCircumference(hips.value) : "—",
      sparkKey: "hips_cm",
      color: "#ec4899",
      delta: hips ? calcMetricDelta(hips.value, hips.previous_value, false) : null,
    },
  ];

  if (!m || Object.keys(m).length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-8 text-center text-slate-500">
        Добавьте первый замер, чтобы увидеть сводку по телу.
      </div>
    );
  }

  return (
    <div className="body-hero-grid">
      {metrics.map((item) => {
        const tone =
          item.delta && item.delta.diff !== 0
            ? item.delta.improved
              ? "body-hero-metric--good"
              : "body-hero-metric--warn"
            : "";
        return (
          <article key={item.key} className={`body-hero-metric ${tone}`}>
            <p className="body-hero-metric__label">{item.label}</p>
            <p className="body-hero-metric__value">{item.value}</p>
            {item.delta ? (
              <DeltaLine
                delta={item.delta}
                formatDiff={
                  item.key === "waist" || item.key === "hips"
                    ? formatCircumferenceChange
                    : item.key === "muscle"
                      ? formatWeightChange
                      : item.key === "fat"
                        ? undefined
                        : formatWeightChange
                }
              />
            ) : (
              <span className="body-hero-metric__delta text-[rgb(var(--app-text-muted))] text-[11px]">
                оценка по весу и жиру
              </span>
            )}
            <Sparkline
              values={
                item.key === "waist" && ratio
                  ? sparklineWaistHipsRatio(chartRows)
                  : sparklineValues(chartRows, item.sparkKey)
              }
              color={item.color}
            />
          </article>
        );
      })}
    </div>
  );
}
