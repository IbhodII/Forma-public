import { PeriodTabs } from "../pages/Analytics/components/PeriodTabs";
import {
  WORKOUT_PERIOD_OPTIONS,
  workoutPeriodDisplayLabel,
  type WorkoutPeriod,
} from "../utils/workoutPeriod";

interface WorkoutPeriodFilterProps {
  period: WorkoutPeriod;
  onPeriodChange: (period: WorkoutPeriod) => void;
  dateFrom: string;
  dateTo: string;
}

const PERIOD_TAB_OPTIONS = WORKOUT_PERIOD_OPTIONS.map((o) => ({
  id: o.value,
  label:
    o.value === "30d"
      ? "30 д"
      : o.value === "3m"
        ? "3 мес"
        : o.value === "6m"
          ? "6 мес"
          : o.value === "12m"
            ? "1 год"
            : "Всё",
}));

export function WorkoutPeriodFilter({
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
}: WorkoutPeriodFilterProps) {
  const displayLabel = workoutPeriodDisplayLabel(period, dateFrom, dateTo);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[rgb(var(--app-border)/0.85)] bg-[rgb(var(--app-surface-subtle)/0.45)] px-4 py-4 shadow-[var(--app-shadow-sm)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">{displayLabel}</p>
      </div>
      <PeriodTabs
        value={period}
        options={PERIOD_TAB_OPTIONS}
        onChange={onPeriodChange}
        variant="segmented"
      />
      {period === "all" ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Все тренировки в базе</p>
      ) : (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          Период задаётся пресетом. Для произвольного диапазона используйте аналитику.
        </p>
      )}
    </div>
  );
}
