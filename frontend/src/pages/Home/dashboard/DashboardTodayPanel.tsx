import { Link } from "react-router-dom";
import { useUnits } from "../../../hooks/useUnits";
import type { useDashboardHome } from "../../../hooks/useDashboardHome";
import { fmtNum } from "../../../utils/fmtNum";
import { parseApiError } from "../../../utils/validation";
import { MiniSparkline } from "../../FoodDiary/premium/MiniSparkline";
import { DashboardPanel, DashboardPanelSkeleton } from "./DashboardShell";
import { dashboardEmpty } from "./emptyCopy";

type DashboardHome = ReturnType<typeof useDashboardHome>;

const WEIGHT_SPARK_COLOR = "#14b8a6";

function StepsSparkline({
  series,
}: {
  series: Array<{ date: string; steps?: number }>;
}) {
  const values = series.map((p) => Number(p.steps ?? 0));
  if (values.length < 2) return null;
  return (
    <div className="dashboard-today-spark" aria-hidden>
      <MiniSparkline values={values} color="#06B6D4" width={120} height={36} />
    </div>
  );
}

export function DashboardTodayPanel({ data }: { data: DashboardHome }) {
  const { formatEnergy } = useUnits();
  const loading =
    data.food.isLoading || data.body.isLoading || data.stepsWeek.isLoading;
  const error = data.food.isError
    ? parseApiError(data.food.error)
    : data.body.isError
      ? parseApiError(data.body.error)
      : null;

  if (loading) return <DashboardPanelSkeleton rows={6} />;
  if (error) {
    return (
      <DashboardPanel title="Сегодня" eyebrow={data.today}>
        <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
      </DashboardPanel>
    );
  }

  const totals = data.food.data?.daily_totals;
  const fiberTarget = data.food.data?.daily_fiber_target?.recommended_grams ?? 30;
  const fiber = totals?.fiber ?? 0;
  const calorieTarget =
    data.food.data?.goals?.calories_goal ??
    data.expenditure.data?.total_expenditure ??
    null;
  const caloriePct =
    calorieTarget && totals?.calories
      ? Math.min(100, Math.round((totals.calories / calorieTarget) * 100))
      : null;

  const metrics = data.body.data?.metrics as
    | {
        weight_kg?: { value?: number };
        body_fat_percent?: { value?: number };
      }
    | undefined;
  const weight = metrics?.weight_kg?.value;
  const bf = metrics?.body_fat_percent?.value;

  const stepsToday =
    data.stepsToday.data?.items?.find((i) => i.date === data.today)?.steps ??
    data.hcSnapshot.data?.steps_today ??
    data.healthConnect.data?.steps?.today ??
    null;
  const stepsWeek = (data.stepsWeek.data?.items ?? []).map((i) => ({
    date: i.date,
    steps: i.steps,
  }));
  const weightWeek = (data.weightWeek.data?.items ?? []).map((i) => i.weight_kg);
  const weightSparkValues = weightWeek.filter((v) => v != null && Number.isFinite(v)) as number[];

  const hubCal = data.healthConnect.data?.calories;
  const activeKcal = hubCal?.today_active ?? null;

  return (
    <DashboardPanel
      title="Сегодня"
      eyebrow={data.today}
      action={
        <Link
          to="/food"
          className="text-[11px] font-medium text-[rgb(var(--app-accent))] hover:underline"
        >
          Дневник →
        </Link>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="dashboard-section-label">Питание</p>
          {totals && totals.calories > 0 ? (
            <div className="mt-1.5 space-y-1.5">
              <p className="text-2xl sm:text-3xl font-bold tabular-nums tracking-tight text-[rgb(var(--app-text))]">
                {formatEnergy(totals.calories)}
                {calorieTarget ? (
                  <span className="text-sm font-medium text-[rgb(var(--app-text-muted))]">
                    {" "}
                    / {formatEnergy(calorieTarget)}
                  </span>
                ) : null}
              </p>
              {caloriePct != null ? (
                <div className="dashboard-progress-bar" aria-hidden>
                  <span style={{ width: `${caloriePct}%` }} />
                </div>
              ) : null}
              <p className="text-xs tabular-nums text-[rgb(var(--app-text-muted))]">
                Б {fmtNum(totals.protein, 0)} · Ж {fmtNum(totals.fat, 0)} · У{" "}
                {fmtNum(totals.carbs, 0)} г · клетч. {fmtNum(fiber, 0)}/{fiberTarget} г
              </p>
            </div>
          ) : (
            <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
              {dashboardEmpty.noDataToday}. {dashboardEmpty.addFirstEntry}
            </p>
          )}
        </div>

        <div>
          <p className="dashboard-section-label">Активность</p>
          {stepsToday != null && stepsToday > 0 ? (
            <div className="mt-1.5 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
                  {stepsToday.toLocaleString("ru-RU")} шагов
                </p>
                <p className="text-xs text-[rgb(var(--app-text-muted))] mt-0.5">
                  {activeKcal != null
                    ? `${Math.round(activeKcal)} ккал активности`
                    : "Подключите Health Connect для деталей"}
                </p>
              </div>
              <StepsSparkline series={stepsWeek} />
            </div>
          ) : (
            <p className="mt-1 text-xs text-[rgb(var(--app-text-muted))]">
              {dashboardEmpty.noSteps}. {dashboardEmpty.connectSource}
            </p>
          )}
        </div>

        <div>
          <p className="dashboard-section-label">Вес и тело</p>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
              <p className="tabular-nums text-base">
                <span className="text-sm text-[rgb(var(--app-text-muted))]">Вес </span>
                <span className="font-bold text-[rgb(var(--app-text))]">
                  {weight != null ? `${fmtNum(weight, 1)} кг` : "—"}
                </span>
              </p>
              <p className="tabular-nums text-base">
                <span className="text-sm text-[rgb(var(--app-text-muted))]">Жир </span>
                <span className="font-bold text-[rgb(var(--app-text))]">
                  {bf != null ? `${fmtNum(bf, 1)} %` : "—"}
                </span>
              </p>
            </div>
            {weightSparkValues.length >= 2 ? (
              <div className="dashboard-today-spark" aria-hidden>
                <MiniSparkline
                  values={weightSparkValues}
                  color={WEIGHT_SPARK_COLOR}
                  width={128}
                  height={40}
                />
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </DashboardPanel>
  );
}
