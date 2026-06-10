import { useQuery } from "@tanstack/react-query";
import { fetchGeneticLimit } from "../../../api/body";
import type { BodyMetricsSummary } from "../../../api/body";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { useUserProfile } from "../../../hooks/useUserProfile";
import { useUnits } from "../../../hooks/useUnits";
import { deriveComposition, geneticProgress } from "../utils/bodyComposition";
import { formatMetricNum } from "../../../utils/bodyMetrics";

export function BodyCompositionSection({ summary }: { summary: BodyMetricsSummary | undefined }) {
  const { formatBodyWeight, formatHeight } = useUnits();
  const { data: profile } = useUserProfile();
  const { data: genetic, isLoading: geneticLoading } = useQuery({
    queryKey: queryKeys.bodyGeneticLimit,
    queryFn: fetchGeneticLimit,
  });

  const comp = deriveComposition(summary, profile?.height_cm);
  const geneticInfo = geneticProgress(genetic);

  if (!comp.weightKg) {
    return (
      <p className="text-sm text-slate-500 text-center py-6">
        Укажите вес и % жира в замере, чтобы увидеть состав тела.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="body-composition-bar" role="img" aria-label="Соотношение жира и сухой массы">
          {comp.fatShare > 0 ? (
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-orange-500"
              style={{ width: `${comp.fatShare}%` }}
            />
          ) : null}
          {comp.leanShare > 0 ? (
            <div
              className="h-full bg-gradient-to-r from-sky-400 to-blue-500"
              style={{ width: `${comp.leanShare}%` }}
            />
          ) : null}
        </div>
        <div className="flex justify-between text-[11px] text-[rgb(var(--app-text-muted))] mt-1.5 tabular-nums">
          <span>Жир {comp.fatShare.toFixed(0)}%</span>
          <span>Сухая масса {comp.leanShare.toFixed(0)}%</span>
        </div>
      </div>

      <div className="body-composition-legend">
        <div className="body-composition-stat">
          <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Масса жира</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {comp.fatMassKg != null ? formatBodyWeight(comp.fatMassKg) : "—"}
          </p>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            {comp.fatPercent != null ? formatMetricNum(comp.fatPercent, "%") : ""}
          </p>
        </div>
        <div className="body-composition-stat">
          <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Сухая масса</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {comp.leanMassKg != null ? formatBodyWeight(comp.leanMassKg) : "—"}
          </p>
        </div>
        <div className="body-composition-stat">
          <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Мышцы</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {comp.muscleMassKg != null ? formatBodyWeight(comp.muscleMassKg) : "—"}
          </p>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">по замеру</p>
        </div>
        <div className="body-composition-stat">
          <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">Вода ≈</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {comp.waterEstimateKg != null ? formatBodyWeight(comp.waterEstimateKg) : "—"}
          </p>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">оценка ~73% LBM</p>
        </div>
        <div className="body-composition-stat">
          <p className="text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">FFMI</p>
          <p className="text-lg font-bold tabular-nums mt-0.5">
            {comp.ffmi != null ? comp.ffmi.toFixed(1) : "—"}
          </p>
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            {profile?.height_cm ? `рост ${formatHeight(profile.height_cm)}` : "укажите рост в профиле"}
          </p>
        </div>
      </div>

      {geneticLoading ? (
        <Loader label="Генетический предел…" />
      ) : geneticInfo ? (
        <div className="rounded-xl border border-[rgb(var(--app-border)/0.8)] p-4 bg-[rgb(var(--app-subtab-track)/0.25)]">
          <div className="flex items-end justify-between gap-2 mb-2">
            <p className="text-sm font-semibold">Генетический предел (сухая масса)</p>
            <p className="text-2xl font-bold tabular-nums text-brand-600 dark:text-brand-400">
              {geneticInfo.percent}%
            </p>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-700/80 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-violet-500 transition-all duration-700"
              style={{ width: `${geneticInfo.percent}%` }}
            />
          </div>
          {genetic?.max_lean_mass != null && genetic.lean_mass != null ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))] mt-2 tabular-nums">
              {formatBodyWeight(genetic.lean_mass)} / {formatBodyWeight(genetic.max_lean_mass)}
              {genetic.remaining_kg != null ? ` · до предела ${formatBodyWeight(genetic.remaining_kg)}` : ""}
            </p>
          ) : null}
          {geneticInfo.label ? (
            <p className="text-xs mt-1.5 text-[rgb(var(--app-text-muted))] leading-snug">{geneticInfo.label}</p>
          ) : null}
        </div>
      ) : genetic?.message ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">{genetic.message}</p>
      ) : null}
    </div>
  );
}
