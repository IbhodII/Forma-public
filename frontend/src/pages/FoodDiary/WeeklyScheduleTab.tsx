import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { foodApi, type FoodPhase, type WeeklyScheduleItem } from "../../api/food";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import { weekDatesFromAnchor, weekStartForDate } from "../../shared/utils/weekCalendar";
import { formatDateRu, todayIso } from "../../utils/format";
import { parseApiError } from "../../utils/validation";
import {
  mealPlanApplyRange,
  pythonWeekday,
  weekdayLabel,
  weekdayOrderFromStart,
} from "./mealPlanApplyUtils";

type DayDraft = { day_of_week: number; meal_plan_id: number | "" };

function draftFromSchedule(items: WeeklyScheduleItem[]): DayDraft[] {
  return Array.from({ length: 7 }, (_, dow) => {
    const row = items.find((d) => d.day_of_week === dow);
    return { day_of_week: dow, meal_plan_id: row?.meal_plan_id ?? "" };
  });
}

function dateForScheduleDow(weekAnchor: string, targetDow: number, weekStartDay: number): string {
  const dates = weekDatesFromAnchor(weekAnchor, weekStartDay);
  for (const iso of dates) {
    if (pythonWeekday(iso) === targetDow) return iso;
  }
  return dates[0] ?? weekAnchor;
}

