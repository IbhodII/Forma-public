import { CollapsibleSection } from "./CollapsibleSection";
import { EmergencyDatabaseExport } from "./EmergencyDatabaseExport";
import { LocalBackupSettings } from "./LocalBackupSettings";
import { DatabaseImportSettings } from "./DatabaseImportSettings";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";

export function BackupsSettings() {
  const caps = useClientCapabilities();

  return (
    <CollapsibleSection
      title="Резервные копии"
      description="Создание и восстановление полной копии базы (ZIP)"
      defaultOpen
    >
      {caps.enableZipBackupRestore ? (
        <div className="space-y-4">
          <EmergencyDatabaseExport releaseLayout />
          <div className="border-t border-[rgb(var(--app-border)/0.4)] pt-4">
            <h4 className="text-sm font-semibold text-[rgb(var(--app-text))] mb-1">
              Восстановить из резервной копии
            </h4>
            <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3 leading-relaxed">
              Выберите ZIP-архив с workouts.db и shared.db. Режим «Заменить» перезапишет текущую
              базу; для больших архивов рекомендуется Replace.
            </p>
            <DatabaseImportSettings embedded zipOnly />
          </div>
        </div>
      ) : null}

      {caps.enableScheduledLocalBackup ? (
        <div
          className={
            caps.enableZipBackupRestore
              ? "border-t border-[rgb(var(--app-border)/0.4)] pt-4 mt-4"
              : ""
          }
        >
          <LocalBackupSettings />
        </div>
      ) : null}
    </CollapsibleSection>
  );
}
