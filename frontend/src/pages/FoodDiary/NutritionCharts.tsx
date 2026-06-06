import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactNode } from "react";
import type {
  BodyNutritionSummary,
  DayExpenditureBreakdown,
  MacroCalorieShare,
  NutritionInsights,
  PerKgMacro,
  TefInfo,
} from "../../api/food";
import { MacroPercentWarning } from "../../components/MacroPercentWarning";
import { useUnits } from "../../hooks/useUnits";
import { kcalToIcharge } from "../../utils/americanUnits";
import { formatDateRu } from "../../utils/format";
import { macroPercentSum } from "../../utils/macroPercentCheck";

export function fmt(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
}

export function NutritionBodySummary({
  body,
  fatCategoryLabel,
}: {
  body: BodyNutritionSummary;
  fatCategoryLabel?: string | null;
}) {
  const { formatBodyWeight } = useUnits();

  return (
    <div className="sticky top-0 z-20 -mx-1 px-1 py-2 bg-[rgb(var(--app-bg))]/90 backdrop-blur-md border-b border-[rgb(var(--app-border))]">
      <div className="card-panel !py-3 !px-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <StatChip
            label="Вес"
            value={body.weight_kg != null ? formatBodyWeight(body.weight_kg) : "—"}
          />
          <StatChip
            label="% жира"
            value={
              body.body_fat_percent != null
                ? `${fmt(body.body_fat_percent)}%${fatCategoryLabel ? ` · ${fatCategoryLabel}` : ""}`
                : "—"
            }
          />
          <StatChip
            label="Сухая масса"
            value={body.lean_mass_kg != null ? formatBodyWeight(body.lean_mass_kg) : "—"}
          />
          <span className="ml-auto inline-flex items-center rounded-full bg-[rgb(var(--app-accent))]/15 px-3 py-1 text-xs font-medium text-[rgb(var(--app-accent))]">
            {body.goal_label || body.phase}
          </span>
        </div>
      </div>
    </div>
  );
}

function StatChip({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="text-[rgb(var(--app-text-muted))]">{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </div>
  );
}

const STATUS_CLASS: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  low: "text-sky-600 dark:text-sky-400",
  high: "text-amber-600 dark:text-amber-400",
  unknown: "text-[rgb(var(--app-text-muted))]",
};