export function WeeklyScheduleTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const weekStartDay = useWeekStartDay();
  const [draft, setDraft] = useState<DayDraft[] | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartForDate(todayIso(), weekStartDay));
  const [applyConfirm, setApplyConfirm] = useState(false);
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    setWeekStart(weekStartForDate(todayIso(), weekStartDay));
  }, [weekStartDay]);

  const { data: plans = [], isLoading: plansLoading, isError: plansError, error: plansLoadError } = useQuery({
    queryKey: queryKeys.foodMealPlansAll,
    queryFn: () => foodApi.getMealPlans(),
  });

  const {
    data: schedule = [],
    isLoading: scheduleLoading,
    isError,
    error,
  } = useQuery({
    queryKey: queryKeys.foodWeeklySchedule,
    queryFn: () => foodApi.getWeeklySchedule(),
  });

  useEffect(() => {
    if (schedule.length > 0 && draft === null) {
      setDraft(draftFromSchedule(schedule));
    }
  }, [schedule, draft]);

  const plansByPhase = useMemo(() => {
    const cut = plans.filter((p) => p.phase === "cut");
    const bulk = plans.filter((p) => p.phase === "bulk");
    return { cut, bulk };
  }, [plans]);

  const weekRange = useMemo(() => mealPlanApplyRange(weekStart, true), [weekStart]);

  const applyTargets = useMemo(() => {
    const rows = draft ?? draftFromSchedule(schedule);
    const targets: { dow: number; date: string; planId: number; planName: string; phase: FoodPhase }[] =
      [];
    for (const row of rows) {
      if (row.meal_plan_id === "") continue;
      const plan = plans.find((p) => p.id === row.meal_plan_id);
      if (!plan) continue;
      targets.push({
        dow: row.day_of_week,
        date: dateForScheduleDow(weekStart, row.day_of_week, weekStartDay),
        planId: Number(row.meal_plan_id),
        planName: plan.name,
        phase: plan.phase as FoodPhase,
      });
    }
    return targets;
  }, [draft, schedule, plans, weekStart, weekStartDay]);

  const saveMut = useMutation({
    mutationFn: () =>
      foodApi.saveWeeklySchedule({
        days: (draft ?? []).map((d) => ({
          day_of_week: d.day_of_week,
          meal_plan_id: d.meal_plan_id === "" ? null : Number(d.meal_plan_id),
        })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.foodWeeklySchedule });
      showToast("Расписание сохранено", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const applyMut = useMutation({
    mutationFn: async () => {
      let total = 0;
      const errors: string[] = [];
      let appliedDays = 0;

      for (const target of applyTargets) {
        try {
          const res = await foodApi.applyMealPlan({
            plan_id: target.planId,
            date: target.date,
            phase: target.phase,
            apply_week: false,
            replace_existing: replaceExisting,
          });
          total += res.total_added;
          appliedDays += 1;
        } catch (e) {
          errors.push(`${weekdayLabel(target.dow)}: ${parseApiError(e)}`);
        }
      }

      if (errors.length > 0 && appliedDays === 0) {
        throw new Error(errors.join("\n"));
      }
      return { total, errors };
    },
    onSuccess: ({ total, errors }) => {
      void qc.invalidateQueries({ queryKey: ["food", "day"] });
      void qc.invalidateQueries({ queryKey: ["food", "week"] });
      if (errors.length > 0) {
        showToast(`Частично: +${total} поз. Ошибки: ${errors.length}`, "error");
      } else {
        showToast(`Добавлено позиций: ${total}`, "success");
      }
      setApplyConfirm(false);
      setReplaceExisting(false);
    },
    onError: (e) => {
      showToast(parseApiError(e), "error");
      setApplyConfirm(false);
    },
  });

  if (plansLoading || scheduleLoading) {
    return <Loader label="Расписание…" compact />;
  }

  if (plansError) {
    return <ErrorAlert message={parseApiError(plansLoadError)} />;
  }

  if (isError) {
    return <ErrorAlert message={parseApiError(error)} />;
  }

  const rows = draft ?? draftFromSchedule(schedule);
  const orderedDows = weekdayOrderFromStart(weekStartDay);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--app-text-muted))]">
        Назначьте рацион на каждый день недели (от{" "}
        <span className="font-medium text-[rgb(var(--app-text))]">
          {weekdayLabel(weekStartDay).toLowerCase()}
        </span>
        ). Применение заполнит дневник с{" "}
        <span className="tabular-nums font-medium text-[rgb(var(--app-text))]">
          {formatDateRu(weekRange.start)}
        </span>{" "}
        по{" "}
        <span className="tabular-nums font-medium text-[rgb(var(--app-text))]">
          {formatDateRu(weekRange.end)}
        </span>
        .
      </p>

      <label className="text-sm block max-w-xs">
        Начало недели (для применения)
        <input
          type="date"
          className="input-field mt-1 w-full"
          value={weekStart}
          onChange={(e) => setWeekStart(weekStartForDate(e.target.value, weekStartDay))}
        />
      </label>

      <div className="space-y-3">
        {orderedDows.map((dow) => {
          const row = rows.find((r) => r.day_of_week === dow);
          if (!row) return null;
          const targetDate = dateForScheduleDow(weekStart, dow, weekStartDay);
          return (
            <div key={row.day_of_week} className="flex flex-wrap items-center gap-2">
              <span className="text-sm w-32 shrink-0">
                {weekdayLabel(dow)}
                <span className="block text-[10px] text-[rgb(var(--app-text-muted))] tabular-nums">
                  {formatDateRu(targetDate)}
                </span>
              </span>
              <select
                className="input-field flex-1 min-w-[12rem]"
                value={row.meal_plan_id === "" ? "" : String(row.meal_plan_id)}
                onChange={(e) => {
                  const v = e.target.value;
                  setDraft((prev) =>
                    (prev ?? rows).map((d) =>
                      d.day_of_week === row.day_of_week
                        ? { ...d, meal_plan_id: v === "" ? "" : Number(v) }
                        : d,
                    ),
                  );
                }}
              >
                <option value="">— не назначен —</option>
                <optgroup label="Сушка">
                  {plansByPhase.cut.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Набор">
                  {plansByPhase.bulk.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-primary"
          disabled={saveMut.isPending}
          onClick={() => saveMut.mutate()}
        >
          {saveMut.isPending ? "Сохранение…" : "Сохранить расписание"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={applyMut.isPending || applyTargets.length === 0}
          onClick={() => setApplyConfirm(true)}
        >
          Применить на неделю
        </button>
      </div>

      <ConfirmModal
        open={applyConfirm}
        title="Применить расписание?"
        message={
          <div className="space-y-3 text-sm">
            <p>
              Период:{" "}
              <span className="font-medium tabular-nums">
                {formatDateRu(weekRange.start)} — {formatDateRu(weekRange.end)}
              </span>
            </p>
            <ul className="text-xs text-[rgb(var(--app-text-muted))] space-y-1 max-h-40 overflow-y-auto">
              {applyTargets.map((t) => (
                <li key={`${t.dow}-${t.planId}`}>
                  {weekdayLabel(t.dow)} ({formatDateRu(t.date)}): {t.planName}
                </li>
              ))}
            </ul>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                className="mt-1"
                checked={replaceExisting}
                onChange={(e) => setReplaceExisting(e.target.checked)}
              />
              <span>
                Заменить существующие записи в затронутые дни
                <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5">
                  По умолчанию записи из рациона добавляются к уже введённым вручную; дубликаты не
                  создаются.
                </span>
              </span>
            </label>
          </div>
        }
        confirmLabel={replaceExisting ? "Заменить и применить" : "Добавить к дневнику"}
        loading={applyMut.isPending}
        onCancel={() => {
          setApplyConfirm(false);
          setReplaceExisting(false);
        }}
        onConfirm={() => applyMut.mutate()}
      />
    </div>
  );
}
