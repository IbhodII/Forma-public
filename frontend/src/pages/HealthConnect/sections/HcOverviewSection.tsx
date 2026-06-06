import type { HealthConnectHubOverview } from "../../../api/sync";
import { HeroStatsRow } from "../../../components/page-shell";
import { KpiCard } from "../../../components/ui/kpi-card";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { HcWarningBanner } from "../components/HcWarningBanner";

const STATUS_LABELS: Record<string, string> = {
  ok: "OK",
  partial: "Partial",
  no_data: "Нет данных",
  stale: "Устарело",
};

function formatSyncTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return iso.slice(0, 16).replace("T", " ");
}

export function HcOverviewSection({
  overview,
  embedded = false,
}: {
  overview: HealthConnectHubOverview;
  embedded?: boolean;
}) {
  const permEntries = Object.entries(overview.permissions ?? {});
  const missingPerms = permEntries.filter(([, ok]) => ok === false).map(([k]) => k);

  return (
    <HcSectionFrame
      id="hc-overview"
      embedded={embedded}
      eyebrow="Overview"
      title={embedded ? "Синхронизация Health Connect" : "Health Connect"}
      description="Данные с мобильного приложения. Desktop только просмотр — sync выполняется на телефоне."
      stats={
        <HeroStatsRow>
          <KpiCard
            label="Последняя синхронизация"
            value={formatSyncTime(overview.last_sync_at)}
            sub={overview.device_label ?? "—"}
          />
          <KpiCard
            label="Статус"
            value={STATUS_LABELS[overview.sync_status] ?? overview.sync_status}
            sub={`${overview.saved_days_in_batch}/${overview.days_in_batch} дней в пакете`}
          />
          <KpiCard
            label="Импортировано"
            value={overview.imported_records}
            sub="полей в последнем пакете"
          />
          <KpiCard
            label="Пропущено"
            value={overview.skipped_records}
            sub={missingPerms.length ? `нет прав: ${missingPerms.join(", ")}` : "в последнем пакете"}
          />
        </HeroStatsRow>
      }
    >
      <HcWarningBanner warnings={overview.warnings} />
      {permEntries.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2 text-xs">
          {permEntries.map(([key, ok]) => (
            <li
              key={key}
              className={`rounded-full px-2 py-0.5 font-medium ${
                ok
                  ? "bg-emerald-500/10 text-emerald-800 dark:text-emerald-200"
                  : "bg-amber-500/10 text-amber-800 dark:text-amber-200"
              }`}
            >
              {key}: {ok ? "да" : "нет"}
            </li>
          ))}
        </ul>
      ) : null}
      {!overview.last_sync_at ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Синхронизаций пока не было. Откройте мобильное приложение → Health Connect → Sync.
        </p>
      ) : null}
    </HcSectionFrame>
  );
}
