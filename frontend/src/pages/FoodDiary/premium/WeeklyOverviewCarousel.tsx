import { motion } from "framer-motion";
import { AlertTriangle } from "lucide-react";
import type { FoodPhase } from "../../../api/food";
import { cn } from "../../../lib/utils";
import { dayStatus, type DayStatus } from "../useWeekSummary";
import { isToday, todayBadgeLabel, todayHighlightClass } from "../../../shared/utils/dateHighlight";
import type { WeekDayCell } from "../useFoodWeekData";

const STATUS_STYLES: Record<
  DayStatus,
  { ring: string; bg: string; badge: string }
> = {
  good: {
    ring: "ring-emerald-500/40",
    bg: "from-emerald-500/15 to-teal-500/5",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  },
  warning: {
    ring: "ring-amber-500/40",
    bg: "from-amber-500/15 to-orange-500/5",
    badge: "bg-amber-500/15 text-amber-800 dark:text-amber-300",
  },
  problem: {
    ring: "ring-rose-500/40",
    bg: "from-rose-500/15 to-red-500/5",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
  },
  neutral: {
    ring: "ring-sky-500/30",
    bg: "from-sky-500/10 to-blue-500/5",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  },
  empty: {
    ring: "ring-slate-300/50",
    bg: "from-slate-200/30 to-transparent",
    badge: "bg-slate-200/50 text-slate-500",
  },
};

function formatGrams(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

function deficitKcalPerKgFat(
  balance: number | null,
  phase: FoodPhase,
  fatKg: number | null,
): number | null {
  if (phase !== "cut" || balance == null || balance >= 0 || fatKg == null || fatKg <= 0) {
    return null;
  }
  return Math.round(Math.abs(balance) / fatKg);
}

export function WeeklyOverviewCarousel({
  cells,
  phase,
  maxDeficitPerKgFat,
  fatKg,
  selectedDate,
  onSelectDay,
  formatEnergy,
  isLoading,
}: {
  cells: WeekDayCell[];
  phase: FoodPhase;
  maxDeficitPerKgFat: number;
  fatKg: number | null;
  selectedDate: string | null;
  onSelectDay: (date: string) => void;
  formatEnergy: (n: number) => string;
  isLoading?: boolean;
}) {
  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 7 }).map((_, i) => (
          <div
            key={i}
            className="h-48 w-[9.5rem] shrink-0 animate-pulse rounded-2xl bg-slate-200/60 dark:bg-slate-800/60"
          />
        ))}
      </div>
    );
  }


  return (
    <section className="food-week-overview space-y-3 pt-1 min-w-0">
      <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        Обзор недели
      </h2>
      <div className="food-week-overview__track">
        {cells.map((cell, i) => {
          const status = dayStatus(cell, phase, maxDeficitPerKgFat, fatKg);
          const styles = STATUS_STYLES[status];
          const isTodayCell = isToday(cell.date);
          const isSelected = selectedDate === cell.date;
          const todayLabel = todayBadgeLabel(cell.date);
          const month = String(new Date(`${cell.date}T12:00:00`).getMonth() + 1).padStart(2, "0");
          const maxKcal = Math.max(
            ...cells.map((c) => Math.max(c.intake, c.expenditure ?? 0)),
            1,
          );
          const intakePct = cell.intake > 0 ? (cell.intake / maxKcal) * 100 : 0;
          const kcalPerKg = deficitKcalPerKgFat(cell.balance, phase, fatKg);

          return (
            <motion.button
              key={cell.date}
              type="button"
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => onSelectDay(cell.date)}
              className={cn(
                "food-week-overview__card rounded-2xl border p-3 text-left transition-all duration-200 min-w-0",
                isTodayCell && "food-week-overview__card--today",
                "bg-gradient-to-br backdrop-blur-md hover:shadow-lg",
                !isTodayCell && "ring-2 ring-inset",
                styles.bg,
                !isTodayCell && styles.ring,
                isSelected && !isTodayCell && "ring-emerald-500",
                isTodayCell && todayHighlightClass(isSelected),
              )}
            >
              <div className="flex items-start justify-between gap-1 mb-2">
                <div>
                  <p className="text-xs font-medium text-slate-500">{cell.weekdayLabel}</p>
                  <p
                    className={cn(
                      "font-bold tabular-nums leading-tight",
                      isTodayCell ? "text-xl" : "text-lg",
                    )}
                  >
                    {String(cell.dayNum).padStart(2, "0")}.{month}
                  </p>
                  {todayLabel ? (
                    <span className="food-week-overview__today-badge mt-1 inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                      {todayLabel}
                    </span>
                  ) : null}
                </div>
                {cell.hasFallback && (
                  <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0" aria-hidden />
                )}
              </div>

              <div className="space-y-1.5 text-[11px] leading-snug tabular-nums">
                <p>
                  <span className="text-slate-500">Б/Ж/У </span>
                  <span className="font-medium">
                    {formatGrams(cell.protein)}/{formatGrams(cell.fat)}/{formatGrams(cell.carbs)}
                  </span>
                </p>
                <p>
                  <span className="text-slate-500">Клетч. </span>
                  <span className="font-medium">
                    {cell.hasEntries
                      ? `${formatGrams(cell.fiber)} / ${formatGrams(cell.fiberTarget)} г`
                      : "—"}
                  </span>
                </p>
                <p className="font-semibold">{cell.hasEntries ? formatEnergy(cell.intake) : "—"}</p>
                {cell.expenditure != null && (
                  <p className="text-slate-500">расх. {formatEnergy(cell.expenditure)}</p>
                )}
                <p
                  className={cn(
                    "font-bold",
                    cell.balance == null
                      ? ""
                      : cell.balance < 0
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  {cell.balance != null
                    ? cell.balance > 0
                      ? `+${formatEnergy(cell.balance)}`
                      : formatEnergy(cell.balance)
                    : "—"}
                </p>
                {kcalPerKg != null ? (
                  <p className="text-[10px] text-emerald-600/90 dark:text-emerald-400/90">
                    ≈ {kcalPerKg} ккал/кг жира
                  </p>
                ) : null}
              </div>

              <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-rose-400 to-rose-500"
                  style={{ width: `${Math.min(100, intakePct)}%` }}
                />
              </div>

              <span
                className={cn(
                  "mt-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium",
                  styles.badge,
                )}
              >
                {status === "good"
                  ? "OK"
                  : status === "warning"
                    ? "!"
                    : status === "problem"
                      ? "!"
                      : status === "empty"
                        ? "—"
                        : "~"}
              </span>
            </motion.button>
          );
        })}
      </div>
    </section>
  );
}
