import { useMemo } from "react";
import type { StrengthHrSetMetrics } from "../../../types";
import type {
  BlockKind,
  StrengthHrEditableBlock,
  StrengthHrEditorAction,
} from "../../../types/strengthHrEditor";
import { confidenceReasonLabel } from "../../../types/strengthHrEditor";
import { findDuplicateSetAssignments } from "../../../utils/strengthHrBlockMetrics";
import { cn } from "../../../lib/utils";

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function setOptionLabel(s: StrengthHrSetMetrics): string {
  const warm = s.is_warmup ? " · разминка" : "";
  return `${s.exercise} · #${s.set_number} · ${s.load_display}${warm}`;
}

export function StrengthHrBlockInspector({
  block,
  blocks,
  sets,
  splitMode,
  onDispatch,
}: {
  block: StrengthHrEditableBlock | null;
  blocks: StrengthHrEditableBlock[];
  sets: StrengthHrSetMetrics[] | null | undefined;
  splitMode: boolean;
  onDispatch: (action: StrengthHrEditorAction) => void;
}) {
  const safeSets = sets ?? [];
  const setOptions = useMemo(
    () => [...safeSets].sort((a, b) => a.order_index - b.order_index),
    [safeSets],
  );

  const sorted = useMemo(
    () => [...blocks].sort((a, b) => a.start_sec - b.start_sec),
    [blocks],
  );

  const blockIdx = block ? sorted.findIndex((b) => b.block_id === block.block_id) : -1;
  const hasPrev = blockIdx > 0;
  const hasNext = blockIdx >= 0 && blockIdx < sorted.length - 1;

  const dupes = useMemo(() => findDuplicateSetAssignments(blocks), [blocks]);
  const duplicateWarning =
    block?.assigned_order_index != null && dupes.includes(block.assigned_order_index);

  if (!block) {
    return (
      <div className="rounded-lg border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface))] p-2 text-[11px] text-[rgb(var(--app-text-muted))]">
        {splitMode
          ? "Выберите блок и кликните на графике, чтобы разделить."
          : "Кликните блок на графике для просмотра деталей."}
      </div>
    );
  }

  if (
    !Number.isFinite(block.start_sec) ||
    !Number.isFinite(block.end_sec) ||
    block.end_sec <= block.start_sec
  ) {
    return (
      <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 dark:bg-amber-950/30 p-2 text-[11px] text-amber-900 dark:text-amber-100">
        Блок с некорректными границами — выберите другой блок или сбросьте разметку.
      </div>
    );
  }

  const kindLabel =
    block.kind === "rest"
      ? "Отдых"
      : block.kind === "noise"
        ? "Шум"
        : block.is_warmup
          ? "Разминка (подход)"
          : "Подход";

  return (
    <div className="rounded-lg border border-[rgb(var(--app-border)/0.4)] bg-[rgb(var(--app-surface))] p-2 space-y-2 text-[11px]">
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">Блок #{block.block_index}</span>
        <span className="text-[10px] text-[rgb(var(--app-text-muted))]">{kindLabel}</span>
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-1 tabular-nums">
        <dt className="text-[rgb(var(--app-text-muted))]">Время</dt>
        <dd>
          {fmtSec(block.start_sec)}–{fmtSec(block.end_sec)} ({block.duration_sec ?? block.end_sec - block.start_sec} с)
        </dd>
        <dt className="text-[rgb(var(--app-text-muted))]">Пик / Сред. / Мин.</dt>
        <dd>
          {block.peak_hr ?? "—"} / {block.avg_hr ?? "—"} / {block.min_hr ?? "—"}
        </dd>
        <dt className="text-[rgb(var(--app-text-muted))]">Восстановление</dt>
        <dd>{block.recovery_drop != null ? `−${block.recovery_drop} bpm` : "—"}</dd>
        <dt className="text-[rgb(var(--app-text-muted))]">Точность</dt>
        <dd>
          {block.confidence} · {confidenceReasonLabel(block.confidence_reason)}
        </dd>
      </dl>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Тип
        </label>
        <KindSelect
          kind={block.kind}
          onChange={(kind) => onDispatch({ type: "setKind", blockId: block.block_id, kind })}
        />
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Подход
        </label>
        <select
          className="w-full rounded border px-1.5 py-1 text-[11px]"
          disabled={block.kind !== "set"}
          value={block.assigned_order_index ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onDispatch({
              type: "assignSet",
              blockId: block.block_id,
              orderIndex: v === "" ? null : Number(v),
            });
          }}
        >
          <option value="">не привязан</option>
          {setOptions.map((s) => (
            <option key={s.order_index} value={s.order_index}>
              {setOptionLabel(s)}
            </option>
          ))}
        </select>
        {duplicateWarning ? (
          <p className="text-[10px] text-amber-800 dark:text-amber-200">
            Этот подход уже назначен другому блоку.
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1 pt-1">
        <ActionBtn
          disabled={!hasPrev}
          onClick={() => onDispatch({ type: "mergeWithPrevious", blockId: block.block_id })}
        >
          ← Объединить
        </ActionBtn>
        <ActionBtn
          disabled={!hasNext}
          onClick={() => onDispatch({ type: "mergeWithNext", blockId: block.block_id })}
        >
          Объединить →
        </ActionBtn>
        <ActionBtn onClick={() => onDispatch({ type: "setKind", blockId: block.block_id, kind: "rest" })}>
          Отдых
        </ActionBtn>
        <ActionBtn onClick={() => onDispatch({ type: "setKind", blockId: block.block_id, kind: "noise" })}>
          Шум
        </ActionBtn>
      </div>

      {splitMode ? (
        <p className="text-[10px] text-[rgb(var(--app-accent))]">Кликните на графике внутри блока для разделения.</p>
      ) : null}
    </div>
  );
}

function ActionBtn({
  children,
  disabled,
  onClick,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={cn(
        "rounded border border-[rgb(var(--app-border)/0.5)] px-1.5 py-0.5 text-[10px]",
        "disabled:opacity-40 hover:bg-[rgb(var(--app-surface-subtle))]",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function KindSelect({
  kind,
  onChange,
}: {
  kind: BlockKind;
  onChange: (k: BlockKind) => void;
}) {
  return (
    <select
      className="w-full rounded border px-1.5 py-1 text-[11px]"
      value={kind}
      onChange={(e) => onChange(e.target.value as BlockKind)}
    >
      <option value="set">Подход</option>
      <option value="rest">Отдых</option>
      <option value="noise">Шум</option>
    </select>
  );
}
