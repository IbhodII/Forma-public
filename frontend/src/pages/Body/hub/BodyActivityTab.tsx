import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { KpiCard } from "../../../components/ui/kpi-card";
import { HcCaloriesSection } from "../../HealthConnect/sections/HcCaloriesSection";
import { HcWorkoutsSection } from "../../HealthConnect/sections/HcWorkoutsSection";
import { BodySection } from "../components/BodySection";
import { BodyHubState } from "./BodyHubState";
import { useBodyHealthHub } from "./useBodyHealthHub";

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return h > 0 ? `${h}ч ${rm}м` : `${m}м`;
}

export function BodyActivityTab() {
  const query = useBodyHealthHub();

  return (
    <div className="body-hub">
      <BodyHubState>
        {() => {
          const data = query.data!;
          const totalDuration = data.workouts.items.reduce((s, w) => s + w.duration_sec, 0);
          const withHr = data.workouts.items.filter((w) => w.avg_hr != null).length;

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
                  Обновить
                </Button>
              </div>

              <BodySection
                title="Общая активность"
                description="Шаги за сегодня + кардио и калории из Health Connect."
              >
                <div className="body-hub__grid-kpi">
                  <KpiCard
                    label="Шаги сегодня"
                    value={
                      data.steps.today != null
                        ? data.steps.today.toLocaleString("ru-RU")
                        : "—"
                    }
                  />
                  <KpiCard
                    label="Калории сегодня"
                    value={
                      data.calories.today_total != null
                        ? data.calories.today_total.toLocaleString("ru-RU")
                        : "—"
                    }
                    sub="ккал total"
                  />
                  <KpiCard
                    label="HC-тренировки"
                    value={data.workouts.items.length}
                    sub={`${formatDuration(totalDuration)} суммарно`}
                  />
                  <KpiCard
                    label="С пульсом"
                    value={withHr}
                    sub="тренировок с avg HR"
                  />
                </div>
              </BodySection>

              <HcCaloriesSection calories={data.calories} embedded />
              <HcWorkoutsSection workouts={data.workouts} embedded />
            </>
          );
        }}
      </BodyHubState>
    </div>
  );
}
