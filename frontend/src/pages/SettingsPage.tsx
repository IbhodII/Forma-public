import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { BikeSettingsForm } from "../components/BikeSettingsForm";
import "../modules/settings/settings.css";
import { AppPageShell, UnifiedPageHeader } from "../components/page-shell";
import { pageHeaderDescription, showDevCaptions } from "../utils/releaseUi";
import { Settings } from "lucide-react";
import { AnalyticsSettings } from "../modules/settings/components/AnalyticsSettings";
import { ConnectionsSettings } from "../modules/settings/components/ConnectionsSettings";
import { CycleHealthSettings } from "../modules/settings/components/CycleHealthSettings";
import { DataSettingsHub } from "../modules/settings/components/DataSettingsHub";
import { DeveloperToolsSettings } from "../modules/settings/components/DeveloperToolsSettings";
import { GeneralSettings } from "../modules/settings/components/GeneralSettings";
import { InterfaceHub } from "../modules/settings/components/InterfaceHub";
import { NutritionSettings } from "../modules/settings/components/NutritionSettings";
import { ProfileSettingsHub } from "../modules/settings/components/ProfileSettingsHub";
import { SettingsSection } from "../modules/settings/components/SettingsSection";
import { SettingsSidebar } from "../modules/settings/components/SettingsSidebar";
import { SupportProjectSettings } from "../modules/settings/components/SupportProjectSettings";
import { SyncSettings } from "../modules/settings/components/SyncSettings";
import {
  resolveSettingsSectionId,
  SETTINGS_SECTIONS,
  SETTINGS_TAB_STORAGE_KEY,
  type SettingsSectionId,
} from "../modules/settings/constants";
import { useT } from "../i18n";
import { useCycleFeatureEnabled } from "../hooks/useCycleFeatureEnabled";
import { useClientCapabilities } from "../hooks/useClientCapabilities";

function resolveInitialSection(tabParam: string | null): SettingsSectionId {
  if (tabParam) return resolveSettingsSectionId(tabParam);
  try {
    const stored = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (stored) return resolveSettingsSectionId(stored);
  } catch {
    /* ignore */
  }
  return "profile";
}

export function SettingsPage() {
  const t = useT();
  const caps = useClientCapabilities();
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const cycleEnabled = useCycleFeatureEnabled();
  const [active, setActive] = useState<SettingsSectionId>(() => resolveInitialSection(tabParam));

  useEffect(() => {
    if (tabParam) {
      setActive(resolveSettingsSectionId(tabParam));
    }
  }, [tabParam]);

  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, active);
    } catch {
      /* ignore */
    }
    if (searchParams.get("tab") !== active) {
      const panel = searchParams.get("panel");
      const next: Record<string, string> = { tab: active };
      if (panel && active === "connections") next.panel = panel;
      setSearchParams(next, { replace: true });
    }
  }, [active, searchParams, setSearchParams]);

  const sectionMeta = useMemo(
    () => SETTINGS_SECTIONS.find((s) => s.id === active) ?? SETTINGS_SECTIONS[0],
    [active],
  );
  const sectionTitle = t(sectionMeta.labelKey);

  return (
    <AppPageShell width="fluid" className="settings-hub">
      <UnifiedPageHeader
        eyebrow={showDevCaptions() ? t("settingsPage.eyebrow") : undefined}
        title={t("settingsPage.title")}
        description={pageHeaderDescription(
          "Профиль, подключения и данные",
          "Профиль, подключения, данные и синхронизация — без технического шума в основных разделах.",
        )}
        icon={Settings}
      />

      <div className="settings-hub__layout">
        <SettingsSidebar active={active} onChange={setActive} />

        <div className="settings-main" role="tabpanel" aria-label={sectionTitle}>
          {active === "profile" && (
            <SettingsSection title="Профиль" description="Аккаунт, имя и параметры тела">
              <ProfileSettingsHub />
            </SettingsSection>
          )}

          {active === "connections" && (
            <SettingsSection
              title="Подключения"
              description="Сервисы и облака — только статус и вход"
            >
              <ConnectionsSettings />
            </SettingsSection>
          )}

          {active === "data" && (
            <SettingsSection
              title="Данные"
              description="Локальная база, импорт, бэкапы, облако и восстановление"
            >
              <DataSettingsHub />
            </SettingsSection>
          )}

          {active === "sync" && (
            <SettingsSection
              title="Синхронизация"
              description="Приоритет источников данных"
            >
              <SyncSettings />
            </SettingsSection>
          )}

          {active === "analytics" && (
            <SettingsSection
              title="Аналитика"
              description="Health Connect в графиках и силовые расчёты"
            >
              <AnalyticsSettings standalone />
            </SettingsSection>
          )}

          {active === "nutrition" && (
            <SettingsSection
              title="Питание и расчёты"
              description="Неделя, активность и макросы"
            >
              <GeneralSettings embedded showSex={false} showWeekStart showUnits={false} />
              <div className="border-t border-[rgb(var(--app-border)/0.5)] pt-5 mt-5">
                <NutritionSettings embedded />
              </div>
            </SettingsSection>
          )}

          {active === "bike" && (
            <SettingsSection
              title="Мой велосипед"
              description="Параметры для оценки мощности без датчика"
            >
              <BikeSettingsForm compact />
            </SettingsSection>
          )}

          {active === "interface" && (
            <SettingsSection title="Интерфейс" description="Тема, блоки и единицы измерения">
              <InterfaceHub />
            </SettingsSection>
          )}

          {active === "about" && (
            <SettingsSection
              title="О приложении"
              description="Поддержка и инструменты разработчика"
            >
              {cycleEnabled ? (
                <div className="mb-5">
                  <CycleHealthSettings embedded />
                </div>
              ) : null}
              <SupportProjectSettings embedded />
              {caps.enableDeveloperTools ? (
                <div className="mt-6 border-t border-[rgb(var(--app-border)/0.5)] pt-6">
                  <DeveloperToolsSettings />
                </div>
              ) : null}
            </SettingsSection>
          )}
        </div>
      </div>
    </AppPageShell>
  );
}
