import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { SubTabs } from "../components/SubTabs";
import { AppPageShell, ContextToolbar, UnifiedPageHeader } from "../components/page-shell";
import { pageHeaderDescription, showDevCaptions } from "../utils/releaseUi";
import { UserRound } from "lucide-react";
import { Body } from "./Body/Body";
import { WeightSection } from "./WeightPage";
import {
  BODY_TAB_ACTIVITY,
  BODY_TAB_HEALTH_CONNECT,
  BODY_TAB_METRICS,
  BODY_TAB_OVERVIEW,
  BODY_TAB_PULSE,
  BODY_TAB_SLEEP,
  BODY_TAB_STEPS,
  BODY_TAB_WEIGHT,
  BODY_TABS,
  resolveBodyTab,
  type BodyTabId,
} from "./Body/bodyHubConstants";
import "./Body/body-hub.css";
import "./HealthConnect/health-connect.css";
import { BodyActivityTab } from "./Body/hub/BodyActivityTab";
import { BodyHealthConnectTab } from "./Body/hub/BodyHealthConnectTab";
import { BodyOverviewTab } from "./Body/hub/BodyOverviewTab";
import { BodyPulseTab } from "./Body/hub/BodyPulseTab";
import { BodySleepTab } from "./Body/hub/BodySleepTab";
import { BodyStepsTab } from "./Body/hub/BodyStepsTab";

export {
  BODY_TAB_METRICS,
  BODY_TAB_WEIGHT,
  BODY_TAB_STEPS,
  BODY_TAB_OVERVIEW,
} from "./Body/bodyHubConstants";

export function BodyPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = resolveBodyTab(tabParam);

  useEffect(() => {
    const valid = BODY_TABS.some((t) => t.id === tabParam);
    if (!tabParam || !valid) {
      setSearchParams({ tab: BODY_TAB_OVERVIEW }, { replace: true });
    }
  }, [tabParam, setSearchParams]);

  const setTab = (id: string) => setSearchParams({ tab: id });

  const descriptionByTab: Record<BodyTabId, string | undefined> = {
    [BODY_TAB_OVERVIEW]: pageHeaderDescription(
      "Сводка веса, шагов, сна и пульса",
      "Сводка веса, шагов, сна и пульса — ежедневный обзор.",
    ),
    [BODY_TAB_METRICS]: pageHeaderDescription(
      "Контрольные замеры тела",
      "Контрольные замеры тела — без изменений.",
    ),
    [BODY_TAB_WEIGHT]: pageHeaderDescription(
      "Ежедневный вес",
      "Ежедневный вес и недельная динамика.",
    ),
    [BODY_TAB_STEPS]: pageHeaderDescription(
      "Шаги за неделю",
      "Health Connect за неделю и история шагов по месяцам.",
    ),
    [BODY_TAB_SLEEP]: pageHeaderDescription(
      "Сон и восстановление",
      "Сон из Health Connect: длительность, время, тренды.",
    ),
    [BODY_TAB_PULSE]: pageHeaderDescription(
      "Пульс и сердечный ритм",
      "Пульс из Health Connect: resting, min/max, тренды.",
    ),
    [BODY_TAB_ACTIVITY]: pageHeaderDescription(
      "Активность и калории",
      "Калории, тренировки HC и связка с шагами.",
    ),
    [BODY_TAB_HEALTH_CONNECT]: showDevCaptions()
      ? "Статус синхронизации, права, источники и диагностика."
      : "Данные Health Connect с телефона",
  };

  return (
    <AppPageShell width="fluid">
      <UnifiedPageHeader
        eyebrow={showDevCaptions() ? "Health & body" : undefined}
        title="Тело"
        description={descriptionByTab[tab]}
        icon={UserRound}
        toolbar={
          <ContextToolbar>
            <SubTabs items={[...BODY_TABS]} activeId={tab} onChange={setTab} />
          </ContextToolbar>
        }
      />
      {tab === BODY_TAB_OVERVIEW && <BodyOverviewTab />}
      {tab === BODY_TAB_METRICS && <Body embedded />}
      {tab === BODY_TAB_WEIGHT && <WeightSection embedded />}
      {tab === BODY_TAB_STEPS && <BodyStepsTab />}
      {tab === BODY_TAB_SLEEP && <BodySleepTab />}
      {tab === BODY_TAB_PULSE && <BodyPulseTab />}
      {tab === BODY_TAB_ACTIVITY && <BodyActivityTab />}
      {tab === BODY_TAB_HEALTH_CONNECT && <BodyHealthConnectTab />}
    </AppPageShell>
  );
}
