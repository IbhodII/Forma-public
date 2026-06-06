import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcBarChart } from "../components/HcBarChart";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { HcSourceBadge } from "../components/HcSourceBadge";
import { HcStaleBadge } from "../components/HcStaleBadge";

export function HcStepsSection({
  steps,
  embedded = false,
}: {
  steps: HealthConnectHubResponse["steps"];
  embedded?: boolean;
}) {
  const chartSeries = steps.week_series.map((d) => ({
    date: d.date,
    value: d.steps,
  }));

  return (
    <HcSectionFrame
      id="hc-steps"
      embedded={embedded}
      eyebrow="Steps"
      title="Шаги из Health Connect"
      description="Эффективное значение за день и источник в SQLite."
    >
      {!steps.has_data ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет данных о шагах за неделю.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-2xl font-semibold tabular-nums">
                {steps.today?.toLocaleString("ru-RU") ?? "—"}
              </span>
              <span className="ml-2 text-sm text-[rgb(var(--app-text-muted))]">сегодня</span>
            </div>
            <HcSourceBadge source={steps.effective_source} />
            {steps.stale ? <HcStaleBadge label="Stale" /> : null}
          </div>
          {steps.stale_reason ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{steps.stale_reason}</p>
          ) : null}
          {steps.source_breakdown_note ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))]">{steps.source_breakdown_note}</p>
          ) : null}
          <div className={embedded ? "body-hub__chart-panel body-hub__chart-panel--wide" : undefined}>
            <HcBarChart title="Динамика шагов" series={chartSeries} valueLabel="Шаги" color="#06B6D4" />
          </div>
          {steps.date_range.min || steps.date_range.max ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))] tabular-nums">
              HC диапазон: {steps.date_range.min ?? "—"} … {steps.date_range.max ?? "—"}
            </p>
          ) : null}
        </div>
      )}
    </HcSectionFrame>
  );
}
