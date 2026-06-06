import { useMemo, useState } from "react";
import type { StrengthHrSetMetrics } from "../../../types";
import type {
  BlockKind,
  StrengthHrEditableBlock,
  StrengthHrEditorAction,
} from "../../../types/strengthHrEditor";
import { cn } from "../../../lib/utils";
import { defaultSplitSec } from "../../../utils/strengthHrBlockMetrics";
import { HR_MANUAL_OVERRIDE_DISCLAIMER } from "./StrengthHrBySetPanel";

function fmtSec(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function setOptionLabel(s: StrengthHrSetMetrics): string {
  const warm = s.is_warmup ? " · разминка" : "";
  return `${s.exercise} · ${s.load_display}${warm}`;
}

export function StrengthHrBlockEditorPanel({
  blocks,
  sets,
  warnings,
  dirty,
  saving,
  embedded = false,
  onDispatch,
  onSave,
  onCancel,
  onResetAuto,
}: {
  blocks: StrengthHrEditableBlock[];
  sets: StrengthHrSetMetrics[];
  warnings?: string[];
  dirty?: boolean;
  saving?: boolean;
  /** Hide toolbar when graph editor provides its own controls */
  embedded?: boolean;
  onDispatch: (action: StrengthHrEditorAction) => void;
  onSave?: () => void;
  onCancel?: () => void;
  onResetAuto?: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [splitSecByBlock, setSplitSecByBlock] = useState<Record<number, number>>({});

  const setOptions = useMemo(
    () => [...sets].sort((a, b) => a.order_index - b.order_index),
    [sets],
  );

  const toggleSelect = (blockId: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(blockId)) next.delete(blockId);
      else next.add(blockId);
      return next;
    });
  };

  const mergeSelected = () => {
    if (selected.size < 2) return;
    onDispatch({ type: "mergeBlocks", blockIds: [...selected] });
    setSelected(new Set());
  };

  return (
    <details
      className={cn(
        "rounded-lg border border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface))]",
        embedded ? "p-0" : "p-2 space-y-2",
      )}
      open={!embedded ? undefined : false}
    >
      <summary className={cn("cursor-pointer text-xs font-medium px-2 py-1.5", embedded && "list-none [&::-webkit-details-marker]:hidden")}>
        {embedded ? "▸ Таблица блоков" : "Редактор блоков"}
      </summary>
      <div className={cn("space-y-2", embedded ? "p-2 pt-0" : "")}>
      {!embedded ? (
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={saving || !dirty}
          className="rounded-md bg-[rgb(var(--app-accent))] px-2.5 py-1 text-xs font-medium text-white disabled:opacity-40"
          onClick={onSave}
        >
          Сохранить
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2.5 py-1 text-xs"
          onClick={onCancel}
        >
          Отменить
        </button>
        <button
          type="button"
          disabled={saving}
          className="rounded-md border border-[rgb(var(--app-border)/0.5)] px-2.5 py-1 text-xs text-amber-800 dark:text-amber-200"
          onClick={onResetAuto}
        >
          Сбросить
        </button>
        <button
          type="button"
          disabled={selected.size < 2}
          className="ml-auto rounded-md border border-[rgb(var(--app-border)/0.5)] px-2 py-1 text-[11px] disabled:opacity-40"
          onClick={mergeSelected}
        >
          Объединить ({selected.size})
        </button>
      </div>
      ) : null}

      {!embedded ? (
      <p className="text-[11px] text-[rgb(var(--app-text-muted))]">{HR_MANUAL_OVERRIDE_DISCLAIMER}</p>
      ) : null}

      {!embedded && warnings?.length ? (
        <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{warnings.join(" ")}</p>
      ) : null}

      <div className="max-h-72 overflow-auto rounded border border-[rgb(var(--app-border)/0.35)]">
        <table className="w-full text-[11px]">
          <thead className="sticky top-0 bg-[rgb(var(--app-surface-subtle)/0.95)]">
            <tr className="text-left text-[10px] uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
              <th className="px-1 py-1 w-6" />
              <th className="px-1 py-1">#</th>
              <th className="px-1 py-1">Начало</th>
              <th className="px-1 py-1">Конец</th>
              <th className="px-1 py-1">Пик</th>
              <th className="px-1 py-1">Тип</th>
              <th className="px-1 py-1">Подход</th>
              <th className="px-1 py-1">Разделить</th>
            </tr>
          </thead>
          <tbody>
            {blocks.map((b) => {
              const splitDefault = splitSecByBlock[b.block_id] ?? defaultSplitSec(b);
              return (
                <tr
                  key={b.block_id}
                  className={cn(
                    "border-t border-[rgb(var(--app-border)/0.25)]",
                    (b.kind === "noise" || b.kind === "rest") && "opacity-70",
                  )}
                >
                  <td className="px-1 py-1">
                    <input
                      type="checkbox"
                      checked={selected.has(b.block_id)}
                      onChange={() => toggleSelect(b.block_id)}
                    />
                  </td>
                  <td className="px-1 py-1 tabular-nums">{b.block_index}</td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        className="w-14 rounded border px-1 py-0.5 tabular-nums"
                        value={b.start_sec}
                        onChange={(e) =>
                          onDispatch({
                            type: "moveBoundary",
                            blockId: b.block_id,
                            edge: "start",
                            sec: Number(e.target.value),
                          })
                        }
                      />
                      <BoundaryNudge
                        onNudge={(d) =>
                          onDispatch({
                            type: "nudgeBoundary",
                            blockId: b.block_id,
                            edge: "start",
                            deltaSec: d,
                          })
                        }
                      />
                    </div>
                    <div className="text-[10px] text-[rgb(var(--app-text-muted))]">{fmtSec(b.start_sec)}</div>
                  </td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-0.5">
                      <input
                        type="number"
                        className="w-14 rounded border px-1 py-0.5 tabular-nums"
                        value={b.end_sec}
                        onChange={(e) =>
                          onDispatch({
                            type: "moveBoundary",
                            blockId: b.block_id,
                            edge: "end",
                            sec: Number(e.target.value),
                          })
                        }
                      />
                      <BoundaryNudge
                        onNudge={(d) =>
                          onDispatch({
                            type: "nudgeBoundary",
                            blockId: b.block_id,
                            edge: "end",
                            deltaSec: d,
                          })
                        }
                      />
                    </div>
                    <div className="text-[10px] text-[rgb(var(--app-text-muted))]">{fmtSec(b.end_sec)}</div>
                  </td>
                  <td className="px-1 py-1 tabular-nums">{b.peak_hr ?? "—"}</td>
                  <td className="px-1 py-1">
                    <KindSelect
                      kind={b.kind}
                      onChange={(kind) => onDispatch({ type: "setKind", blockId: b.block_id, kind })}
                    />
                  </td>
                  <td className="px-1 py-1 min-w-[8rem]">
                    <select
                      className="w-full max-w-[10rem] rounded border px-1 py-0.5 text-[11px]"
                      disabled={b.kind !== "set"}
                      value={b.assigned_order_index ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        onDispatch({
                          type: "assignSet",
                          blockId: b.block_id,
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
                  </td>
                  <td className="px-1 py-1 whitespace-nowrap">
                    <input
                      type="number"
                      className="w-14 rounded border px-1 py-0.5 tabular-nums mr-1"
                      value={splitDefault}
                      onChange={(e) =>
                        setSplitSecByBlock((prev) => ({
                          ...prev,
                          [b.block_id]: Number(e.target.value),
                        }))
                      }
                    />
                    <button
                      type="button"
                      className="rounded border px-1 py-0.5 text-[10px]"
                      onClick={() =>
                        onDispatch({
                          type: "splitBlock",
                          blockId: b.block_id,
                          atSec: splitDefault,
                        })
                      }
                    >
                      Разделить
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      </div>
    </details>
  );
}

function BoundaryNudge({ onNudge }: { onNudge: (delta: number) => void }) {
  return (
    <div className="flex flex-col gap-px">
      <button type="button" className="text-[9px] leading-none px-0.5" onClick={() => onNudge(5)}>
        +5
      </button>
      <button type="button" className="text-[9px] leading-none px-0.5" onClick={() => onNudge(-5)}>
        −5
      </button>
      <button type="button" className="text-[9px] leading-none px-0.5" onClick={() => onNudge(15)}>
        +15
      </button>
      <button type="button" className="text-[9px] leading-none px-0.5" onClick={() => onNudge(-15)}>
        −15
      </button>
    </div>
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
      className="rounded border px-1 py-0.5 text-[11px]"
      value={kind}
      onChange={(e) => onChange(e.target.value as BlockKind)}
    >
      <option value="set">Подход</option>
      <option value="rest">Отдых</option>
      <option value="noise">Шум</option>
    </select>
  );
}
