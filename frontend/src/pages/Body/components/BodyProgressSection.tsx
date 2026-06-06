import { useEffect, useMemo, useState } from "react";
import type { PlotParams } from "react-plotly.js";
import { PlotChart } from "../../../components/Plot";
import { Loader } from "../../../components/Loader";
import { useUserProfile } from "../../../hooks/useUserProfile";
import { useUnits } from "../../../hooks/useUnits";
import type { BodyMetricRow } from "../../../types";
import {
  BODY_CHART_PERIOD_OPTIONS,
  BODY_CIRCUMFERENCE_CHART_LINES,
  BODY_COMPOSITION_CHART_LINES,
  CIRCUMFERENCE_LS_KEY,
  COMPOSITION_LS_KEY,
  type BodyChartPeriod,
  loadChartLinePrefs,
  saveChartLinePrefs,
} from "../../../utils/bodyMetrics";
import { buildBodyChartTraces, BODY_CHART_LAYOUT } from "../utils/bodyChartTraces";

type ProgressTab = "composition" | "circumferences";

function compositionChartLines(useAmerican: boolean) {
  if (!useAmerican) return BODY_COMPOSITION_CHART_LINES;
  return BODY_COMPOSITION_CHART_LINES.map((line) => {
    if (line.key === "weight_kg") return { ...line, label: "Вес, Jp" };
    if (line.key === "muscle_mass_kg") return { ...line, label: "Мышцы, Jp" };
    return line;
  });
}

