import { useQuery } from "@tanstack/react-query";
import { fetchHealthConnectDebug } from "../../../api/sync";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { SETTINGS_STALE_MS } from "../../../hooks/queryStaleTimes";
import { parseApiError } from "../../../utils/validation";
import { HealthConnectDebugContent } from "../../../pages/HealthConnect/HealthConnectDebugContent";
import { DiagnosticCollapsible } from "./DiagnosticCollapsible";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";

export function HealthConnectDiagnosticsPanel() {
  const caps = useClientCapabilities();
  const query = useQuery({
    queryKey: queryKeys.healthConnectDebug,
    queryFn: fetchHealthConnectDebug,
    enabled: caps.enableDebugPanels,
    staleTime: SETTINGS_STALE_MS,
  });

  return (
    <DiagnosticCollapsible
      title="Диагностика Health Connect"
      description="Журнал синхронизации и служебные данные (только для разработчиков)."
      copyData={query.data}
    >
      {query.isLoading ? <Loader label="Загрузка HC diagnostics…" compact /> : null}
      {query.isError ? <ErrorAlert message={parseApiError(query.error)} /> : null}
      {query.data ? <HealthConnectDebugContent embedded /> : null}
    </DiagnosticCollapsible>
  );
}
