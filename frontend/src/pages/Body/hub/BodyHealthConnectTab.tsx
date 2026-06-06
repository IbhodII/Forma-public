import { HealthConnectHubContent } from "../../HealthConnect/HealthConnectHubContent";

export function BodyHealthConnectTab() {
  return (
    <div className="body-hub health-connect-page">
      <HealthConnectHubContent variant="technical" embedded />
    </div>
  );
}
