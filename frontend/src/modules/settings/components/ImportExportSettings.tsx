import { CollapsibleSection } from "./CollapsibleSection";
import { FitImportBlock } from "./FitImportBlock";
import { DatabaseImportSettings } from "./DatabaseImportSettings";
import { DataBackupSettings } from "./DataBackupSettings";
import { MiniDatabasePanel } from "./MiniDatabasePanel";
import { useClientCapabilities } from "../../../hooks/useClientCapabilities";

/** Импорт и экспорт файлов — без облачной синхронизации. */
export function ImportExportSettings() {
  const caps = useClientCapabilities();
  const showDevDbTools =
    caps.enableMiniDatabaseExport ||
    caps.enableTwoFileDatabaseImport ||
    caps.enableJsonAccountBackup;

  return (
    <CollapsibleSection
      title="Импорт и экспорт"
      description="Файлы тренировок (FIT/GPX) и перенос данных"
      defaultOpen
    >
      <FitImportBlock embedded />

      {showDevDbTools ? (
        <>
          {caps.enableMiniDatabaseExport ? (
            <div className="border-t border-[rgb(var(--app-border)/0.4)] pt-4">
              <MiniDatabasePanel />
            </div>
          ) : null}

          {caps.enableTwoFileDatabaseImport || caps.enableDatabaseImport ? (
            <div className="border-t border-[rgb(var(--app-border)/0.4)] pt-4">
              <h4 className="text-sm font-semibold text-[rgb(var(--app-text))] mb-1">
                Импорт базы данных
              </h4>
              <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3 leading-relaxed">
                ZIP или пары файлов workouts.db + shared.db (режим разработчика / admin).
              </p>
              <DatabaseImportSettings
                embedded
                zipOnly={!caps.enableTwoFileDatabaseImport}
              />
            </div>
          ) : null}

          {caps.enableJsonAccountBackup ? (
            <div className="border-t border-[rgb(var(--app-border)/0.4)] pt-4">
              <h4 className="text-sm font-semibold text-[rgb(var(--app-text))] mb-1">
                Экспорт / импорт JSON
              </h4>
              <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3 leading-relaxed">
                Файл <code className="text-[11px]">forma_backup_v1.json</code> для переноса без ZIP.
              </p>
              <DataBackupSettings jsonOnly />
            </div>
          ) : null}
        </>
      ) : null}
    </CollapsibleSection>
  );
}
