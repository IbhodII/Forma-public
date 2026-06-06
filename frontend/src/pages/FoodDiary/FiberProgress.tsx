import { useUnits } from "../../hooks/useUnits";

export function FiberProgress({
  current,
  target,
}: {
  current: number;
  target: number;
}) {
  const { formatFoodWeight } = useUnits();
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;

  return (
    <div className="col-span-2 sm:col-span-4 space-y-1">
      <div className="flex justify-between text-sm">
        <span className="text-[rgb(var(--app-text-muted))]">Клетчатка</span>
        <span className="font-medium tabular-nums">
          {formatFoodWeight(current)} / {formatFoodWeight(target)}
        </span>
      </div>
      <div
        className="h-2 rounded-full bg-[rgb(var(--app-surface-muted))] overflow-hidden"
        role="progressbar"
        aria-valuenow={current}
        aria-valuemin={0}
        aria-valuemax={target}
      >
        <div
          className="h-full rounded-full bg-emerald-500/80 transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
