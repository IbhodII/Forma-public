import {
  Area,
  AreaChart,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer } from "../../../components/analytics";
import type { WeekDayCell } from "../useFoodWeekData";

export function MainWeeklyCharts({
  cells,
  formatEnergy,
}: {
  cells: WeekDayCell[];
  formatEnergy: (n: number) => string;
}) {
  const chartData = cells.map((c) => ({
    label: c.weekdayLabel.slice(0, 2),
    intake: c.intake,
    expenditure: c.expenditure ?? 0,
    balance: c.balance ?? 0,
    protein: c.protein,
  }));

  const tooltipStyle = {
    borderRadius: 8,
    border: "1px solid rgb(var(--app-border))",
    fontSize: 11,
    padding: "6px 10px",
  };

  return (
    <section className="space-y-2">
      <h2 className="analytics-label">Аналитика недели</h2>

      <div className="grid gap-2 lg:grid-cols-2 lg:items-stretch min-w-0 w-full">
        <ChartContainer title="Потребление и расход" height="sm">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="intakeFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#f43f5e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="expFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#64748b" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#64748b" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis hide />
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, name) => [
                  formatEnergy(Number(v) || 0),
                  name === "intake" ? "Потребление" : "Расход",
                ]}
              />
              <Area
                type="monotone"
                dataKey="expenditure"
                stroke="#64748b"
                strokeWidth={1.5}
                fill="url(#expFill)"
                name="expenditure"
              />
              <Area
                type="monotone"
                dataKey="intake"
                stroke="#f43f5e"
                strokeWidth={2}
                fill="url(#intakeFill)"
                name="intake"
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartContainer>

        <ChartContainer title="Баланс и белок" height="sm">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#94a3b8" strokeOpacity={0.2} />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="bal" hide />
              <YAxis yAxisId="prot" orientation="right" hide />
              <Tooltip contentStyle={tooltipStyle} />
              <Legend wrapperStyle={{ fontSize: 10, paddingTop: 0 }} />
              <Area
                yAxisId="bal"
                type="monotone"
                dataKey="balance"
                stroke="#F97316"
                fill="#F97316"
                fillOpacity={0.12}
                strokeWidth={1.5}
                name="Баланс, ккал"
              />
              <Line
                yAxisId="prot"
                type="monotone"
                dataKey="protein"
                stroke="#3b82f6"
                strokeWidth={1.5}
                dot={{ r: 2.5, fill: "#3b82f6" }}
                name="Белок, г"
              />
            </ComposedChart>
          </ResponsiveContainer>
        </ChartContainer>
      </div>
    </section>
  );
}
