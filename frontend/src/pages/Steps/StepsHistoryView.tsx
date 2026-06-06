import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchStepsHistory, upsertStepsHistory } from "../../api/steps";
import { PlotChart } from "../../components/Plot";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { queryKeys } from "../../hooks/queryKeys";
import { useUnits } from "../../hooks/useUnits";
import { buildStepsRecords } from "../../utils/stepsRecords";
import { convertArrayKmToSol } from "../../utils/units";
import { parseApiError } from "../../utils/validation";
import {
  BODY_WEEKLY_PERIOD_OPTIONS,
  type BodyWeeklyPeriod,
  periodToDateRange,
} from "../../utils/weeklyAggregation";
import { DataTable } from "../../components/ui/data-table";
import {
  StepsMonthFormModal,
  formatStepsMonthLabel,
  getPreviousMonthFirstDay,
} from "./StepsMonthFormModal";
import "../Body/body-layout.css";

const MONTH_NAMES_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
];

function formatMonthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  return `${MONTH_NAMES_SHORT[mi] ?? m} ${y}`;
}

function formatSteps(n: number): string {
  return n.toLocaleString("ru-RU");
}

export function StepsHistoryView({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { formatDistance, formatSmallLength, system } = useUnits();
  const [period, setPeriod] = useState<BodyWeeklyPeriod>("all");
  const [showMonthForm, setShowMonthForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const previousMonthDate = useMemo(() => getPreviousMonthFirstDay(), []);

  const range = useMemo(() => periodToDateRange(period), [period]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.stepsHistory(range.date_from, range.date_to),
    queryFn: () =>
      fetchStepsHistory({ date_from: range.date_from, date_to: range.date_to }),
  });

  const { data: allMonthsData } = useQuery({
    queryKey: queryKeys.stepsHistory(),
    queryFn: () => fetchStepsHistory(),
  });

  const previousMonthRow = useMemo(
    () => allMonthsData?.items.find((r) => r.date.slice(0, 10) === previousMonthDate) ?? null,
    [allMonthsData?.items, previousMonthDate],
  );

  const saveMonthMut = useMutation({
    mutationFn: upsertStepsHistory,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["steps", "history"] });
      setShowMonthForm(false);
      setFormError(null);
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  const items = data?.items ?? [];
  const yearly = useMemo(
    () => [...(data?.yearly ?? [])].sort((a, b) => b.year - a.year),
    [data?.yearly],
  );

  const records = useMemo(
    () => buildStepsRecords(items, yearly, formatDistance),
    [items, yearly, formatDistance],
  );

  const chart = useMemo(() => {
    const labels = items.map((r) => formatMonthLabel(r.date));
    const steps = items.map((r) => r.steps);
    const km = items.map((r) => r.distance_km ?? null);
    const distanceLabels = km.map((v) => (v != null ? formatDistance(v) : "—"));
    const distanceY =
      system === "american" ? convertArrayKmToSol(km) : km;
    return { labels, steps, distanceY, distanceLabels };
  }, [items, formatDistance, system]);

  const distanceAxisTitle = system === "american" ? "SoL" : "км";

  const latest = data?.summary?.latest;

  const chartAxis = {
    tickangle: -35,
    tickfont: { size: 11 },
  };

  return (
    <div className="space-y-6 text-[rgb(var(--app-text))]">
      <div className="flex flex-wrap justify-end gap-3">
        <button
          type="button"
          className="btn-primary shrink-0 sm:w-auto"
          onClick={() => {
            setFormError(null);
            setShowMonthForm(true);
          }}
        >
          + {previousMonthRow ? "Обновить" : "Добавить"} за {formatStepsMonthLabel(previousMonthDate)}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {BODY_WEEKLY_PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => setPeriod(opt.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              period === opt.id
                ? "bg-brand-600 text-white"
                : "bg-[rgb(var(--app-subtab-track))] text-[rgb(var(--app-text))] hover:bg-[rgb(var(--app-subtab-hover))]"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {isLoading && <Loader label="Загрузка истории шагов…" />}
      {isError && <ErrorAlert message={parseApiError(error)} />}

      <div className="body-steps-layout">
        <div className="space-y-6">
      {!isLoading && !isError && latest && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card-metric">
            <p className="text-xs text-slate-500 dark:text-slate-400">Последний месяц</p>
            <p className="text-xl font-semibold">{formatMonthLabel(latest.date)}</p>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
              {formatSteps(latest.steps)} шагов
            </p>
          </div>
          {latest.distance_km != null && (
            <div className="card-metric">
              <p className="text-xs text-slate-500 dark:text-slate-400">Дистанция</p>
              <p className="text-xl font-semibold tabular-nums">
                {formatDistance(latest.distance_km)}
              </p>
              {latest.step_length_m != null && latest.step_length_m > 0 && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Длина шага: {formatSmallLength(latest.step_length_m * 100)}
                </p>
              )}
            </div>
          )}
          {data?.summary?.total_steps_all != null && (
            <div className="card-metric">
              <p className="text-xs text-slate-500 dark:text-slate-400">Всего за период</p>
              <p className="text-xl font-semibold">{formatSteps(data.summary.total_steps_all)}</p>
            </div>
          )}
        </div>
      )}

      {!isLoading && !isError && chart.labels.length > 0 && (
        <div className="card-panel desktop-chart-panel">
          <PlotChart
            data={[
              {
                x: chart.labels,
                y: chart.steps,
                type: "bar",
                name: "Шаги",
                marker: { color: "#6366f1" },
              },
              ...(chart.distanceY.some((v) => v != null)
                ? [
                    {
                      x: chart.labels,
                      y: chart.distanceY,
                      type: "scatter" as const,
                      mode: "lines+markers" as const,
                      name: `Дистанция, ${distanceAxisTitle}`,
                      yaxis: "y2" as const,
                      customdata: chart.distanceLabels,
                      hovertemplate: "%{x}<br>Дистанция: %{customdata}<extra></extra>",
                      line: { color: "#06B6D4", width: 2 },
                      marker: { size: 5 },
                    },
                  ]
                : []),
            ]}
            layout={{
              xaxis: chartAxis,
              yaxis: { title: { text: "Шаги" } },
              yaxis2: chart.distanceY.some((v) => v != null)
                ? {
                    title: { text: distanceAxisTitle },
                    overlaying: "y",
                    side: "right",
                  }
                : undefined,
              legend: { orientation: "h", y: 1.12 },
              margin: { t: 40 },
            }}
            compact
          />
        </div>
      )}

      {!isLoading && !isError && records.byYear.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-medium text-sm">По годам</h3>
          <DataTable>
            <thead>
              <tr>
                <th>Год</th>
                <th className="text-right">Шаги</th>
                <th className="text-right">Месяцев</th>
                <th>Лучший месяц</th>
              </tr>
            </thead>
            <tbody>
              {records.byYear.map((y) => (
                <tr key={y.year}>
                  <td className="font-medium">{y.year}</td>
                  <td className="text-right tabular-nums">{formatSteps(y.total_steps)}</td>
                  <td className="text-right">{y.months_count}</td>
                  <td>
                    {y.best_month_label} ({formatSteps(y.best_month_steps)})
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </div>
      )}

      {!isLoading && !isError && items.length === 0 && (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Нет данных за выбранный период.
        </p>
      )}
        </div>

        <div className="space-y-4">
      {!isLoading && !isError && records.global.length > 0 && (
        <div className="card-panel space-y-4">
          <h3 className="font-medium text-sm">Рекорды</h3>
          <ul className="grid sm:grid-cols-2 wide:grid-cols-1 gap-3">
            {records.global.map((row) => (
              <li
                key={row.label}
                className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2"
              >
                <p className="text-xs text-slate-500 dark:text-slate-400">{row.label}</p>
                <p className="font-semibold text-slate-800 dark:text-slate-100">{row.value}</p>
                <p className="text-xs text-slate-500 mt-0.5">{row.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
        </div>
      </div>

      <StepsMonthFormModal
        open={showMonthForm}
        monthDate={previousMonthDate}
        initial={previousMonthRow}
        formError={formError}
        isPending={saveMonthMut.isPending}
        onClose={() => {
          setShowMonthForm(false);
          setFormError(null);
        }}
        onSubmit={(payload) => saveMonthMut.mutate(payload)}
      />
    </div>
  );
}
