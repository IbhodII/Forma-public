import type { ReactNode } from "react";
import { Loader } from "../../../components/Loader";
import { MetricHelp } from "./MetricHelp";

/**
 * Подблок внутри секции (variant nested) или самостоятельная карточка (panel).
 * Заголовок всегда внутри визуальной рамки блока.
 */
export function AnalyticsCard({
  title,
  hint,
  description,
  actions,
  isLoading,
  loadingLabel,
  isEmpty,
  emptyMessage,
  children,
  className = "",
  variant = "panel",
}: {
  title: string;
  hint?: string;
  description?: string;
  actions?: ReactNode;
  isLoading?: boolean;
  loadingLabel?: string;
  isEmpty?: boolean;
  emptyMessage?: string;
  children?: ReactNode;
  className?: string;
  variant?: "panel" | "nested" | "flat";
}) {
  if (variant === "flat") {
    return (
      <section className={`min-w-0 space-y-3 ${className}`}>
        <BlockHeader title={title} hint={hint} description={description} actions={actions} nested />
        {isLoading ? (
          <Loader label={loadingLabel ?? "Загрузка…"} />
        ) : isEmpty ? (
          <p className="text-sm text-slate-500 py-6 text-center">{emptyMessage ?? "Нет данных"}</p>
        ) : (
          children
        )}
      </section>
    );
  }

  const shell =
    variant === "nested"
      ? "analytics-nested-block analytics-widget"
      : "card-panel analytics-panel analytics-widget min-w-0 overflow-hidden";

  return (
    <section className={`${shell} ${className}`}>
      <header className="analytics-panel__head">
        <BlockHeader
          title={title}
          hint={hint}
          description={description}
          actions={actions}
          nested={variant === "nested"}
        />
      </header>

      {isLoading ? (
        <Loader label={loadingLabel ?? "Загрузка…"} />
      ) : isEmpty ? (
        <p className="text-sm text-slate-500 py-6 text-center">{emptyMessage ?? "Нет данных"}</p>
      ) : (
        <div className={variant === "nested" ? "analytics-nested-block__body" : "analytics-panel__body"}>
          {children}
        </div>
      )}
    </section>
  );
}

function BlockHeader({
  title,
  hint,
  description,
  actions,
  nested,
}: {
  title: string;
  hint?: string;
  description?: string;
  actions?: ReactNode;
  nested?: boolean;
}) {
  return (
    <div className="space-y-1 min-w-0">
      <div className="analytics-panel__head-row">
        <h3
          className={`analytics-panel__title min-w-0 flex-1 inline-flex items-center gap-2 ${
            nested ? "analytics-panel__title--nested" : ""
          }`}
        >
          <span className="truncate">{title}</span>
          {hint ? <MetricHelp hint={hint} /> : null}
        </h3>
        {actions ? <div className="analytics-block-actions">{actions}</div> : null}
      </div>
      {description ? (
        <p className={`analytics-panel__desc ${nested ? "analytics-panel__desc--nested" : ""}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
