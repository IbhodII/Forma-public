import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchCaloriesAnalytics } from "../../../api/analytics";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { PlotChart } from "../../../components/Plot";
import { queryKeys } from "../../../hooks/queryKeys";
import { useUnits } from "../../../hooks/useUnits";
import { kcalToIcharge } from "../../../utils/americanUnits";
import { parseApiError } from "../../../utils/validation";
import { SECTION_HINTS } from "../analyticsHints";
import { chartDateLabel, sortByDate } from "../utils/chartDates";
import { AnalyticsSectionHeader } from "./MetricHelp";
import type { CaloriesAnalyticsRow } from "../../../types";

function buildYRange(maxStack: number): [number, number] | undefined {
  if (!Number.isFinite(maxStack) || maxStack <= 0) return undefined;
  const pad = Math.max(maxStack * 0.12, maxStack < 100 ? 10 : 50);
  return [0, maxStack + pad];
}

export function CaloriesSection({
  dateFrom,
  dateTo,
  embedded = false,
  enabled = true,
}: {
  dateFrom: string;
  dateTo: string;
  embedded?: boolean;
  enabled?: boolean;
}) {
  const { formatEnergy, system } = useUnits();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.calories(dateFrom, dateTo),
    queryFn: () => fetchCaloriesAnalytics(dateFrom, dateTo),
    enabled: enabled && Boolean(dateFrom && dateTo),
  });

  const averages = useMemo(() => {
    if (!data?.length) return null;
    const n = data.length;
    const sum = data.reduce(
      (acc, r) => ({
        strength: acc.strength + r.strength_kcal,
        cardio: acc.cardio + r.cardio_kcal,
        total: acc.total + r.total_kcal,
      }),
      { strength: 0, cardio: 0, total: 0 },
    );
    return {
      strength: sum.strength / n,
      cardio: sum.cardio / n,
      total: sum.total / n,
    };
  }, [data]);

  const energyYTitle = system === "american" ? "iCharge" : "ккал";
  const toChartY = (kcal: number) =>
    system === "american" ? kcalToIcharge(kcal) : kcal;

  const chart = useMemo(() => {
    if (!data?.length) return null;
    const sorted = sortByDate(data);
    const withActivity = sorted.filter((r) => r.total_kcal > 0);
    const rows: CaloriesAnalyticsRow[] =
      withActivity.length > 0 ? withActivity : sorted;

    const xIso = rows.map((r) => r.date);
    const strengthY = rows.map((r) => toChartY(r.strength_kcal));
    const cardioY = rows.map((r) => toChartY(r.cardio_kcal));
    const maxStack = Math.max(
      0,
      ...rows.map((r) => toChartY(r.strength_kcal + r.cardio_kcal)),
    );
    const yRange = buildYRange(maxStack);
    const tickLabels = rows.map((r) => chartDateLabel(r.date));

    const useCategoryAxis =
      rows.length <= 45 ||
      rows.some((r, i) => {
        const prev = rows[i - 1];
        if (!prev) return false;
        const gap =
          new Date(r.date).getTime() - new Date(prev.date).getTime();
        return gap > 2 * 86400000;
      });

    return {
      rows,
      x: useCategoryAxis ? tickLabels : xIso,
      strengthY,
      cardioY,
      maxStack,
      yRange,
      useCategoryAxis,
      tickLabels,
    };
  }, [data, system]);

  return (
    <section className="space-y-4 min-w-0">
      {!embedded ? <AnalyticsSectionHeader {...SECTION_HINTS.calories} /> : null}
      {isLoading && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}
      {averages && (
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="rounded-lg border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-subtab-track)/0.35)] px-3 py-2.5 text-center sm:text-left">
            <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              Силовые
            </p>
            <p className="text-lg sm:text-xl font-bold tabular-nums mt-0.5">
              {formatEnergy(averages.strength)}
            </p>
            <p className="text-[10px] text-[rgb(var(--app-text-muted))]">ср./день</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-subtab-track)/0.35)] px-3 py-2.5 text-center sm:text-left">
            <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              Кардио
            </p>
            <p className="text-lg sm:text-xl font-bold tabular-nums mt-0.5">
              {formatEnergy(averages.cardio)}
            </p>
            <p className="text-[10px] text-[rgb(var(--app-text-muted))]">ср./день</p>
          </div>
          <div className="rounded-lg border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-subtab-track)/0.35)] px-3 py-2.5 text-center sm:text-left">
            <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              Всего
            </p>
            <p className="text-lg sm:text-xl font-bold tabular-nums mt-0.5">
              {formatEnergy(averages.total)}
            </p>
            <p className="text-[10px] text-[rgb(var(--app-text-muted))]">ср./день</p>
          </div>
        </div>
      )}
      {chart && chart.rows.length > 0 && chart.maxStack > 0 ? (
        <div className="w-full min-w-0 min-h-[240px] sm:min-h-[280px]">
          <PlotChart
            data={[
              {
                x: chart.x,
                y: chart.strengthY,
                type: "bar",
                name: "Силовые",
                marker: { color: "#6366f1", line: { width: 0 } },
                customdata: chart.rows.map((r) => chartDateLabel(r.date)),
                hovertemplate:
                  "%{customdata}<br>Силовые: %{y:.0f}<extra></extra>",
              },
              {
                x: chart.x,
                y: chart.cardioY,
                type: "bar",
                name: "Кардио",
                marker: { color: "#F97316", line: { width: 0 } },
                customdata: chart.rows.map((r) => chartDateLabel(r.date)),
                hovertemplate:
                  "%{customdata}<br>Кардио: %{y:.0f}<extra></extra>",
              },
            ]}
            layout={{
              barmode: "stack",
              margin: { t: 12, r: 12, b: 52, l: 52 },
              bargap: chart.rows.length > 30 ? 0.15 : 0.25,
              xaxis: chart.useCategoryAxis
                ? {
                    type: "category",
                    title: { text: "Дата" },
                    tickangle: chart.rows.length > 14 ? -40 : 0,
                    automargin: true,
                  }
                : {
                    type: "date",
                    title: { text: "Дата" },
                    tickformat: "%d.%m.%y",
                    tickangle: -35,
                    automargin: true,
                  },
              yaxis: {
                title: { text: energyYTitle },
                rangemode: "tozero",
                ...(chart.yRange ? { range: chart.yRange, autorange: false } : {}),
                automargin: true,
              },
              hovermode: "x unified",
              transition: { duration: 350, easing: "cubic-in-out" as const },
            }}
            compact
            className="w-full min-w-0"
          />
          <p className="text-[10px] text-[rgb(var(--app-text-muted))] mt-2 text-center sm:text-left">
            На графике — дни с расходом &gt; 0 ({chart.rows.length} из {data?.length ?? 0} в
            периоде)
          </p>
        </div>
      ) : chart && chart.rows.length > 0 && chart.maxStack === 0 ? (
        <p className="text-sm text-slate-500 py-8 text-center">
          За выбранный период нет записей с калориями.
        </p>
      ) : null}
    </section>
  );
}
