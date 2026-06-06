import { useQuery } from "@tanstack/react-query";
import { fetchHealthConnectHub } from "../../../api/sync";
import { fetchSourcePriorities } from "../../../api/user";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { getSourceDisplay } from "../../../utils/workoutSources";
import { parseApiError } from "../../../utils/validation";
import { formatHcSource } from "../../../pages/HealthConnect/components/HcSourceBadge";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import { SETTINGS_STALE_MS } from "../../../hooks/queryStaleTimes";
import { DebugJsonPreview, DiagnosticCollapsible } from "./DiagnosticCollapsible";

const EFFECTIVE_LABELS: Record<string, string> = {
  health_connect: "Health Connect",
  polar_fit_preferred: "Polar / FIT preferred",
  manual: "Manual",
  none: "Не используется",
};

function effectiveLabel(effective: string): string {
  return EFFECTIVE_LABELS[effective] ?? formatHcSource(effective);
}

export function SourceResolverDiagnosticsPanel() {
  const caps = useClientCapabilities();
  const hubQuery = useQuery({
    queryKey: queryKeys.healthConnectHub,
    queryFn: fetchHealthConnectHub,
    enabled: caps.enableDebugPanels,
    staleTime: SETTINGS_STALE_MS,
  });

  const prefsQuery = useQuery({
    queryKey: queryKeys.sourcePriorities,
    queryFn: fetchSourcePriorities,
    enabled: caps.enableDebugPanels,
    staleTime: SETTINGS_STALE_MS,
  });

  const loading = hubQuery.isLoading || prefsQuery.isLoading;
  const error = hubQuery.error ?? prefsQuery.error;

  const copyPayload = {
    source_routing: hubQuery.data?.source_routing,
    user_priority_prefs: prefsQuery.data,
    analytics_connected: hubQuery.data?.analytics_connected,
  };

  return (
    <DiagnosticCollapsible
      title="Source resolver diagnostics"
      description="Effective source по метрикам, политики маршрутизации и пользовательские приоритеты."
      copyData={copyPayload}
    >
      {loading ? <Loader label="Загрузка source resolver…" compact /> : null}
      {error ? <ErrorAlert message={parseApiError(error)} /> : null}

      {hubQuery.data ? (
        <div className="space-y-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Analytics connected: {hubQuery.data.analytics_connected ? "да" : "нет"}
          </p>
          {hubQuery.data.source_routing.rules.map((rule) => (
            <div
              key={rule.metric}
              className="grid gap-2 rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3 sm:grid-cols-[1fr_auto]"
            >
              <div>
                <div className="text-sm font-medium">{rule.metric_label}</div>
                <p className="mt-0.5 text-xs text-[rgb(var(--app-text-muted))]">{rule.policy}</p>
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  metric: <code className="text-[11px]">{rule.metric}</code>
                  {rule.fallback ? ` · fallback: ${rule.fallback}` : ""}
                </p>
              </div>
              <div className="self-start rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle))] px-3 py-1.5 text-sm">
                {effectiveLabel(rule.effective)}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {prefsQuery.data ? (
        <div className="space-y-2 border-t border-[rgb(var(--app-border)/0.45)] pt-4">
          <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
            User priority prefs (canonical decisions)
          </p>
          <dl className="grid gap-2 sm:grid-cols-2">
            {Object.entries(prefsQuery.data).map(([metric, sources]) => (
              <div
                key={metric}
                className="rounded-lg border border-[rgb(var(--app-border)/0.5)] px-3 py-2 text-xs"
              >
                <dt className="font-medium text-[rgb(var(--app-text))]">{metric}</dt>
                <dd className="mt-1 flex flex-wrap gap-1">
                  {(sources as string[]).length ? (
                    (sources as string[]).map((src, index) => {
                      const display = getSourceDisplay(src);
                      return (
                        <span
                          key={`${metric}-${src}`}
                          className={`rounded-full border px-1.5 py-0.5 ${display.colorClass}`}
                        >
                          {index + 1}. {display.label}
                        </span>
                      );
                    })
                  ) : (
                    <span className="text-[rgb(var(--app-text-muted))]">—</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          <DebugJsonPreview data={prefsQuery.data} label="Raw priority prefs JSON" />
        </div>
      ) : null}
    </DiagnosticCollapsible>
  );
}
