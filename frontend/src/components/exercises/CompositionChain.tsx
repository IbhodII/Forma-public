import { GripVertical, Plus, X } from "lucide-react";
import { useState } from "react";
import { cn } from "../../lib/utils";

/** Визуальная цепочка упражнений (круг / порядок выполнения). */
export function CompositionChain({
  exercises,
  onRemove,
  onReorder,
  onGoCatalog,
}: {
  exercises: string[];
  onRemove: (name: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onGoCatalog: () => void;
}) {
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  const finishDrag = () => {
    setDragIdx(null);
    setOverIdx(null);
  };

  const handleDrop = (toIdx: number) => {
    if (dragIdx !== null && dragIdx !== toIdx) {
      onReorder(dragIdx, toIdx);
    }
    finishDrag();
  };

  if (!exercises.length) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[rgb(var(--app-border))] p-8 text-center">
        <p className="text-sm font-medium text-[rgb(var(--app-text))]">Соберите порядок упражнений</p>
        <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1 max-w-sm mx-auto">
          Добавьте шаги из каталога — они отобразятся цепочкой, как раунды круговой тренировки.
        </p>
        <button type="button" className="btn-primary mt-4 inline-flex items-center gap-2" onClick={onGoCatalog}>
          <Plus className="h-4 w-4" />
          Открыть каталог
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        {exercises.map((ex, idx) => {
          const dragging = dragIdx === idx;
          const dropTarget = overIdx === idx && dragIdx !== null && dragIdx !== idx;
          return (
            <div key={`${idx}-${ex}`} className="flex items-center gap-1">
              {idx > 0 ? (
                <span className="text-[rgb(var(--app-text-muted))] text-lg px-0.5" aria-hidden>
                  →
                </span>
              ) : null}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setOverIdx(idx);
                }}
                onDragLeave={() => {
                  if (overIdx === idx) setOverIdx(null);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  handleDrop(idx);
                }}
                className={cn(
                  "group inline-flex items-center gap-1.5 rounded-xl border pl-1.5 pr-2 py-1.5 text-sm font-medium transition-all",
                  "bg-[rgb(var(--app-surface))] border-[rgb(var(--app-border)/0.8)]",
                  dragging && "opacity-40",
                  dropTarget && "ring-2 ring-[rgb(var(--app-accent)/0.4)] scale-[1.02]",
                )}
              >
                <button
                  type="button"
                  draggable
                  title="Перетащить"
                  onDragStart={(e) => {
                    setDragIdx(idx);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragEnd={finishDrag}
                  className="p-1 rounded-lg text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-subtab-hover))] cursor-grab active:cursor-grabbing touch-none"
                >
                  <GripVertical className="h-4 w-4" />
                </button>
                <span className="tabular-nums text-xs text-[rgb(var(--app-accent))] font-bold w-5">
                  {idx + 1}
                </span>
                <span className="max-w-[10rem] sm:max-w-[14rem] truncate" title={ex}>
                  {ex}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(ex)}
                  className="p-0.5 rounded-md opacity-60 hover:opacity-100 hover:bg-rose-500/15 text-rose-600"
                  aria-label={`Убрать ${ex}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        {exercises.length} шаг{exercises.length === 1 ? "" : exercises.length < 5 ? "а" : "ов"} · перетащите для
        изменения порядка
      </p>
    </div>
  );
}