function LineToggles({
  lines,
  active,
  focusKey,
  onChange,
  onFocus,
}: {
  lines: { key: string; label: string; color: string }[];
  active: string[];
  focusKey: string | null;
  onChange: (keys: string[]) => void;
  onFocus: (key: string | null) => void;
}) {
  const toggle = (key: string) => {
    if (active.includes(key)) {
      onChange(active.filter((k) => k !== key));
      if (focusKey === key) onFocus(null);
    } else {
      onChange([...active, key]);
    }
  };

  return (
    <div className="flex flex-wrap gap-2 mt-3">
      {lines.map((line) => {
        const on = active.includes(line.key);
        const focused = focusKey === line.key;
        return (
          <button
            key={line.key}
            type="button"
            onClick={() => toggle(line.key)}
            onDoubleClick={(e) => {
              e.preventDefault();
              if (focused) onFocus(null);
              else {
                onChange([line.key]);
                onFocus(line.key);
              }
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-all ${
              on
                ? focused
                  ? "border-[rgb(var(--app-accent))] bg-[rgb(var(--app-accent)/0.12)] shadow-sm"
                  : "border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))]"
                : "border-transparent opacity-50"
            }`}
            title="Двойной клик — фокус на одной метрике"
          >
            <span
              className="h-2 w-2 rounded-full shrink-0"
              style={{ backgroundColor: line.color }}
              aria-hidden
            />
            {line.label}
          </button>
        );
      })}
      {focusKey ? (
        <button
          type="button"
          className="text-xs text-[rgb(var(--app-text-muted))] underline-offset-2 hover:underline px-1"
          onClick={() => onFocus(null)}
        >
          Сбросить фокус
        </button>
      ) : null}
    </div>
  );
}

export function BodyProgressSection({
  rows,
  isLoading,
  period,
  onPeriodChange,
}: {
  rows: BodyMetricRow[] | undefined;
  isLoading: boolean;
  period: BodyChartPeriod;
  onPeriodChange: (p: BodyChartPeriod) => void;
}) {
  const { system } = useUnits();
  const { data: profile } = useUserProfile();
  const weekLabel = profile?.week_start_label?.toLowerCase() ?? "суббота";
  const useAmerican = system === "american";
  const compositionLines = useMemo(
    () => compositionChartLines(useAmerican),
    [useAmerican],
  );

  const [tab, setTab] = useState<ProgressTab>("composition");
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const defaultComp = BODY_COMPOSITION_CHART_LINES.map((l) => l.key);
  const defaultCirc = BODY_CIRCUMFERENCE_CHART_LINES.map((l) => l.key);

  const [compActive, setCompActive] = useState(() =>
    loadChartLinePrefs(COMPOSITION_LS_KEY, defaultComp),
  );
  const [circActive, setCircActive] = useState(() =>
    loadChartLinePrefs(CIRCUMFERENCE_LS_KEY, defaultCirc),
  );

  useEffect(() => {
    saveChartLinePrefs(COMPOSITION_LS_KEY, compActive);
  }, [compActive]);

  useEffect(() => {
    saveChartLinePrefs(CIRCUMFERENCE_LS_KEY, circActive);
  }, [circActive]);

  const compTraces = useMemo(
    () => buildBodyChartTraces(rows ?? [], compositionLines, compActive, useAmerican, focusKey),
    [rows, compActive, compositionLines, useAmerican, focusKey],
  );
  const circTraces = useMemo(
    () => buildBodyChartTraces(rows ?? [], BODY_CIRCUMFERENCE_CHART_LINES, circActive, false, focusKey),
    [rows, circActive, focusKey],
  );

  const hasFatAxis = useMemo(
    () => compTraces.some((t) => (t as { yaxis?: string }).yaxis === "y2"),
    [compTraces],
  );

  const compositionLayout: NonNullable<PlotParams["layout"]> = useMemo(
    () => ({
      ...BODY_CHART_LAYOUT,
      margin: {
        ...BODY_CHART_LAYOUT.margin,
        r: hasFatAxis ? 56 : BODY_CHART_LAYOUT.margin?.r,
      },
      yaxis: {
        ...BODY_CHART_LAYOUT.yaxis,
        title: { text: useAmerican ? "Jp" : "кг" },
        tickformat: ".1f",
      },
      ...(hasFatAxis
        ? {
            yaxis2: {
              title: { text: "Жир, %" },
              overlaying: "y" as const,
              side: "right" as const,
              automargin: true,
              zeroline: false,
              tickformat: ".1f",
            },
          }
        : {}),
    }),
    [useAmerican, hasFatAxis],
  );

  const circLayout: NonNullable<PlotParams["layout"]> = useMemo(
    () => ({
      ...BODY_CHART_LAYOUT,
      yaxis: {
        ...BODY_CHART_LAYOUT.yaxis,
        title: { text: "см" },
        tickformat: ".1f",
      },
    }),
    [],
  );

  const periodTabs = (
    <div className="body-progress-tabs" role="tablist" aria-label="Период графика">
      {BODY_CHART_PERIOD_OPTIONS.map((o) => (
        <button
          key={o.id}
          type="button"
          role="tab"
          aria-selected={period === o.id}
          className={`body-progress-tab ${period === o.id ? "body-progress-tab--active" : ""}`}
          onClick={() => onPeriodChange(o.id)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );

  const progressTabs = (
    <div className="body-progress-tabs" role="tablist" aria-label="Тип динамики">
      <button
        type="button"
        role="tab"
        aria-selected={tab === "composition"}
        className={`body-progress-tab ${tab === "composition" ? "body-progress-tab--active" : ""}`}
        onClick={() => {
          setTab("composition");
          setFocusKey(null);
        }}
      >
        Вес · жир · мышцы
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={tab === "circumferences"}
        className={`body-progress-tab ${tab === "circumferences" ? "body-progress-tab--active" : ""}`}
        onClick={() => {
          setTab("circumferences");
          setFocusKey(null);
        }}
      >
        Обхваты
      </button>
    </div>
  );

  const traces = tab === "composition" ? compTraces : circTraces;
  const layout = tab === "composition" ? compositionLayout : circLayout;
  const lineDefs = tab === "composition" ? compositionLines : BODY_CIRCUMFERENCE_CHART_LINES;
  const active = tab === "composition" ? compActive : circActive;
  const setActive = tab === "composition" ? setCompActive : setCircActive;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[rgb(var(--app-text-muted))] leading-snug">
        Одна точка на неделю — контрольный замер в {weekLabel} (как в истории).
      </p>
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:items-center sm:justify-between">
        {progressTabs}
        {periodTabs}
      </div>

      {isLoading ? <Loader label="Загрузка графиков…" /> : null}

      {!isLoading && (
        <>
          <div className="body-chart-wrap p-2 sm:p-3">
            {traces.length > 0 ? (
              <PlotChart
                data={traces}
                layout={layout}
                compact
                tall={!!focusKey}
                className="w-full min-w-0"
              />
            ) : (
              <p className="text-sm text-[rgb(var(--app-text-muted))] py-12 text-center">
                Нет данных за выбранный период
              </p>
            )}
          </div>
          <LineToggles
            lines={lineDefs}
            active={active}
            focusKey={focusKey}
            onChange={setActive}
            onFocus={setFocusKey}
          />
          <p className="text-[11px] text-[rgb(var(--app-text-muted))]">
            Двойной клик по метрике — режим фокуса на одной линии.
            {useAmerican && tab === "composition"
              ? " Вес и мышцы в японских единицах (Jp)."
              : null}
          </p>
        </>
      )}
    </div>
  );
}
