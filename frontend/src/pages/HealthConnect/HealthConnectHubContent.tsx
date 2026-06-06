import { useQuery } from "@tanstack/react-query";

import { RefreshCw } from "lucide-react";

import { fetchHealthConnectHub } from "../../api/sync";

import { ErrorAlert } from "../../components/ErrorAlert";

import { Loader } from "../../components/Loader";

import { Button } from "../../components/ui/button";

import { queryKeys } from "../../hooks/queryKeys";

import { parseApiError } from "../../utils/validation";

import "./health-connect.css";
import { HcCaloriesSection } from "./sections/HcCaloriesSection";
import { HcVitalsSection } from "./sections/HcVitalsSection";

import { HcHeartRateSection } from "./sections/HcHeartRateSection";

import { HcOverviewSection } from "./sections/HcOverviewSection";

import { HcSleepSection } from "./sections/HcSleepSection";

import { HcSourceRoutingSection } from "./sections/HcSourceRoutingSection";

import { HcStepsSection } from "./sections/HcStepsSection";

import { HcWorkoutsSection } from "./sections/HcWorkoutsSection";
import { HcAnalyticsMasterToggle } from "../../components/HcAnalyticsMasterToggle";
import { useClientCapabilities } from "../../hooks/useClientCapabilities";
import { useDeveloperTools } from "../../hooks/useDeveloperTools";
import { HealthConnectDebugContent } from "./HealthConnectDebugContent";
import { CollapsibleSection } from "../../modules/settings/components/CollapsibleSection";

export function HealthConnectHubContent({
  variant = "full",
  embedded = false,
}: {
  variant?: "full" | "technical";
  embedded?: boolean;
}) {
  const caps = useClientCapabilities();
  const { developerToolsEnabled } = useDeveloperTools();
  const showDev = caps.enableHealthConnectDebug || developerToolsEnabled;

  const query = useQuery({
    queryKey: queryKeys.healthConnectHub,
    queryFn: fetchHealthConnectHub,
  });

  const technical = variant === "technical";

  return (
    <div className="space-y-4 sm:space-y-5">
      <HcAnalyticsMasterToggle />

      {query.isLoading && <Loader label="Загрузка Health Connect…" />}

      {query.isError && <ErrorAlert message={parseApiError(query.error)} />}

      {query.data && !query.isError && (
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

          <HcOverviewSection overview={query.data.overview} embedded={embedded || technical} />

          {!technical ? (
            <>
              <HcStepsSection steps={query.data.steps} />
              <HcSleepSection sleep={query.data.sleep} />
              <HcVitalsSection heartRate={query.data.heart_rate} calories={query.data.calories} />
              <HcCaloriesSection calories={query.data.calories} />
              <HcWorkoutsSection workouts={query.data.workouts} />
              <HcHeartRateSection heartRate={query.data.heart_rate} />
            </>
          ) : null}

          <HcSourceRoutingSection
            routing={query.data.source_routing}
            analyticsConnected={query.data.analytics_connected}
            embedded={embedded || technical}
          />

          {showDev ? (
            <CollapsibleSection
              title="Диагностика"
              description="Сырые записи и отладка синхронизации"
              defaultOpen={technical}
              embedded
            >
              <HealthConnectDebugContent />
            </CollapsibleSection>
          ) : null}
        </>
      )}
    </div>
  );
}
