import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { HcHeartRateSection } from "../../HealthConnect/sections/HcHeartRateSection";
import { BodyHubState } from "./BodyHubState";
import { useBodyHealthHub } from "./useBodyHealthHub";

export function BodyPulseTab() {
  const query = useBodyHealthHub();

  return (
    <div className="body-hub">
      <BodyHubState>
        {() => (
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
            <HcHeartRateSection heartRate={query.data!.heart_rate} embedded />
            {!query.data!.heart_rate.has_data ? (
              <div className="body-hub__empty">
                Пульс появится после синхронизации постоянного пульса из Health Connect на телефоне.
              </div>
            ) : null}
          </>
        )}
      </BodyHubState>
    </div>
  );
}
