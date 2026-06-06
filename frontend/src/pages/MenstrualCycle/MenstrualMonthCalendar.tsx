import { useMemo } from "react";
import {
  CYCLE_PHASE_CELL_CLASS,
  CYCLE_PHASE_LEGEND,
  type CyclePhase,
} from "../../shared/menstrualCyclePhases";
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

export function menstrualDateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function menstrualMonthRange(year: number, month: number): { from: string; to: string } {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: menstrualDateKey(year, month, 1),
    to: menstrualDateKey(year, month, lastDay),
  };
}

type MenstrualMonthCalendarProps = {
  year: number;
  month: number;
  weekStartDay: number;
  phaseByDate: Map<string, CyclePhase>;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: string) => void;
};

export function MenstrualMonthCalendar({
  year,
  month,
  weekStartDay,
  phaseByDate,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: MenstrualMonthCalendarProps) {
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
      result.push({ day, date: menstrualDateKey(year, month, day) });
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month, weekStartDay]);

  const todayKey = useMemo(() => {
    const t = new Date();
    return menstrualDateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  return (
    <div className="card-panel space-y-4 min-w-0 overflow-hidden">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="min-h-11 min-w-11 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
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
          className="min-h-11 min-w-11 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800"
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

      <div className="grid grid-cols-7 gap-x-1 gap-y-2">
        {cells.map((cell, idx) => {
          if (!cell) {
            return <div key={`empty-${idx}`} aria-hidden />;
          }
          const phase = phaseByDate.get(cell.date);
          const isToday = cell.date === todayKey;
          const cellClass = phase
            ? CYCLE_PHASE_CELL_CLASS[phase]
            : "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
          return (
            <button
              key={cell.date}
              type="button"
              className="flex items-center justify-center py-0.5 rounded-lg hover:opacity-90 transition-opacity min-h-11"
              onClick={() => onSelectDate(cell.date)}
              title={phase ? undefined : "Нет данных о фазе — задайте дату в настройках"}
            >
              <span
                className={[
                  "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold tabular-nums",
                  cellClass,
                  isToday ? "ring-2 ring-slate-800/30 dark:ring-white/40 ring-offset-1" : "",
                ].join(" ")}
              >
                {cell.day}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-600 dark:text-slate-400 pt-1">
        {CYCLE_PHASE_LEGEND.map((item) => (
          <span key={item.phase} className="inline-flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${item.className}`} />
            {item.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-3 rounded-full bg-slate-200 dark:bg-slate-700" />
          Нет фазы
        </span>
      </div>
      <p className="text-xs text-slate-500">Нажмите на день, чтобы добавить симптомы или изменить фазу.</p>
    </div>
  );
}
