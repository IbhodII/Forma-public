import { useEffect, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  Flame,
  Footprints,
  Heart,
  Moon,
  Scale,
} from "lucide-react";
import { queryKeys } from "../../../hooks/queryKeys";
import { useWeekStartDay } from "../../../hooks/useWeekStartDay";
import { Loader } from "../../../components/Loader";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { parseApiError } from "../../../utils/validation";
import {
  BODY_TAB_ACTIVITY,
  BODY_TAB_PULSE,
  BODY_TAB_SLEEP,
  BODY_TAB_STEPS,
  BODY_TAB_WEIGHT,
} from "../bodyHubConstants";
import "../body-overview.css";
import { useBodyOverviewSummary } from "./useBodyOverviewSummary";
import { BodyOverviewChartCard } from "./overview/BodyOverviewChartCard";
import { BodyOverviewHcCard } from "./overview/BodyOverviewHcCard";
import { BodyOverviewHeroMetric } from "./overview/BodyOverviewHeroMetric";
import {
  avgCaloriesWeek,
  BODY_OVERVIEW_WEIGHT_DAYS,
  formatSyncLabel,
  hrAvgEstimate,
  weightOverview,
} from "./overview/bodyOverviewUtils";
import { HEALTH_METRIC } from "../../../shared/healthMetricColors";
import { BodyOverviewMiniTrend } from "./overview/BodyOverviewMiniTrend";
import { BodyOverviewWeightChart } from "./overview/BodyOverviewWeightChart";
import { useUnits } from "../../../hooks/useUnits";

