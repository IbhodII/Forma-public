import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { FoodPhase } from "../../../api/food";
import { Button } from "../../../components/ui/button";
import { cn } from "../../../lib/utils";
import { formatDateRu } from "../../../utils/format";
import type { WeekSummary } from "../useWeekSummary";

export function WeekCommandHeader({
  weekNumber,
  weekStart,
  weekEnd,
  phase,
  onPhaseChange,
  onPrevWeek,
  onNextWeek,
  canNextWeek,
  summary,
  onAddMeal,
  canAdd,
  formatEnergy,
}: {
  weekNumber?: number;
  weekStart: string;
  weekEnd: string;
  phase: FoodPhase;
  onPhaseChange: (p: FoodPhase) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  canNextWeek: boolean;
  summary: WeekSummary;
  onAddMeal: () => void;
  canAdd: boolean;
  formatEnergy: (n: number) => string;
}) {
  const pills = [
    {
      label: "Ср. ккал",
      value: summary.avgIntake != null ? formatEnergy(summary.avgIntake) : "—",
    },
    {
      label: phase === "cut" ? "Ср. дефицит" : "Ср. профицит",
      value:
        summary.avgBalance != null
          ? summary.avgBalance < 0
            ? formatEnergy(Math.abs(summary.avgBalance))
            : summary.avgBalance > 0
              ? `+${formatEnergy(summary.avgBalance)}`
              : "≈0"
          : "—",
      accent:
        summary.avgBalance != null
          ? phase === "cut"
            ? summary.avgBalance < -30
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600"
            : summary.avgBalance > 30
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-amber-600"
          : "",
    },
    {
      label: "Ср. белок",
      value: summary.avgProtein != null ? `${summary.avgProtein} г` : "—",
    },
    {
      label: "Заполнено",
      value: `${summary.adherencePct}%`,
    },
  ];

  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-40 -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="rounded-3xl border border-white/40 bg-white/75 px-4 py-4 shadow-xl shadow-slate-300/25 backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/80 dark:shadow-black/40 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
              Nutrition Command Center
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
                {weekNumber != null ? `Неделя ${weekNumber}` : "Неделя"}
              </h1>
              <div className="flex items-center gap-1 rounded-xl border border-slate-200/80 bg-slate-50/80 p-0.5 dark:border-slate-700 dark:bg-slate-950/50">
                {(["cut", "bulk"] as const).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => onPhaseChange(p)}
                    className={cn(
                      "rounded-lg px-3 py-1 text-sm font-medium transition-all",
                      phase === p
                        ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                        : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200",
                    )}
                  >
                    {p === "cut" ? "Сушка" : "Набор"}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {formatDateRu(weekStart)} — {formatDateRu(weekEnd)}
            </p>
            <div className="flex items-center gap-3 max-w-xs">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                <motion.div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400"
                  initial={{ width: 0 }}
                  animate={{ width: `${summary.weekProgressPct}%` }}
                  transition={{ duration: 0.6 }}
                />
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{summary.weekProgressPct}%</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" size="icon" onClick={onPrevWeek} aria-label="Пред. неделя">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              disabled={!canNextWeek}
              onClick={onNextWeek}
              aria-label="След. неделя"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button type="button" disabled={!canAdd} onClick={onAddMeal} className="gap-2">
              <Plus className="h-4 w-4" />
              Добавить приём
            </Button>
          </div>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {pills.map((pill) => (
            <div
              key={pill.label}
              className="shrink-0 rounded-2xl border border-slate-200/60 bg-white/60 px-4 py-2.5 dark:border-slate-700/60 dark:bg-slate-950/40"
            >
              <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                {pill.label}
              </p>
              <p className={cn("text-sm font-bold tabular-nums", pill.accent)}>{pill.value}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.header>
  );
}
