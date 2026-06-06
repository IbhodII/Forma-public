import { StatusBanner, type StatusBannerTone } from "../../../components/analytics/StatusBanner";
import { HcSourceBadge } from "../../HealthConnect/components/HcSourceBadge";
import type { RecoveryAdvice } from "../utils/recoveryAdvice";

const TONE_MAP: Record<RecoveryAdvice["tone"], StatusBannerTone> = {
  danger: "error",
  warning: "warning",
  neutral: "info",
  good: "success",
};

export function RecoveryRecommendations({ advice }: { advice: RecoveryAdvice }) {
  return (
    <StatusBanner tone={TONE_MAP[advice.tone]} title={advice.title} compact={false}>
      <p>{advice.message}</p>
      {advice.extra ? <p className="mt-1 opacity-90">{advice.extra}</p> : null}
      {advice.hcStaleWarning ? (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">
          {advice.hcStaleWarning} Обновите данные в приложении-источнике и выполните синхронизацию.
        </p>
      ) : null}
      {advice.sleepSource ? (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs opacity-80">Сон:</span>
          <HcSourceBadge source={advice.sleepSource} />
        </div>
      ) : null}
      {advice.factors?.length ? (
        <ul className="mt-2 space-y-0.5 list-disc list-inside opacity-90">
          {advice.factors.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
    </StatusBanner>
  );
}
