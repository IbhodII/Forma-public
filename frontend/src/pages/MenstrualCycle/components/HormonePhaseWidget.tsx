import type { CycleImpact } from "../../../shared/menstrualCyclePhases";
import { Activity, Flame } from "lucide-react";

type Props = {
  impact: CycleImpact | undefined;
  isLoading: boolean;
};

export function HormonePhaseWidget({ impact, isLoading }: Props) {
  if (isLoading) {
    return (
      <div className="cycle-wellness__glass rounded-2xl p-5 animate-pulse h-32" aria-busy />
    );
  }

  if (!impact?.tracking) {
    return null;
  }

  return (
    <section className="cycle-wellness__glass rounded-2xl p-5 sm:p-6 space-y-4">
      <h2 className="text-base font-semibold text-[hsl(var(--cycle-ink))]">Влияние на метаболизм</h2>
      <p className="text-sm text-[hsl(var(--cycle-muted))]">
        Персональные коэффициенты для BMR и восстановления на основе текущей фазы.
      </p>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="rounded-xl bg-white/40 dark:bg-white/5 p-4 flex gap-3">
          <Flame className="h-5 w-5 text-rose-500 shrink-0" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wide text-[hsl(var(--cycle-muted))]">BMR</p>
            <p className="text-lg font-semibold tabular-nums text-[hsl(var(--cycle-ink))]">
              ×{impact.bmr_multiplier?.toFixed(2) ?? "1.00"}
            </p>
            <p className="text-xs text-[hsl(var(--cycle-muted))] mt-1">
              {impact.bmr_note ?? "Без коррекции"}
            </p>
          </div>
        </div>
        <div className="rounded-xl bg-white/40 dark:bg-white/5 p-4 flex gap-3">
          <Activity className="h-5 w-5 text-violet-500 shrink-0" aria-hidden />
          <div>
            <p className="text-xs uppercase tracking-wide text-[hsl(var(--cycle-muted))]">Восстановление</p>
            <p className="text-lg font-semibold tabular-nums text-[hsl(var(--cycle-ink))]">
              ×{impact.recovery_multiplier?.toFixed(2) ?? "1.00"}
            </p>
            <p className="text-xs text-[hsl(var(--cycle-muted))] mt-1">
              {impact.recovery_note ?? "Стандартная нагрузка"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
