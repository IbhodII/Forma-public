import { useQuery } from "@tanstack/react-query";
import { fetchIntegrationSettings } from "../../../api/user";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import { DebugJsonPreview, DiagnosticCollapsible } from "./DiagnosticCollapsible";

export function ImportDiagnosticsPanel() {
  const query = useQuery({
    queryKey: queryKeys.integrationSettings,
    queryFn: fetchIntegrationSettings,
  });

  const data = query.data;

  return (
    <DiagnosticCollapsible
      title="Import diagnostics"
      description="FIT-папка, effective path и параметры импорта с диска."
      copyData={data}
    >
      {query.isLoading ? <Loader label="Загрузка import settings…" compact /> : null}
      {query.isError ? <ErrorAlert message={parseApiError(query.error)} /> : null}
      {data ? (
        <dl className="grid gap-3 sm:grid-cols-2 text-sm">
          <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3">
            <dt className="text-xs text-[rgb(var(--app-text-muted))]">fit_folder_path</dt>
            <dd className="mt-1 break-all font-medium">{data.fit_folder_path ?? "—"}</dd>
          </div>
          <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3">
            <dt className="text-xs text-[rgb(var(--app-text-muted))]">effective_fit_folder_path</dt>
            <dd className="mt-1 break-all font-medium">{data.effective_fit_folder_path ?? "—"}</dd>
          </div>
        </dl>
      ) : null}
      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        Дубликаты и canonical source при импорте FIT/Polar решаются source resolver — см. раздел Source
        resolver diagnostics. Конфликты отображаются на карточках тренировок (SourceConflictBanner).
      </p>
      {data ? <DebugJsonPreview data={data} label="Raw integration settings JSON" /> : null}
    </DiagnosticCollapsible>
  );
}
