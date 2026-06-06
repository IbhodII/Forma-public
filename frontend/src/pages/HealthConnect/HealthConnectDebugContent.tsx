import { useQuery } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { fetchHealthConnectDebug } from "../../api/sync";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { AppPageNav, HeroStatsRow, PageSection } from "../../components/page-shell";
import { KpiCard } from "../../components/ui/kpi-card";
import { Button } from "../../components/ui/button";
import { queryKeys } from "../../hooks/queryKeys";
import { parseApiError } from "../../utils/validation";

const LAYER_NAV = [
  { id: "phone-raw", label: "С телефона" },
  { id: "prepared", label: "Подготовлено" },
  { id: "received", label: "Принято" },
  { id: "saved", label: "Сохранено" },
  { id: "skipped", label: "Пропущено" },
  { id: "analytics", label: "Аналитика" },
] as const;

const WARNING_LABELS: Record<string, string> = {
  sync_log_table_missing: "Таблица журнала синхронизации не найдена (миграция v048+)",
  permission_missing: "На телефоне не выданы разрешения Health Connect",
  no_records: "В пакете нет данных по полям",
  records_skipped: "Часть записей пропущена при сохранении",
  backend_accepted_but_saved_0: "Backend принял пакет, но ничего не сохранил",
};

const COUNT_LABELS: Record<string, string> = {
  steps: "Шаги",
  total_calories: "Калории браслета",
  sleep: "Сон",
  weight_kg: "Вес",
  workouts: "Кардио HC",
};