export function BodyOverviewTab() {
  const { formatBodyWeight, formatEnergy, formatWeightChange } = useUnits();
  const overviewQuery = useBodyOverviewSummary();
  const qc = useQueryClient();
  const weekStartDay = useWeekStartDay();

  const hub = overviewQuery.data?.health_connect_hub;
  const weight = overviewQuery.data?.weight;

  useEffect(() => {
    if (hub) {
      qc.setQueryData(queryKeys.healthConnectHub, hub);
    }
  }, [hub, qc]);

  const weightSummary = useMemo(
    () => weightOverview(weight, weekStartDay),
    [weight, weekStartDay],
  );
  const hasWeightChart = (weight?.items?.length ?? 0) > 0;

  if (overviewQuery.isLoading && !overviewQuery.data) {
    return (
      <div className="body-overview">
        <Loader label="Загрузка обзора…" />
      </div>
    );
  }

  if (overviewQuery.isError) {
    return (
      <div className="body-overview">
        <ErrorAlert message={parseApiError(overviewQuery.error)} />
      </div>
    );
  }

  if (!hub || !weight) {
    return (
      <div className="body-overview">
        <Loader label="Загрузка обзора…" />
      </div>
    );
  }

  const w = weightSummary;
  const stepsSpark = hub.steps.week_series.map((d) => d.steps);
  const sleepSpark = hub.sleep.week_nights.map((n) => n.duration_hours);
  const calSpark = hub.calories.week_series.map((d) => d.total_calories);
  const avgCal = avgCaloriesWeek(hub);
  const avgSleep = hub.sleep.avg_hours;
  const hrAvg = hrAvgEstimate(hub);
  const workoutCount = hub.workouts.items.length;

  return (
    <div className="body-overview">
      <section className="body-overview__hero" aria-label="Сводка за сегодня">
        <BodyOverviewHeroMetric
          icon={Scale}
          iconBg={HEALTH_METRIC.weight.rgb + " / 0.15"}
          iconColor={HEALTH_METRIC.weight.dark}
          label="Вес"
          value={w.current != null ? formatBodyWeight(w.current) : null}
          delta={
            w.delta != null
              ? `${formatWeightChange(w.delta)} к прошлой записи`
              : undefined
          }
          deltaTone={
            w.delta == null ? "neutral" : w.delta > 0 ? "up" : w.delta < 0 ? "down" : "neutral"
          }
          sparkValues={w.spark}
          sparkColor={HEALTH_METRIC.weight.primary}
          to={`/body?tab=${BODY_TAB_WEIGHT}`}
          emptyTitle="Нет записей веса"
          emptyHint="Добавьте вес во вкладке «Ежедневный вес»"
        />
        <BodyOverviewHeroMetric
          icon={Footprints}
          iconBg={`rgb(${HEALTH_METRIC.steps.rgb} / 0.15)`}
          iconColor={HEALTH_METRIC.steps.dark}
          label="Шаги сегодня"
          value={
            hub.steps.today != null
              ? hub.steps.today.toLocaleString("ru-RU")
              : null
          }
          meta={
            stepsSpark.length
              ? `за 7 дн. ≈ ${Math.round(stepsSpark.reduce((a, b) => a + b, 0) / stepsSpark.length).toLocaleString("ru-RU")}`
              : undefined
          }
          sparkValues={stepsSpark}
          sparkColor={HEALTH_METRIC.steps.primary}
          to={`/body?tab=${BODY_TAB_STEPS}`}
          emptyTitle="Нет шагов"
          emptyHint="Синхронизируйте Health Connect на телефоне"
        />
        <BodyOverviewHeroMetric
          icon={Moon}
          iconBg={`rgb(${HEALTH_METRIC.sleep.rgb} / 0.15)`}
          iconColor={HEALTH_METRIC.sleep.dark}
          label="Сон"
          value={
            hub.sleep.last_night.hours != null
              ? `${hub.sleep.last_night.hours} ч`
              : null
          }
          meta={
            avgSleep != null
              ? `среднее ${avgSleep} ч / нед`
              : hub.sleep.last_night.date
                ? hub.sleep.last_night.date
                : undefined
          }
          sparkValues={sleepSpark}
          sparkColor={HEALTH_METRIC.sleep.primary}
          to={`/body?tab=${BODY_TAB_SLEEP}`}
          emptyTitle="Нет данных сна"
          emptyHint="Подключите Health Connect и синхронизируйте сон"
        />
        <BodyOverviewHeroMetric
          icon={Heart}
          iconBg={`rgb(${HEALTH_METRIC.heartRate.rgb} / 0.12)`}
          iconColor={HEALTH_METRIC.heartRate.dark}
          label="Пульс в покое"
          value={
            hub.heart_rate.resting_hr_estimate != null
              ? `${hub.heart_rate.resting_hr_estimate} уд/мин`
              : null
          }
          meta={
            hrAvg != null
              ? `средний диапазон ≈ ${hrAvg}`
              : hub.heart_rate.has_data
                ? "по данным HC"
                : undefined
          }
          to={`/body?tab=${BODY_TAB_PULSE}`}
          emptyTitle="Нет пульса"
          emptyHint="Импортируйте постоянный пульс через Health Connect"
        />
        <BodyOverviewHeroMetric
          icon={Flame}
          iconBg={`rgb(${HEALTH_METRIC.calories.rgb} / 0.12)`}
          iconColor={HEALTH_METRIC.calories.dark}
          label="Калории"
          value={
            hub.calories.today_total != null ? formatEnergy(hub.calories.today_total) : null
          }
          meta={avgCal != null ? `среднее ${formatEnergy(Math.round(avgCal))} / день` : undefined}
          sparkValues={calSpark}
          sparkColor={HEALTH_METRIC.calories.primary}
          to={`/body?tab=${BODY_TAB_ACTIVITY}`}
          emptyTitle="Нет калорий"
          emptyHint="Данные появятся после синхронизации активности"
        />
        <BodyOverviewHeroMetric
          icon={Activity}
          iconBg="rgb(59 130 246 / 0.12)"
          iconColor="#2563eb"
          label="Активность"
          value={workoutCount > 0 ? `${workoutCount} трен.` : hub.steps.today != null ? "Шаги OK" : null}
          meta={
            workoutCount > 0
              ? `${hub.workouts.linked_count} связаны с Polar/FIT`
              : formatSyncLabel(hub.overview.last_sync_at)
          }
          to={`/body?tab=${BODY_TAB_ACTIVITY}`}
          emptyTitle="Нет активности"
          emptyHint="Тренировки и шаги из Health Connect"
        />
      </section>

      <section className="body-overview__dashboard" aria-label="Тренды и детали">
        <BodyOverviewChartCard
          className="body-overview__span-7 body-overview-chart-card--mini"
          title="Шаги за неделю"
          description="Дневная динамика из Health Connect"
          linkTo={`/body?tab=${BODY_TAB_STEPS}`}
          linkLabel="Шаги"
          emptyIcon={Footprints}
          emptyTitle="Нет шагов за период"
          emptyHint="Подключите Health Connect и выполните синхронизацию на телефоне"
        >
          {stepsSpark.length >= 2 ? (
            <BodyOverviewMiniTrend
              eyebrow="7 дней"
              value={Math.round(
                stepsSpark.reduce((a, b) => a + b, 0) / stepsSpark.length,
              ).toLocaleString("ru-RU")}
              valueSuffix="шагов/день"
              series={stepsSpark}
              color={HEALTH_METRIC.steps.primary}
            />
          ) : null}
        </BodyOverviewChartCard>

        <BodyOverviewChartCard
          className="body-overview__span-5 body-overview-chart-card--mini"
          title="Сон за неделю"
          description="Длительность ночного сна, часы"
          linkTo={`/body?tab=${BODY_TAB_SLEEP}`}
          linkLabel="Сон"
          emptyIcon={Moon}
          emptyTitle="Нет данных сна"
          emptyHint="Записи сна появятся после синхронизации Health Connect"
        >
          {sleepSpark.length >= 2 ? (
            <BodyOverviewMiniTrend
              eyebrow="7 ночей"
              value={avgSleep != null ? `${avgSleep}` : null}
              valueSuffix={avgSleep != null ? "ч в среднем" : undefined}
              series={sleepSpark}
              color={HEALTH_METRIC.sleep.primary}
              emptyHint="Записи сна появятся после синхронизации"
            />
          ) : null}
        </BodyOverviewChartCard>

        <BodyOverviewChartCard
          className="body-overview__span-6 body-overview-chart-card--mini"
          title="Динамика веса"
          description={`Мини-график за ${BODY_OVERVIEW_WEIGHT_DAYS} дней — как в питании`}
          linkTo={`/body?tab=${BODY_TAB_WEIGHT}`}
          linkLabel="Вес"
          emptyIcon={Scale}
          emptyTitle="Нет записей веса"
          emptyHint="Ведите ежедневный вес — график построится автоматически"
        >
          {hasWeightChart ? (
            <BodyOverviewWeightChart weight={weight} weekStartDay={weekStartDay} />
          ) : null}
        </BodyOverviewChartCard>

        <BodyOverviewChartCard
          className="body-overview__span-6 body-overview-chart-card--mini"
          title="Калории и активность"
          description="Суточные калории (total) за неделю"
          linkTo={`/body?tab=${BODY_TAB_ACTIVITY}`}
          linkLabel="Активность"
          emptyIcon={Flame}
          emptyTitle="Нет данных активности"
          emptyHint="Синхронизируйте калории и тренировки через Health Connect"
        >
          {calSpark.length >= 2 ? (
            <BodyOverviewMiniTrend
              eyebrow="7 дней"
              value={avgCal != null ? formatEnergy(Math.round(avgCal)) : null}
              valueSuffix={avgCal != null ? "/день" : undefined}
              series={calSpark}
              color={HEALTH_METRIC.calories.primary}
            />
          ) : null}
        </BodyOverviewChartCard>

        <BodyOverviewChartCard
          className="body-overview__span-4"
          title="Пульс"
          description="Оценки по данным Health Connect"
          linkTo={`/body?tab=${BODY_TAB_PULSE}`}
          linkLabel="Пульс"
          emptyIcon={Heart}
          emptyTitle="Нет тренда пульса"
          emptyHint="Сейчас доступны resting HR и min/max за день — недельный график появится при накоплении данных"
        >
          {hub.heart_rate.has_data ? (
            <div className="body-overview-stats-row">
              <div className="body-overview-stat">
                <p className="body-overview-stat__label">Resting</p>
                <p className="body-overview-stat__value">
                  {hub.heart_rate.resting_hr_estimate ?? "—"}
                </p>
              </div>
              <div className="body-overview-stat">
                <p className="body-overview-stat__label">Min</p>
                <p className="body-overview-stat__value">{hub.heart_rate.daily_hr_min ?? "—"}</p>
              </div>
              <div className="body-overview-stat">
                <p className="body-overview-stat__label">Max</p>
                <p className="body-overview-stat__value">{hub.heart_rate.daily_hr_max ?? "—"}</p>
              </div>
            </div>
          ) : null}
        </BodyOverviewChartCard>

        <BodyOverviewHcCard overview={hub.overview} />
      </section>
    </div>
  );
}
