import type { TopExerciseProgress } from "../../../types";
import { useUnits } from "../../../hooks/useUnits";
import { EmptyState } from "../../../components/ui/empty-state";
import { cn } from "../../../lib/utils";
import { Trophy, TrendingDown, TrendingUp, Minus } from "lucide-react";

function PrCard({ row }: { row: TopExerciseProgress }) {
  const { formatWeight, formatWeightChange } = useUnits();
  const { change, change_percent } = row;
  const up = change != null && change > 0.05;
  const down = change != null && change < -0.05;
  const flat = !up && !down;

  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const tone = flat
    ? "text-[rgb(var(--app-text-muted))]"
    : up
      ? "text-emerald-600 dark:text-emerald-400"
      : "text-rose-600 dark:text-rose-400";

  return (
    <article className="card-metric flex flex-col gap-3 min-h-[8.5rem]">
      <div className="flex items-start justify-between gap-2">
        <h4 className="text-sm font-semibold leading-snug text-[rgb(var(--app-text))] line-clamp-2" title={row.exercise}>
          {row.exercise}
        </h4>
        <span className="shrink-0 flex h-8 w-8 items-center justify-center rounded-xl bg-[rgb(var(--app-accent)/0.1)]">
          <Trophy className="h-4 w-4 text-[rgb(var(--app-accent))]" />
        </span>
      </div>

      <div className="space-y-1">
        <p className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))]">1ПМ · 7 дн.</p>
        <p className="text-2xl font-bold tabular-nums tracking-tight text-[rgb(var(--app-text))]">
          {row.current_1rm != null ? formatWeight(row.current_1rm) : "—"}
        </p>
      </div>

      <div className="mt-auto flex items-end justify-between gap-2 text-xs">
        <div>
          <p className="text-[rgb(var(--app-text-muted))]">30 дн. назад</p>
          <p className="font-medium tabular-nums text-[rgb(var(--app-text))]">
            {row.past_1rm != null ? formatWeight(row.past_1rm) : "—"}
          </p>
        </div>
        {change != null && change_percent != null ? (
          <div className={cn("flex items-center gap-1 font-semibold tabular-nums", tone)}>
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span>{formatWeightChange(change)}</span>
            <span className="opacity-80">
              ({up && change_percent > 0 ? "+" : ""}
              {change_percent.toFixed(1)}%)
            </span>
          </div>
        ) : (
          <span className="text-[rgb(var(--app-text-muted))]">—</span>
        )}
      </div>
    </article>
  );
}

export function PrTrackingCards({ items }: { items: TopExerciseProgress[] }) {
  if (!items.length) {
    return (
      <EmptyState
        title="Нет PR за период"
        description="Запишите силовые с расчётом 1ПМ — здесь появятся карточки прогресса по упражнениям."
      />
    );
  }

  return (
    <div className="analytics-grid analytics-grid--pr grid grid-cols-1 sm:grid-cols-2 2xl:grid-cols-3 gap-3">
      {items.map((row) => (
        <PrCard key={row.exercise} row={row} />
      ))}
    </div>
  );
}
