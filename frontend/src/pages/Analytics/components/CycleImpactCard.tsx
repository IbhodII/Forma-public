import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { fetchMenstrualCycleImpact } from "../../../api/menstrualCycle";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { useCycleFeatureEnabled } from "../../../hooks/useCycleFeatureEnabled";
import { CYCLE_PHASE_CELL_CLASS, type CyclePhase } from "../../../shared/menstrualCyclePhases";

export function CycleImpactCard({ enabled = true }: { enabled?: boolean }) {
  const cycleFeatureEnabled = useCycleFeatureEnabled();
  const today = new Date().toISOString().slice(0, 10);
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.menstrualCycleImpact(today),
    queryFn: () => fetchMenstrualCycleImpact(today),
    enabled: enabled && cycleFeatureEnabled,
  });

  if (!cycleFeatureEnabled) {
    return null;
  }

  if (isLoading) {
    return <Loader label="Фаза цикла…" />;
  }

  if (!data?.tracking) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 p-4 text-sm text-slate-600 space-y-2">
        <p>{data?.message ?? "Добавьте данные о цикле в профиле."}</p>
        <Link
          to="/settings?tab=cycle"
          className="inline-flex min-h-11 items-center text-brand-600 font-medium"
        >
          Настройки цикла →
        </Link>
      </div>
    );
  }

  const phase = data.phase as CyclePhase | undefined;
  const phaseDot = phase ? CYCLE_PHASE_CELL_CLASS[phase].split(" ")[0] : "bg-slate-300";

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`h-4 w-4 rounded-full shrink-0 ${phaseDot}`} />
        <div>
          <p className="font-semibold text-slate-800 dark:text-slate-100">
            {data.phase_label ?? "—"}
          </p>
          <p className="text-xs text-slate-500">
            {data.source === "manual" ? "Задано вручную в календаре" : "Рассчитано по настройкам"}
          </p>
        </div>
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
          <dt className="text-xs text-slate-500 uppercase tracking-wide">BMR</dt>
          <dd className="mt-1 font-medium tabular-nums">
            ×{data.bmr_multiplier?.toFixed(2) ?? "1.00"}
            {data.bmr_adjusted ? (
              <span className="block text-xs font-normal text-slate-600 mt-0.5">
                {data.bmr_note}
              </span>
            ) : (
              <span className="block text-xs font-normal text-slate-500 mt-0.5">Без коррекции</span>
            )}
          </dd>
        </div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
          <dt className="text-xs text-slate-500 uppercase tracking-wide">CTL / ATL (TRIMP)</dt>
          <dd className="mt-1 font-medium tabular-nums">
            ×{data.recovery_multiplier?.toFixed(2) ?? "1.00"}
            {data.recovery_note ? (
              <span className="block text-xs font-normal text-slate-600 mt-0.5">
                {data.recovery_note}
              </span>
            ) : (
              <span className="block text-xs font-normal text-slate-500 mt-0.5">
                Стандартный учёт нагрузки
              </span>
            )}
          </dd>
        </div>
      </dl>
      <Link to="/cycle" className="text-brand-600 text-sm font-medium inline-flex min-h-11 items-center">
        Календарь цикла →
      </Link>
    </div>
  );
}
