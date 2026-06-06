import type { ReactNode } from "react";

export function BodySection({
  id,
  title,
  description,
  actions,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const sectionClass =
    id === "body-history" ? "body-section body-section--history" : "body-section";

  return (
    <section id={id} className={sectionClass}>
      <div className="body-panel">
        <header className="body-panel__head">
          <div className="body-panel__head-row">
            <h2 className="body-panel__title min-w-0 flex-1">{title}</h2>
            {actions ? <div className="body-panel__actions">{actions}</div> : null}
          </div>
          {description ? <p className="body-panel__desc">{description}</p> : null}
        </header>
        <div className="body-panel__body">{children}</div>
      </div>
    </section>
  );
}
