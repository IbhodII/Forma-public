import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  fetchStrengthHrAnalyticsOverview,
  fetchStrengthHrAnalyticsSession,
} from "../../../api/strength";
import { fetchPresets } from "../../../api/presets";
import { ChartContainer } from "../../../components/analytics/ChartContainer";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { MappingStatusPill } from "../../../components/strength/history/StrengthHrBySetPanel";
import { DataTable, DataTableEmptyRow } from "../../../components/ui/data-table";
import { KpiCard, KpiGrid } from "../../../components/ui/kpi-card";
import { queryKeys } from "../../../hooks/queryKeys";
import type {
  StrengthHrExerciseAggregate,
  StrengthHrSessionSummary,
  StrengthHrTrendPoint,
} from "../../../types";
import { formatDateRu } from "../../../utils/format";
import { parseApiError } from "../../../utils/validation";
import { PeriodTabs } from "./PeriodTabs";
import {
  STANDARD_PERIOD_OPTIONS,
  dateRangeForPeriod,
  type StandardPeriodId,
} from "../utils/analyticsPeriods";
import { StrengthHrAnalysisSummary } from "../../../components/strength/history/StrengthHrBySetPanel";

const MAX_EXERCISE_SUGGESTIONS = 80;

function normalizedIncludes(value: string, query: string): boolean {
  return value.toLowerCase().includes(query.trim().toLowerCase());
}

function sessionWorkoutLink(session: StrengthHrSessionSummary): string {
  const expand = `${session.date}|${session.workout_title}`;
  return `/workouts?tab=${encodeURIComponent(session.workout_title)}&strengthExpand=${encodeURIComponent(expand)}`;
}

function trendChartData(points: StrengthHrTrendPoint[]) {
  return points.map((p) => ({
    label: formatDateRu(p.date),
    avg_peak_hr: p.avg_peak_hr ?? undefined,
    max_hr: p.max_hr ?? undefined,
    avg_recovery_drop: p.avg_recovery_drop ?? undefined,
    block_count: p.block_count,
  }));
}

function trendLabel(value: string | null | undefined): string {
  if (value === "up") return "Рост";
  if (value === "down") return "Снижение";
  if (value === "stable") return "Стабильно";
  return "—";
}

