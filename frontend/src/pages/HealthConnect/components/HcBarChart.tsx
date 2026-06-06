import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "../../../components/analytics";
import { buildHcChartPoints, HcPeriodToggle, type HcChartPeriod } from "./HcPeriodToggle";

export function HcBarChart({
  title,
  series,
  valueLabel,
  color = "#22C55E",
}: {
  title: string;
  series: Array<{ date: string; value: number }>;
  valueLabel: string;
  color?: string;
}) {
  const [period, setPeriod] = useState<HcChartPeriod>("day");

  const chartData = useMemo(
    () => buildHcChartPoints(series, period),
    [series, period],
  );

  if (!series.length) return null;

  return (
    <div className="hc-chart-block">
      <div className="hc-chart-block__head">
        <span className="hc-chart-block__title">{title}</span>
        <HcPeriodToggle value={period} onChange={setPeriod} />
      </div>
      {chartData.length > 0 ? (
        <ChartContainer height="md" title="">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={44} />
              <Tooltip formatter={(v) => [Number(v).toLocaleString("ru-RU"), valueLabel]} />
              <Bar dataKey="value" fill={color} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartContainer>
      ) : (
        <p className="text-xs text-[rgb(var(--app-text-muted))]">Недостаточно точек для периода.</p>
      )}
    </div>
  );
}
