import { useMemo } from "react";
import { useTheme } from "../../../contexts/ThemeContext";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { NutritionForecastResult } from "../../../api/cutBulk";
import { useUnits } from "../../../hooks/useUnits";
import { formatDateRu } from "../../../utils/format";
import { cn } from "../../../lib/utils";
import { buildForecastChartData } from "./forecastChartData";

function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return formatDateRu(String(iso).slice(0, 10));
}

export function WeightProjectionChart({
  forecast,
  className,
  tall = false,
  showCaption = true,
}: {
  forecast: NutritionForecastResult;
  className?: string;
  tall?: boolean;
  showCaption?: boolean;
}) {
  const { formatBodyWeight, formatEnergy } = useUnits();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const tickColor = isDark ? "#94a3b8" : "#64748b";
  const gridColor = isDark ? "#475569" : "#94a3b8";

  const chartData = useMemo(() => buildForecastChartData(forecast), [forecast]);

  const realRatePerKg =
    forecast.average_real_deficit_per_kg_fat ?? forecast.observed_deficit_per_kg_fat;
  const targetRatePerKg = forecast.target_deficit_per_kg_fat ?? forecast.max_deficit_per_kg_fat;

  const weightYDomain = useMemo((): [number, number] | undefined => {
    if (chartData.length < 2) return undefined;
    const weights = chartData.map((d) => d.weight).filter((w) => Number.isFinite(w));
    if (weights.length < 2) return undefined;
    const min = Math.min(...weights);
    const max = Math.max(...weights);
    if (!Number.isFinite(min) || !Number.isFinite(max)) return undefined;
    const span = max - min;
    const pad = span > 0 ? Math.max(0.3, span * 0.15) : 1;
    return [Math.floor((min - pad) * 10) / 10, Math.ceil((max + pad) * 10) / 10];
  }, [chartData]);

  if (chartData.length < 2) {
    const rawCount = forecast.weight_projection?.length ?? forecast.weeks_log?.length ?? 0;
    return (
      <div className={className}>
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          {rawCount > 0
            ? "Данные прогноза недостаточны для графика"
            : "Недостаточно точек для графика"}
        </p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      {showCaption && forecast.model === "dynamic_cut" ? (
        <p className="text-[10px] text-[rgb(var(--app-text-muted))] mb-1.5 leading-snug">
          Динамическая модель
          {realRatePerKg != null ? ` · ~${realRatePerKg.toFixed(1)} ккал/кг жира` : ""}
          {targetRatePerKg != null ? ` (план ${targetRatePerKg.toFixed(0)})` : ""}
        </p>
      ) : null}
      <div className={cn("w-full flex-1 min-h-0", tall ? "min-h-[14rem]" : "min-h-[12rem]")}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 6, right: 8, left: 0, bottom: 2 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridColor} strokeOpacity={0.3} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: tickColor }}
              axisLine={{ stroke: gridColor, strokeOpacity: 0.4 }}
              tickLine={false}
            />
            <YAxis
              domain={weightYDomain ?? ["auto", "auto"]}
              tick={{ fontSize: 10, fill: tickColor }}
              tickFormatter={(v) => `${v}`}
              width={40}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: `1px solid ${isDark ? "#475569" : "#e2e8f0"}`,
                backgroundColor: isDark ? "rgba(15,23,42,0.96)" : "rgba(255,255,255,0.96)",
                color: isDark ? "#f8fafc" : "#0f172a",
                fontSize: 11,
                padding: "6px 10px",
              }}
              formatter={(value) => [formatBodyWeight(Number(value ?? 0)), "Вес"]}
              labelFormatter={(_, payload) => {
                const row = payload?.[0]?.payload as { date?: string; deficit?: number };
                const datePart = row?.date ? fmtDate(row.date) : "";
                if (row?.deficit != null && row.deficit > 0) {
                  return `${datePart} · дефицит ${formatEnergy(row.deficit)}/д`;
                }
                return datePart;
              }}
            />
            <Line
              type="monotone"
              dataKey="weight"
              stroke="#22C55E"
              strokeWidth={tall ? 2.5 : 2}
              dot={{ r: tall ? 3.5 : 3, fill: "#22C55E", stroke: "#fff", strokeWidth: 1.5 }}
              activeDot={{ r: 5, fill: "#059669", stroke: "#fff", strokeWidth: 2 }}
              name="Вес"
              connectNulls
              isAnimationActive
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
