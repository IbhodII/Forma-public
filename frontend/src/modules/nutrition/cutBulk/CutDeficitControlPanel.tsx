import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { ReactNode } from "react";
import { Loader } from "../../../components/Loader";
import { cn } from "../../../lib/utils";
import { CUT_BALANCE_PERIOD_LABEL } from "./balancePeriod";
import { formatDateRu } from "../../../utils/format";
import { parseApiError } from "../../../utils/validation";
import { useUnits } from "../../../hooks/useUnits";
import { useCutDeficitControl } from "./useCutDeficitControl";

function StatusNote({
  variant,
  children,
}: {
  variant: "ok" | "danger" | "info" | "muted";
  children: ReactNode;
}) {
  const styles = {
    ok: "border-l-emerald-500 text-emerald-800 dark:text-emerald-200",
    danger: "border-l-rose-500 text-rose-800 dark:text-rose-200",
    info: "border-l-sky-500 text-sky-900 dark:text-sky-100",
    muted: "border-l-slate-400 text-[rgb(var(--app-text-muted))]",
  };
  const Icon =
    variant === "ok" ? CheckCircle2 : variant === "danger" ? AlertTriangle : Info;

  return (
    <p className={cn("flex items-start gap-1.5 border-l-2 pl-2 leading-snug text-[11px]", styles[variant])}>
      {variant !== "muted" ? (
        <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
      ) : null}
      <span>{children}</span>
    </p>
  );
}

/** Поле лимита дефицита — в одной строке с целями по весу/% жира. */
export function CutDeficitLimitField({
  preferChest,
  control,
  className,
}: {
  preferChest?: boolean;
  control?: ReturnType<typeof useCutDeficitControl>;
  className?: string;
}) {
  const internal = useCutDeficitControl(preferChest);
  const { maxDeficit, setMaxDeficit, persistLimit } = control ?? internal;

  return (
    <label className={cn("goal-projection-field text-xs min-w-0", className)}>
      <span className="goal-projection-field__label goal-projection-field__label--nowrap">
        Лимит, ккал/кг жира
      </span>
      <input
        type="number"
        min={5}
        max={60}
        step={1}
        value={maxDeficit}
        onChange={(e) => setMaxDeficit(Number(e.target.value))}
        onBlur={persistLimit}
        className="input-field mt-0.5 !min-h-8 !py-1.5 !text-sm w-full"
      />
    </label>
  );
}

/** Метрики и статусы контроля дефицита — над графиком прогноза. */
export function CutDeficitControlStats({
  preferChest,
  control,
}: {
  preferChest?: boolean;
  control?: ReturnType<typeof useCutDeficitControl>;
}) {
  const { formatEnergy } = useUnits();
  const internal = useCutDeficitControl(preferChest);
  const { maxDeficit, controlQuery, data, realPerKg, realKcal } = control ?? internal;

  return (
    <div className="rounded-md border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface-subtle)/0.35)] px-2 py-1.5 space-y-1.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-0.5">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Контроль дефицита
        </h3>
        <span className="text-[10px] text-[rgb(var(--app-text-muted))]">{CUT_BALANCE_PERIOD_LABEL}</span>
      </div>

      {controlQuery.isLoading && <Loader label="Расчёт дефицита…" compact />}
      {controlQuery.isError && (
        <p className="text-[11px] text-rose-600 dark:text-rose-400">
          {parseApiError(controlQuery.error)}
        </p>
      )}

      {data?.ok && (
        <div className="space-y-1.5">
          {data.period_start && data.period_end && (
            <p className="text-[10px] text-[rgb(var(--app-text-muted))] tabular-nums">
              {formatDateRu(data.period_start)} — {formatDateRu(data.period_end)}
            </p>
          )}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-[11px]">
            <div>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))]">Потребление</p>
              <p className="font-semibold tabular-nums">{formatEnergy(data.average_daily_intake ?? 0)}/д</p>
            </div>
            <div>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))]">Расход</p>
              <p className="font-semibold tabular-nums">{formatEnergy(data.average_daily_expenditure ?? 0)}/д</p>
            </div>
            <div>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))]">Дефицит</p>
              <p className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatEnergy(realKcal ?? 0)}/д
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))]">Факт, ккал/кг</p>
              <p className="font-semibold tabular-nums">
                {Number.isFinite(realPerKg) ? realPerKg!.toFixed(1) : "—"}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-[rgb(var(--app-text-muted))]">План, ккал/кг</p>
              <p className="font-semibold tabular-nums text-[rgb(var(--app-text-muted))]">{maxDeficit}</p>
            </div>
            {data.fat_kg != null && (
              <div>
                <p className="text-[10px] text-[rgb(var(--app-text-muted))]">Цель, ккал/д</p>
                <p className="font-semibold tabular-nums text-[rgb(var(--app-text-muted))]">
                  {formatEnergy(data.target_deficit_kcal_per_day ?? Math.round(maxDeficit * data.fat_kg))}
                </p>
              </div>
            )}
          </div>

          {data.days_missing != null && data.days_missing > 0 && (
            <StatusNote variant="info">
              {data.days_missing} дн. без записей
              {data.days_counted != null ? ` (учтено ${data.days_counted})` : ""}
            </StatusNote>
          )}
          {data.status === "within_limit" && data.message && (
            <StatusNote variant="ok">{data.message}</StatusNote>
          )}
          {data.status === "over_limit" && data.message && (
            <StatusNote variant="danger">
              {data.message}
              {data.extra_kcal_per_day != null && data.extra_kcal_per_day > 0 && (
                <>
                  {" "}
                  <strong>+{formatEnergy(data.extra_kcal_per_day)}/день</strong>
                </>
              )}
            </StatusNote>
          )}
          {data.status === "below_target" && data.message && (
            <StatusNote variant="info">{data.message}</StatusNote>
          )}
          {data.status === "no_deficit" && data.message && (
            <StatusNote variant="muted">{data.message}</StatusNote>
          )}
        </div>
      )}

      {data && !data.ok && data.error && (
        <p className="text-[11px] text-amber-700 dark:text-amber-300">{data.error}</p>
      )}
    </div>
  );
}

/** Полный блок (настройки и др.). */
export function CutDeficitControlPanel({
  preferChest,
  compact = false,
}: {
  preferChest?: boolean;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="space-y-1.5">
        <CutDeficitLimitField preferChest={preferChest} />
        <CutDeficitControlStats preferChest={preferChest} />
      </div>
    );
  }

  return (
    <div className="card-panel space-y-4 border border-[rgb(var(--app-border))]">
      <div>
        <h3 className="font-medium">Контроль дефицита (сушка)</h3>
        <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1">
          Фактический дефицит — расход минус потребление. Целевой лимит — ориентир для сравнения.
        </p>
      </div>
      <CutDeficitLimitField preferChest={preferChest} className="max-w-xs" />
      <CutDeficitControlStats preferChest={preferChest} />
    </div>
  );
}
