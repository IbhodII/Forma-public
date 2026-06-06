import { memo, useMemo } from "react";
import { Link } from "react-router-dom";
import type { Data, Layout } from "plotly.js";
import { PlotChart } from "../../../components/Plot";
import { Loader } from "../../../components/Loader";
import { useTheme } from "../../../contexts/ThemeContext";
import type { ZoneTimeResponse } from "../../../types";
import {
  ANALYTICS_ZONE_COLORS,
  ANALYTICS_ZONE_MUTED,
  ANALYTICS_ZONE_TIPS,
  formatAnalyticsZoneBpm,
} from "../../../utils/heartRateZones";

const EMPTY_MESSAGE =
  "Загрузите подробные данные о пульсе на тренировках (импорт FIT, Polar или пульс на силовых).";

const DONUT_HOLE = 0.62;

const PLOT_LAYOUT: Partial<Layout> = {
  margin: { t: 0, r: 0, b: 0, l: 0 },
  autosize: true,
  showlegend: false,
  paper_bgcolor: "rgba(0,0,0,0)",
  plot_bgcolor: "rgba(0,0,0,0)",
  transition: { duration: 450, easing: "cubic-in-out" },
};

type ZoneRow = {
  zone: ZoneTimeResponse["zones"][number];
  minutes: number;
  percent: number;
  color: string;
  muted: string;
  tip: string;
};

function formatZoneMinutes(minutes: number): string {
  if (minutes <= 0) return "—";
  return Number.isInteger(minutes) ? String(minutes) : minutes.toFixed(1);
}

function formatTotalMinutes(totalMin: number): string {
  return Math.round(totalMin).toLocaleString("ru-RU");
}

function buildZoneRows(data: ZoneTimeResponse): ZoneRow[] {
  const zones = data.zones ?? [];
  const items = data.items ?? [];
  return zones.map((z) => {
    const item = items.find((i) => i.zone_id === z.id);
    return {
      zone: z,
      minutes: item?.minutes ?? 0,
      percent: item?.percent ?? 0,
      color: ANALYTICS_ZONE_COLORS[z.id] ?? "#64748b",
      muted: ANALYTICS_ZONE_MUTED[z.id] ?? "rgba(100, 116, 139, 0.15)",
      tip: ANALYTICS_ZONE_TIPS[z.id] ?? "",
    };
  });
}

function computePanelStats(rows: ZoneRow[], data: ZoneTimeResponse) {
  const totalMin = data.total_seconds / 60;
  let dominant: ZoneRow | null = null;
  let weightedSum = 0;
  let weightedWeight = 0;

  for (const row of rows) {
    if (row.minutes <= 0) continue;
    if (!dominant || row.minutes > dominant.minutes) dominant = row;
    const mid = (row.zone.min_bpm + row.zone.max_bpm) / 2;
    weightedSum += mid * row.minutes;
    weightedWeight += row.minutes;
  }

  const avgHr =
    weightedWeight > 0 ? Math.round(weightedSum / weightedWeight) : null;

  return {
    totalMin,
    dominant,
    avgHr,
    workouts: data.workouts_with_hr ?? 0,
    maxHr: data.max_heart_rate,
  };
}

