import { RefreshCw } from "lucide-react";
import { Button } from "../../../components/ui/button";
import { HcSleepSection } from "../../HealthConnect/sections/HcSleepSection";
import { BodyHubState } from "./BodyHubState";
import { useBodyHealthHub } from "./useBodyHealthHub";

export function BodySleepTab() {
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
            <HcSleepSection sleep={query.data!.sleep} embedded />
          </>
        )}
      </BodyHubState>
    </div>
  );
}
