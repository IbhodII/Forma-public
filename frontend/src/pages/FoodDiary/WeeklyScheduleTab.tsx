import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { foodApi, type FoodPhase, type WeeklyScheduleItem } from "../../api/food";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import { weekStartForDate } from "../../shared/utils/weekCalendar";
import { parseApiError } from "../../utils/validation";

const WEEKDAY_LABELS = [
  "Понедельник",
  "Вторник",
  "Среда",
  "Четверг",
  "Пятница",
  "Суббота",
  "Воскресенье",
] as const;

type DayDraft = { day_of_week: number; meal_plan_id: number | "" };

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function mondayBasedDow(iso: string): number {
  const js = new Date(`${iso}T12:00:00`).getDay();
  return js === 0 ? 6 : js - 1;
}

function dateForScheduleDow(weekAnchor: string, dow: number): string {
  const start = new Date(`${weekAnchor}T12:00:00`);
  for (let i = 0; i < 7; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = d.toISOString().slice(0, 10);
    if (mondayBasedDow(iso) === dow) return iso;
  }
  const fallback = new Date(`${weekAnchor}T12:00:00`);
  fallback.setDate(fallback.getDate() + dow);
  return fallback.toISOString().slice(0, 10);
}

function draftFromSchedule(items: WeeklyScheduleItem[]): DayDraft[] {
  return WEEKDAY_LABELS.map((_, dow) => {
    const row = items.find((d) => d.day_of_week === dow);
    return { day_of_week: dow, meal_plan_id: row?.meal_plan_id ?? "" };
  });
}

export function WeeklyScheduleTab() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const weekStartDay = useWeekStartDay();
  const [draft, setDraft] = useState<DayDraft[] | null>(null);
  const [weekStart, setWeekStart] = useState(() => weekStartForDate(todayIso(), weekStartDay));
  const [applyConfirm, setApplyConfirm] = useState(false);

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
      const rows = draft ?? [];
      let total = 0;
      const errors: string[] = [];
      let appliedDays = 0;

      for (const row of rows) {
        if (row.meal_plan_id === "") continue;
        const plan = plans.find((p) => p.id === row.meal_plan_id);
        if (!plan) continue;
        const targetDate = dateForScheduleDow(weekStart, row.day_of_week);
        try {
          const res = await foodApi.applyMealPlan({
            plan_id: Number(row.meal_plan_id),
            date: targetDate,
            phase: plan.phase as FoodPhase,
            apply_week: false,
            replace_existing: true,
          });
          total += res.total_added;
          appliedDays += 1;
        } catch (e) {
          errors.push(`${WEEKDAY_LABELS[row.day_of_week]}: ${parseApiError(e)}`);
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
  const weekEnd = dateForScheduleDow(weekStart, 6);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[rgb(var(--app-text-muted))]">
        Назначьте рацион на каждый день недели (пн–вс). Применение заполнит дневник с{" "}
        <span className="tabular-nums font-medium text-[rgb(var(--app-text))]">{weekStart}</span> по{" "}
        <span className="tabular-nums font-medium text-[rgb(var(--app-text))]">{weekEnd}</span>.
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
        {rows.map((row) => (
          <div key={row.day_of_week} className="flex flex-wrap items-center gap-2">
            <span className="text-sm w-28 shrink-0">{WEEKDAY_LABELS[row.day_of_week]}</span>
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
        ))}
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
          disabled={applyMut.isPending}
          onClick={() => setApplyConfirm(true)}
        >
          Применить на неделю
        </button>
      </div>

      <ConfirmModal
        open={applyConfirm}
        title="Применить расписание?"
        message="Заменить записи в дневнике за выбранную неделю по расписанию?"
        confirmLabel="Применить"
        loading={applyMut.isPending}
        onCancel={() => setApplyConfirm(false)}
        onConfirm={() => applyMut.mutate()}
      />
    </div>
  );
}
