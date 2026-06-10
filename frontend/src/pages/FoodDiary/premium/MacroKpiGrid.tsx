import { motion } from "framer-motion";
import { Beef, Droplets, Flame, Leaf, Wheat } from "lucide-react";
import type { MacroTotals, NutritionGoals } from "../../../api/food";
import { useUnits } from "../../../hooks/useUnits";
import { cn } from "../../../lib/utils";
import { Card } from "../../../components/ui/card";
import { CircularProgress } from "./CircularProgress";

type MacroKey = "protein" | "fat" | "carbs" | "fiber" | "calories";

const MACRO_CONFIG: Record<
  MacroKey,
  {
    label: string;
    icon: typeof Beef;
    gradient: string;
    ring: string;
    unit: "g" | "kcal";
  }
> = {
  protein: {
    label: "Белки",
    icon: Beef,
    gradient: "from-blue-500/15 via-blue-400/5 to-transparent",
    ring: "text-blue-500",
    unit: "g",
  },
  fat: {
    label: "Жиры",
    icon: Droplets,
    gradient: "from-amber-500/15 via-orange-400/5 to-transparent",
    ring: "text-amber-500",
    unit: "g",
  },
  carbs: {
    label: "Углеводы",
    icon: Wheat,
    gradient: "from-violet-500/15 via-purple-400/5 to-transparent",
    ring: "text-violet-500",
    unit: "g",
  },
  fiber: {
    label: "Клетчатка",
    icon: Leaf,
    gradient: "from-emerald-500/15 via-teal-400/5 to-transparent",
    ring: "text-emerald-500",
    unit: "g",
  },
  calories: {
    label: "Калории",
    icon: Flame,
    gradient: "from-rose-500/15 via-pink-400/5 to-transparent",
    ring: "text-rose-500",
    unit: "kcal",
  },
};

function goalFor(key: MacroKey, goals: NutritionGoals | null | undefined): number | null {
  if (!goals) return null;
  const map: Record<MacroKey, keyof NutritionGoals> = {
    protein: "protein_goal",
    fat: "fat_goal",
    carbs: "carbs_goal",
    fiber: "calories_goal",
    calories: "calories_goal",
  };
  if (key === "fiber") {
    return goals.calories_goal ? null : null;
  }
  const v = goals[map[key]];
  return typeof v === "number" && v > 0 ? v : null;
}

function defaultFiberGoal(recommended?: number | null) {
  return recommended && recommended > 0 ? recommended : 30;
}

export function MacroKpiGrid({
  totals,
  goals,
  fiberTarget,
  isLoading,
}: {
  totals: MacroTotals | null | undefined;
  goals: NutritionGoals | null | undefined;
  fiberTarget?: number | null;
  isLoading?: boolean;
}) {
  const { formatEnergy, formatFoodWeight } = useUnits();

  const keys: MacroKey[] = ["protein", "fat", "carbs", "fiber", "calories"];

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {keys.map((k) => (
          <div
            key={k}
            className="h-36 rounded-2xl bg-slate-200/60 animate-pulse dark:bg-slate-800/60"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
      {keys.map((key, i) => {
        const cfg = MACRO_CONFIG[key];
        const Icon = cfg.icon;
        const current =
          key === "fiber"
            ? totals?.fiber ?? 0
            : key === "calories"
              ? totals?.calories ?? 0
              : totals?.[key] ?? 0;
        const target =
          key === "fiber"
            ? defaultFiberGoal(fiberTarget)
            : goalFor(key, goals) ?? (key === "calories" ? 2200 : key === "protein" ? 120 : key === "fat" ? 70 : key === "carbs" ? 200 : 30);

        const display =
          key === "fiber"
            ? `${formatFoodWeight(current)} / ${formatFoodWeight(target)}`
            : cfg.unit === "kcal"
              ? formatEnergy(current)
              : `${formatFoodWeight(current)}`;

        return (
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.35 }}
          >
            <Card
              className={cn(
                "group relative overflow-hidden border-0 p-0 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-2xl hover:shadow-slate-300/30 dark:hover:shadow-black/40",
                "bg-gradient-to-br",
                cfg.gradient,
              )}
            >
              <div className="absolute inset-0 bg-white/60 backdrop-blur-xl dark:bg-slate-900/40" />
              <div className="relative flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {cfg.label}
                  </span>
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl bg-white/80 shadow-sm dark:bg-slate-800/80",
                      cfg.ring,
                    )}
                  >
                    <Icon className="h-4 w-4" strokeWidth={2.25} />
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2">
                  <p className="text-2xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-white">
                    {display}
                  </p>
                  <CircularProgress
                    value={current}
                    max={target}
                    size={56}
                    stroke={5}
                    accentClass={cfg.ring}
                  >
                    <span className="text-[10px] font-semibold tabular-nums text-slate-600 dark:text-slate-300">
                      {target > 0 ? Math.round((current / target) * 100) : 0}%
                    </span>
                  </CircularProgress>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-700/50">
                  <motion.div
                    className={cn("h-full rounded-full bg-current opacity-80", cfg.ring)}
                    initial={{ width: 0 }}
                    animate={{
                      width: `${target > 0 ? Math.min(100, (current / target) * 100) : 0}%`,
                    }}
                    transition={{ duration: 0.7, ease: "easeOut" }}
                  />
                </div>
              </div>
            </Card>
          </motion.div>
        );
      })}
    </div>
  );
}
