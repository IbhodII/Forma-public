import { useQuery } from "@tanstack/react-query";
import { fetchCloudOAuthDebug } from "../../../api/cloud";
import { fetchPolarConnectionStatus } from "../../../api/polar";
import { resolveApiBaseUrl, resolveApiOrigin } from "../../../api/runtimeBaseUrl";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { OAuthProviderDebugBlock } from "./OAuthDebugPanel";
import { DebugJsonPreview, DiagnosticCollapsible } from "./DiagnosticCollapsible";

export function PolarDiagnosticsPanel() {
  const apiOrigin = resolveApiOrigin();
  const clientApiBase = resolveApiBaseUrl();

  const oauthQuery = useQuery({
    queryKey: [...queryKeys.cloudOAuthDebug, apiOrigin ?? "default"],
    queryFn: () => fetchCloudOAuthDebug(apiOrigin ?? undefined),
    staleTime: 30_000,
  });

  const polarStatusQuery = useQuery({
    queryKey: queryKeys.polarConnectionStatus,
    queryFn: fetchPolarConnectionStatus,
  });

  const copyPayload = {
    polar_oauth: oauthQuery.data?.polar,
    polar_connection: polarStatusQuery.data,
    api_base: clientApiBase,
  };

  return (
    <DiagnosticCollapsible
      title="Polar diagnostics"
      description="OAuth redirect URI, конфигурация AccessLink и статус подключения Polar Flow."
      copyData={copyPayload}
    >
      {oauthQuery.isLoading || polarStatusQuery.isLoading ? (
        <Loader label="Загрузка Polar diagnostics…" compact />
      ) : null}
      {oauthQuery.isError ? <ErrorAlert message={parseApiError(oauthQuery.error)} /> : null}
      {polarStatusQuery.isError ? <ErrorAlert message={parseApiError(polarStatusQuery.error)} /> : null}

      {polarStatusQuery.data ? (
        <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">Polar Flow</span>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                polarStatusQuery.data.connected
                  ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "bg-[rgb(var(--app-surface-subtle))] text-[rgb(var(--app-text-muted))]"
              }`}
            >
              {polarStatusQuery.data.connected ? "Подключён" : "Не подключён"}
            </span>
          </div>
          {polarStatusQuery.data.polar_user_id ? (
            <p className="mt-2 text-xs text-[rgb(var(--app-text-muted))]">
              Polar user ID: {polarStatusQuery.data.polar_user_id}
            </p>
          ) : null}
          {polarStatusQuery.data.updated_at ? (
            <p className="text-xs text-[rgb(var(--app-text-muted))]">
              Обновлено: {polarStatusQuery.data.updated_at.slice(0, 19).replace("T", " ")}
            </p>
          ) : null}
        </div>
      ) : null}

      {oauthQuery.data?.polar ? (
        <OAuthProviderDebugBlock title="Polar AccessLink OAuth" provider={oauthQuery.data.polar} />
      ) : null}

      {oauthQuery.data?.polar ? (
        <DebugJsonPreview data={oauthQuery.data.polar} label="Raw Polar OAuth config JSON" />
      ) : null}
    </DiagnosticCollapsible>
  );
}
