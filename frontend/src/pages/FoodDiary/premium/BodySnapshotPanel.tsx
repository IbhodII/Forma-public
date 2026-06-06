import { ChevronDown, UserRound } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { CutBulkSnapshot } from "../../../api/cutBulk";
import type { FoodPhase } from "../../../api/food";
import { Skeleton } from "../../../components/ui/skeleton";
import { cn } from "../../../lib/utils";
import { useBodyContextPanel } from "../useBodyContextPanel";
import { BodyStatCard } from "./BodyStatCard";

export function BodySnapshotPanel({
  phase,
  snap,
  goalLabel,
  className,
}: {
  phase: FoodPhase;
  snap: CutBulkSnapshot | null | undefined;
  goalLabel?: string | null;
  className?: string;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const { stats, lastUpdated, isLoading, hasData } = useBodyContextPanel(phase, snap, goalLabel);

  if (!isLoading && !hasData) {
    return (
      <div
        className={cn(
          "rounded-xl border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.35)] px-3 py-2.5 text-xs text-[rgb(var(--app-text-muted))]",
          className,
        )}
      >
        <Link to="/body" className="text-emerald-600 hover:underline dark:text-emerald-400">
          Добавьте замеры тела
        </Link>
        , чтобы видеть вес и состав в контексте недели.
      </div>
    );
  }

  return (
    <section
      className={cn(
        "rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface))] shadow-[var(--app-shadow-sm)]",
        className,
      )}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left sm:pointer-events-none"
        onClick={() => setCollapsed((c) => !c)}
        aria-expanded={!collapsed}
      >
        <div className="flex items-center gap-2 min-w-0">
          <UserRound className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--app-accent))]" aria-hidden />
          <span className="analytics-label text-[rgb(var(--app-text))]">
            Текущие параметры тела
          </span>
          {lastUpdated && (
            <span className="hidden truncate text-[10px] text-[rgb(var(--app-text-muted))] sm:inline">
              · обновлено {lastUpdated}
            </span>
          )}
        </div>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-[rgb(var(--app-text-muted))] transition-transform sm:hidden",
            collapsed && "-rotate-90",
          )}
        />
      </button>

      <div
        className={cn(
          "border-t border-[rgb(var(--app-border)/0.45)] px-3 pb-3 pt-2",
          collapsed && "hidden sm:block",
        )}
      >
        {isLoading ? (
          <div className="flex gap-2 overflow-hidden">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-28 shrink-0 rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="body-snapshot-panel__grid">
            {stats.map((item, i) => (
              <BodyStatCard key={item.key} item={item} index={i} />
            ))}
          </div>
        )}
        {lastUpdated && (
          <p className="mt-2 text-[10px] text-slate-400 sm:hidden">Обновлено {lastUpdated}</p>
        )}
      </div>
    </section>
  );
}
