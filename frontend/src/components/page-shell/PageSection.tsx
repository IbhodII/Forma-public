import type { ReactNode } from "react";
import { cn } from "../../lib/utils";
import { SectionTitle } from "./SectionTitle";
import { UnifiedCard } from "./UnifiedCard";

export function PageSection({
  id,
  eyebrow,
  title,
  description,
  actions,
  stats,
  children,
  surface = true,
  className,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  description?: string;
  actions?: ReactNode;
  stats?: ReactNode;
  children: ReactNode;
  /** Обёртка в unified-card (false для вложенных вкладок) */
  surface?: boolean;
  className?: string;
}) {
  const head =
    title || eyebrow || description || actions ? (
      <header
        className={cn(
          "page-section__head",
          actions && "page-section__head--row",
          surface && "mb-0",
        )}
      >
        <div className="min-w-0 space-y-1">
          {eyebrow ? <p className="page-section__eyebrow">{eyebrow}</p> : null}
          {title ? <SectionTitle as="h2">{title}</SectionTitle> : null}
          {description ? <p className="section-description">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap gap-2 shrink-0">{actions}</div> : null}
      </header>
    ) : null;

  const body = (
    <>
      {head}
      {stats ? <div className={head ? "mt-4" : undefined}>{stats}</div> : null}
      <div className={head || stats ? "mt-4 min-w-0" : "min-w-0"}>{children}</div>
    </>
  );

  if (!surface) {
    return (
      <section id={id} className={cn("page-section", className)}>
        {body}
      </section>
    );
  }

  return (
    <section id={id} className={cn("page-section", className)}>
      <UnifiedCard variant="panel" className="space-y-0">
        {body}
      </UnifiedCard>
    </section>
  );
}
