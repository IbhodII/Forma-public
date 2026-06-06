import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CollapsibleSection } from "./CollapsibleSection";
import { LocalDatabaseSettings } from "./LocalDatabaseSettings";
import { ImportExportSettings } from "./ImportExportSettings";
import { BackupsSettings } from "./BackupsSettings";
import { CloudDataSettings } from "./CloudDataSettings";
import { RestoreSettings } from "./RestoreSettings";
import { DataBackupAdvancedPanel } from "./DataBackupAdvancedPanel";
import { resolveClientMode } from "../../../config/clientCapabilities";
import { useDeveloperTools } from "../../../hooks/useDeveloperTools";

const DATA_PANELS = [
  { id: "local", label: "Локальные данные" },
  { id: "import", label: "Импорт и экспорт" },
  { id: "backups", label: "Резервные копии" },
  { id: "cloud", label: "Облако" },
  { id: "restore", label: "Восстановление" },
] as const;

type DataPanelId = (typeof DATA_PANELS)[number]["id"];

function isDataPanelId(value: string | null): value is DataPanelId {
  return DATA_PANELS.some((p) => p.id === value);
}

export function DataSettingsHub() {
  const clientMode = resolveClientMode();
  const { developerToolsEnabled } = useDeveloperTools();
  const showAdvanced = clientMode === "admin_browser" || developerToolsEnabled;
  const [searchParams, setSearchParams] = useSearchParams();
  const panelParam = searchParams.get("panel");

  useEffect(() => {
    if (!isDataPanelId(panelParam)) return;
    const el = document.getElementById(`data-panel-${panelParam}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [panelParam]);

  const setPanel = (id: DataPanelId) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", "data");
    next.set("panel", id);
    setSearchParams(next, { replace: true });
  };

  return (
    <div className="settings-data-hub space-y-4">
      <p className="text-sm text-[rgb(var(--app-text-muted))] leading-relaxed max-w-2xl">
        Локальная база, файловый импорт, бэкапы и облако — в одном месте. Приоритет источников
        данных — во вкладке{" "}
        <Link to="/settings?tab=sync" className="text-[rgb(var(--app-accent))] hover:underline">
          Синхронизация
        </Link>
        .
      </p>

      <nav className="settings-data-nav" aria-label="Разделы данных">
        {DATA_PANELS.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`settings-data-nav__btn${panelParam === p.id ? " settings-data-nav__btn--active" : ""}`}
            onClick={() => setPanel(p.id)}
          >
            {p.label}
          </button>
        ))}
      </nav>

      <div id="data-panel-local" className="scroll-mt-4">
        <LocalDatabaseSettings />
      </div>

      <div id="data-panel-import" className="scroll-mt-4">
        <ImportExportSettings />
      </div>

      <div id="data-panel-backups" className="scroll-mt-4">
        <BackupsSettings />
      </div>

      <div id="data-panel-cloud" className="scroll-mt-4">
        <CloudDataSettings />
      </div>

      <div id="data-panel-restore" className="scroll-mt-4">
        <RestoreSettings />
      </div>

      {showAdvanced ? (
        <CollapsibleSection
          title="Расширенное"
          description="Диагностика облака и действия для разработчика"
          defaultOpen={false}
        >
          <DataBackupAdvancedPanel />
        </CollapsibleSection>
      ) : null}
    </div>
  );
}
