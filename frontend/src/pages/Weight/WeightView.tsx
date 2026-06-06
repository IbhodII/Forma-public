import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { fetchWeightDashboard, saveDailyWeight, type WeightDashboard } from "../../api/weight";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import type { BodyMetricRow } from "../../types";
import { useUnits } from "../../hooks/useUnits";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import { buildWeightCardStats, buildWeightWeeks } from "../../utils/weightWeekly";
import {
  BODY_WEEKLY_PERIOD_OPTIONS,
  downloadCsv,
  type BodyWeeklyPeriod,
  weeklyToCsv,
  type WeeklyAggregate,
} from "../../utils/weeklyAggregation";
import { parseApiError } from "../../utils/validation";
import { WeekDetailModal } from "./components/WeekDetailModal";
import { WeeklyChart } from "./components/WeeklyChart";
import { WeeklyMetricsCards } from "./components/WeeklyMetricsCards";
import { WeeklyTable } from "./components/WeeklyTable";
import { WeightEntryForm } from "./components/WeightEntryForm";
import "../Body/body-layout.css";

/**
 * Вкладка «Вес»: недельная аналитика, график, ввод записей.
 */
export function WeightView({ embedded: _embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const { formatBodyWeight, formatBarbellWeight } = useUnits();
  const qc = useQueryClient();
  const [period, setPeriod] = useState<BodyWeeklyPeriod>("365d");
  const [selectedWeek, setSelectedWeek] = useState<WeeklyAggregate | null>(null);
  const [modalEditRow, setModalEditRow] = useState<BodyMetricRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.weight,
    queryFn: fetchWeightDashboard,
  });

  const saveMut = useMutation({
    mutationFn: saveDailyWeight,
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: queryKeys.weight });
      const previous = qc.getQueryData<WeightDashboard>(queryKeys.weight);
      if (previous) {
        const d = payload.date.slice(0, 10);
        const exists = previous.items.some((i) => i.date.slice(0, 10) === d);
        const items = exists
          ? previous.items.map((i) =>
              i.date.slice(0, 10) === d
                ? {
                    date: d,
                    weight_kg: payload.weight_kg,
                    body_fat_percent: payload.only_weight
                      ? i.body_fat_percent
                      : payload.body_fat_percent ?? null,
                  }
                : i,
            )
          : [
              {
                date: d,
                weight_kg: payload.weight_kg,
                body_fat_percent: payload.body_fat_percent ?? null,
              },
              ...previous.items,
            ];
        qc.setQueryData<WeightDashboard>(queryKeys.weight, { ...previous, items });
      }
      return { previous };
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: queryKeys.weight });
      await qc.refetchQueries({ queryKey: queryKeys.weight });
      void qc.invalidateQueries({ queryKey: ["body"] });
      showToast("Вес сохранён", "success");
      setModalEditRow(null);
      setFormError(null);
    },
    onError: (e, _payload, context) => {
      if (context?.previous) {
        qc.setQueryData(queryKeys.weight, context.previous);
      }
      const msg = parseApiError(e);
      setFormError(msg);
      showToast(msg, "error");
    },
  });

  const weekStartDay = useWeekStartDay();

  const weeks = useMemo(
    () => buildWeightWeeks(data, period, weekStartDay),
    [data, period, weekStartDay],
  );
  const cardStats = useMemo(
    () => buildWeightCardStats(data, weeks, weekStartDay),
    [data, weeks, weekStartDay],
  );

  const weekForModal = useMemo(() => {
    if (!selectedWeek) return null;
    return weeks.find((w) => w.weekStart === selectedWeek.weekStart) ?? selectedWeek;
  }, [selectedWeek, weeks]);

  const lookupRowForDate = useMemo(() => {
    if (!data?.items?.length) return undefined;
    const byDate = new Map(
      data.items.map((i) => [String(i.date).slice(0, 10), i] as const),
    );
    return (dateIso: string) => byDate.get(dateIso.slice(0, 10));
  }, [data?.items]);

  const fullSave = (payload: Parameters<typeof saveDailyWeight>[0]) => {
    saveMut.mutate(payload);
  };

  const closeWeekModal = () => {
    setSelectedWeek(null);
    setModalEditRow(null);
    setFormError(null);
  };

  const exportCsv = () => {
    if (!weeks.length) {
      showToast("Нет данных для экспорта", "error");
      return;
    }
    downloadCsv(`weight-weekly-${period}.csv`, weeklyToCsv(weeks));
    showToast("CSV скачан", "success");
  };

  return (
    <div className="body-weight-layout space-y-6">
      <div className="flex flex-wrap items-center gap-3 justify-between">
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
        <button type="button" className="btn-secondary text-sm" onClick={exportCsv} disabled={!weeks.length}>
          Экспорт CSV
        </button>
      </div>

      {isLoading && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}

      {data && !isLoading && (
        <>
          <WeeklyMetricsCards
            stats={cardStats}
            thirdMetricTitle="Сухая масса"
            thirdMetricHint="Средняя «сухая» масса за неделю (вес минус жир)"
            formatBodyWeight={formatBodyWeight}
            formatBarbellWeight={formatBarbellWeight}
          />

          <div className="body-weight-layout__primary">
            <div className="body-weight-layout__chart-panel card-panel desktop-chart-panel">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-3">Динамика по неделям</h3>
              <WeeklyChart weeks={weeks} formatBodyWeight={formatBodyWeight} />
            </div>

            <div className="body-weight-layout__entry-panel desktop-form-max">
              <WeightEntryForm
                onSave={fullSave}
                isPending={saveMut.isPending}
                formError={formError}
                lookupRowForDate={lookupRowForDate}
              />
            </div>

            <div className="body-weight-layout__table-panel card-panel min-w-0">
              <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-3">По неделям</h3>
              <WeeklyTable
                weeks={weeks}
                onSelectWeek={setSelectedWeek}
                muscleColumnLabel="Сухая масса"
                formatBodyWeight={formatBodyWeight}
                formatBarbellWeight={formatBarbellWeight}
              />
            </div>
          </div>
        </>
      )}

      {weekForModal && (
        <WeekDetailModal
          week={weekForModal}
          editingRow={modalEditRow}
          onClose={closeWeekModal}
          onStartEdit={(row) => {
            setModalEditRow(row);
            setFormError(null);
          }}
          onCancelEdit={() => {
            setModalEditRow(null);
            setFormError(null);
          }}
          onSave={fullSave}
          isPending={saveMut.isPending}
          formError={formError}
        />
      )}
    </div>
  );
}
