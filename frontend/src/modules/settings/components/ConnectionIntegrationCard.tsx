import { Link } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import type { ConnectionTone } from "../hooks/useConnectionsStatus";
import { formatSyncTimeShort } from "../../../pages/Home/dashboard/utils";

function badgeClass(tone: ConnectionTone): string {
  if (tone === "ok") return "settings-integration-card__badge settings-integration-card__badge--ok";
  if (tone === "warn") return "settings-integration-card__badge settings-integration-card__badge--warn";
  if (tone === "future") return "settings-integration-card__badge settings-integration-card__badge--future";
  return "settings-integration-card__badge settings-integration-card__badge--idle";
}

export function ConnectionIntegrationCard({
  name,
  description,
  icon: Icon,
  chip,
  tone,
  lastSync,
  meta,
  configureLabel = "Настроить",
  onConfigure,
  configureTo,
  external,
}: {
  name: string;
  description: string;
  icon: LucideIcon;
  chip: string;
  tone: ConnectionTone;
  lastSync?: string | null;
  meta: string;
  configureLabel?: string;
  onConfigure?: () => void;
  configureTo?: string;
  external?: boolean;
}) {
  const ConfigureBtn =
    configureTo != null ? (
      external ? (
        <a href={configureTo} className="btn-secondary text-xs w-full sm:w-auto">
          {configureLabel}
        </a>
      ) : (
        <Link to={configureTo} className="btn-secondary text-xs w-full sm:w-auto">
          {configureLabel}
        </Link>
      )
    ) : (
      <button type="button" className="btn-secondary text-xs w-full sm:w-auto" onClick={onConfigure}>
        {configureLabel}
      </button>
    );

  return (
    <article className="settings-integration-card">
      <div className="settings-integration-card__head">
        <div className="flex items-start gap-2.5 min-w-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--app-accent)/0.12)] text-[rgb(var(--app-accent))]">
            <Icon className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <h3 className="settings-integration-card__name">{name}</h3>
            <p className="text-xs text-[rgb(var(--app-text-muted))] mt-0.5 leading-snug">{description}</p>
          </div>
        </div>
        <span className={badgeClass(tone)}>{chip}</span>
      </div>
      <div className="settings-integration-card__meta">
        <p>{meta}</p>
        {lastSync ? <p>Последняя синхронизация: {formatSyncTimeShort(lastSync)}</p> : null}
      </div>
      {ConfigureBtn}
    </article>
  );
}
