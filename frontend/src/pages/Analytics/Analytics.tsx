import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchExercises, fetchStrength1RmChart, fetchStrengthVolume } from "../../api/strength";
import { fetchTopExercisesProgress } from "../../api/strengthAnalytics";
import { fetchAnalyticsSettings } from "../../api/user";
import {
  useCtlAtlTsbQuery,
  useDailyTrimpQuery,
  usePassiveHrDailyQuery,
  usePassiveHrTimelineQuery,
  useSleepSummaryQuery,
  useZoneTimeQuery,
} from "../../hooks/analytics/useAnalyticsQueries";
import { useUserProfile } from "../../hooks/useUserProfile";
import { buildRecoveryFactors } from "./utils/recoveryAdvice";
import { ErrorAlert } from "../../components/ErrorAlert";
import { queryKeys } from "../../hooks/queryKeys";
import { parseApiError } from "../../utils/validation";
import { GENETIC_POTENTIAL_HINT, SECTION_HINTS } from "./analyticsHints";
import { AppPageNav, AppPageShell, UnifiedPageHeader } from "../../components/page-shell";
import { pageHeaderDescription, showDevCaptions } from "../../utils/releaseUi";
import { LineChart } from "lucide-react";
import "./analytics.css";
import { AnalyticsCard } from "./components/AnalyticsCard";
import { AnalyticsSection } from "./components/AnalyticsSection";
import { CtlCards } from "./components/CtlCards";
import { CtlChart } from "./components/CtlChart";
import { GeneticPotentialCard } from "./components/GeneticPotentialCard";
import { PeriodTabs } from "./components/PeriodTabs";
import { RecoveryRecommendations } from "./components/RecoveryRecommendations";
import { TrimpChart } from "./components/TrimpChart";
import { HeartRateZonesPanel } from "./components/HeartRateZonesPanel";
import { PassiveDailyHeartRatePanel } from "./components/PassiveDailyHeartRatePanel";
import { CycleImpactCard } from "./components/CycleImpactCard";
import { useCycleFeatureEnabled } from "../../hooks/useCycleFeatureEnabled";
import { CaloriesSection } from "./components/CaloriesSection";
import {
  StrengthAnalyticsBlock,
  type StrengthAnalyticsTabId,
} from "./components/StrengthAnalyticsBlock";
import { useAnalyticsSectionActive } from "./hooks/useAnalyticsSectionActive";
import {
  STANDARD_PERIOD_OPTIONS,
  dateRangeForPeriod,
  periodToDays,
  strengthRangeForPeriod,
  type StandardPeriodId,
} from "./utils/analyticsPeriods";

const PAGE_SECTIONS = [
  { id: "recovery", label: "Восстановление" },
  { id: "performance", label: "Форма" },
  { id: "strength", label: "Силовые" },
  { id: "body", label: "Тело" },
  { id: "heart-rate", label: "Пульс" },
  { id: "energy", label: "Энергия" },
] as const;

const SECTION_IDS = PAGE_SECTIONS.map((s) => s.id);

function periodTabs(value: StandardPeriodId, onChange: (v: StandardPeriodId) => void) {
  return (
    <PeriodTabs
      value={value}
      options={STANDARD_PERIOD_OPTIONS}
      onChange={onChange}
      variant="segmented"
    />
  );
}

function minDate(a: string | undefined, b: string | undefined): string {
  if (!a) return b ?? "";
  if (!b) return a;
  return a < b ? a : b;
}