export function StrengthHrAnalyticsSection({
  enabled = true,
  exerciseOptions = [],
}: {
  enabled?: boolean;
  exerciseOptions?: string[];
}) {
  const [period, setPeriod] = useState<StandardPeriodId>("90");
  const [workoutTitle, setWorkoutTitle] = useState("");
  const [exercise, setExercise] = useState("");
  const [verifiedOnly, setVerifiedOnly] = useState(false);
  const [minConfidence, setMinConfidence] = useState<"" | "medium" | "high">("");
  const [selected, setSelected] = useState<StrengthHrSessionSummary | null>(null);

  const range = useMemo(() => dateRangeForPeriod(period), [period]);
  const activePresetsQuery = useQuery({
    queryKey: queryKeys.strengthPresets(true),
    queryFn: () => fetchPresets(true),
    enabled,
    staleTime: 5 * 60_000,
  });
  const activePresetNames = useMemo(
    () =>
      (activePresetsQuery.data ?? [])
        .filter((p) => p.is_active === 1)
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "ru")),
    [activePresetsQuery.data],
  );
  const filteredExerciseOptions = useMemo(() => {
    const q = exercise.trim();
    const source = q ? exerciseOptions.filter((name) => normalizedIncludes(name, q)) : exerciseOptions;
    return source.slice(0, MAX_EXERCISE_SUGGESTIONS);
  }, [exercise, exerciseOptions]);
  const exerciseIsExact = !exercise || exerciseOptions.includes(exercise);
  const filterParams = useMemo(
    () => ({
      date_from: range.from,
      date_to: range.to,
      workout_title: workoutTitle || undefined,
      exercise: exercise && exerciseIsExact ? exercise : undefined,
      verified_only: verifiedOnly,
      min_confidence: minConfidence || undefined,
    }),
    [range.from, range.to, workoutTitle, exercise, exerciseIsExact, verifiedOnly, minConfidence],
  );

  const overviewQuery = useQuery({
    queryKey: queryKeys.strengthHrAnalyticsOverview({ ...filterParams, limit: 200, offset: 0 }),
    queryFn: () => fetchStrengthHrAnalyticsOverview({ ...filterParams, limit: 200, offset: 0 }),
    enabled,
    staleTime: 5 * 60_000,
  });

  const previewQuery = useQuery({
    queryKey: queryKeys.strengthHrAnalyticsSession(
      selected?.date ?? "",
      selected?.workout_title ?? "",
    ),
    queryFn: () =>
      fetchStrengthHrAnalyticsSession(selected!.date, selected!.workout_title),
    enabled: Boolean(selected),
  });

  const sessions = overviewQuery.data?.sessions ?? [];
  const trends = overviewQuery.data?.trends ?? [];
  const exerciseRows = overviewQuery.data?.exercises ?? [];
  const truncated = overviewQuery.data?.truncated ?? false;

  const kpis = useMemo(() => {
    const peaks = sessions.map((s) => s.avg_peak_hr).filter((v): v is number => v != null);
    const recoveries = sessions
      .map((s) => s.avg_recovery_drop)
      .filter((v): v is number => v != null);
    const verifiedCount = sessions.filter((s) => s.mapping_status === "verified").length;
    const lowConf = sessions.filter((s) => s.confidence === "low").length;
    const topExercise = [...exerciseRows].sort(
      (a, b) => (b.avg_peak_hr ?? 0) - (a.avg_peak_hr ?? 0),
    )[0];
    return {
      avgPeak: peaks.length ? Math.round(peaks.reduce((a, b) => a + b, 0) / peaks.length) : null,
      avgRecovery: recoveries.length
        ? Math.round(recoveries.reduce((a, b) => a + b, 0) / recoveries.length)
        : null,
      verifiedCount,
      lowConf,
      topExercise: topExercise?.exercise ?? "—",
      topExerciseHr: topExercise?.avg_peak_hr ?? null,
    };
  }, [sessions, exerciseRows]);

  const chartData = useMemo(() => trendChartData(trends), [trends]);
  const loading = overviewQuery.isLoading;
  const hasActiveFilters = Boolean(workoutTitle || (exercise && exerciseIsExact) || verifiedOnly || minConfidence);
  const isEmpty = !loading && !overviewQuery.isError && !sessions.length && !exerciseRows.length && !trends.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface))] p-3">
        <PeriodTabs
          value={period}
          options={STANDARD_PERIOD_OPTIONS}
          onChange={setPeriod}
          variant="segmented"
        />
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-[rgb(var(--app-text-muted))]">Тип тренировки</span>
          {activePresetNames.length ? (
            <select
              className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-sm min-w-[10rem]"
              value={workoutTitle}
              onChange={(e) => setWorkoutTitle(e.target.value)}
            >
              <option value="">Все</option>
              {activePresetNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-sm min-w-[8rem]"
              value={workoutTitle}
              onChange={(e) => setWorkoutTitle(e.target.value)}
              placeholder={activePresetsQuery.isLoading ? "Загрузка…" : "Все"}
            />
          )}
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-[rgb(var(--app-text-muted))]">Упражнение</span>
          <input
            className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-sm min-w-[10rem]"
            value={exercise}
            onChange={(e) => setExercise(e.target.value)}
            placeholder="Все"
            list="strength-hr-exercise-options"
            autoComplete="off"
          />
          <datalist id="strength-hr-exercise-options">
            {filteredExerciseOptions.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label className="flex flex-col gap-0.5 text-xs">
          <span className="text-[rgb(var(--app-text-muted))]">Мин. точность</span>
          <select
            className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-sm"
            value={minConfidence}
            onChange={(e) => setMinConfidence(e.target.value as "" | "medium" | "high")}
          >
            <option value="">Любая</option>
            <option value="medium">Средняя+</option>
            <option value="high">Высокая</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs pb-1">
          <input
            type="checkbox"
            checked={verifiedOnly}
            onChange={(e) => setVerifiedOnly(e.target.checked)}
          />
          Только проверенные
        </label>
      </div>

      {loading ? <Loader label="Аналитика пульса…" /> : null}
      {overviewQuery.isError ? <ErrorAlert message={parseApiError(overviewQuery.error)} /> : null}
      {exercise && !exerciseIsExact ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Начните вводить название и выберите упражнение из списка, чтобы применить фильтр.
        </p>
      ) : null}
      {truncated ? (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Показаны последние 100 сессий с пульсом — полный список обрезан для скорости.
        </p>
      ) : null}
      {isEmpty ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))] rounded-xl border border-dashed border-[rgb(var(--app-border))] px-4 py-6 text-center">
          {hasActiveFilters
            ? "По выбранному упражнению, типу тренировки или периоду нет данных пульса."
            : "Пока нет силовых тренировок с данными пульса."}
        </p>
      ) : null}

      {!loading && !overviewQuery.isError ? (
        <>
          <KpiGrid>
            <KpiCard
              label="Средний пиковый пульс"
              value={kpis.avgPeak != null ? `${kpis.avgPeak}` : "—"}
              sub="по сессиям с пульсом"
            />
            <KpiCard
              label="Среднее восстановление"
              value={kpis.avgRecovery != null ? `−${kpis.avgRecovery}` : "—"}
              sub="падение, уд/мин"
            />
            <KpiCard
              label="Упражнение с макс. пульсом"
              value={kpis.topExerciseHr != null ? `${kpis.topExerciseHr}` : "—"}
              sub={kpis.topExercise}
            />
            <KpiCard label="Проверенных сессий" value={kpis.verifiedCount} />
            <KpiCard label="Низкая точность" value={kpis.lowConf} />
            <KpiCard label="Сессий с пульсом" value={sessions.length} />
          </KpiGrid>

          <ChartContainer title="Тренды пульса в силовых" height="lg">
            {chartData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.35} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="hr" tick={{ fontSize: 11 }} />
                  <YAxis yAxisId="rec" orientation="right" tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend />
                  <Line
                    yAxisId="hr"
                    type="monotone"
                    dataKey="avg_peak_hr"
                    name="Средний пик"
                    stroke="#6366f1"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    yAxisId="hr"
                    type="monotone"
                    dataKey="max_hr"
                    name="Макс. пульс"
                    stroke="#ef4444"
                    dot={false}
                    strokeWidth={1.5}
                  />
                  <Line
                    yAxisId="rec"
                    type="monotone"
                    dataKey="avg_recovery_drop"
                    name="Восстановление"
                    stroke="#10b981"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-[rgb(var(--app-text-muted))] py-8 text-center">
                Нет сессий с пульсом за период
              </p>
            )}
          </ChartContainer>

          <div className="strength-hr-analytics__tables grid gap-4">
            <div className="space-y-2">
              <p className="analytics-label">Упражнения</p>
              <DataTable density="compact">
                <thead>
                  <tr>
                    <th>Упр.</th>
                    <th>Сессии</th>
                    <th>Средний пик</th>
                    <th>Восст.</th>
                    <th>Тренд</th>
                  </tr>
                </thead>
                <tbody>
                  {exerciseRows.length ? (
                    exerciseRows.map((row: StrengthHrExerciseAggregate) => (
                      <tr key={row.exercise}>
                        <td className="max-w-[8rem] truncate" title={row.exercise}>
                          {row.exercise}
                        </td>
                        <td className="tabular-nums">{row.sessions_count}</td>
                        <td className="tabular-nums">{row.avg_peak_hr ?? "—"}</td>
                        <td className="tabular-nums">
                          {row.avg_recovery_drop != null ? `−${row.avg_recovery_drop}` : "—"}
                        </td>
                        <td>{trendLabel(row.trend_direction)}</td>
                      </tr>
                    ))
                  ) : (
                    <DataTableEmptyRow colSpan={5} title="Нет данных" />
                  )}
                </tbody>
              </DataTable>
            </div>

            <div className="space-y-2">
              <p className="analytics-label">Сессии</p>
              <DataTable density="compact">
                <thead>
                  <tr>
                    <th>Дата</th>
                    <th>Тип</th>
                    <th>Блоки</th>
                    <th>Пик</th>
                    <th>Статус</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {sessions.length ? (
                    sessions.map((s) => (
                      <tr
                        key={`${s.date}|${s.workout_title}`}
                        className={selected?.date === s.date && selected.workout_title === s.workout_title ? "bg-[rgb(var(--app-accent)/0.06)]" : undefined}
                      >
                        <td className="whitespace-nowrap">{formatDateRu(s.date)}</td>
                        <td className="max-w-[7rem] truncate" title={s.workout_title}>
                          {s.workout_title}
                        </td>
                        <td className="tabular-nums">{s.detected_blocks_count}</td>
                        <td className="tabular-nums">{s.avg_peak_hr ?? "—"}</td>
                        <td>
                          <MappingStatusPill mappingStatus={s.mapping_status} />
                        </td>
                        <td className="text-right whitespace-nowrap">
                          <button
                            type="button"
                            className="text-[11px] font-medium text-[rgb(var(--app-accent))] hover:underline mr-2"
                            onClick={() => setSelected(s)}
                          >
                            Просмотр
                          </button>
                          <Link
                            to={sessionWorkoutLink(s)}
                            className="text-[11px] font-medium text-[rgb(var(--app-accent))] hover:underline"
                          >
                            Открыть
                          </Link>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <DataTableEmptyRow colSpan={6} title="Нет сессий с пульсом" />
                  )}
                </tbody>
              </DataTable>
            </div>
          </div>

          {selected ? (
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] bg-[rgb(var(--app-surface))] p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">
                  {formatDateRu(selected.date)} · {selected.workout_title}
                </p>
                <Link
                  to={sessionWorkoutLink(selected)}
                  className="ml-auto text-xs font-medium text-[rgb(var(--app-accent))] hover:underline"
                >
                  Открыть в тренировках
                </Link>
              </div>
              {previewQuery.isLoading ? <Loader label="Сессия…" compact /> : null}
              {previewQuery.isError ? (
                <ErrorAlert message={parseApiError(previewQuery.error)} />
              ) : null}
              {previewQuery.data?.analysis ? (
                <StrengthHrAnalysisSummary
                  data={previewQuery.data.analysis}
                  manualMapping={false}
                  onToggleMapping={() => {}}
                />
              ) : null}
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
