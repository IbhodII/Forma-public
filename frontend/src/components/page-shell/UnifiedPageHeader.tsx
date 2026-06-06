import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { cn } from "../../lib/utils";

export type PageBreadcrumb = { label: string; to?: string };

export function UnifiedPageHeader({
  eyebrow,
  title,
  subtitle,
  description,
  icon: Icon,
  actions,
  stats,
  breadcrumbs,
  toolbar,
  sticky = false,
  variant = "hero",
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  description?: string;
  icon?: LucideIcon;
  actions?: ReactNode;
  stats?: ReactNode;
  breadcrumbs?: PageBreadcrumb[];
  toolbar?: ReactNode;
  sticky?: boolean;
  variant?: "hero" | "minimal";
  className?: string;
}) {
  const lead = subtitle ?? description;

  return (
    <header
      className={cn(
        "app-page-header",
        variant === "minimal" && "app-page-header--minimal",
        sticky && variant !== "minimal" && "app-page-header--sticky",
        className,
      )}
    >
      {variant === "hero" ? <div className="app-page-header__glow" aria-hidden /> : null}

      <div className="relative space-y-4">
        {breadcrumbs?.length ? (
          <nav className="app-page-header__breadcrumbs" aria-label="Навигация">
            {breadcrumbs.map((crumb, i) => (
              <span key={`${crumb.label}-${i}`} className="inline-flex items-center gap-1.5">
                {i > 0 ? <span aria-hidden>/</span> : null}
                {crumb.to ? (
                  <Link to={crumb.to}>{crumb.label}</Link>
                ) : (
                  <span>{crumb.label}</span>
                )}
              </span>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="app-page-header__title-row">
              {Icon ? (
                <span className="app-page-header__icon" aria-hidden>
                  <Icon className="h-5 w-5" />
                </span>
              ) : null}
              <div className="min-w-0">
                {eyebrow ? <p className="app-page-header__eyebrow mb-1.5">{eyebrow}</p> : null}
                <h1 className="app-page-header__title">{title}</h1>
              </div>
            </div>
            {lead ? <p className="app-page-header__subtitle">{lead}</p> : null}
          </div>
          {actions ? <div className="app-page-header__actions">{actions}</div> : null}
        </div>

        {toolbar ? <div className="min-w-0">{toolbar}</div> : null}
        {stats ? <div className="app-page-header__stats">{stats}</div> : null}
      </div>
    </header>
  );
}
