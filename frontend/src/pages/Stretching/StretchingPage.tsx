import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppPageShell } from "../../components/page-shell";
import "./stretchingWellness.css";
import { RecoveryInsights } from "./components/RecoveryInsights";
import { StretchHero } from "./components/StretchHero";
import { StretchNav } from "./components/StretchNav";
import { StretchingExercisesTab } from "./StretchingExercisesTab";
import { StretchingHistoryTab } from "./StretchingHistoryTab";
import { StretchingJourneyTab } from "./StretchingJourneyTab";
import { StretchingPresetsTab } from "./StretchingPresetsTab";
import { useStretchingStats } from "./hooks/useStretchingStats";

export const STRETCHING_TAB_JOURNEY = "journey";
export const STRETCHING_TAB_PROGRAMS = "programs";
export const STRETCHING_TAB_JOURNAL = "journal";
export const STRETCHING_TAB_LIBRARY = "library";

const STRETCHING_TABS = [
  { id: STRETCHING_TAB_JOURNEY, label: "Сегодня" },
  { id: STRETCHING_TAB_PROGRAMS, label: "Программы" },
  { id: STRETCHING_TAB_JOURNAL, label: "Журнал" },
  { id: STRETCHING_TAB_LIBRARY, label: "Библиотека" },
] as const;

type StretchingTabId = (typeof STRETCHING_TABS)[number]["id"];

const TAB_ALIASES: Record<string, StretchingTabId> = {
  journey: STRETCHING_TAB_JOURNEY,
  programs: STRETCHING_TAB_PROGRAMS,
  presets: STRETCHING_TAB_PROGRAMS,
  journal: STRETCHING_TAB_JOURNAL,
  history: STRETCHING_TAB_JOURNAL,
  library: STRETCHING_TAB_LIBRARY,
  exercises: STRETCHING_TAB_LIBRARY,
};

function resolveTab(param: string | null): StretchingTabId {
  if (!param) return STRETCHING_TAB_JOURNEY;
  return TAB_ALIASES[param] ?? STRETCHING_TAB_JOURNEY;
}

export function StretchingPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tabParam = searchParams.get("tab");
  const tab = resolveTab(tabParam);
  const stats = useStretchingStats();

  useEffect(() => {
    const canonical = STRETCHING_TABS.some((t) => t.id === tabParam)
      ? tabParam
      : TAB_ALIASES[tabParam ?? ""] ?? null;
    if (!tabParam || canonical !== tabParam) {
      setSearchParams({ tab }, { replace: true });
    }
  }, [tabParam, tab, setSearchParams]);

  const setTab = (id: string) => setSearchParams({ tab: id });

  return (
    <AppPageShell className="stretch-wellness -mx-1 sm:-mx-2 pb-5 sm:pb-8">
      <StretchHero
        mobilityScore={stats.mobilityScore}
        recoveryStatus={stats.recoveryStatus}
        todayDone={stats.todayDone}
        estimatedSessionMin={stats.estimatedSessionMin}
      />

      {!stats.isLoading && (
        <RecoveryInsights
          recoveryStatus={stats.recoveryStatus}
          streak={stats.streak}
          sessionsThisWeek={stats.sessionsThisWeek}
          minutesThisWeek={stats.minutesThisWeek}
          estimatedSessionMin={stats.estimatedSessionMin}
        />
      )}

      <StretchNav tabs={STRETCHING_TABS} activeId={tab} onChange={setTab} />

      <div className="min-h-[20rem]">
        {tab === STRETCHING_TAB_JOURNEY && <StretchingJourneyTab />}
        {tab === STRETCHING_TAB_PROGRAMS && <StretchingPresetsTab />}
        {tab === STRETCHING_TAB_JOURNAL && <StretchingHistoryTab />}
        {tab === STRETCHING_TAB_LIBRARY && <StretchingExercisesTab />}
      </div>
    </AppPageShell>
  );
}