export function Analytics() {
  const cycleEnabled = useCycleFeatureEnabled();
  const [ctlPeriod, setCtlPeriod] = useState<StandardPeriodId>("90");
  const [trimpPeriod, setTrimpPeriod] = useState<StandardPeriodId>("90");
  const [trimpChartMode, setTrimpChartMode] = useState<"bar" | "line">("bar");
  const [exercise, setExercise] = useState("");
  const [oneRmPeriod, setOneRmPeriod] = useState<StandardPeriodId>("90");
  const [volumePeriod, setVolumePeriod] = useState<StandardPeriodId>("90");
  const [oneRmMa7, setOneRmMa7] = useState(false);
  const [zonePeriod, setZonePeriod] = useState<StandardPeriodId>("90");
  const [passiveHrPeriod, setPassiveHrPeriod] = useState<StandardPeriodId>("30");
  const [zoneCardioType, setZoneCardioType] = useState("");
  const [caloriesPeriod, setCaloriesPeriod] = useState<StandardPeriodId>("90");
  const [strengthTab, setStrengthTab] = useState<StrengthAnalyticsTabId>("e1rm");

  const ctlDaysNum = periodToDays(ctlPeriod);
  const zoneDays = periodToDays(zonePeriod);
  const passiveHrRange = useMemo(() => dateRangeForPeriod(passiveHrPeriod), [passiveHrPeriod]);
  const trimpRange = useMemo(() => dateRangeForPeriod(trimpPeriod), [trimpPeriod]);
  const recoveryTrimpFrom = useMemo(() => dateRangeForPeriod("30").from ?? "", []);
  const trimpFetchRange = useMemo(() => {
    const chartRange = dateRangeForPeriod(trimpPeriod);
    return {
      from: minDate(chartRange.from, recoveryTrimpFrom),
      to: chartRange.to ?? "",
    };
  }, [trimpPeriod, recoveryTrimpFrom]);
  const oneRmRange = useMemo(() => strengthRangeForPeriod(oneRmPeriod), [oneRmPeriod]);
  const volumeRange = useMemo(() => strengthRangeForPeriod(volumePeriod), [volumePeriod]);
  const caloriesRange = useMemo(() => dateRangeForPeriod(caloriesPeriod), [caloriesPeriod]);

  const [activeSection, setActiveSection] = useState<string>(PAGE_SECTIONS[0].id);
  const { isSectionActive, setSectionRef } = useAnalyticsSectionActive(SECTION_IDS, activeSection);

  const recoveryActive = isSectionActive("recovery");
  const performanceActive = isSectionActive("performance");
  const strengthActive = isSectionActive("strength");
  const bodyActive = isSectionActive("body");
  const heartRateActive = isSectionActive("heart-rate");
  const energyActive = isSectionActive("energy");

  const ctlEnabled = recoveryActive || performanceActive;
  const trimpEnabled = recoveryActive || heartRateActive;

  useEffect(() => {
    const sync = () => {
      const id = window.location.hash.replace(/^#/, "");
      if (id === "strength-hr") {
        setActiveSection("strength");
        setStrengthTab("strength-hr");
        return;
      }
      if (PAGE_SECTIONS.some((s) => s.id === id)) setActiveSection(id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const {
    data: ctlData,
    isLoading: ctlLoading,
    isError: ctlError,
    error: ctlErr,
  } = useCtlAtlTsbQuery(ctlDaysNum, ctlEnabled);

  const {
    data: trimpDataAll,
    isLoading: trimpLoading,
    isError: trimpError,
    error: trimpErr,
  } = useDailyTrimpQuery(trimpFetchRange.from, trimpFetchRange.to, trimpEnabled);

  const trimpData = useMemo(() => {
    if (!trimpDataAll?.length) return trimpDataAll;
    if (!trimpRange.from) return trimpDataAll;
    return trimpDataAll.filter((row) => row.date >= trimpRange.from!);
  }, [trimpDataAll, trimpRange.from]);

  const recoveryTrimp = useMemo(() => {
    if (!trimpDataAll?.length || !recoveryTrimpFrom) return [];
    return trimpDataAll.filter((row) => row.date >= recoveryTrimpFrom);
  }, [trimpDataAll, recoveryTrimpFrom]);

  const { data: exercises } = useQuery({
    queryKey: queryKeys.strengthExercises,
    queryFn: fetchExercises,
    enabled: strengthActive,
  });

  const activeExercise = exercise || exercises?.[0] || "";

  const { data: analyticsSettings } = useQuery({
    queryKey: queryKeys.analyticsSettings,
    queryFn: fetchAnalyticsSettings,
    enabled: strengthActive,
  });
  const includeWarmup = analyticsSettings?.include_warmup_in_analytics ?? false;

  const { data: oneRmChartData, isLoading: oneRmChartLoading } = useQuery({
    queryKey: queryKeys.strength1RmChart(
      activeExercise,
      oneRmRange.from,
      oneRmRange.to,
      includeWarmup,
    ),
    queryFn: () =>
      fetchStrength1RmChart({
        exercise_name: activeExercise,
        date_from: oneRmRange.from,
        date_to: oneRmRange.to,
        include_warmup: includeWarmup,
      }),
    enabled: strengthActive && strengthTab === "e1rm" && Boolean(activeExercise),
  });

  const { data: volumeData, isLoading: volumeLoading } = useQuery({
    queryKey: queryKeys.strengthVolume(
      volumeRange.from ?? "",
      volumeRange.to,
      includeWarmup,
    ),
    queryFn: () =>
      fetchStrengthVolume(volumeRange.from ?? "", volumeRange.to, includeWarmup),
    enabled:
      strengthActive && strengthTab === "volume" && Boolean(volumeRange.to),
  });

  const { data: topProgress, isLoading: topProgressLoading } = useQuery({
    queryKey: queryKeys.topExercisesProgress({ include_warmup: includeWarmup }),
    queryFn: () => fetchTopExercisesProgress({ include_warmup: includeWarmup }),
    enabled: strengthActive && strengthTab === "progress",
  });

  const { data: profile, isLoading: profileLoading } = useUserProfile({
    enabled: heartRateActive,
  });

  const {
    data: zoneTimeData,
    isLoading: zoneTimeLoading,
    isError: zoneTimeError,
    error: zoneTimeErr,
  } = useZoneTimeQuery(zoneDays, zoneCardioType, heartRateActive);

  const passiveHrFrom = passiveHrRange.from ?? "";
  const passiveHrTo = passiveHrRange.to ?? "";

  const {
    data: passiveHrDailyResp,
    isLoading: passiveHrDailyLoading,
    isError: passiveHrDailyError,
    error: passiveHrDailyErr,
  } = usePassiveHrDailyQuery(passiveHrFrom, passiveHrTo, heartRateActive);
  const passiveHrDaily = passiveHrDailyResp?.days;
  const passiveHrGate = passiveHrDailyResp?.hc_gate;

  const passiveTimelineDate = useMemo(() => {
    const rows = passiveHrDaily ?? [];
    const withData = rows.filter((d) => d.sample_count > 0);
    return withData.length ? withData[withData.length - 1]!.date : passiveHrTo;
  }, [passiveHrDaily, passiveHrTo]);

  const {
    data: passiveHrTimeline,
    isLoading: passiveHrTimelineLoading,
    isError: passiveHrTimelineError,
    error: passiveHrTimelineErr,
  } = usePassiveHrTimelineQuery(passiveTimelineDate, heartRateActive);

  const {
    data: sleepSummary,
    isError: sleepError,
    error: sleepErr,
  } = useSleepSummaryQuery(7, recoveryActive);

  const recoveryAdvice = useMemo(
    () =>
      buildRecoveryFactors({
        ctlSeries: ctlData?.items ?? [],
        dailyTrimp: recoveryTrimp ?? [],
        sleepSummary: sleepSummary?.has_data ? sleepSummary : null,
      }),
    [ctlData?.items, recoveryTrimp, sleepSummary],
  );

  const ctlItems = ctlData?.items ?? [];
  const hasCtlChart = ctlItems.length > 0;

  return (
    <AppPageShell width="fluid" className="analytics-page overflow-x-hidden">
      <UnifiedPageHeader
        sticky
        eyebrow={showDevCaptions() ? "Athlete dashboard" : undefined}
        title="Аналитика"
        description={pageHeaderDescription(
          "Форма, восстановление и тренировочная нагрузка",
          "Форма, восстановление, рекорды и нагрузка — сфокусированный обзор без таблиц.",
        )}
        icon={LineChart}
        toolbar={
          <AppPageNav
            ariaLabel="Разделы аналитики"
            activeId={activeSection}
            onSelect={setActiveSection}
            items={PAGE_SECTIONS.map((s) => ({ id: s.id, label: s.label, href: `#${s.id}` }))}
          />
        }
      />

      <AnalyticsSection
        id="recovery"
        sectionRef={setSectionRef("recovery")}
        title="Нагрузка и восстановление"
        hint={SECTION_HINTS.recovery.hint}
        description="Текущие CTL, ATL, TSB и рекомендации по восстановлению на основе недавней нагрузки."
        actions={periodTabs(ctlPeriod, setCtlPeriod)}
      >
        <div className="analytics-section-grid analytics-section-grid--recovery">
          <div className="analytics-section-grid__main space-y-4">
            {ctlLoading ? (
              <p className="text-sm text-slate-500 py-4">Загрузка метрик…</p>
            ) : ctlError ? (
              <ErrorAlert message={parseApiError(ctlErr)} />
            ) : (
              <CtlCards data={ctlData} />
            )}
            {sleepError ? <ErrorAlert message={parseApiError(sleepErr)} /> : null}
            <RecoveryRecommendations advice={recoveryAdvice} />
          </div>
          {cycleEnabled ? (
            <div className="analytics-section-grid__aside">
              <AnalyticsCard
                variant="nested"
                title="Влияние цикла"
                hint="Коррекция BMR и TRIMP по фазе менструального цикла"
              >
                <CycleImpactCard enabled={recoveryActive} />
              </AnalyticsCard>
            </div>
          ) : null}
        </div>
      </AnalyticsSection>

      <AnalyticsSection
        id="performance"
        sectionRef={setSectionRef("performance")}
        title={SECTION_HINTS.ctlBlock.title}
        hint={SECTION_HINTS.ctlBlock.hint}
        description={SECTION_HINTS.ctlBlock.description}
        actions={periodTabs(ctlPeriod, setCtlPeriod)}
      >
        <div className="analytics-hero-panel -mx-0">
          {ctlLoading ? (
            <p className="text-sm text-slate-500 py-16 text-center">Загрузка CTL/ATL/TSB…</p>
          ) : ctlError ? (
            <ErrorAlert message={parseApiError(ctlErr)} />
          ) : hasCtlChart ? (
            <CtlChart items={ctlItems} hero />
          ) : (
            <p className="text-sm text-slate-500 py-16 text-center">
              Нет данных для графика. Добавьте кардио с TRIMP.
            </p>
          )}
        </div>
      </AnalyticsSection>

      <AnalyticsSection
        id="strength"
        sectionRef={setSectionRef("strength")}
        title="Силовая аналитика"
        hint={SECTION_HINTS.strength1rm.hint}
        description="Прогресс 1ПМ, сравнение упражнений и объём нагрузки за период."
      >
        <StrengthAnalyticsBlock
          tab={strengthTab}
          onTabChange={setStrengthTab}
          exercises={exercises ?? []}
          activeExercise={activeExercise}
          onExerciseChange={setExercise}
          oneRmPeriod={oneRmPeriod}
          onOneRmPeriodChange={setOneRmPeriod}
          volumePeriod={volumePeriod}
          onVolumePeriodChange={setVolumePeriod}
          oneRmMa7={oneRmMa7}
          onOneRmMa7Change={setOneRmMa7}
          oneRmChartData={oneRmChartData ?? []}
          oneRmChartLoading={oneRmChartLoading}
          topProgress={topProgress ?? []}
          topProgressLoading={topProgressLoading}
          volumeData={volumeData ?? []}
          volumeLoading={volumeLoading}
          hrAnalyticsEnabled={strengthActive && strengthTab === "strength-hr"}
        />
      </AnalyticsSection>

      <AnalyticsSection
        id="body"
        sectionRef={setSectionRef("body")}
        title="Состав тела"
        hint={GENETIC_POTENTIAL_HINT}
        description="Оценка запаса сухой массы относительно генетического предела (FFMI)."
      >
        <GeneticPotentialCard compact embedded enabled={bodyActive} />
      </AnalyticsSection>

      <AnalyticsSection
        id="heart-rate"
        sectionRef={setSectionRef("heart-rate")}
        title="Пульс и кардионагрузка"
        hint={SECTION_HINTS.trimp.hint}
        description="Распределение времени по зонам max HR и дневной TRIMP."
      >
        <div className="analytics-section-grid analytics-section-grid--dual">
          <AnalyticsCard
            variant="nested"
            title="Daily heart rate (Health Connect)"
            hint="Continuous passive HR от часов"
            description="Resting, средний и min/max пульс по дням; timeline последнего дня с данными."
            actions={periodTabs(passiveHrPeriod, setPassiveHrPeriod)}
            isLoading={passiveHrDailyLoading || passiveHrTimelineLoading}
            loadingLabel="Пульс Health Connect…"
            isEmpty={
              !passiveHrDailyLoading &&
              !passiveHrTimelineLoading &&
              !passiveHrDailyError &&
              !passiveHrTimelineError &&
              !(passiveHrDaily?.length)
            }
            emptyMessage="Нет пассивного пульса за период"
          >
            {(passiveHrDailyError || passiveHrTimelineError) && (
              <ErrorAlert
                message={parseApiError(passiveHrDailyErr ?? passiveHrTimelineErr)}
              />
            )}
            <PassiveDailyHeartRatePanel
              daily={passiveHrDaily ?? []}
              timeline={passiveHrTimeline?.points ?? []}
              isLoading={passiveHrDailyLoading || passiveHrTimelineLoading}
              hcGate={passiveHrGate}
            />
          </AnalyticsCard>

          <AnalyticsCard
            variant="nested"
            title="Зоны и время в зонах пульса"
            hint="Все тренировки с посекундным пульсом"
            description="Donut и список зон за выбранный период."
            actions={periodTabs(zonePeriod, setZonePeriod)}
            isLoading={zoneTimeLoading}
            loadingLabel="Зоны пульса…"
            isEmpty={
              !zoneTimeLoading && !zoneTimeError && !zoneTimeData?.items?.length
            }
            emptyMessage="Нет тренировок с пульсом за период"
          >
            {zoneTimeError ? (
              <ErrorAlert message={parseApiError(zoneTimeErr)} />
            ) : null}
            <HeartRateZonesPanel
              data={zoneTimeData}
              isLoading={zoneTimeLoading}
              workoutType={zoneCardioType}
              onWorkoutTypeChange={setZoneCardioType}
              days={zoneDays}
              maxHr={profile?.effective_max_heart_rate ?? null}
              profileLoading={profileLoading}
              hasProfileMax={Boolean(
                profile?.effective_max_heart_rate && profile.effective_max_heart_rate > 0,
              )}
            />
          </AnalyticsCard>

          <AnalyticsCard
            variant="nested"
            title={SECTION_HINTS.trimp.title}
            hint={SECTION_HINTS.trimp.hint}
            description={SECTION_HINTS.trimp.description}
            className="analytics-section-grid__full"
            actions={
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 flex-wrap justify-end w-full sm:w-auto">
                {periodTabs(trimpPeriod, setTrimpPeriod)}
                <button
                  type="button"
                  onClick={() => setTrimpChartMode((m) => (m === "bar" ? "line" : "bar"))}
                  className="btn-secondary min-h-[44px] sm:min-h-9 text-sm px-3 rounded-xl whitespace-nowrap"
                >
                  {trimpChartMode === "bar" ? "Линия" : "Столбцы"}
                </button>
              </div>
            }
            isLoading={trimpLoading}
            loadingLabel="TRIMP…"
            isEmpty={!trimpLoading && !trimpError && !(trimpData?.length)}
            emptyMessage="Нет TRIMP за период"
          >
            {trimpError ? <ErrorAlert message={parseApiError(trimpErr)} /> : null}
            <TrimpChart items={trimpData ?? []} mode={trimpChartMode} />
          </AnalyticsCard>
        </div>
      </AnalyticsSection>

      <AnalyticsSection
        id="energy"
        sectionRef={setSectionRef("energy")}
        title={SECTION_HINTS.calories.title}
        hint={SECTION_HINTS.calories.hint}
        description={SECTION_HINTS.calories.description}
        actions={periodTabs(caloriesPeriod, setCaloriesPeriod)}
      >
        <CaloriesSection
          embedded
          enabled={energyActive}
          dateFrom={caloriesRange.from}
          dateTo={caloriesRange.to}
        />
      </AnalyticsSection>
    </AppPageShell>
  );
}
