import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcBarChart } from "../components/HcBarChart";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { HcSourceBadge } from "../components/HcSourceBadge";
import { HcStaleBadge } from "../components/HcStaleBadge";

function formatTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const part = iso.includes("T") ? iso.split("T")[1] : iso;
  return part.slice(0, 5);
}

export function HcSleepSection({
  sleep,
  embedded = false,
}: {
  sleep: HealthConnectHubResponse["sleep"];
  embedded?: boolean;
}) {
  const ln = sleep.last_night;
  const sleepChartSeries = sleep.week_nights.map((n) => ({
    date: n.date,
    value: n.duration_hours,
  }));

  return (
    <HcSectionFrame
      id="hc-sleep"
      embedded={embedded}
      eyebrow="Sleep"
      title="Сон"
      description="Длительность и время отбоя/подъёма — без медицинской аналитики стадий."
    >
      {!sleep.has_data ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет записей сна за неделю.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <span className="text-2xl font-semibold tabular-nums">
                {ln.hours != null ? `${ln.hours} ч` : "—"}
              </span>
              <span className="ml-2 text-sm text-[rgb(var(--app-text-muted))]">
                {ln.date ?? "последняя ночь"}
              </span>
            </div>
            <HcSourceBadge source={ln.source} />
            {sleep.freshness === "stale" ? <HcStaleBadge /> : null}
          </div>
          {sleep.stale_warning ? (
            <p className="text-xs text-amber-700 dark:text-amber-300">{sleep.stale_warning}</p>
          ) : null}
          <div className="grid gap-3 sm:grid-cols-3 text-sm">
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Отбой</div>
              <div className="font-medium tabular-nums">{formatTime(ln.start_time)}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Подъём</div>
              <div className="font-medium tabular-nums">{formatTime(ln.end_time)}</div>
            </div>
            <div className="rounded-xl border border-[rgb(var(--app-border)/0.55)] px-3 py-2">
              <div className="text-xs text-[rgb(var(--app-text-muted))]">Среднее / стабильность</div>
              <div className="font-medium tabular-nums">
                {sleep.avg_hours != null ? `${sleep.avg_hours} ч` : "—"}
                {sleep.consistency_score != null ? ` · ${sleep.consistency_score}%` : ""}
              </div>
            </div>
          </div>
          {sleepChartSeries.length > 0 ? (
            <div className={embedded ? "body-hub__chart-panel" : undefined}>
              <HcBarChart
                title="Длительность сна"
                series={sleepChartSeries}
                valueLabel="Часы"
                color="#8B5CF6"
              />
            </div>
          ) : null}
          {sleep.week_nights.length > 0 ? (
            <ul className="space-y-2 mt-3">
              {sleep.week_nights.map((n) => (
                <li
                  key={n.date}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[rgb(var(--app-surface-subtle)/0.5)] px-3 py-2 text-sm"
                >
                  <span className="tabular-nums">{n.date}</span>
                  <span>
                    {formatTime(n.start_time)} → {formatTime(n.end_time)}
                  </span>
                  <span className="tabular-nums">{n.duration_hours} ч</span>
                  <HcSourceBadge source={n.source} />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      )}
    </HcSectionFrame>
  );
}
