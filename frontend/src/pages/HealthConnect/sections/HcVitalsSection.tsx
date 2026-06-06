import type { HealthConnectHubResponse } from "../../../api/sync";
import { PageSection } from "../../../components/page-shell";
import { Activity, Droplets, Heart, Wind, Zap } from "lucide-react";

function VitalCard({
  label,
  value,
  sub,
  icon,
  muted = false,
}: {
  label: string;
  value: React.ReactNode;
  sub?: string;
  icon: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div className={`hc-vital-card ${muted ? "hc-vital-card--muted" : ""}`}>
      <span className="hc-vital-card__icon" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="hc-vital-card__label">{label}</div>
        <div className="hc-vital-card__value">{value}</div>
        {sub ? <div className="hc-vital-card__sub">{sub}</div> : null}
      </div>
    </div>
  );
}

export function HcVitalsSection({
  heartRate,
  calories,
}: {
  heartRate: HealthConnectHubResponse["heart_rate"];
  calories: HealthConnectHubResponse["calories"];
}) {
  const energy = calories.today_active ?? calories.today_total ?? null;

  return (
    <PageSection
      id="hc-vitals"
      eyebrow="Vitals"
      title="Пульс и восстановление"
      description="Доступные метрики из Health Connect. HRV, SpO₂ и stress появятся, когда бэкенд начнёт их импортировать."
    >
      <div className="hc-vitals-grid">
        <VitalCard
          label="Пульс покоя"
          value={heartRate.resting_hr_estimate ?? "—"}
          sub="оценка по samples"
          icon={<Heart className="h-4 w-4" />}
        />
        <VitalCard
          label="Min / Max HR"
          value={
            heartRate.daily_hr_min != null || heartRate.daily_hr_max != null
              ? `${heartRate.daily_hr_min ?? "—"} / ${heartRate.daily_hr_max ?? "—"}`
              : "—"
          }
          sub={`${heartRate.sample_count} samples`}
          icon={<Activity className="h-4 w-4" />}
        />
        <VitalCard
          label="HRV"
          value="—"
          sub="Скоро: RMSSD / SDNN"
          icon={<Zap className="h-4 w-4" />}
          muted
        />
        <VitalCard
          label="Энергия"
          value={energy != null ? `${Math.round(energy)} ккал` : "—"}
          sub={calories.today_source ?? "активность / total"}
          icon={<Zap className="h-4 w-4" />}
        />
        <VitalCard
          label="SpO₂"
          value="—"
          sub="Нет данных в hub"
          icon={<Droplets className="h-4 w-4" />}
          muted
        />
        <VitalCard
          label="Дыхание"
          value="—"
          sub="Нет данных в hub"
          icon={<Wind className="h-4 w-4" />}
          muted
        />
        <VitalCard
          label="Stress / recovery"
          value="—"
          sub="Зависит от источника на телефоне"
          icon={<Activity className="h-4 w-4" />}
          muted
        />
      </div>
      {heartRate.incomplete_warning ? (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">{heartRate.incomplete_warning}</p>
      ) : null}
    </PageSection>
  );
}
