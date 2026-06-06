import type { CtlAtlTsbResponse } from "../../../types";
import { CTL_CARD_HINTS, METRIC_RANGE_GUIDE } from "../analyticsHints";
import {
  atlColorLevel,
  ctlColorLevel,
  metricCardClasses,
  trimpColorLevel,
  tsbColorLevel,
} from "../utils/metricColors";
import { MetricHelp } from "./MetricHelp";
import { KpiCard } from "../../../components/ui/kpi-card";

const CARD_DEFS = [
  { key: "ctl" as const, label: "CTL (фитнес)", short: "долгосрочный фитнес" },
  { key: "atl" as const, label: "ATL (усталость)", short: "нагрузка ~7 дней" },
  { key: "tsb" as const, label: "TSB (форма)", short: "CTL − ATL" },
  { key: "trimpLast" as const, label: "TRIMP последней тренировки", short: "последнее кардио" },
];

function colorForCard(
  key: (typeof CARD_DEFS)[number]["key"],
  cur: NonNullable<CtlAtlTsbResponse["current"]>,
): ReturnType<typeof metricCardClasses> {
  switch (key) {
    case "ctl":
      return metricCardClasses(ctlColorLevel(cur.ctl));
    case "atl":
      return metricCardClasses(atlColorLevel(cur.atl, cur.ctl));
    case "tsb":
      return metricCardClasses(tsbColorLevel(cur.tsb));
    case "trimpLast":
      return metricCardClasses(trimpColorLevel(cur.trimp));
    default:
      return metricCardClasses("neutral");
  }
}

export function CtlCards({ data }: { data: CtlAtlTsbResponse | undefined }) {
  const cur = data?.current;
  if (!cur) {
    return (
      <p className="text-sm text-slate-500 card-panel border-dashed">
        Нет данных TRIMP для расчёта CTL/ATL/TSB. Добавьте кардио с записью пульса.
      </p>
    );
  }

  const values: Record<(typeof CARD_DEFS)[number]["key"], number | null | undefined> = {
    ctl: cur.ctl,
    atl: cur.atl,
    tsb: cur.tsb,
    trimpLast: cur.trimp,
  };

  const atlDiff =
    cur.atl != null && cur.ctl != null && Number.isFinite(cur.atl) && Number.isFinite(cur.ctl)
      ? cur.atl - cur.ctl
      : null;

  return (
    <div className="analytics-grid analytics-grid--kpi grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 min-w-0">
      {CARD_DEFS.map((c) => {
        const { value: valueClass, border } = colorForCard(c.key, cur);
        const v = values[c.key];
        const display = v != null && Number.isFinite(v) ? Number(v).toFixed(1) : "—";

        const subText =
          c.key === "trimpLast" && cur.last_workout_date
            ? `${c.short} · ${cur.last_workout_date}`
            : c.short;

        return (
          <KpiCard
            key={c.key}
            className={`rounded-xl transition-shadow hover:shadow-md ${border}`}
            label={
              <span className="flex min-w-0 max-w-full items-center gap-1.5">
                <span className="min-w-0 truncate">{c.label}</span>
                <MetricHelp
                  hint={CTL_CARD_HINTS[c.key]}
                  lines={METRIC_RANGE_GUIDE[c.key === "trimpLast" ? "trimp" : c.key].lines}
                />
              </span>
            }
            value={display}
            sub={subText}
            valueClassName={valueClass}
          >
            {c.key === "atl" && atlDiff != null ? (
              <p className="text-xs text-[rgb(var(--app-text-muted))] tabular-nums">
                ATL − CTL: {atlDiff > 0 ? "+" : ""}
                {atlDiff.toFixed(1)}
              </p>
            ) : null}
            {c.key === "tsb" && cur.tsb != null && Number.isFinite(cur.tsb) ? (
              <p className="text-xs text-[rgb(var(--app-text-muted))]">
                {cur.tsb > 10
                  ? "отличное восстановление"
                  : cur.tsb < -15
                    ? "перетренированность"
                    : cur.tsb < -5
                      ? "усталость"
                      : "баланс"}
              </p>
            ) : null}
          </KpiCard>
        );
      })}
    </div>
  );
}
