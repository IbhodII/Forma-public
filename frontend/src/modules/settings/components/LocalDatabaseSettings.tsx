import { useQuery } from "@tanstack/react-query";
import { Database, FolderOpen, RefreshCw } from "lucide-react";
import { fetchDatabaseOverview } from "../../../api/databaseDiagnostics";
import { fetchBackupSettings } from "../../../api/user";
import { queryKeys } from "../../../hooks/queryKeys";
import { useToast } from "../../../components/Toast";
import { CollapsibleSection } from "./CollapsibleSection";
import { SettingsSubsection } from "./SettingsSection";
import { WarmupControls } from "./WarmupControls";
import { DatabaseOverviewBlock } from "./DatabaseOverviewBlock";

function formatBackupDate(iso: string | null | undefined): string {
  if (!iso) return "ещё не создавался";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function LocalDatabaseSettings() {
  const { showToast } = useToast();
  const backupQuery = useQuery({
    queryKey: queryKeys.backupSettings,
    queryFn: fetchBackupSettings,
  });
  const overviewQuery = useQuery({
    queryKey: ["database", "diagnostics", "overview"],
    queryFn: fetchDatabaseOverview,
    enabled: false,
  });

  const overview = overviewQuery.data;
  const dataRoot =
    overview?.activeDbPath.forma_data_dir ?? overview?.activeDbPath.data_root ?? null;

  const openDataFolder = () => {
    if (!dataRoot) {
      void overviewQuery.refetch().then((r) => {
        const path =
          r.data?.activeDbPath.forma_data_dir ?? r.data?.activeDbPath.data_root;
        if (path) {
          void navigator.clipboard.writeText(path);
          showToast("Путь скопирован в буфер обмена", "success");
        } else {
          showToast("Сначала загрузите сводку по базе", "info");
        }
      });
      return;
    }
    void navigator.clipboard.writeText(dataRoot);
    showToast("Путь к данным скопирован — откройте в проводнике", "success");
  };

  return (
    <CollapsibleSection
      title="Локальные данные"
      description="Где лежит база, когда был последний бэкап и обслуживание после импорта"
      defaultOpen
    >
      <div className="rounded-xl border border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-4 flex gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[rgb(var(--app-accent)/0.12)] text-[rgb(var(--app-accent))]">
          <Database className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1 text-sm space-y-2">
          <p className="font-semibold text-[rgb(var(--app-text))]">Активная база на этом ПК</p>
          {overview ? (
            <dl className="grid gap-1.5 text-xs text-[rgb(var(--app-text-muted))]">
              <div>
                <dt className="inline font-medium text-[rgb(var(--app-text))]">workouts.db: </dt>
                <dd className="inline break-all font-mono">{overview.activeDbPath.workouts}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-[rgb(var(--app-text))]">shared.db: </dt>
                <dd className="inline break-all font-mono">{overview.activeDbPath.shared}</dd>
              </div>
              <div>
                <dt className="inline font-medium text-[rgb(var(--app-text))]">Записей (ваш профиль): </dt>
                <dd className="inline">
                  силовые {overview.counts.strength_workouts}, кардио{" "}
                  {overview.counts.cardio_workouts}, питание {overview.counts.food_entries}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="text-xs leading-relaxed">
              Нажмите «Обновить сводку», чтобы увидеть пути и счётчики записей.
            </p>
          )}
          <p className="text-xs">
            Последний локальный ZIP-бэкап:{" "}
            <span className="font-medium text-[rgb(var(--app-text))]">
              {formatBackupDate(backupQuery.data?.last_backup_date)}
            </span>
            {backupQuery.data?.backup_folder_path ? (
              <>
                {" "}
                · папка{" "}
                <code className="text-[11px]">{backupQuery.data.backup_folder_path}</code>
              </>
            ) : null}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-secondary text-sm inline-flex items-center gap-1.5"
          disabled={overviewQuery.isFetching}
          onClick={() => void overviewQuery.refetch()}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${overviewQuery.isFetching ? "animate-spin" : ""}`} />
          {overviewQuery.isFetching ? "Загрузка…" : "Обновить сводку"}
        </button>
        <button
          type="button"
          className="btn-secondary text-sm inline-flex items-center gap-1.5"
          onClick={openDataFolder}
        >
          <FolderOpen className="h-3.5 w-3.5" aria-hidden />
          Путь к папке данных
        </button>
      </div>

      <SettingsSubsection
        title="Прогрев данных"
        description="Пересчёт кэшей и аналитики после импорта или восстановления"
      >
        <WarmupControls />
      </SettingsSubsection>

      <CollapsibleSection
        title="Диагностика базы"
        description="Техническая сводка для проверки целостности и видимости тренировок"
        defaultOpen={false}
        embedded
      >
        {overview ? (
          <>
            <DatabaseOverviewBlock overview={overview} />
            <button
              type="button"
              className="btn-secondary mt-3 text-sm"
              disabled={overviewQuery.isFetching}
              onClick={() => void overviewQuery.refetch()}
            >
              Обновить диагностику
            </button>
          </>
        ) : (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Загрузите сводку кнопкой выше — здесь появятся пути API и счётчики таблиц.
          </p>
        )}
      </CollapsibleSection>
    </CollapsibleSection>
  );
}
