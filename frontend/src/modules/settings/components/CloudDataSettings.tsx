import { Link } from "react-router-dom";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";
import { CollapsibleSection } from "./CollapsibleSection";
import { FormaSyncPanel } from "./FormaSyncPanel";
import { CloudSyncPanel } from "./CloudSyncPanel";
import { CloudStorageSection } from "./CloudStorageSection";
export function CloudDataSettings() {
  const caps = useClientCapabilities();

  return (
    <CollapsibleSection
      title="Облачная синхронизация"
      description="FormaSync, провайдер облака, бэкап и загрузка тренировок — отдельно от локального импорта"
      defaultOpen
    >
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed">
        Подключение аккаунтов Яндекс / Google — также в{" "}
        <Link to="/settings?tab=connections" className="text-[rgb(var(--app-accent))] hover:underline">
          Подключения
        </Link>
        . Здесь — синхронизация пакетов, выбор провайдера и действия с облаком.
      </p>

      <FormaSyncPanel />

      <CloudSyncPanel />

      {caps.enableLegacyImportTools ? (
        <CollapsibleSection
          title="Яндекс / Google: бэкап БД и FIT"
          description="OAuth, загрузка тренировок в облако и ручной бэкап workouts.db"
          defaultOpen={false}
          embedded
        >
          <CloudStorageSection />
        </CollapsibleSection>
      ) : null}
    </CollapsibleSection>
  );
}
