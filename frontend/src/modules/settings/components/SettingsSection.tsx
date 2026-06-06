import type { ReactNode } from "react";

export function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="settings-section">
      <header className="settings-section__head">
        <h2 className="settings-section__title">{title}</h2>
        {description ? <p className="settings-section__desc">{description}</p> : null}
      </header>
      <div className="settings-section__body">{children}</div>
    </section>
  );
}

export function SettingsSubsection({
  id,
  title,
  description,
  children,
}: {
  id?: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div id={id} className="settings-subsection scroll-mt-24">
      <div>
        <h3 className="settings-subsection__title">{title}</h3>
        {description ? <p className="settings-subsection__desc mt-1">{description}</p> : null}
      </div>
      {children}
    </div>
  );
}
