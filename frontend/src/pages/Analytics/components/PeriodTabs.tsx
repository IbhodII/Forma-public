export function PeriodTabs<T extends string>({
  value,
  options,
  onChange,
  variant = "default",
}: {
  value: T;
  options: readonly { id: T; label: string }[];
  onChange: (id: T) => void;
  variant?: "default" | "segmented";
}) {
  if (variant === "segmented") {
    return (
      <div className="subtabs-track inline-flex" role="tablist">
        {options.map((opt) => (
          <button
            key={opt.id}
            type="button"
            role="tab"
            aria-selected={value === opt.id}
            onClick={() => onChange(opt.id)}
            className={value === opt.id ? "subtabs-tab-active min-h-9" : "subtabs-tab min-h-9"}
          >
            {opt.label}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5 p-1 rounded-xl bg-slate-100/90 dark:bg-slate-800/80 border border-slate-200/60 dark:border-slate-700/60" role="tablist">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="tab"
          aria-selected={value === opt.id}
          onClick={() => onChange(opt.id)}
          className={`min-h-9 px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
            value === opt.id
              ? "bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-50 shadow-sm"
              : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
