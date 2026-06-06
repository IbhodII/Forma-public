import { useMemo } from "react";
import {
  monthGridLeadingPadding,
  weekdayLabelsFromStart,
} from "../../shared/utils/weekCalendar";

const MONTHS_RU = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

export function formatMonthKey(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}`;
}

export function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function monthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: dateKey(year, month, 1),
    to: dateKey(year, month, lastDay),
  };
}

type StretchingMonthCalendarProps = {
  year: number;
  month: number;
  weekStartDay: number;
  datesWithWorkouts: Set<string>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: string) => void;
};

export function StretchingMonthCalendar({
  year,
  month,
  weekStartDay,
  datesWithWorkouts,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: StretchingMonthCalendarProps) {
  const weekdayLabels = useMemo(
    () => weekdayLabelsFromStart(weekStartDay),
    [weekStartDay],
  );

  const cells = useMemo(() => {
    const firstWeekday = monthGridLeadingPadding(year, month, weekStartDay);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < firstWeekday; i += 1) result.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      result.push({ day, date: dateKey(year, month, day) });
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month, weekStartDay]);

  const todayKey = useMemo(() => {
    const t = new Date();
    return dateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  return (
    <div className="stretch-wellness__glass rounded-2xl p-5 sm:p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={onPrevMonth}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
          {MONTHS_RU[month]} {year}
        </h3>
        <button
          type="button"
          className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
          onClick={onNextMonth}
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-slate-500">
        {weekdayLabels.map((wd) => (
          <div key={wd} className="py-1">
            {wd}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-x-1 gap-y-3">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} aria-hidden />;
          }
          const hasWorkout = datesWithWorkouts.has(cell.date);
          const isToday = cell.date === todayKey;
          return (
            <button
              key={cell.date}
              type="button"
              className="flex items-center justify-center py-1 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              onClick={() => onSelectDate(cell.date)}
            >
              <span
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums transition-colors",
                  hasWorkout
                    ? "bg-gradient-to-br from-teal-500 to-emerald-500 text-white shadow-md shadow-teal-500/25"
                    : "bg-slate-200/80 text-slate-600 dark:bg-slate-700/80 dark:text-slate-300",
                  isToday && !hasWorkout ? "ring-2 ring-teal-400/60 ring-offset-2" : "",
                  isToday && hasWorkout ? "ring-2 ring-teal-300/80 ring-offset-2" : "",
                ].join(" ")}
              >
                {cell.day}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-4 text-xs text-slate-500 pt-1">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-teal-500" />
          Была растяжка
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-200 dark:bg-slate-700" />
          Не было
        </span>
      </div>
    </div>
  );
}
