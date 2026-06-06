type Tab = { id: string; label: string };

type Props = {
  tabs: readonly Tab[];
  activeId: string;
  onChange: (id: string) => void;
};

export function StretchNav({ tabs, activeId, onChange }: Props) {
  return (
    <nav
      className="stretch-wellness__glass rounded-2xl p-1.5 flex gap-1 overflow-x-auto scrollbar-none"
      aria-label="Разделы растяжки"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={[
              "flex-1 min-w-[5.5rem] rounded-xl px-3 sm:px-4 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap min-h-[44px]",
              active
                ? "bg-white dark:bg-teal-900/50 text-teal-800 dark:text-teal-100 shadow-sm"
                : "text-[hsl(var(--stretch-muted))] hover:text-[hsl(var(--stretch-ink))] hover:bg-white/40",
            ].join(" ")}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
