import type { ReactNode } from "react";

/** Маленький «?» с подсказкой при наведении / фокусе. */
export function MetricHelp({ hint, lines }: { hint: string; lines?: string[] }) {
  const title = lines?.length ? `${hint}\n\n${lines.join("\n")}` : hint;
  return (
    <span
      title={title}
      className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-200/90 text-[10px] font-bold leading-none text-slate-600 cursor-help hover:bg-slate-300 touch-manipulation"
      aria-label={title}
      role="img"
    >
      ?
    </span>
  );
}

/** Заголовок раздела + «?» и короткая подпись снизу. */
export function AnalyticsSectionHeader({
  title,
  hint,
  description,
  actions,
}: {
  title: string;
  hint: string;
  description: string;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-slate-800 inline-flex items-center gap-2">
          {title}
          <MetricHelp hint={hint} />
        </h3>
        {actions}
      </div>
      <p className="text-sm text-slate-500 leading-snug max-w-3xl">{description}</p>
    </div>
  );
}
