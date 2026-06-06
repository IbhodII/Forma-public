import { useState, type ReactNode } from "react";

type Props = {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  embedded?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  description,
  defaultOpen = true,
  embedded = false,
  children,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  if (embedded) {
    return <div className="space-y-4">{children}</div>;
  }

  return (
    <section className="card-panel overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-start justify-between gap-3 px-5 py-4 text-left hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
        aria-expanded={open}
      >
        <div>
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{title}</h3>
          {description && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{description}</p>
          )}
        </div>
        <span
          className={`shrink-0 mt-0.5 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          ▾
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5 pt-4 border-t border-slate-100 dark:border-slate-700/80 space-y-4">
          {children}
        </div>
      )}
    </section>
  );
}
