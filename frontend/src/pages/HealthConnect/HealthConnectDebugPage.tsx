import { Smartphone } from "lucide-react";
import { AppPageShell, UnifiedPageHeader } from "../../components/page-shell";
import { HealthConnectHubContent } from "./HealthConnectHubContent";

export function HealthConnectDebugPage() {
  return (
    <AppPageShell className="health-connect-page">
      <UnifiedPageHeader
        eyebrow="Интеграции"
        title="Health Connect"
        description="Шаги, сон, пульс и активность с телефона. Синхронизация выполняется в мобильном приложении Forma."
        icon={Smartphone}
      />
      <HealthConnectHubContent />
    </AppPageShell>
  );
}
