import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { formatHcSource } from "../components/HcSourceBadge";

const EFFECTIVE_LABELS: Record<string, string> = {
  health_connect: "Health Connect",
  polar_fit_preferred: "Polar / FIT preferred",
  manual: "Manual",
  none: "Не используется",
};

function effectiveLabel(effective: string): string {
  return EFFECTIVE_LABELS[effective] ?? formatHcSource(effective);
}

export function HcSourceRoutingSection({
  routing,
  analyticsConnected,
  embedded = false,
}: {
  routing: HealthConnectHubResponse["source_routing"];
  analyticsConnected: boolean;
  embedded?: boolean;
}) {
  return (
    <HcSectionFrame
      id="hc-routing"
      embedded={embedded}
      eyebrow="Sources"
      title="Источники данных"
      description="Read-only: effective source и правила маршрутизации. Изменение не влияет на sync."
    >
      {!analyticsConnected ? (
        <p className="mb-4 text-xs text-amber-700 dark:text-amber-300">
          HC не подключён к analytics — включите toggles в Настройки → Аналитика и синхронизируйте
          свежие данные.
        </p>
      ) : (
        <p className="mb-4 text-xs text-emerald-700 dark:text-emerald-300">
          HC подключён к analytics — хотя бы одна метрика включена и данные свежие.
        </p>
      )}
      <div className="space-y-3">
        {routing.rules.map((rule) => (
          <div
            key={rule.metric}
            className="grid gap-2 rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3 sm:grid-cols-[1fr_auto]"
          >
            <div>
              <div className="text-sm font-medium">{rule.metric_label}</div>
              <p className="text-xs text-[rgb(var(--app-text-muted))] mt-0.5">{rule.policy}</p>
              {rule.fallback ? (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">Fallback: {rule.fallback}</p>
              ) : null}
            </div>
            <select
              disabled
              className="h-9 rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle))] px-3 text-sm opacity-90 cursor-not-allowed"
              value={rule.effective}
              aria-label={`Источник: ${rule.metric_label}`}
            >
              <option value={rule.effective}>{effectiveLabel(rule.effective)}</option>
            </select>
          </div>
        ))}
      </div>
    </HcSectionFrame>
  );
}
