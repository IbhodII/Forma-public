import { Link } from "react-router-dom";
import {
  AlertTriangle,
  Cloud,
  HeartPulse,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import type { useDashboardHome } from "../../../hooks/useDashboardHome";
import { parseApiError } from "../../../utils/validation";
import { DashboardPanel, DashboardPanelSkeleton } from "./DashboardShell";
import { dashboardEmpty } from "./emptyCopy";
import { formatSyncTimeShort } from "./utils";

type DashboardHome = ReturnType<typeof useDashboardHome>;

type Tone = "ok" | "warn" | "off";

function IntegrationCard({
  to,
  name,
  meta,
  chip,
  tone,
  icon,
}: {
  to: string;
  name: string;
  meta: string;
  chip: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  const chipClass =
    tone === "ok"
      ? "dashboard-chip dashboard-chip--ok"
      : tone === "warn"
        ? "dashboard-chip dashboard-chip--warn"
        : "dashboard-chip dashboard-chip--off";

  return (
    <Link to={to} className="dashboard-integration-card">
      <span className="dashboard-integration-card__icon" aria-hidden>
        {icon}
      </span>
      <span className="dashboard-integration-card__body">
        <span className="dashboard-integration-card__name">{name}</span>
        <span className="dashboard-integration-card__meta">{meta}</span>
      </span>
      <span className={chipClass}>{chip}</span>
    </Link>
  );
}

export function DashboardStatusPanel({ data }: { data: DashboardHome }) {
  if (data.dashboard.isLoading) {
    return <DashboardPanelSkeleton rows={6} />;
  }

  const hcSnap = data.hcSnapshot.data;
  const hub = data.healthConnect.data;
  const overview = hub?.overview;
  const warnings = overview?.warnings ?? hcSnap?.warnings ?? [];
  const lastSync = overview?.last_sync_at ?? hcSnap?.last_sync_at ?? null;
  const syncStatus = overview?.sync_status ?? hcSnap?.sync_status;
  const hcStale =
    syncStatus === "stale" ||
    syncStatus === "partial" ||
    syncStatus === "no_data" ||
    Boolean(hcSnap?.stale) ||
    (hub?.steps && "stale" in hub.steps && hub.steps.stale) ||
    warnings.some((w) => w.includes("permission"));
  const hcOk = Boolean(lastSync) && !hcStale;
  const hcMeta = data.dashboard.isError
    ? parseApiError(data.dashboard.error)
    : !lastSync
      ? dashboardEmpty.waitingPhoneSync
      : `Обновлено ${formatSyncTimeShort(lastSync)}`;
  const hcChip = hcOk ? "OK" : hcStale ? "Внимание" : "Нет данных";

  const polarOk = Boolean(data.polar.data?.connected);
  const cloudOk = Boolean(data.cloud.data?.connected);
  const forma = data.formaSync.data;
  const conflictCount = forma?.conflict_count ?? 0;
  const pendingChanges = forma?.pending_changes ?? 0;
  const formaOk =
    Boolean(forma?.yandex_connected) &&
    !forma?.last_error &&
    !forma?.baseline_required &&
    conflictCount === 0 &&
    pendingChanges === 0;

  let formaChip = "Выкл";
  let formaMeta = "Подключите Яндекс.Диск";
  let formaTone: Tone = "off";
  if (forma?.yandex_connected) {
    if (forma.baseline_required) {
      formaChip = "Старт";
      formaMeta = "Первичная выгрузка";
      formaTone = "warn";
    } else if (conflictCount > 0) {
      formaChip = `${conflictCount} конфл.`;
      formaMeta = "Нужно разрешить";
      formaTone = "warn";
    } else if (pendingChanges > 0) {
      formaChip = `${pendingChanges} в очереди`;
      formaMeta = "Ожидает отправки";
      formaTone = "warn";
    } else if (forma.last_upload_at) {
      formaChip = "OK";
      formaMeta = `Отправка ${formatSyncTimeShort(forma.last_upload_at)}`;
      formaTone = "ok";
    } else {
      formaChip = "OK";
      formaMeta = "Облако подключено";
      formaTone = "ok";
    }
  }

  const pendingImport =
    pendingChanges > 0 ||
    warnings.some((w) => w.includes("import") || w.includes("pending"));

  const alerts: React.ReactNode[] = [];

  if (conflictCount > 0) {
    alerts.push(
      <div key="conflict" className="dashboard-alert dashboard-alert--warn">
        <span className="flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <span>
            {conflictCount} конфликт{conflictCount > 1 ? "а" : ""} данных FormaSync
          </span>
        </span>
        <Link to="/settings?tab=sync" className="dashboard-alert__action">
          Разрешить
        </Link>
      </div>,
    );
  }

  if (pendingImport) {
    alerts.push(
      <div key="import" className="dashboard-alert dashboard-alert--info">
        <span>{dashboardEmpty.pendingImport}</span>
        <Link to="/settings?tab=data" className="dashboard-alert__action">
          Импорт
        </Link>
      </div>,
    );
  }

  if (forma?.baseline_required) {
    alerts.push(
      <div key="baseline" className="dashboard-alert dashboard-alert--info">
        <span>Нужна первичная выгрузка в облако</span>
        <Link to="/settings?tab=sync" className="dashboard-alert__action">
          Настроить
        </Link>
      </div>,
    );
  }

  if (hcStale && lastSync) {
    alerts.push(
      <div key="hc-stale" className="dashboard-alert dashboard-alert--warn">
        <span>Health Connect: данные устарели. Синхронизируйте с телефона.</span>
        <Link to="/body?tab=health-connect" className="dashboard-alert__action">
          Открыть
        </Link>
      </div>,
    );
  }

  return (
    <DashboardPanel
      title="Интеграции"
      eyebrow="Синхронизация"
      action={
        <Link
          to="/settings?tab=sync_cloud"
          className="text-[11px] font-semibold text-[rgb(var(--app-accent))] hover:underline"
        >
          Настройки
        </Link>
      }
    >
      <div className="dashboard-integrations">
        <IntegrationCard
          to="/body?tab=health-connect"
          name="Health Connect"
          meta={hcMeta}
          chip={hcChip}
          tone={data.dashboard.isError ? "warn" : hcOk ? "ok" : hcStale ? "warn" : "off"}
          icon={<Smartphone className="h-5 w-5" />}
        />
        <IntegrationCard
          to="/settings?tab=connections&panel=polar"
          name="Polar Flow"
          meta={polarOk ? "Подключён" : "Не настроен"}
          chip={polarOk ? "OK" : "—"}
          tone={polarOk ? "ok" : "off"}
          icon={<HeartPulse className="h-4 w-4" />}
        />
        <IntegrationCard
          to="/settings?tab=connections&panel=yandex"
          name="Яндекс.Диск"
          meta={cloudOk ? "Резерв и OAuth" : "Не подключён"}
          chip={cloudOk ? "OK" : "—"}
          tone={cloudOk ? "ok" : "off"}
          icon={<Cloud className="h-5 w-5" />}
        />
        <IntegrationCard
          to="/settings?tab=sync"
          name="FormaSync"
          meta={formaMeta}
          chip={formaChip}
          tone={formaOk ? "ok" : formaTone}
          icon={<RefreshCw className="h-5 w-5" />}
        />
      </div>

      {alerts.length > 0 ? <div className="mt-1 space-y-0">{alerts}</div> : null}
    </DashboardPanel>
  );
}
