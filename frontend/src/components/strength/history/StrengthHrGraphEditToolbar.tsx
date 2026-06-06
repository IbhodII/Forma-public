import { cn } from "../../../lib/utils";
import { HR_MANUAL_OVERRIDE_DISCLAIMER } from "./StrengthHrBySetPanel";

export function StrengthHrGraphEditToolbar({
  dirty,
  saving,
  splitMode,
  warnings,
  onSave,
  onCancel,
  onResetAuto,
  onToggleSplitMode,
}: {
  dirty: boolean;
  saving: boolean;
  splitMode: boolean;
  warnings: string[];
  onSave: () => void;
  onCancel: () => void;
  onResetAuto: () => void;
  onToggleSplitMode: () => void;
}) {
  return (
    <div className="space-y-1.5">
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
          className={cn(
            "ml-auto rounded-md border px-2 py-1 text-[11px]",
            splitMode
              ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent)/0.1)] text-[rgb(var(--app-accent))]"
              : "border-[rgb(var(--app-border)/0.5)]",
          )}
          onClick={onToggleSplitMode}
        >
          {splitMode ? "Разделить: вкл" : "Разделить"}
        </button>
      </div>
      <p className="text-[11px] text-[rgb(var(--app-text-muted))]">{HR_MANUAL_OVERRIDE_DISCLAIMER}</p>
      {warnings.length ? (
        <p className="text-[11px] text-amber-800/90 dark:text-amber-200/90">{warnings.join(" ")}</p>
      ) : null}
    </div>
  );
}