function JsonBlock({ data }: { data: unknown }) {
  if (data == null) {
    return <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет данных</p>;
  }
  return (
    <pre className="text-xs overflow-x-auto rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.4)] p-3 font-mono whitespace-pre-wrap break-all">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

export function HealthConnectDebugContent({ embedded = false }: { embedded?: boolean }) {
  const [activeLayer, setActiveLayer] = useState<string>(LAYER_NAV[0].id);
  const query = useQuery({
    queryKey: queryKeys.healthConnectDebug,
    queryFn: fetchHealthConnectDebug,
  });

  const last = query.data?.last_sync;
  const lastBatch = query.data?.last_batch;
  const warnings = query.data?.warnings ?? [];
  const mobileAudit = lastBatch?.mobile_audit as Record<string, unknown> | undefined;
  const batchAudit = lastBatch?.audit as Record<string, unknown> | undefined;
  const savedCumulative = query.data?.saved_by_field;
  const analyticsUsage = query.data?.analytics_usage ?? {};

  return (
    <div className="space-y-6 sm:space-y-8">
      {!embedded && query.isLoading && <Loader label="Загрузка диагностики…" />}
      {!embedded && query.isError && <ErrorAlert message={parseApiError(query.error)} />}

      {query.data && !query.isError && (
        <>
          {!embedded && warnings.length > 0 ? (
            <ul className="space-y-2">
              {warnings.map((w) => (
                <li
                  key={w}
                  className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-4 py-2 text-sm text-amber-900 dark:text-amber-200"
                >
                  {WARNING_LABELS[w] ?? w}
                </li>
              ))}
            </ul>
          ) : null}

          {!embedded ? (
          <PageSection
            id="hc-overview"
            eyebrow="Audit layers"
            title="Health Connect — диагностика"
            description="Шесть уровней данных: от сырого HC на телефоне до сохранения в SQLite. Аналитика не подключена."
            actions={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={query.isFetching}
                onClick={() => void query.refetch()}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${query.isFetching ? "animate-spin" : ""}`} />
                Обновить
              </Button>
            }
            stats={
              <HeroStatsRow>
                <KpiCard
                  label="Последняя синхронизация"
                  value={last?.synced_at?.slice(0, 19).replace("T", " ") ?? "—"}
                  sub={lastBatch?.device_label ?? "нет device_label"}
                />
                <KpiCard
                  label="Received (batch)"
                  value={last?.days_count ?? "—"}
                  sub="дней в POST"
                />
                <KpiCard
                  label="Saved (batch)"
                  value={last?.saved_days ?? "—"}
                  sub={`полей: ${String((batchAudit as { saved_totals?: { fields?: number } })?.saved_totals?.fields ?? "—")}`}
                />
                <KpiCard
                  label="Skipped (batch)"
                  value={
                    (batchAudit as { skipped_totals?: { total?: number } })?.skipped_totals?.total ??
                    "—"
                  }
                  sub="последний пакет"
                />
              </HeroStatsRow>
            }
          >
            <AppPageNav
              ariaLabel="Слои данных Health Connect"
              activeId={activeLayer}
              onSelect={setActiveLayer}
              items={[...LAYER_NAV]}
            />
          </PageSection>
          ) : (
            <AppPageNav
              ariaLabel="Слои данных Health Connect"
              activeId={activeLayer}
              onSelect={setActiveLayer}
              items={[...LAYER_NAV]}
            />
          )}

          {embedded && query.isFetching && !query.data ? (
            <Loader label="Загрузка debug…" compact />
          ) : null}

          {activeLayer === "phone-raw" && (
            <PageSection
              id="phone-raw"
              title="1. Raw on phone"
              description="Что Health Connect отдаёт на устройстве (из mobile audit)."
            >
              {mobileAudit?.raw_summary ? (
                <JsonBlock data={mobileAudit.raw_summary} />
              ) : (
                <p className="text-sm text-[rgb(var(--app-text-muted))]">
                  Mobile audit не загружен. Выполните синхронизацию с телефона (экран «HC
                  диагностика»).
                </p>
              )}
              {mobileAudit?.permissions_detail ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))] mb-2">
                    Permissions
                  </h4>
                  <JsonBlock data={mobileAudit.permissions_detail} />
                </div>
              ) : null}
            </PageSection>
          )}

          {activeLayer === "prepared" && (
            <PageSection
              id="prepared"
              title="2. Prepared payload"
              description="Дневные пакеты, которые mobile app отправляет на backend."
            >
              {mobileAudit?.prepared_summary ? (
                <JsonBlock data={mobileAudit.prepared_summary} />
              ) : (
                <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет prepared summary</p>
              )}
            </PageSection>
          )}

          {activeLayer === "received" && (
            <PageSection
              id="received"
              title="3. Backend received"
              description="Последний пакет синхронизации с телефона."
            >
              <JsonBlock data={(batchAudit as { received_totals?: unknown })?.received_totals} />
              <div className="mt-4">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))] mb-2">
                  Day summaries
                </h4>
                <JsonBlock data={(batchAudit as { day_summaries?: unknown })?.day_summaries} />
              </div>
              {last?.payload_preview ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))] mb-2">
                    Payload preview (log)
                  </h4>
                  <JsonBlock data={last.payload_preview} />
                </div>
              ) : null}
            </PageSection>
          )}

          {activeLayer === "saved" && (
            <PageSection
              id="saved"
              title="4. Backend saved"
              description="Последний пакет + накопительные totals в SQLite (source=health_connect)."
            >
              <h4 className="text-sm font-medium mb-2">Last batch saved</h4>
              <JsonBlock data={(batchAudit as { saved_totals?: unknown })?.saved_totals} />
              <h4 className="text-sm font-medium mt-4 mb-2">Cumulative in DB</h4>
              <p className="text-xs text-[rgb(var(--app-text-muted))] mb-2">
                layer: {String(savedCumulative?.layer ?? "backend_saved_cumulative")}
              </p>
              <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.entries(savedCumulative?.counts ?? query.data.counts_by_type ?? {}).map(
                  ([key, count]) => {
                    const range =
                      (savedCumulative?.ranges as Record<string, { min?: string; max?: string }>)?.[
                        key
                      ] ?? query.data.date_ranges?.[key];
                    return (
                      <div
                        key={key}
                        className="rounded-xl border border-[rgb(var(--app-border))] px-4 py-3"
                      >
                        <dt className="text-xs text-[rgb(var(--app-text-muted))]">
                          {COUNT_LABELS[key] ?? key}
                        </dt>
                        <dd className="text-xl font-semibold tabular-nums">{count as number}</dd>
                        {range?.min || range?.max ? (
                          <dd className="text-xs text-[rgb(var(--app-text-muted))] tabular-nums">
                            {range.min ?? "—"} … {range.max ?? "—"}
                          </dd>
                        ) : null}
                      </div>
                    );
                  },
                )}
              </dl>
            </PageSection>
          )}

          {activeLayer === "skipped" && (
            <PageSection
              id="skipped"
              title="5. Backend skipped"
              description="Пропущенные поля и причины (последний пакет)."
            >
              <JsonBlock data={(batchAudit as { skipped_totals?: unknown })?.skipped_totals} />
              {(batchAudit as { warnings?: string[] })?.warnings?.length ? (
                <div className="mt-4">
                  <h4 className="text-xs font-semibold uppercase tracking-wider mb-2">Warnings</h4>
                  <ul className="text-sm list-disc pl-5">
                    {((batchAudit as { warnings?: string[] }).warnings ?? []).map((w) => (
                      <li key={w}>{WARNING_LABELS[w] ?? w}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </PageSection>
          )}

          {activeLayer === "analytics" && (
            <PageSection
              id="analytics"
              title="6. Analytics usage"
              description="Все поля HC явно не подключены к recovery / deficit / expenditure."
            >
              <div className="overflow-x-auto rounded-xl border border-[rgb(var(--app-border))]">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[rgb(var(--app-border))] text-left text-xs text-[rgb(var(--app-text-muted))]">
                      <th className="py-2 px-3">Поле</th>
                      <th className="py-2 px-3">Saved</th>
                      <th className="py-2 px-3">Analytics</th>
                      <th className="py-2 px-3">Note</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(analyticsUsage).map(([field, meta]) => {
                      const m = meta as { used?: boolean; saved_by_backend?: boolean; note?: string };
                      return (
                        <tr key={field} className="border-b border-[rgb(var(--app-border))]/50">
                          <td className="py-2 px-3 font-medium">{field}</td>
                          <td className="py-2 px-3">{m.saved_by_backend ? "да" : "нет"}</td>
                          <td className="py-2 px-3">{m.used ? "да" : "нет"}</td>
                          <td className="py-2 px-3 text-xs text-[rgb(var(--app-text-muted))]">
                            {m.note ?? "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {query.data.field_catalog.length > 0 ? (
                <div className="mt-6">
                  <h4 className="text-sm font-medium mb-2">Field catalog</h4>
                  <div className="overflow-x-auto rounded-xl border border-[rgb(var(--app-border))]">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b text-[rgb(var(--app-text-muted))]">
                          <th className="py-2 px-2 text-left">HC field</th>
                          <th className="py-2 px-2 text-left">Table</th>
                          <th className="py-2 px-2 text-left">Column</th>
                          <th className="py-2 px-2 text-left">Permissions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.field_catalog.map((row) => (
                          <tr key={row.hc_field} className="border-b border-[rgb(var(--app-border))]/40">
                            <td className="py-1.5 px-2">{row.hc_field}</td>
                            <td className="py-1.5 px-2">{row.target_table ?? "—"}</td>
                            <td className="py-1.5 px-2">{row.target_column ?? "—"}</td>
                            <td className="py-1.5 px-2">
                              {(row.required_permissions ?? []).join(", ") || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </PageSection>
          )}
        </>
      )}
    </div>
  );
}
