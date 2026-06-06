import type { WeeklyCardStats } from "../../../utils/weeklyAggregation";
import { formatWeeklyNum } from "../../../utils/weeklyAggregation";

interface CardDef {
  key: string;
  title: string;
  hint: string;
  gradient: string;
  pick: (s: WeeklyCardStats) => number | null;
  format?: (n: number) => string;
  unitSuffix?: string;
}

export function WeeklyMetricsCards({
  stats,
  subtitle,
  thirdMetricTitle = "Мышцы",
  thirdMetricHint = "Средняя масса за неделю",
  formatBodyWeight,
  formatBarbellWeight,
}: {
  stats: WeeklyCardStats;
  subtitle?: string;
  thirdMetricTitle?: string;
  thirdMetricHint?: string;
  formatBodyWeight: (kg: number) => string;
  formatBarbellWeight: (kg: number) => string;
}) {
  const cards: CardDef[] = [
    {
      key: "weight",
      title: "Вес",
      hint: "Средний вес за текущую неделю (суббота–пятница) или последний замер",
      gradient: "from-emerald-500 to-emerald-700",
      pick: (s) => s.weightKg,
      format: formatBodyWeight,
    },
    {
      key: "fat",
      title: "Жир",
      hint: "Средний процент жира за неделю",
      unitSuffix: "%",
      gradient: "from-rose-500 to-rose-700",
      pick: (s) => s.fatPercent,
    },
    {
      key: "muscle",
      title: thirdMetricTitle,
      hint: thirdMetricHint,
      gradient: "from-blue-500 to-blue-700",
      pick: (s) => s.muscleKg,
      format: formatBarbellWeight,
    },
    {
      key: "count",
      title: "Замеров",
      hint: "Число записей в текущей неделе",
      gradient: "from-amber-500 to-amber-700",
      pick: (s) => s.count,
    },
  ];

  return (
    <div className="space-y-2">
      {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const raw = c.pick(stats);
          const isCount = c.key === "count";
          let display: string;
          if (isCount) {
            display = stats.fromCurrentWeek ? String(stats.count) : "—";
          } else if (typeof raw === "number" && c.format) {
            display = c.format(raw);
          } else if (typeof raw === "number" && c.unitSuffix === "%") {
            display = `${formatWeeklyNum(raw, 1)}%`;
          } else {
            display = formatWeeklyNum(typeof raw === "number" ? raw : null, 1);
          }
          return (
            <div
              key={c.key}
              title={c.hint}
              className={`rounded-xl bg-gradient-to-br ${c.gradient} p-4 text-white shadow-lg`}
            >
              <p className="text-xs font-medium text-white/80 uppercase tracking-wide">{c.title}</p>
              <p className="text-3xl font-bold mt-1 tabular-nums">{display}</p>
            </div>
          );
        })}
      </div>
      <p className="text-xs text-slate-400">
        {stats.fromCurrentWeek
          ? "Показатели за текущую неделю (средние)"
          : "В текущей неделе нет замеров — показаны последние значения"}
      </p>
    </div>
  );
}
