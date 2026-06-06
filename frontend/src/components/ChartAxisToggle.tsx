import type { HrChartAxis } from "../utils/hrChart";

const btnClass = (active: boolean) =>
  active
    ? "bg-brand-600 text-white border-brand-600"
    : "border-slate-200 dark:border-slate-600 text-[rgb(var(--app-text-muted))] hover:bg-slate-100 dark:hover:bg-slate-700";

export function ChartAxisToggle({
  axis,
  onChange,
  canDistance,
}: {
  axis: HrChartAxis;
  onChange: (axis: HrChartAxis) => void;
  canDistance: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500">Ось:</span>
      <button
        type="button"
        onClick={() => onChange("time")}
        className={`px-2 py-0.5 text-xs rounded border ${btnClass(axis === "time")}`}
        style={axis !== "time" ? { backgroundColor: "rgb(var(--app-surface))" } : undefined}
      >
        Время
      </button>
      <button
        type="button"
        onClick={() => onChange("distance")}
        disabled={!canDistance}
        title={!canDistance ? "Нет distance_m — переимпортируйте FIT" : "Без остановок"}
        className={`px-2 py-0.5 text-xs rounded border ${btnClass(axis === "distance")} disabled:opacity-40`}
        style={axis !== "distance" ? { backgroundColor: "rgb(var(--app-surface))" } : undefined}
      >
        Дистанция
      </button>
    </div>
  );
}
