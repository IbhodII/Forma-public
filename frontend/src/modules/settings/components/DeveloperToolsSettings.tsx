import { useDeveloperTools } from "../../../hooks/useDeveloperTools";
import { SettingsSubsection } from "./SettingsSection";
import { DiagnosticCollapsible } from "./DiagnosticCollapsible";
import { HealthConnectDiagnosticsPanel } from "./HealthConnectDiagnosticsPanel";
import { ImportDiagnosticsPanel } from "./ImportDiagnosticsPanel";
import { OAuthDebugPanel } from "./OAuthDebugPanel";
import { PolarDiagnosticsPanel } from "./PolarDiagnosticsPanel";
import { SourceResolverDiagnosticsPanel } from "./SourceResolverDiagnosticsPanel";
import { SyncLogsPanel } from "./SyncLogsPanel";
import { LanMobileDevBlock } from "./LanMobileDevBlock";
import { MiniDatabasePanel } from "./MiniDatabasePanel";
import { DatabaseImportSettings } from "./DatabaseImportSettings";
import { DataBackupSettings } from "./DataBackupSettings";
import { ScopeDebugPanel } from "./ScopeDebugPanel";
import { useQuery } from "@tanstack/react-query";
import { fetchCloudOAuthDebug } from "../../../api/cloud";
import { resolveApiOrigin } from "../../../api/runtimeBaseUrl";
import { queryKeys } from "../../../hooks/queryKeys";
import { resolveClientMode } from "../../../config/clientCapabilities";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import pkg from "../../../../package.json";

export function DeveloperToolsSettings() {
  const caps = useClientCapabilities();
  const { developerToolsEnabled, setDeveloperToolsEnabled } = useDeveloperTools();
  const apiOrigin = resolveApiOrigin();

  const oauthQuery = useQuery({
    queryKey: [...queryKeys.cloudOAuthDebug, apiOrigin ?? "default"],
    queryFn: () => fetchCloudOAuthDebug(apiOrigin ?? undefined),
    staleTime: 30_000,
    enabled: developerToolsEnabled,
  });

  return (
    <SettingsSubsection
      title="Диагностика / Developer Tools"
      description="Технические инструменты для отладки sync, OAuth и импорта. Скрыты от обычного интерфейса."
    >
      {caps.enableMiniDatabaseExport ? <MiniDatabasePanel /> : null}

      {developerToolsEnabled &&
      (caps.enableTwoFileDatabaseImport || caps.enableJsonAccountBackup) ? (
        <div className="space-y-4 rounded-xl border border-[rgb(var(--app-border)/0.6)] p-4">
          <p className="text-sm font-medium">Импорт / бэкап (dev)</p>
          {caps.enableTwoFileDatabaseImport ? (
            <DatabaseImportSettings embedded zipOnly={false} />
          ) : null}
          {caps.enableJsonAccountBackup ? <DataBackupSettings jsonOnly /> : null}
        </div>
      ) : null}

      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[rgb(var(--app-border)/0.6)] p-4">
        <input
          type="checkbox"
          className="mt-0.5 rounded border-[rgb(var(--app-border))]"
          checked={developerToolsEnabled}
          onChange={(e) => setDeveloperToolsEnabled(e.target.checked)}
        />
        <span>
          <span className="block text-sm font-medium">Показать диагностические инструменты</span>
          <span className="mt-0.5 block text-xs text-[rgb(var(--app-text-muted))]">
            Сохраняется локально в браузере. Включите для доступа к raw JSON, redirect URI и audit-слоям.
          </span>
        </span>
      </label>

      {!developerToolsEnabled ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Статусы подключения (HC sync, OAuth, Polar) остаются в обычных разделах. Детальная диагностика
          доступна после включения переключателя выше.
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] p-4 text-sm">
            <p className="font-medium">Сборка (read-only)</p>
            <dl className="mt-2 grid gap-1 text-xs text-[rgb(var(--app-text-muted))]">
              <div className="flex gap-2">
                <dt>Версия:</dt>
                <dd>{pkg.version}</dd>
              </div>
              <div className="flex gap-2">
                <dt>Client mode:</dt>
                <dd>{resolveClientMode()}</dd>
              </div>
              <div className="flex gap-2">
                <dt>API origin:</dt>
                <dd className="break-all">{apiOrigin ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-[rgb(var(--app-text-muted))]">
              Release smoke: docs/RELEASE_SMOKE.md (build commands, exe/APK matrix, sign-off §10)
            </p>
          </div>
          <ScopeDebugPanel embedded />
          <DiagnosticCollapsible
            title="OAuth diagnostics"
            description="Expected redirect URI, env config, masked client id и callback paths."
            copyData={oauthQuery.data}
          >
            <OAuthDebugPanel embedded />
          </DiagnosticCollapsible>

          <HealthConnectDiagnosticsPanel />
          <SourceResolverDiagnosticsPanel />
          <ImportDiagnosticsPanel />
          <PolarDiagnosticsPanel />
          <SyncLogsPanel />
          <LanMobileDevBlock />
        </div>
      )}
    </SettingsSubsection>
  );
}
