import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { fetchCardioTabSettings } from "../api/cardio";
import { fetchPolarPendingList, type PolarPendingListItem } from "../api/polar";
import { fetchPresets } from "../api/presets";
import { PolarAttachExistingModal } from "../components/PolarAttachExistingModal";
import { PolarPendingFollowUpModals } from "../components/PolarPendingFollowUpModals";
import { PolarPendingModal } from "../components/PolarPendingModal";
import { PolarSameDateModal } from "../components/PolarSameDateModal";
import { SubTabs } from "../components/SubTabs";
import { WorkoutPeriodFilter } from "../components/WorkoutPeriodFilter";
import { usePolarAutoAttach } from "../hooks/usePolarAutoAttach";
import { useWorkoutFormGate } from "../contexts/WorkoutFormGateContext";
import { queryKeys } from "../hooks/queryKeys";
import {
  workoutPeriodToDateRange,
  workoutPeriodDisplayLabel,
  type WorkoutPeriod,
} from "../utils/workoutPeriod";
import {
  CARDIO_ARCHIVED_TAB_PREFIX,
  CARDIO_RUN,
  CARDIO_TAB_ORDER,
  WORKOUTS_EXERCISES_TAB,
  WORKOUTS_PRESETS_TAB,
  cardioTabLabel,
} from "../utils/constants";
import { AppPageShell, ContextToolbar, UnifiedPageHeader } from "../components/page-shell";
import { pageHeaderDescription, showDevCaptions } from "../utils/releaseUi";
import { Dumbbell } from "lucide-react";
import { CardioSection } from "./CardioSection";
import { ExercisesPage } from "./ExercisesPage";
import { PresetsList } from "./PresetsList";
import { StrengthSection } from "./StrengthPage";
import "./workouts-layout.css";

export { WORKOUTS_EXERCISES_TAB, WORKOUTS_PRESETS_TAB } from "../utils/constants";

function buildWorkoutTabItems(activePresetNames: string[], activeCardioTypes: string[]) {
  const raw = [
    ...activePresetNames.map((t) => ({ id: t, label: t })),
    ...activeCardioTypes.map((t) => ({ id: t, label: cardioTabLabel(t) })),
    { id: WORKOUTS_EXERCISES_TAB, label: "Набор упражнений" },
    { id: WORKOUTS_PRESETS_TAB, label: "Настройки отображения" },
  ];
  // Defensive UI guard: imported duplicates in presets must not duplicate tabs.
  const seen = new Set<string>();
  return raw.filter((item) => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });
}

function resolveTab(tabParam: string | null, tabIds: string[]): string {
  if (tabParam && tabIds.includes(tabParam)) return tabParam;
  return tabIds[0] ?? WORKOUTS_EXERCISES_TAB;
}

const DEFAULT_WORKOUT_PERIOD: WorkoutPeriod = "3m";

/** Старые URL с архивными вкладками → вкладка «Настройки отображения». */
function isLegacyArchivedTab(tab: string | null): boolean {
  if (!tab) return false;
  return tab.startsWith("archived:") || tab.startsWith(CARDIO_ARCHIVED_TAB_PREFIX);
}

