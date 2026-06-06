import {
  Dumbbell,
  Flame,
  HeartPulse,
  Moon,
  Scale,
  Zap,
} from "lucide-react";
import { useUnits } from "../../../hooks/useUnits";
import type { useDashboardHome } from "../../../hooks/useDashboardHome";
import type { useDashboardTrainingLoad } from "../../../hooks/useDashboardTrainingLoad";
import { fmtNum } from "../../../utils/fmtNum";
import { MiniSparkline } from "../../FoodDiary/premium/MiniSparkline";
import { HEALTH_METRIC } from "../../../shared/healthMetricColors";
import { DashboardMetricTile, type DashboardMetricAccent } from "./DashboardShell";
import { Skeleton } from "../../../components/ui/skeleton";
import { dashboardEmpty } from "./emptyCopy";
import {
  formatSleepHours,
  formatDashboardWorkoutDate,
  pickLatestWorkout,
  tsbRecoveryLabel,
  tsbValueClass,
  weightDeltaLabel,
} from "./utils";

type DashboardHome = ReturnType<typeof useDashboardHome>;

const STEPS_GOAL = 10_000;

function TileSkeleton() {
  return (
    <div className="dashboard-metric-tile" aria-hidden>
      <Skeleton className="h-2.5 w-16" />
      <Skeleton className="mt-3 h-8 w-24" />
      <Skeleton className="mt-3 h-2.5 w-full" />
    </div>
  );
}

function MetricIcon({
  variant,
  children,
}: {
  variant: string;
  children: React.ReactNode;
}) {
  return (
    <span className={`dashboard-metric-tile__icon dashboard-metric-tile__icon--${variant}`}>
      {children}
    </span>
  );
}

