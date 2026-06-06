import { useQuery } from "@tanstack/react-query";
import { fetchHealthConnectDebug } from "../../../api/sync";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import { queryKeys } from "../../../hooks/queryKeys";
import { SETTINGS_STALE_MS } from "../../../hooks/queryStaleTimes";
import { parseApiError } from "../../../utils/validation";
import { DebugJsonPreview, DiagnosticCollapsible } from "./DiagnosticCollapsible";

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 19).replace("T", " ");
}

export function SyncLogsPanel() {
  const caps = useClientCapabilities();
  const query = useQuery({
    queryKey: queryKeys.healthConnectDebug,
    queryFn: fetchHealthConnectDebug,
    enabled: caps.enableDebugPanels,
    staleTime: SETTINGS_STALE_MS,
  });

  const logs = query.data?.recent_syncs ?? (query.data?.last_sync ? [query.data.last_sync] : []);

  return (
    <DiagnosticCollapsible
      title="Sync logs"
      description="Журнал последних синхронизаций Health Connect (health_connect_sync_log)."
      copyData={logs.length ? logs : undefined}
    >
      {query.isLoading ? <Loader label="Загрузка журнала…" compact /> : null}
      {query.isError ? <ErrorAlert message={parseApiError(query.error)} /> : null}
      {!query.isLoading && !query.isError && logs.length === 0 ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Записей синхронизации пока нет.</p>
      ) : null}
      {logs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-[rgb(var(--app-border)/0.55)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[rgb(var(--app-border)/0.55)] text-left text-xs text-[rgb(var(--app-text-muted))]">
                <th className="px-3 py-2">Время</th>
                <th className="px-3 py-2">Устройство</th>
                <th className="px-3 py-2">Дней</th>
                <th className="px-3 py-2">Сохранено</th>
                <th className="px-3 py-2">Ошибки</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((row, index) => (
                <tr key={`${row.synced_at ?? index}`} className="border-b border-[rgb(var(--app-border)/0.4)]">
                  <td className="px-3 py-2 tabular-nums">{formatSyncTime(row.synced_at)}</td>
                  <td className="px-3 py-2">{row.device_label ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.days_count ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.saved_days ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums">{row.errors_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      {query.data?.last_batch ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Последний пакет (audit)</p>
          <DebugJsonPreview data={query.data.last_batch.audit} />
        </div>
      ) : null}
    </DiagnosticCollapsible>
  );
}
