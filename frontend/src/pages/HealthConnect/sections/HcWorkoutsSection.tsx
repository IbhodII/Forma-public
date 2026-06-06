import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { formatHcSource, HcSourceBadge } from "../components/HcSourceBadge";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h > 0 ? `${h}ч ${rm}м` : `${m}м`;
}

export function HcWorkoutsSection({
  workouts,
  embedded = false,
}: {
  workouts: HealthConnectHubResponse["workouts"];
  embedded?: boolean;
}) {
  return (
    <HcSectionFrame
      id="hc-workouts"
      embedded={embedded}
      eyebrow="Workouts"
      title="Тренировки из HC"
      description="Кардио из Health Connect. Linked — на ту же дату/тип есть Polar/FIT/manual."
    >
      {!workouts.has_data ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет HC-тренировок за неделю.</p>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Standalone: {workouts.standalone_count} · Linked: {workouts.linked_count}
          </p>
          {workouts.show_unlinked ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
              <p className="text-xs font-medium text-amber-800 dark:text-amber-200">
                Unlinked HC workouts ({workouts.unlinked_items?.length ?? 0})
              </p>
              <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
                Нет Polar/FIT на ту же дату и тип — используются как HC fallback в аналитике.
              </p>
              {(workouts.unlinked_items?.length ?? 0) === 0 ? (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">Нет standalone-тренировок.</p>
              ) : (
                <ul className="space-y-1">
                  {workouts.unlinked_items!.map((w) => (
                    <li key={`unlinked-${w.id}`} className="text-xs tabular-nums">
                      {w.date} · {w.type}
                      {w.calories != null ? ` · ${w.calories} ккал` : ""}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}
          <ul className="space-y-2">
            {workouts.items.map((w) => (
              <li
                key={w.id}
                className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2 text-sm"
              >
                <span className="tabular-nums font-medium">{w.date}</span>
                <span>{w.type}</span>
                <span className="tabular-nums text-[rgb(var(--app-text-muted))]">
                  {formatDuration(w.duration_sec)}
                </span>
                {w.calories != null ? (
                  <span className="tabular-nums">{w.calories} ккал</span>
                ) : null}
                <HcSourceBadge source={w.source} />
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    w.link_status === "linked"
                      ? "bg-blue-500/15 text-blue-800 dark:text-blue-200"
                      : "bg-[rgb(var(--app-surface-subtle))] text-[rgb(var(--app-text-muted))]"
                  }`}
                >
                  {w.link_status === "linked"
                    ? `linked · ${formatHcSource(w.linked_source)}`
                    : "standalone HC"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </HcSectionFrame>
  );
}