export function DashboardHeroStrip({
  data,
  trainingLoad,
}: {
  data: DashboardHome;
  trainingLoad: ReturnType<typeof useDashboardTrainingLoad>;
}) {
  const { formatEnergy } = useUnits();

  const food = data.food.data;
  const expenditure = data.expenditure.data;
  const intake = food?.daily_totals?.calories ?? 0;
  const hasFoodToday = Boolean(food?.daily_totals && intake > 0);
  const calorieTarget =
    food?.goals?.calories_goal ??
    expenditure?.total_expenditure ??
    food?.expenditure?.total_burn ??
    null;
  const calorieProgress =
    calorieTarget != null && calorieTarget > 0
      ? Math.round((intake / calorieTarget) * 100)
      : null;
  const caloriesLeft =
    calorieTarget != null && calorieTarget > intake
      ? Math.round(calorieTarget - intake)
      : null;

  const hcSnap = data.hcSnapshot.data;
  const hcHubSteps = data.healthConnect.data?.steps;
  const stepsPoint =
    data.stepsToday.data?.items?.find((i) => i.date === data.today) ?? null;
  const stepsValue =
    stepsPoint?.steps ?? hcSnap?.steps_today ?? hcHubSteps?.today ?? null;
  const stepsProgress =
    stepsValue != null && stepsValue > 0
      ? Math.round((stepsValue / STEPS_GOAL) * 100)
      : null;
  const stepsWeek = (data.stepsWeek.data?.items ?? []).map((i) => ({
    date: i.date,
    steps: i.steps,
  }));

  const tsb = trainingLoad.current?.tsb;
  const sleepHours = (data.sleep.data?.last_night_hours as number | null | undefined) ?? null;
  const sleepQuality = data.sleep.data?.quality_score as number | null | undefined;

  const weight = (data.body.data?.metrics as { weight_kg?: { value?: number } } | undefined)
    ?.weight_kg?.value;
  const weightSeries = data.weightWeek.data?.items ?? [];
  const weightSub =
    weightDeltaLabel(weight, weightSeries, data.today) ?? dashboardEmpty.noWeight;

  const strengthSession = data.latestStrength.data?.items?.[0];
  const cardioDate = trainingLoad.current?.last_workout_date;
  const latest = pickLatestWorkout(
    strengthSession?.date,
    strengthSession?.workout_title,
    cardioDate ?? undefined,
  );

  type TileProps = Omit<React.ComponentProps<typeof DashboardMetricTile>, "accent" | "label">;

  const tile = (accent: DashboardMetricAccent, label: string, props: TileProps) => (
    <DashboardMetricTile accent={accent} label={label} {...props} />
  );

  return (
    <div className="dashboard-v2__hero-wrap">
    <div className="dashboard-v2__hero" aria-label="Ключевые показатели">
      {data.food.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("calories", "Калории", {
          href: "/food",
          value: hasFoodToday ? formatEnergy(intake) : "—",
          sub:
            calorieTarget != null
              ? hasFoodToday
                ? `из ${formatEnergy(calorieTarget)}`
                : dashboardEmpty.setCalorieGoal
              : dashboardEmpty.setCalorieGoal,
          tag:
            caloriesLeft != null && hasFoodToday
              ? `Осталось ${formatEnergy(caloriesLeft)}`
              : undefined,
          progress: hasFoodToday ? calorieProgress : null,
          progressVariant: "calories",
          icon: (
            <MetricIcon variant="calories">
              <Flame className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
      {data.stepsToday.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("steps", "Активность", {
          href: "/body?tab=health-connect",
          value: stepsValue != null ? stepsValue.toLocaleString("ru-RU") : "—",
          sub:
            stepsValue != null
              ? `Цель: ${STEPS_GOAL.toLocaleString("ru-RU")} шагов`
              : dashboardEmpty.noSteps,
          progress: stepsProgress,
          progressVariant: "steps",
          sparkline:
            stepsWeek.length > 1 ? (
              <div className="dashboard-metric-tile__spark dashboard-metric-tile__spark--line">
                <MiniSparkline
                  values={stepsWeek.map((i) => i.steps ?? 0)}
                  color={HEALTH_METRIC.steps.primary}
                  width={100}
                  height={28}
                />
              </div>
            ) : undefined,
          icon: (
            <MetricIcon variant="steps">
              <Zap className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
      {trainingLoad.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("recovery", "Восстановление", {
          href: "/analytics",
          value:
            trainingLoad.metricsReady && tsb != null
              ? fmtNum(tsb, 1)
              : "—",
          sub:
            trainingLoad.metricsReady && tsb != null
              ? tsbRecoveryLabel(tsb)
              : dashboardEmpty.noDataToday,
          tag: tsb != null && tsb > 0 ? "Хорошо" : undefined,
          valueClassName: tsbValueClass(tsb),
          icon: (
            <MetricIcon variant="recovery">
              <HeartPulse className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
      {data.sleep.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("sleep", "Сон", {
          href: "/body?tab=health-connect",
          value: formatSleepHours(sleepHours),
          sub:
            sleepHours != null
              ? sleepQuality != null
                ? `Качество: ${Math.round(sleepQuality)}%`
                : "прошлая ночь"
              : dashboardEmpty.noSleep,
          tag: sleepHours != null && (sleepQuality ?? 0) >= 70 ? "Хорошо" : undefined,
          icon: (
            <MetricIcon variant="sleep">
              <Moon className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
      {data.body.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("weight", "Вес", {
          href: "/body",
          value: weight != null ? `${fmtNum(weight, 1)} кг` : "—",
          sub: weight != null ? weightSub : dashboardEmpty.addFirstEntry,
          sparkline:
            weightSeries.length > 1 ? (
              <div className="dashboard-metric-tile__spark dashboard-metric-tile__spark--line">
                <MiniSparkline
                  values={weightSeries.map((i) => i.weight_kg).filter((v) => v != null) as number[]}
                  color={HEALTH_METRIC.weight.primary}
                  width={100}
                  height={28}
                />
              </div>
            ) : undefined,
          icon: (
            <MetricIcon variant="weight">
              <Scale className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
      {data.latestStrength.isLoading ? (
        <TileSkeleton />
      ) : (
        tile("workout", "Тренировка", {
          href: "/workouts",
          value: formatDashboardWorkoutDate(latest.date),
          sub: latest.label ?? dashboardEmpty.noWorkout,
          icon: (
            <MetricIcon variant="workout">
              <Dumbbell className="h-6 w-6" aria-hidden />
            </MetricIcon>
          ),
        })
      )}
    </div>
    </div>
  );
}
