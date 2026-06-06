import { cn } from "../../lib/utils";

export type AppPageNavItem = { id: string; label: string; href?: string };

export function AppPageNav({
  items,
  activeId,
  onSelect,
  ariaLabel,
}: {
  items: AppPageNavItem[];
  activeId: string;
  onSelect?: (id: string) => void;
  ariaLabel: string;
}) {
  return (
    <nav className="app-page-nav" aria-label={ariaLabel}>
      {items.map((item) => {
        const active = activeId === item.id;
        const className = `app-page-nav__link${active ? " app-page-nav__link--active" : ""}`;
        if (item.href) {
          return (
            <a
              key={item.id}
              href={item.href}
              className={className}
              onClick={() => onSelect?.(item.id)}
            >
              {item.label}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            className={cn(className)}
            onClick={() => onSelect?.(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
