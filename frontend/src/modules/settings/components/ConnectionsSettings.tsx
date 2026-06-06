import { useSearchParams } from "react-router-dom";
import {
  Activity,
  Cloud,
  FolderInput,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { Loader } from "../../../components/Loader";
import { CollapsibleSection } from "./CollapsibleSection";
import { ConnectionIntegrationCard } from "./ConnectionIntegrationCard";
import { useConnectionsStatus } from "../hooks/useConnectionsStatus";
import { PolarFlowSettings } from "./PolarFlowSettings";
import { YandexDiskConnectBlock } from "./YandexDiskConnectBlock";
import { SettingsSubsection } from "./SettingsSection";

export function ConnectionsSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const panel = searchParams.get("panel");
  const { rows, isLoading } = useConnectionsStatus();

  const openPanel = (id: string) => {
    setSearchParams({ tab: "connections", panel: id }, { replace: true });
  };

  if (isLoading) {
    return <Loader label="Подключения…" />;
  }

  const hc = rows["health-connect"];
  const polar = rows.polar;
  const yandex = rows.yandex;
  const google = rows.google;
  const forma = rows.forma;
  const fit = rows.fit;

  return (
    <div className="space-y-5">
      <div className="settings-integration-grid">
        <ConnectionIntegrationCard
          name="Health Connect"
          description="Шаги, сон и пульс с телефона"
          icon={Smartphone}
          chip={hc.chip}
          tone={hc.tone}
          lastSync={hc.lastSync}
          meta={hc.meta}
          configureTo="/body?tab=health-connect"
          configureLabel="Открыть"
        />
        <ConnectionIntegrationCard
          name="Polar Flow"
          description="Тренировки и пульс с Polar"
          icon={Activity}
          chip={polar.chip}
          tone={polar.tone}
          meta={polar.meta}
          onConfigure={() => openPanel("polar")}
        />
        <ConnectionIntegrationCard
          name="Google Fit"
          description="Синхронизация активности Google"
          icon={Activity}
          chip={google.chip}
          tone={google.tone}
          meta={google.meta}
          configureLabel="Скоро"
          onConfigure={() => openPanel("google")}
        />
        <ConnectionIntegrationCard
          name="Яндекс.Диск"
          description="Облако и OAuth Forma"
          icon={Cloud}
          chip={yandex.chip}
          tone={yandex.tone}
          lastSync={yandex.lastSync}
          meta={yandex.meta}
          onConfigure={() => openPanel("yandex")}
        />
        <ConnectionIntegrationCard
          name="FormaSync"
          description="Пакеты данных между устройствами"
          icon={RefreshCw}
          chip={forma.chip}
          tone={forma.tone}
          lastSync={forma.lastSync}
          meta={forma.meta}
          configureTo="/settings?tab=sync"
        />
        <ConnectionIntegrationCard
          name="FIT / GPX"
          description="Импорт с папки на компьютере"
          icon={FolderInput}
          chip={fit.chip}
          tone={fit.tone}
          meta={fit.meta}
          configureTo="/settings?tab=data"
        />
      </div>

      {panel === "polar" ? <PolarFlowSettings /> : null}

      {panel === "yandex" ? (
        <SettingsSubsection title="Яндекс.Диск" description="Вход для облака и FormaSync">
          <YandexDiskConnectBlock />
        </SettingsSubsection>
      ) : null}

      {panel === "google" ? (
        <CollapsibleSection
          title="Google Fit / Drive"
          description="Интеграция в разработке"
          defaultOpen
          embedded
        >
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Подключение Google появится в следующих версиях. Сейчас используйте Health Connect или
            Polar.
          </p>
        </CollapsibleSection>
      ) : null}

      {!panel ? (
        <p className="text-xs text-[rgb(var(--app-text-muted))] leading-relaxed">
          Выберите сервис и нажмите «Настроить», чтобы подключить или изменить параметры. Техническая
          диагностика — в разделе «О приложении» → Developer Tools.
        </p>
      ) : null}
    </div>
  );
}
