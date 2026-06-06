import { Clock, Layers, Play, Settings2 } from "lucide-react";
import { useState } from "react";
import type { StretchingPreset } from "../../../types";

type Props = {
  preset: StretchingPreset;
  estimatedMin?: number;
  selected?: boolean;
  onSelect: () => void;
  onStart: () => void;
  onEdit: () => void;
  onArchive?: () => void;
  onRestore?: () => void;
  onDelete?: () => void;
  archived?: boolean;
};

export function StretchProgramCard({
  preset,
  estimatedMin = 15,
  selected,
  onSelect,
  onStart,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  archived,
}: Props) {
  const [hover, setHover] = useState(false);
  const count = preset.exercise_count ?? 0;

  return (
    <article
      className={[
        "stretch-flow-card stretch-wellness__glass p-5 sm:p-6 cursor-pointer",
        selected ? "ring-2 ring-teal-500/50" : "",
        archived ? "opacity-70" : "",
      ].join(" ")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2 min-w-0">
          <h3 className="text-xl font-semibold text-[hsl(var(--stretch-ink))] tracking-tight">
            {preset.name}
            {archived && (
              <span className="ml-2 text-xs font-normal text-[hsl(var(--stretch-muted))]">архив</span>
            )}
          </h3>
          <div className="flex flex-wrap gap-3 text-sm text-[hsl(var(--stretch-muted))]">
            <span className="inline-flex items-center gap-1.5">
              <Layers className="h-4 w-4" aria-hidden />
              {count} {count === 1 ? "поза" : "позы"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4" aria-hidden />
              ~{estimatedMin} мин
            </span>
          </div>
        </div>
        {!archived && (
          <button
            type="button"
            className={[
              "inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-teal-600 to-teal-500 shadow-lg transition-transform",
              hover || selected ? "scale-[1.02]" : "",
            ].join(" ")}
            onClick={(e) => {
              e.stopPropagation();
              onStart();
            }}
          >
            <Play className="h-4 w-4 fill-current" aria-hidden />
            Начать
          </button>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium bg-white/50 dark:bg-white/10 text-[hsl(var(--stretch-ink))] hover:bg-white/70 transition-colors"
          onClick={onEdit}
        >
          <Settings2 className="h-3.5 w-3.5" aria-hidden />
          Настроить
        </button>
        {onArchive && !archived && (
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-[hsl(var(--stretch-muted))] hover:text-amber-700 transition-colors"
            onClick={onArchive}
          >
            В архив
          </button>
        )}
        {onRestore && archived && (
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-teal-700 dark:text-teal-400"
            onClick={onRestore}
          >
            Восстановить
          </button>
        )}
        {onDelete && (
          <button
            type="button"
            className="rounded-full px-3 py-1.5 text-xs text-red-600/90"
            onClick={onDelete}
          >
            Удалить
          </button>
        )}
      </div>
    </article>
  );
}
