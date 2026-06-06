import { useMemo } from "react";
import { PlotChart } from "../../../components/Plot";
import type {
  PassiveHeartRateDaily,
  PassiveHeartRateHcGate,
  PassiveHeartRateTimelinePoint,
} from "../../../api/passiveHeartRate";
import { HcSourceBadge } from "../../HealthConnect/components/HcSourceBadge";
import { chartDateLabel, sortByDate } from "../utils/chartDates";

const DAILY_LAYOUT = {
  margin: { t: 12, r: 12, b: 48, l: 44 },
  autosize: true,
  xaxis: { tickangle: -35, automargin: true },
  yaxis: { title: { text: "bpm" }, automargin: true, zeroline: false },
};

const TIMELINE_LAYOUT = {
  margin: { t: 12, r: 12, b: 40, l: 44 },
  autosize: true,
  xaxis: { automargin: true, tickangle: -25 },
  yaxis: { title: { text: "bpm" }, automargin: true, zeroline: false },
};

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/40 px-3 py-2 min-w-[88px]">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-lg font-semibold text-slate-100">{value}</div>
    </div>
  );
}

export function PassiveDailyHeartRatePanel({
  daily,
  timeline,
  isLoading,
  hcGate,
}: {
  daily: PassiveHeartRateDaily[];
  timeline: PassiveHeartRateTimelinePoint[];
  isLoading: boolean;
  hcGate?: PassiveHeartRateHcGate;
}) {
  const withData = useMemo(
    () => sortByDate(daily.filter((d) => d.sample_count > 0)),
    [daily],
  );

  const latest = withData.length ? withData[withData.length - 1] : null;

  const dailyChart = useMemo(
    () => ({
      labels: withData.map((d) => chartDateLabel(d.date)),
      avg: withData.map((d) => d.avg_hr ?? null),
      resting: withData.map((d) => d.resting_hr ?? null),
    }),
    [withData],
  );

  const timelineChart = useMemo(() => {
    const sorted = [...timeline].sort(
      (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime(),
    );
    return {
      x: sorted.map((p) =>
        new Date(p.time).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }),
      ),
      y: sorted.map((p) => p.bpm),
    };
  }, [timeline]);

  if (isLoading) {
    return <p className="text-sm text-slate-500 py-6 text-center">Загрузка пульса…</p>;
  }

  if (!withData.length) {
    const gateMsg = !hcGate?.enabled
      ? "Включите «Пульс (passive HR)» в настройках аналитики, чтобы использовать данные Health Connect."
      : hcGate?.stale_warning
        ? hcGate.stale_warning
        : null;
    return (
      <div className="py-6 text-center space-y-2">
        <p className="text-sm text-slate-500">
          Нет continuous HR из Health Connect за период. Синхронизируйте часы через мобильное
          приложение.
        </p>
        {gateMsg ? (
          <p className="text-xs text-amber-700 dark:text-amber-300 px-4">{gateMsg}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <HcSourceBadge source="health_connect" />
        {hcGate?.stale_warning ? (
          <span className="text-xs text-amber-700 dark:text-amber-300">{hcGate.stale_warning}</span>
        ) : null}
      </div>
      {latest ? (
        <div className="flex flex-wrap gap-2">
          <Kpi label="Resting" value={latest.resting_hr != null ? String(latest.resting_hr) : "—"} />
          <Kpi label="Avg" value={latest.avg_hr != null ? String(latest.avg_hr) : "—"} />
          <Kpi label="Min" value={latest.min_hr != null ? String(latest.min_hr) : "—"} />
          <Kpi label="Max" value={latest.max_hr != null ? String(latest.max_hr) : "—"} />
          <Kpi label="Samples" value={String(latest.sample_count)} />
        </div>
      ) : null}

      <div className="chart-container w-full min-w-0">
        <PlotChart
          data={[
            {
              x: dailyChart.labels,
              y: dailyChart.avg,
              type: "scatter",
              mode: "lines+markers",
              name: "Avg HR",
              line: { color: "#ef4444", width: 2 },
              marker: { size: 4 },
            },
            {
              x: dailyChart.labels,
              y: dailyChart.resting,
              type: "scatter",
              mode: "lines+markers",
              name: "Resting",
              line: { color: "#38bdf8", width: 2, dash: "dot" },
              marker: { size: 3 },
            },
          ]}
          layout={DAILY_LAYOUT}
          compact
          className="w-full min-w-0"
        />
      </div>

      {timeline.length > 0 ? (
        <>
          <p className="text-sm text-slate-400">
            Timeline {latest?.date}: {timeline.length} samples
          </p>
          <div className="chart-container w-full min-w-0">
            <PlotChart
              data={[
                {
                  x: timelineChart.x,
                  y: timelineChart.y,
                  type: "scatter",
                  mode: "lines",
                  name: "HR",
                  line: { color: "#f87171", width: 1.5 },
                },
              ]}
              layout={TIMELINE_LAYOUT}
              compact
              className="w-full min-w-0"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
