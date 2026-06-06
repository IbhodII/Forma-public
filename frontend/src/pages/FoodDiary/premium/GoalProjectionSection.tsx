import { Target } from "lucide-react";
import type { FoodPhase } from "../../../api/food";
import type { CutBulkSnapshot } from "../../../api/cutBulk";
import { GoalProjectionPanel } from "./GoalProjectionPanel";
import { BulkGainGoalPanel } from "../../../modules/nutrition/cutBulk/BulkGainGoalPanel";

export function GoalProjectionSection({
  phase,
  preferChest,
  snap,
}: {
  phase: FoodPhase;
  preferChest: boolean;
  snap: CutBulkSnapshot | null;
}) {
  return (
    <section className="goal-projection-section space-y-2 min-w-0">
      <div className="flex items-center gap-1.5">
        <Target className="h-4 w-4 text-emerald-600 shrink-0" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[rgb(var(--app-text-muted))]">
          Цели и прогноз
        </h2>
      </div>
      <div className="goal-projection-section__card space-y-3">
        <GoalProjectionPanel phase={phase} preferChest={preferChest} snap={snap} />
        {phase === "bulk" ? <BulkGainGoalPanel preferChest={preferChest} compact /> : null}
      </div>
    </section>
  );
}
