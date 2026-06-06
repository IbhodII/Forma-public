import { useMemo } from "react";
import type { MenstrualCycleLogEntry } from "../../../api/menstrualCycle";
import type { CyclePhase } from "../../../shared/menstrualCyclePhases";
import {
  monthGridLeadingPadding,
  weekdayLabelsFromStart,
} from "../../../shared/utils/weekCalendar";
import { menstrualDateKey } from "../MenstrualMonthCalendar";
import { CYCLE_WELLNESS_PHASE, PHASE_ORDER } from "../cycleWellnessTheme";

const MONTHS_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

type Props = {
  year: number;
  month: number;
  weekStartDay: number;
  phaseByDate: Map<string, CyclePhase>;
  logByDate: Map<string, MenstrualCycleLogEntry>;
  selectedDate: string | null;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onSelectDate: (date: string) => void;
};

export function ElegantCalendar({
  year,
  month,
  weekStartDay,
  phaseByDate,
  logByDate,
  selectedDate,
  onPrevMonth,
  onNextMonth,
  onSelectDate,
}: Props) {
  const weekdayLabels = useMemo(
    () => weekdayLabelsFromStart(weekStartDay),
    [weekStartDay],
  );

  const cells = useMemo(() => {
    const pad = monthGridLeadingPadding(year, month, weekStartDay);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const result: Array<{ day: number; date: string } | null> = [];
    for (let i = 0; i < pad; i += 1) result.push(null);
    for (let d = 1; d <= daysInMonth; d += 1) {
      result.push({ day: d, date: menstrualDateKey(year, month, d) });
    }
    while (result.length % 7 !== 0) result.push(null);
    return result;
  }, [year, month, weekStartDay]);

  const todayKey = useMemo(() => {
    const t = new Date();
    return menstrualDateKey(t.getFullYear(), t.getMonth(), t.getDate());
  }, []);

  return (
    <section className="cycle-wellness__glass rounded-2xl p-5 sm:p-6 space-y-5 min-w-0">
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-white/50 hover:bg-white/70 text-[hsl(var(--cycle-ink))] transition-colors"
          onClick={onPrevMonth}
          aria-label="Предыдущий месяц"
        >
          ←
        </button>
        <h2 className="text-lg font-semibold text-[hsl(var(--cycle-ink))] tabular-nums">
          {MONTHS_RU[month]} {year}
        </h2>
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-white/50 hover:bg-white/70 text-[hsl(var(--cycle-ink))] transition-colors"
          onClick={onNextMonth}
          aria-label="Следующий месяц"
        >
          →
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-center text-[11px] font-medium text-[hsl(var(--cycle-muted))]">
        {weekdayLabels.map((wd) => (
          <div key={wd} className="py-1">{wd}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
        {cells.map((cell, idx) => {
          if (!cell) return <div key={`e-${idx}`} aria-hidden />;
          const phase = phaseByDate.get(cell.date);
          const hasLog = logByDate.has(cell.date);
          const isToday = cell.date === todayKey;
          const isSelected = cell.date === selectedDate;
          const theme = phase ? CYCLE_WELLNESS_PHASE[phase] : null;

          return (
            <button
              key={cell.date}
              type="button"
              onClick={() => onSelectDate(cell.date)}
              className={[
                "relative flex flex-col items-center justify-center rounded-2xl py-2 min-h-[3.25rem] transition-all",
                theme ? theme.bg : "bg-white/35 dark:bg-white/5",
                isSelected ? `ring-2 ${theme?.ring ?? "ring-rose-300"} scale-[1.03] shadow-md` : "hover:scale-[1.02]",
                isToday && !isSelected ? "ring-1 ring-rose-400/50" : "",
              ].join(" ")}
            >
              <span className={`text-sm font-semibold tabular-nums ${theme?.text ?? "text-[hsl(var(--cycle-muted))]"}`}>
                {cell.day}
              </span>
              {hasLog && (
                <span className="absolute bottom-1.5 h-1 w-1 rounded-full bg-[hsl(var(--cycle-ink))]/40" aria-hidden />
              )}
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-[hsl(var(--cycle-muted))]">
        {PHASE_ORDER.map((p) => (
          <span key={p} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${CYCLE_WELLNESS_PHASE[p].dot}`} />
            {CYCLE_WELLNESS_PHASE[p].label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1 w-1 rounded-full bg-[hsl(var(--cycle-ink))]/40" />
          Есть запись
        </span>
      </div>
    </section>
  );
}
