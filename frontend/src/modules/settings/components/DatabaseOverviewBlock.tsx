import type { DatabaseOverview } from "../../../api/databaseDiagnostics";

export function DatabaseOverviewBlock({ overview }: { overview: DatabaseOverview }) {
  const c = overview.counts;
  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-muted))] p-3 text-xs space-y-1 font-mono">
      <p className="font-medium text-[rgb(var(--app-text))] font-sans">Сводка API</p>
      <p className="text-[rgb(var(--app-text-muted))] break-all">
        workouts: {overview.activeDbPath.workouts}
      </p>
      <p className="text-[rgb(var(--app-text-muted))]">
        user_id={overview.request_user_id}{" "}
        {overview.currentProfile.display_name
          ? `(${overview.currentProfile.display_name})`
          : overview.currentProfile.found
            ? ""
            : "— профиль не найден"}
      </p>
      <p className="text-[rgb(var(--app-text-muted))]">
        strength={c.strength_workouts} cardio={c.cardio_workouts} food={c.food_entries}{" "}
        body={c.body_metrics} weight={c.daily_weight} steps={c.steps_days}
      </p>
    </div>
  );
}
