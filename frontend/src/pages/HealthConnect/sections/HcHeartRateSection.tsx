import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { HcSourceBadge } from "../components/HcSourceBadge";

export function HcHeartRateSection({
  heartRate,
  embedded = false,
}: {
  heartRate: HealthConnectHubResponse["heart_rate"];
  embedded?: boolean;
}) {
  const avgEstimate =
    heartRate.daily_hr_min != null && heartRate.daily_hr_max != null
      ? Math.round((heartRate.daily_hr_min + heartRate.daily_hr_max) / 2)
      : null;

  return (
    <HcSectionFrame
      id="hc-hr"
      embedded={embedded}
      eyebrow="Heart rate"
      title="Пульс"
      description="Resting HR и диапазон за день из постоянного пульса Health Connect."
    >
      {!heartRate.has_data && !heartRate.incomplete_warning ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет HR samples от HC за неделю.</p>
      ) : (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Resting (est.)</div>
              <div className="text-xl font-semibold tabular-nums">
                {heartRate.resting_hr_estimate ?? "—"}
              </div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Средний (оценка)</div>
              <div className="text-xl font-semibold tabular-nums">{avgEstimate ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Min HR</div>
              <div className="text-xl font-semibold tabular-nums">{heartRate.daily_hr_min ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Max HR</div>
              <div className="text-xl font-semibold tabular-nums">{heartRate.daily_hr_max ?? "—"}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Samples</div>
              <div className="text-xl font-semibold tabular-nums">{heartRate.sample_count}</div>
            </div>
          </div>
          <HcSourceBadge source={heartRate.source} />
          {heartRate.incomplete_warning ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{heartRate.incomplete_warning}</p>
          ) : null}
        </div>
      )}
    </HcSectionFrame>
  );
}