export function PerKgMacrosPanel({
  items,
  subtitle,
}: {
  items: PerKgMacro[];
  subtitle?: string;
}) {
  const { formatFoodWeight } = useUnits();
  if (items.length === 0) return null;
  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-sm font-medium">Нутриенты на кг массы</h4>
        {subtitle && <p className="text-xs text-[rgb(var(--app-text-muted))]">{subtitle}</p>}
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {items.map((row) => (
          <div key={row.key} className="rounded-lg border border-[rgb(var(--app-border))] px-3 py-2">
            <p className="text-xs text-[rgb(var(--app-text-muted))]">{row.label}</p>
            <p className={`text-lg font-semibold tabular-nums ${STATUS_CLASS[row.status] ?? ""}`}>
              {row.current_g_per_kg != null ? `${formatFoodWeight(row.current_g_per_kg)}/кг` : "—"}
            </p>
            <p className="text-xs text-[rgb(var(--app-text-muted))]">
              цель{" "}
              {row.target_g_per_kg != null ? `${formatFoodWeight(row.target_g_per_kg)}/кг` : "—"}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TefPanel({
  tef,
  title = "Термический эффект пищи (TEF)",
  helpSlot,
}: {
  tef: TefInfo;
  title?: string;
  helpSlot?: ReactNode;
}) {
  const { formatEnergy } = useUnits();
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium inline-flex items-center gap-1.5">
        {title}
        {helpSlot}
      </h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Metric label="Базовые калории" value={formatEnergy(tef.base_calories)} />
        <Metric label="TEF" value={`−${formatEnergy(tef.tef_kcal)}`} accent />
        <Metric label="Чистые калории" value={formatEnergy(tef.net_calories)} />
      </div>
      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        Б {formatEnergy(tef.protein_tef)} · Ж {formatEnergy(tef.fat_tef)} · У{" "}
        {formatEnergy(tef.carbs_tef)} TEF
      </p>
    </div>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-[rgb(var(--app-border))] px-3 py-2">
      <p className="text-xs text-[rgb(var(--app-text-muted))]">{label}</p>
      <p className={`font-semibold tabular-nums ${accent ? "text-violet-600 dark:text-violet-400" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export function MacroCalorieDistribution({ shares }: { shares: MacroCalorieShare[] }) {
  const { formatFoodWeight, formatEnergy } = useUnits();
  const data = shares.filter((s) => s.kcal > 0);
  const colors: Record<string, string> = {
    protein: "#22C55E",
    fat: "#EAB308",
    carbs: "#3B82F6",
  };
  const pieData = data.length ? data : shares;
  const hasMacroKcal = data.length > 0;

  const percentSum = macroPercentSum(shares);

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">Распределение калорий по макросам</h4>
      <MacroPercentWarning sumPercent={percentSum} />
      {!hasMacroKcal ? (
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Нет калорий из белков, жиров и углеводов (например, только алкоголь за день).
        </p>
      ) : (
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-52">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={pieData}
                dataKey="kcal"
                nameKey="label"
                cx="50%"
                cy="50%"
                innerRadius={48}
                outerRadius={72}
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={colors[entry.key] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value, _name, item) => {
                  const n = typeof value === "number" ? value : Number(value ?? 0);
                  const p = item?.payload as MacroCalorieShare | undefined;
                  return [`${formatEnergy(n)} (${fmt(p?.percent)}%)`, p?.label ?? ""];
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="space-y-3">
          {shares.map((s) => (
            <div key={s.key}>
              <div className="flex justify-between text-xs mb-1">
                <span>{s.label}</span>
                <span className="tabular-nums text-[rgb(var(--app-text-muted))]">
                  {formatFoodWeight(s.grams)} · {formatEnergy(s.kcal)} · {fmt(s.percent)}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-[rgb(var(--app-surface-muted))] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${Math.min(100, s.percent)}%`,
                    backgroundColor: colors[s.key] ?? "#94a3b8",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
    </div>
  );
}

const EXP_COLORS = {
  bmr: "#6366f1",
  activity: "#14b8a6",
  workout: "#f97316",
  tef: "#a855f7",
};

function dayLabel(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric" });
}

const EXP_LABELS: Record<string, string> = {
  bmr: "Базовый обмен",
  activity: "Активность",
  workout: "Тренировки",
  tef: "TEF",
};

export function WeeklyExpenditureChart({ days }: { days: DayExpenditureBreakdown[] }) {
  const { system, formatEnergy } = useUnits();
  const useAmerican = system === "american";
  const chartData = days.map((d) => {
    const raw = {
      name: dayLabel(d.date),
      date: d.date,
      bmr: d.bmr ?? 0,
      activity: d.activity_kcal,
      workout: d.workout_kcal,
      tef: d.tef_kcal,
      total: d.total_out_kcal ?? 0,
    };
    if (!useAmerican) return raw;
    const icharge = (kcal: number) => kcalToIcharge(kcal);
    return {
      ...raw,
      bmr: raw.bmr ? icharge(raw.bmr) : 0,
      activity: icharge(raw.activity),
      workout: icharge(raw.workout),
      tef: icharge(raw.tef),
      total: icharge(raw.total),
    };
  });
  const yAxisLabel = useAmerican ? "iCharge" : "ккал";

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">Расход калорий по дням</h4>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--app-border))" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={48} label={{ value: yAxisLabel, angle: -90, position: "insideLeft", fontSize: 10 }} />
            <Tooltip
              formatter={(value, name) => {
                const n = typeof value === "number" ? value : Number(value ?? 0);
                const key = String(name);
                return [formatEnergy(n), EXP_LABELS[key] ?? key];
              }}
              labelFormatter={(_l, payload) => {
                const row = payload?.[0]?.payload as { date?: string } | undefined;
                return row?.date ? formatDateRu(row.date) : "";
              }}
            />
            <Legend formatter={(v) => EXP_LABELS[String(v)] ?? String(v)} />
            <Bar dataKey="bmr" stackId="a" fill={EXP_COLORS.bmr} name="bmr" />
            <Bar dataKey="activity" stackId="a" fill={EXP_COLORS.activity} name="activity" />
            <Bar dataKey="workout" stackId="a" fill={EXP_COLORS.workout} name="workout" />
            <Bar dataKey="tef" stackId="a" fill={EXP_COLORS.tef} name="tef" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export type { NutritionInsights, BodyNutritionSummary };
