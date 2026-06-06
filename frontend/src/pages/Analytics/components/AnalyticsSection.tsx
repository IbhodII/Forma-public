import type { ReactNode, Ref } from "react";
import { UnifiedCard } from "../../../components/page-shell/UnifiedCard";
import { MetricHelp } from "./MetricHelp";

/** Крупная секция страницы: заголовок и контент внутри одной card-panel. */
export function AnalyticsSection({
  id,
  title,
  description,
  hint,
  actions,
  children,
  className = "",
  sectionRef,
}: {
  id: string;
  title: string;
  description?: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  sectionRef?: Ref<HTMLElement>;
}) {
  return (
    <section
      id={id}
      ref={sectionRef}
      data-analytics-section={id}
      className={`analytics-section ${className}`.trim()}
    >
      <UnifiedCard variant="panel" className="analytics-panel min-w-0 overflow-hidden">
        <header className="analytics-panel__head">
          <div className="analytics-panel__head-row">
            <h2 className="analytics-panel__title min-w-0 flex-1">
              <span className="truncate">{title}</span>
              {hint ? <MetricHelp hint={hint} /> : null}
            </h2>
            {actions ? <div className="analytics-block-actions">{actions}</div> : null}
          </div>
          {description ? (
            <p className="analytics-panel__desc">{description}</p>
          ) : null}
        </header>
        <div className="analytics-panel__body">{children}</div>
      </UnifiedCard>
    </section>
  );
}