function WorkoutTypeFilter({
  workoutType,
  onWorkoutTypeChange,
  typeOptions,
}: {
  workoutType: string;
  onWorkoutTypeChange: (v: string) => void;
  typeOptions: { id: string; label: string }[];
}) {
  if (typeOptions.length <= 1) return null;
  return (
    <label className="block w-full max-w-md">
      <span className="text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
        Тип тренировки
      </span>
      <select
        value={workoutType}
        onChange={(e) => onWorkoutTypeChange(e.target.value)}
        className="input-field min-h-10 w-full rounded-xl text-sm shadow-sm mt-1.5"
      >
        {typeOptions.map((opt) => (
          <option key={opt.id || "__all__"} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function SummaryStat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface))] px-3 py-2 shadow-[var(--app-shadow-sm)] min-w-0">
      <p className="text-[10px] sm:text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))] truncate">
        {label}
      </p>
      <p
        className="text-lg sm:text-xl font-bold tabular-nums mt-0.5 truncate text-[rgb(var(--app-text))]"
        style={accent ? { color: accent } : undefined}
      >
        {value}
      </p>
      {sub ? (
        <p className="text-[10px] sm:text-xs text-[rgb(var(--app-text-muted))] mt-0.5 truncate leading-snug">
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function SummaryRow({
  stats,
}: {
  stats: ReturnType<typeof computePanelStats>;
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2 sm:gap-3">
      <SummaryStat label="Max HR" value={`${stats.maxHr}`} sub="уд/мин" />
      <SummaryStat
        label="Всего в зонах"
        value={formatTotalMinutes(stats.totalMin)}
        sub="минут"
      />
      <SummaryStat
        label="С пульсом"
        value={stats.workouts > 0 ? String(stats.workouts) : "—"}
        sub="тренировок"
      />
      <SummaryStat
        label="Средний пульс"
        value={stats.avgHr != null ? String(stats.avgHr) : "—"}
        sub="оценка по зонам"
      />
      <SummaryStat
        label="Доминирует"
        value={stats.dominant?.zone.name ?? "—"}
        sub={
          stats.dominant
            ? `${formatZoneMinutes(stats.dominant.minutes)} мин · ${stats.dominant.percent}%`
            : undefined
        }
        accent={stats.dominant?.color}
      />
    </div>
  );
}

const ZoneDonut = memo(function ZoneDonut({
  rows,
  totalMinutes,
  plotKey,
}: {
  rows: ZoneRow[];
  totalMinutes: number;
  plotKey: string;
}) {
  const { resolvedTheme } = useTheme();
  const pieRows = useMemo(() => rows.filter((r) => r.minutes > 0), [rows]);

  const donutLayout = useMemo((): Partial<Layout> => {
    const centerColor = resolvedTheme === "dark" ? "#f8fafc" : "#0f172a";
    const mutedColor = resolvedTheme === "dark" ? "#94a3b8" : "#64748b";
    return {
      ...PLOT_LAYOUT,
      annotations: [
        {
          x: 0.5,
          y: 0.52,
          xref: "paper",
          yref: "paper",
          text: formatTotalMinutes(totalMinutes),
          showarrow: false,
          align: "center",
          font: {
            size: 34,
            color: centerColor,
            family: "system-ui, sans-serif",
          },
        },
        {
          x: 0.5,
          y: 0.4,
          xref: "paper",
          yref: "paper",
          text: "мин",
          showarrow: false,
          align: "center",
          font: { size: 11, color: mutedColor, family: "system-ui, sans-serif" },
        },
        {
          x: 0.5,
          y: 0.3,
          xref: "paper",
          yref: "paper",
          text: "Всего в зонах",
          showarrow: false,
          align: "center",
          font: { size: 10, color: mutedColor, family: "system-ui, sans-serif" },
        },
      ],
    };
  }, [resolvedTheme, totalMinutes]);

  const plotData = useMemo((): Data[] => {
    if (pieRows.length === 0) return [];
    return [
      {
        labels: pieRows.map((r) => r.zone.name),
        values: pieRows.map((r) => r.minutes),
        type: "pie",
        hole: DONUT_HOLE,
        sort: false,
        direction: "counterclockwise",
        rotation: 90,
        textinfo: "none",
        textposition: "none",
        hoverlabel: { font: { size: 12 } },
        marker: {
          colors: pieRows.map((r) => r.color),
          line: { color: "rgba(255,255,255,0.92)", width: 2.5 },
        },
        customdata: pieRows.map(
          (s) => `${s.zone.name}<br>${formatAnalyticsZoneBpm(s.zone)}`,
        ),
        hovertemplate:
          "%{customdata}<br><b>%{value:.0f}</b> мин · %{percent}<extra></extra>",
      },
    ];
  }, [pieRows]);

  if (pieRows.length === 0) {
    return (
      <div className="flex aspect-square max-h-[min(88vw,22rem)] w-full items-center justify-center rounded-xl border border-dashed border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle)/0.5)]">
        <p className="text-sm text-[rgb(var(--app-text-muted))] px-5 text-center">Нет минут в зонах за период</p>
      </div>
    );
  }

  return (
    <div className="relative w-full max-w-[22rem] lg:max-w-none mx-auto lg:mx-0">
      <div
        className="absolute inset-[6%] rounded-full opacity-40 blur-2xl pointer-events-none"
        style={{
          background: `conic-gradient(${pieRows.map((r, i) => `${r.color} ${(i / pieRows.length) * 100}% ${((i + 1) / pieRows.length) * 100}%`).join(", ")})`,
        }}
        aria-hidden
      />
      <div className="relative aspect-square w-full drop-shadow-[0_12px_40px_rgba(15,23,42,0.12)] dark:drop-shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <PlotChart
          key={`${plotKey}-${resolvedTheme}`}
          data={plotData}
          layout={donutLayout}
          compact
          className="w-full h-full [&_.js-plotly-plot]:!min-h-0 [&_.main-svg]:mx-auto"
          config={{
            responsive: true,
            displayModeBar: false,
            displaylogo: false,
          }}
        />
      </div>
    </div>
  );
});

function ZoneListRow({
  row,
  isDominant,
  maxPercent,
}: {
  row: ZoneRow;
  isDominant: boolean;
  maxPercent: number;
}) {
  const barWidth = maxPercent > 0 ? Math.min(100, (row.percent / maxPercent) * 100) : 0;

  return (
    <article
      className={`group rounded-xl border p-3 transition-all duration-200 hover:shadow-md ${
        isDominant
          ? "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-sm ring-1 ring-inset"
          : "border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.35)] hover:border-[rgb(var(--app-border))]"
      }`}
      style={
        isDominant
          ? { boxShadow: `0 0 0 1px ${row.color}33`, borderColor: `${row.color}55` }
          : undefined
      }
      title={row.tip}
    >
      <div className="flex gap-3 items-start min-w-0">
        <div
          className="w-1 shrink-0 self-stretch rounded-full min-h-[3.25rem]"
          style={{ backgroundColor: row.color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-start justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h4
                  className="text-sm font-semibold truncate"
                  style={{ color: row.color }}
                >
                  {row.zone.name}
                </h4>
                {isDominant ? (
                  <span
                    className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-md"
                    style={{
                      color: row.color,
                      backgroundColor: row.muted,
                    }}
                  >
                    основная
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-[rgb(var(--app-text-muted))] tabular-nums mt-0.5">
                {formatAnalyticsZoneBpm(row.zone)}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold tabular-nums text-[rgb(var(--app-text))] leading-none">
                {row.minutes > 0 ? formatZoneMinutes(row.minutes) : "—"}
              </p>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))] mt-0.5">
                {row.minutes > 0 ? "мин" : "нет данных"}
              </p>
            </div>
          </div>
          <div className="space-y-1">
            <div
              className="h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: row.muted }}
            >
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out group-hover:opacity-100 opacity-90"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: row.color,
                  boxShadow: row.minutes > 0 ? `0 0 12px ${row.color}55` : undefined,
                }}
              />
            </div>
            <p className="text-xs font-medium tabular-nums text-[rgb(var(--app-text-muted))]">
              {row.minutes > 0 ? `${row.percent}% времени` : "0%"}
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}

function ZoneDashboard({
  rows,
  stats,
  plotKey,
}: {
  rows: ZoneRow[];
  stats: ReturnType<typeof computePanelStats>;
  plotKey: string;
}) {
  const maxPercent = useMemo(
    () => Math.max(0, ...rows.map((r) => r.percent)),
    [rows],
  );

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] gap-4 xl:gap-5 items-center xl:items-start">
      <div className="lg:sticky lg:top-4 flex justify-center lg:justify-center lg:py-2">
        <ZoneDonut rows={rows} totalMinutes={stats.totalMin} plotKey={plotKey} />
      </div>
      <div className="space-y-2 min-w-0">
        {rows.map((row) => (
          <ZoneListRow
            key={row.zone.id}
            row={row}
            isDominant={stats.dominant?.zone.id === row.zone.id && row.minutes > 0}
            maxPercent={maxPercent}
          />
        ))}
      </div>
    </div>
  );
}

function ZoneTipsFooter({ rows }: { rows: ZoneRow[] }) {
  return (
    <details className="group rounded-xl border border-[rgb(var(--app-border)/0.7)] bg-[rgb(var(--app-surface-subtle)/0.35)]">
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-medium text-[rgb(var(--app-text))] flex items-center justify-between gap-2 [&::-webkit-details-marker]:hidden">
        <span>Рекомендации по зонам</span>
        <span className="text-[rgb(var(--app-text-muted))] transition-transform group-open:rotate-180" aria-hidden>
          ▾
        </span>
      </summary>
      <ul className="px-3 pb-3 space-y-2 border-t border-[rgb(var(--app-border)/0.5)] pt-2.5">
        {rows.map((row) => (
          <li key={row.zone.id} className="flex gap-2.5 text-sm text-[rgb(var(--app-text-muted))] min-w-0">
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: row.color }}
              aria-hidden
            />
            <span className="leading-snug min-w-0">
              <span className="font-medium text-[rgb(var(--app-text))]">
                {row.zone.name}
              </span>
              {": "}
              {row.tip}
            </span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function HeartRateZonesPanel({
  data,
  isLoading,
  workoutType,
  onWorkoutTypeChange,
  days,
  maxHr,
  profileLoading,
  hasProfileMax,
}: {
  data: ZoneTimeResponse | undefined;
  isLoading: boolean;
  workoutType: string;
  onWorkoutTypeChange: (v: string) => void;
  /** Для ключей графика (дней в периоде). */
  days: number;
  maxHr: number | null;
  profileLoading: boolean;
  hasProfileMax: boolean;
}) {
  const typeOptions = useMemo(() => {
    const fromApi = data?.available_types ?? [];
    return [{ id: "", label: "Все с пульсом" }, ...fromApi];
  }, [data?.available_types]);

  const zoneRows = useMemo(
    () => (data ? buildZoneRows(data) : []),
    [data],
  );

  const stats = useMemo(
    () => (data ? computePanelStats(zoneRows, data) : null),
    [zoneRows, data],
  );

  const plotKey = `${days}-${workoutType}-${data?.total_seconds ?? 0}`;

  if (profileLoading || isLoading) {
    return <Loader label="Зоны пульса…" />;
  }

  if (!hasProfileMax || !maxHr) {
    return (
      <div className="rounded-xl border border-dashed border-[rgb(var(--app-border))] p-5 text-center space-y-2 bg-[rgb(var(--app-surface-subtle)/0.35)]">
        <p className="text-sm text-[rgb(var(--app-text-muted))]">
          Укажите максимальный пульс в профиле — от него считаются зоны.
        </p>
        <Link
          to="/settings?tab=profile"
          className="inline-flex min-h-11 items-center text-brand-600 dark:text-brand-400 font-medium text-sm"
        >
          Перейти в профиль →
        </Link>
      </div>
    );
  }

  if (!data?.total_seconds) {
    return (
      <div className="space-y-5">
        <WorkoutTypeFilter
          workoutType={workoutType}
          onWorkoutTypeChange={onWorkoutTypeChange}
          typeOptions={typeOptions}
        />
        <div className="rounded-xl border border-dashed border-[rgb(var(--app-border))] p-5 text-center space-y-2 bg-[rgb(var(--app-surface-subtle)/0.35)]">
          <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">{EMPTY_MESSAGE}</p>
          <Link
            to="/settings?tab=analytics"
            className="inline-flex min-h-11 items-center text-brand-600 dark:text-brand-400 font-medium text-sm"
          >
            Настройки интеграций →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 min-w-0">
      <WorkoutTypeFilter
        workoutType={workoutType}
        onWorkoutTypeChange={onWorkoutTypeChange}
        typeOptions={typeOptions}
      />

      {stats ? <SummaryRow stats={stats} /> : null}

      {stats ? (
        <ZoneDashboard rows={zoneRows} stats={stats} plotKey={plotKey} />
      ) : null}

      <ZoneTipsFooter rows={zoneRows} />
    </div>
  );
}
