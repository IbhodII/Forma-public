import { Link } from "react-router-dom";
import { Settings, Smartphone } from "lucide-react";
import type { HealthConnectHubOverview } from "../../../../api/sync";
import {
  BODY_TAB_HEALTH_CONNECT,
} from "../../bodyHubConstants";
import {
  formatSyncLabel,
  hcSyncStatusLabel,
  permissionsSummary,
} from "./bodyOverviewUtils";

export function BodyOverviewHcCard({ overview }: { overview: HealthConnectHubOverview }) {
  const { granted, total, entries } = permissionsSummary(overview.permissions);
  const statusTone =
    overview.sync_status === "ok"
      ? "ok"
      : overview.sync_status === "no_data"
        ? "muted"
        : "warn";

  return (
    <section className="body-overview-hc body-overview__span-8">
      <div className="body-overview-hc__head">
        <div className="flex items-center gap-2">
          <Smartphone className="h-5 w-5 text-[rgb(var(--app-accent))]" />
          <h3 className="body-overview-hc__title">Health Connect</h3>
        </div>
        <span className={`body-overview-hc__status body-overview-hc__status--${statusTone}`}>
          {hcSyncStatusLabel(overview.sync_status)}
        </span>
      </div>

      <div className="body-overview-hc__grid">
        <div>
          <p className="body-overview-hc__item-label">Последняя синхронизация</p>
          <p className="body-overview-hc__item-value">{formatSyncLabel(overview.last_sync_at)}</p>
        </div>
        <div>
          <p className="body-overview-hc__item-label">Устройство</p>
          <p className="body-overview-hc__item-value">
            {overview.device_label?.trim() || "Мобильное приложение Forma"}
          </p>
        </div>
        <div>
          <p className="body-overview-hc__item-label">Разрешения</p>
          <p className="body-overview-hc__item-value">
            {total > 0 ? `${granted} из ${total} активны` : "Не настроены"}
          </p>
        </div>
        <div>
          <p className="body-overview-hc__item-label">Пакет данных</p>
          <p className="body-overview-hc__item-value tabular-nums">
            {overview.saved_days_in_batch}/{overview.days_in_batch} дней
          </p>
        </div>
      </div>

      {entries.length > 0 ? (
        <div className="body-overview-hc__perms">
          {entries.slice(0, 8).map(([key, ok]) => (
            <span
              key={key}
              className={`body-overview-hc__perm ${ok ? "body-overview-hc__perm--ok" : "body-overview-hc__perm--no"}`}
            >
              {key}
            </span>
          ))}
        </div>
      ) : null}

      {!overview.last_sync_at ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
          Откройте Forma на телефоне и выполните синхронизацию Health Connect — шаги, сон и пульс
          появятся здесь автоматически.
        </p>
      ) : null}

      <div className="body-overview-hc__actions">
        <Link to={`/body?tab=${BODY_TAB_HEALTH_CONNECT}`} className="btn-primary text-sm">
          Открыть статус
        </Link>
        <Link to="/settings?tab=connections" className="btn-secondary text-sm inline-flex items-center gap-1.5">
          <Settings className="h-4 w-4" />
          Настройки
        </Link>
      </div>
    </section>
  );
}