export function WorkoutsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [polarModalOpen, setPolarModalOpen] = useState(false);
  const [polarCreateItem, setPolarCreateItem] = useState<PolarPendingListItem | null>(null);
  const [polarAttachFromList, setPolarAttachFromList] = useState<PolarPendingListItem | null>(
    null,
  );
  const initialRange = workoutPeriodToDateRange(DEFAULT_WORKOUT_PERIOD);
  const [workoutPeriod, setWorkoutPeriod] = useState<WorkoutPeriod>(DEFAULT_WORKOUT_PERIOD);
  const [dateFrom, setDateFrom] = useState(initialRange.from ?? "");
  const [dateTo, setDateTo] = useState(initialRange.to ?? "");

  const applyWorkoutPeriod = (period: WorkoutPeriod) => {
    setWorkoutPeriod(period);
    const range = workoutPeriodToDateRange(period);
    setDateFrom(range.from ?? "");
    setDateTo(range.to ?? "");
  };

  const periodLabel = workoutPeriodDisplayLabel(workoutPeriod, dateFrom, dateTo);

  const { data: allPresets } = useQuery({
    queryKey: queryKeys.strengthPresets(),
    queryFn: () => fetchPresets(),
  });

  const { data: cardioSettings } = useQuery({
    queryKey: queryKeys.cardioTabSettings(),
    queryFn: () => fetchCardioTabSettings(),
  });

  const { data: polarPending } = useQuery({
    queryKey: queryKeys.polarPendingList,
    queryFn: fetchPolarPendingList,
    staleTime: 60_000,
  });
  const polarPendingCount = polarPending?.total ?? 0;
  const polarItems = polarPending?.items ?? [];
  const { isWorkoutFormOpen } = useWorkoutFormGate();

  const {
    attachItem,
    sameDatePrompt,
    dismissSameDate,
    onAttachFromSameDate,
    clearAttachItem,
    refreshPending,
  } = usePolarAutoAttach(polarItems, { suppressPrompts: isWorkoutFormOpen });

  const activePresetNames = useMemo(
    () => allPresets?.filter((p) => p.is_active === 1).map((p) => p.name) ?? [],
    [allPresets],
  );

  const activeCardioTypes = useMemo(() => {
    if (cardioSettings?.length) {
      return cardioSettings.filter((c) => c.is_active === 1).map((c) => c.type);
    }
    return [...CARDIO_TAB_ORDER];
  }, [cardioSettings]);

  const workoutTypes = activePresetNames;
  const tabItems = useMemo(
    () => buildWorkoutTabItems(workoutTypes, activeCardioTypes),
    [workoutTypes, activeCardioTypes],
  );
  const tabIds = useMemo(() => tabItems.map((t) => t.id), [tabItems]);

  const tabParam = searchParams.get("tab");
  const strengthExpandParam = searchParams.get("strengthExpand");
  const strengthTitleParam = searchParams.get("strengthTitle");

  useEffect(() => {
    if (!tabIds.length) return;
    if (isLegacyArchivedTab(tabParam)) {
      setSearchParams({ tab: WORKOUTS_PRESETS_TAB }, { replace: true });
      return;
    }
    if (searchParams.get("run") === "1") {
      const runTab = activeCardioTypes.includes(CARDIO_RUN) ? CARDIO_RUN : tabIds[0];
      setSearchParams({ tab: runTab }, { replace: true });
      return;
    }
    if (tabParam === "polar-pending") {
      setPolarModalOpen(true);
      setSearchParams({ tab: tabIds[0] }, { replace: true });
      return;
    }
    if (!tabParam || !tabIds.includes(tabParam)) {
      setSearchParams({ tab: tabIds[0] }, { replace: true });
    }
  }, [tabIds, tabParam, searchParams, setSearchParams, activeCardioTypes]);

  const tab = resolveTab(
    isLegacyArchivedTab(tabParam) ? WORKOUTS_PRESETS_TAB : tabParam,
    tabIds,
  );

  const setTab = (id: string) => {
    const next = new URLSearchParams(searchParams);
    next.set("tab", id);
    next.delete("strengthExpand");
    setSearchParams(next);
  };

  const isStrength = workoutTypes.includes(tab);
  const isExercises = tab === WORKOUTS_EXERCISES_TAB;
  const isPresets = tab === WORKOUTS_PRESETS_TAB;

  useEffect(() => {
    if (!strengthExpandParam || isPresets) return;
    if (!workoutTypes.includes(tab)) return;
    const next = new URLSearchParams(searchParams);
    next.delete("strengthExpand");
    next.delete("strengthTitle");
    setSearchParams(next, { replace: true });
  }, [strengthExpandParam, tab, workoutTypes, searchParams, setSearchParams, isPresets]);
  const isCardio = activeCardioTypes.includes(tab);

  return (
    <AppPageShell width="fluid" className="workouts-layout">
      <UnifiedPageHeader
        eyebrow={showDevCaptions() ? "Training hub" : undefined}
        title="Тренировки"
        description={pageHeaderDescription(
          "Силовые, кардио и каталог упражнений",
          "Силовые, кардио и библиотека упражнений — единая лента без админ-таблиц.",
        )}
        icon={Dumbbell}
        toolbar={
          <ContextToolbar layout="stack">
            <SubTabs items={tabItems} activeId={tab} onChange={setTab} />
            {(isStrength || isCardio) && (
              <WorkoutPeriodFilter
                period={workoutPeriod}
                onPeriodChange={applyWorkoutPeriod}
                dateFrom={dateFrom}
                dateTo={dateTo}
              />
            )}
          </ContextToolbar>
        }
      />

      {polarPendingCount > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 sm:px-4 py-2.5 sm:py-3 text-xs sm:text-sm text-amber-900 flex flex-col sm:flex-row sm:flex-wrap sm:items-center sm:justify-between gap-2">
          <span>
            У вас {polarPendingCount}{" "}
            {polarPendingCount === 1
              ? "незаписанная тренировка Polar"
              : polarPendingCount < 5
                ? "незаписанные тренировки Polar"
                : "незаписанных тренировок Polar"}
            .
          </span>
          <button
            type="button"
            className="font-medium text-brand-700 hover:underline shrink-0 min-h-[44px] sm:min-h-0 px-1"
            onClick={() => setPolarModalOpen(true)}
          >
            Посмотреть список
          </button>
        </div>
      )}

      <div className="workouts-layout__body">
        <div className="workouts-layout__main">
      {isStrength && (
        <StrengthSection
          embedded
          fixedWorkoutTitle={tab}
          activeWorkoutTypes={workoutTypes}
          dateFrom={dateFrom}
          dateTo={dateTo}
          periodLabel={periodLabel}
          initialExpandedKey={strengthExpandParam}
        />
      )}
      {isCardio && (
        <CardioSection
          embedded
          fixedType={tab}
          activeCardioTypes={activeCardioTypes}
          dateFrom={dateFrom}
          dateTo={dateTo}
          periodLabel={periodLabel}
        />
      )}
      {isExercises && <ExercisesPage embedded />}
      {isPresets && (
        <>
          <PresetsList embedded />
          {strengthExpandParam && strengthTitleParam && (
            <div className="mt-4 sm:mt-6 border-t border-slate-200 pt-4 sm:pt-6">
              <p className="text-sm text-slate-500 mb-3">Архивный пресет — просмотр тренировки</p>
              <StrengthSection
                embedded
                fixedWorkoutTitle={strengthTitleParam}
                readOnly
                dateFrom={dateFrom}
                dateTo={dateTo}
                periodLabel={periodLabel}
                initialExpandedKey={strengthExpandParam}
              />
            </div>
          )}
        </>
      )}
        </div>
      </div>

      <PolarPendingModal
        open={polarModalOpen}
        onClose={() => setPolarModalOpen(false)}
        onCreateItem={setPolarCreateItem}
        onAttachItem={setPolarAttachFromList}
      />

      <PolarPendingFollowUpModals
        createItem={polarCreateItem}
        attachItem={polarAttachFromList}
        strengthTypes={workoutTypes}
        onCloseCreate={() => setPolarCreateItem(null)}
        onCloseAttach={() => setPolarAttachFromList(null)}
      />

      {sameDatePrompt && (
        <PolarSameDateModal
          date={sameDatePrompt.date}
          items={sameDatePrompt.items}
          onClose={dismissSameDate}
          onAttachItem={onAttachFromSameDate}
        />
      )}

      {attachItem && (
        <PolarAttachExistingModal
          item={attachItem}
          onClose={clearAttachItem}
          onDone={refreshPending}
        />
      )}
    </AppPageShell>
  );
}
