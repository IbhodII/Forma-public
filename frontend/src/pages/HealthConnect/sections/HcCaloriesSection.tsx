import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HealthConnectHubResponse } from "../../../api/sync";
import { HcSectionFrame } from "../components/HcSectionFrame";
import { HcSourceBadge } from "../components/HcSourceBadge";

export function HcCaloriesSection({
  calories,
  embedded = false,
}: {
  calories: HealthConnectHubResponse["calories"];
  embedded?: boolean;
}) {
  const chartData = calories.week_series.map((d) => ({
    label: d.date.slice(5),
    kcal: d.total_calories,
  }));

  const sections = Object.values(calories.sections ?? {});

  return (
    <HcSectionFrame
      id="hc-calories"
      embedded={embedded}
      eyebrow="Calories"
      title="Калории"
      description="Общие, активные и тренировочные — с правилами fallback и replacement."
    >
      {!calories.has_data ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">Нет данных калорий за неделю.</p>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-semibold tabular-nums">
              {calories.today_total?.toLocaleString("ru-RU") ?? "—"}
            </span>
            <span className="text-sm text-[rgb(var(--app-text-muted))]">ккал сегодня (total)</span>
            <HcSourceBadge source={calories.today_source} />
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {sections.map((s) => (
              <div
                key={s.label}
                className="rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3 space-y-1"
              >
                <div className="text-sm font-medium">{s.label}</div>
                <HcSourceBadge source={s.source} />
                <p className="text-xs text-[rgb(var(--app-text-muted))]">{s.description}</p>
              </div>
            ))}
          </div>
          {calories.routing_notes.length > 0 ? (
            <ul className="text-xs text-[rgb(var(--app-text-muted))] space-y-1 list-disc pl-4">
              {calories.routing_notes.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          ) : null}
          {chartData.length > 0 ? (
            <div
              className={`h-40 rounded-xl border border-[rgb(var(--app-border)/0.55)] p-3${embedded ? " body-hub__chart-panel" : ""}`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} width={44} />
                  <Tooltip formatter={(v) => [Number(v).toLocaleString("ru-RU"), "ккал"]} />
                  <Area type="monotone" dataKey="kcal" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : null}
        </div>
      )}
    </HcSectionFrame>
  );
}
