import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { KpiCard } from "../../../components/ui/kpi-card";
import { HcStepsSection } from "../../HealthConnect/sections/HcStepsSection";
import { StepsHistoryView } from "../../Steps/StepsHistoryView";
import { BodySection } from "../components/BodySection";
import { buildDailyStepsInsights } from "./bodyStepsInsights";
import { BodyHubState } from "./BodyHubState";
import { useBodyHealthHub } from "./useBodyHealthHub";

export function BodyStepsTab() {
  const query = useBodyHealthHub();

  return (
    <div className="body-hub">
      <BodyHubState>
        {() => {
          const data = query.data!;
          const insights = buildDailyStepsInsights(
            data.steps.week_series.map((d) => ({ date: d.date, steps: d.steps })),
          );

          return (
            <>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${query.isFetching ? "animate-spin" : ""}`} />
                  Обновить HC
                </Button>
              </div>

              <HcStepsSection steps={data.steps} embedded />

              <BodySection
                title="Статистика за неделю"
                description="По данным Health Connect за последние 7 дней."
              >
                {!data.steps.has_data ? (
                  <div className="body-hub__empty">
                    Нет дневных шагов из Health Connect. История по месяцам ниже — ручной ввод.
                  </div>
                ) : (
                  <div className="body-hub__grid-kpi">
                    <KpiCard
                      label="Среднее за неделю"
                      value={
                        insights.avgSteps != null
                          ? insights.avgSteps.toLocaleString("ru-RU")
                          : "—"
                      }
                    />
                    <KpiCard
                      label="Лучший день"
                      value={
                        insights.bestDay
                          ? insights.bestDay.steps.toLocaleString("ru-RU")
                          : "—"
                      }
                      sub={insights.bestDay?.date}
                    />
                    <KpiCard
                      label="Активные дни"
                      value={insights.activeDays}
                      sub="дней с шагами > 0"
                    />
                    <KpiCard
                      label="Серия"
                      value={insights.streakDays}
                      sub="дней подряд с шагами"
                    />
                    <KpiCard
                      label="Самый активный день недели"
                      value={insights.busiestWeekday?.label ?? "—"}
                      sub={
                        insights.busiestWeekday
                          ? `≈ ${insights.busiestWeekday.avgSteps.toLocaleString("ru-RU")} шагов`
                          : undefined
                      }
                    />
                  </div>
                )}
              </BodySection>

              <BodySection
                title="История по месяцам"
                description="Ручные записи и рекорды — как в прежней вкладке шагов."
              >
                <StepsHistoryView embedded />
              </BodySection>
            </>
          );
        }}
      </BodyHubState>
    </div>
  );
}
