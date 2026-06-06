/** Горизонтальные подвкладки (тип тренировки / кардио / настройки) */

export interface SubTabItem {
  id: string;
  label: string;
}

interface SubTabsProps {
  items: SubTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export function SubTabs({ items, activeId, onChange, className = "" }: SubTabsProps) {
  return (
    <div className={`subtabs-track overflow-x-auto flex-nowrap md:flex-wrap ${className}`} role="tablist">
      {items.map((item) => {
        const active = item.id === activeId;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.id)}
            className={`${active ? "subtabs-tab-active" : "subtabs-tab"} shrink-0 whitespace-nowrap`}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
