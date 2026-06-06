import { useQuery } from "@tanstack/react-query";

import { useMemo, useState } from "react";

import { Link } from "react-router-dom";

import {

  fetchMenstrualCycleImpact,

  fetchMenstrualCycleLog,

  fetchMenstrualCyclePhases,

  fetchMenstrualCycleSettings,

  type MenstrualCycleLogEntry,

} from "../../api/menstrualCycle";

import { Loader } from "../../components/Loader";

import { useWeekStartDay } from "../../hooks/useWeekStartDay";

import { queryKeys } from "../../hooks/queryKeys";

import type { CyclePhase } from "../../shared/menstrualCyclePhases";

import { CycleHero } from "./components/CycleHero";

import { CycleInsights } from "./components/CycleInsights";

import { ElegantCalendar } from "./components/ElegantCalendar";

import { HormonePhaseWidget } from "./components/HormonePhaseWidget";

import { PhaseTimeline } from "./components/PhaseTimeline";

import "./cycleWellness.css";

import { DayEditModal } from "./DayEditModal";

import { menstrualMonthRange } from "./MenstrualMonthCalendar";

import { computeMenstrualStats } from "./menstrualCycleStats";

import { useCycleOverview } from "./hooks/useCycleOverview";

import { CYCLE_WELLNESS_PHASE } from "./cycleWellnessTheme";
import { AppPageShell } from "../../components/page-shell";



function statsRangeForAvgCycle(year: number, month: number): { from: string; to: string } {

  const start = new Date(year, month - 5, 1);

  const end = new Date(year, month + 1, 0);

  const fmt = (d: Date) =>

    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return { from: fmt(start), to: fmt(end) };

}



export function MenstrualCyclePage() {

  const weekStartDay = useWeekStartDay();

  const today = new Date().toISOString().slice(0, 10);

  const [year, setYear] = useState(() => new Date().getFullYear());

  const [month, setMonth] = useState(() => new Date().getMonth());

  const [selectedDate, setSelectedDate] = useState<string | null>(null);



  const monthRange = useMemo(() => menstrualMonthRange(year, month), [year, month]);

  const statsRange = useMemo(() => statsRangeForAvgCycle(year, month), [year, month]);



  const { data: settings, isLoading: settingsLoading } = useQuery({

    queryKey: queryKeys.menstrualCycleSettings,

    queryFn: fetchMenstrualCycleSettings,

  });



  const { data: monthLog = [], isLoading: logLoading } = useQuery({

    queryKey: queryKeys.menstrualCycleLog(monthRange),

    queryFn: () => fetchMenstrualCycleLog({ from: monthRange.from, to: monthRange.to }),

  });



  const { data: phaseDays = [], isLoading: phasesLoading } = useQuery({

    queryKey: queryKeys.menstrualCyclePhases(monthRange.from, monthRange.to),

    queryFn: () => fetchMenstrualCyclePhases(monthRange.from, monthRange.to),

    enabled: Boolean(settings?.cycle_enabled !== false && settings?.last_period_start),

  });



  const { data: statsLog = [] } = useQuery({

    queryKey: queryKeys.menstrualCycleLog(statsRange),

    queryFn: () => fetchMenstrualCycleLog({ from: statsRange.from, to: statsRange.to }),

  });



  const { data: impact, isLoading: impactLoading } = useQuery({

    queryKey: queryKeys.menstrualCycleImpact(today),

    queryFn: () => fetchMenstrualCycleImpact(today),

    enabled: Boolean(settings?.cycle_enabled !== false && settings?.last_period_start),

  });



  const phaseByDate = useMemo(() => {

    const map = new Map<string, CyclePhase>();

    for (const p of phaseDays) map.set(p.date, p.phase);

    return map;

  }, [phaseDays]);



  const logByDate = useMemo(() => {

    const map = new Map<string, MenstrualCycleLogEntry>();

    for (const e of monthLog) map.set(e.date, e);

    return map;

  }, [monthLog]);



  const stats = useMemo(() => {

    if (!settings) return null;

    return computeMenstrualStats(

      settings,

      statsLog.map((e) => e.date),

      year,

      month,

    );

  }, [settings, statsLog, year, month]);



  const overview = useCycleOverview(settings, phaseByDate, today);



  const shiftMonth = (delta: number) => {

    const d = new Date(year, month + delta, 1);

    setYear(d.getFullYear());

    setMonth(d.getMonth());

  };



  const selectedEntry = selectedDate ? logByDate.get(selectedDate) ?? null : null;

  const needsSetup = !settings?.last_period_start && !settings?.last_menstruation;

  const isLoading = settingsLoading || logLoading || phasesLoading;



  const phaseLabel = overview.todayPhase

    ? CYCLE_WELLNESS_PHASE[overview.todayPhase].label

    : "Добавьте данные";



  return (

    <AppPageShell width="fluid" className="cycle-wellness desktop-content-max pb-28">

      <CycleHero

        todayPhase={overview.todayPhase}

        phaseLabel={phaseLabel}

        phaseInsight={overview.phaseInsight}

        cycleDay={overview.cycleDay}

        cycleLen={overview.cycleLen}

        progressPercent={overview.progressPercent}

        nextEvent={overview.nextEvent}

      />



      {needsSetup && (

        <div className="cycle-wellness__glass rounded-2xl p-5 sm:p-6 text-sm border border-amber-200/50 bg-amber-50/40 dark:bg-amber-950/20">

          <p className="text-[hsl(var(--cycle-ink))] leading-relaxed">

            Укажите дату последней менструации — мы рассчитаем фазы и персональные подсказки.

          </p>

          <Link

            to="/settings?tab=cycle"

            className="inline-block mt-3 font-semibold text-rose-700 dark:text-rose-300 hover:underline"

          >

            Перейти в настройки цикла →

          </Link>

        </div>

      )}



      {!needsSetup && !isLoading && (

        <>

          <PhaseTimeline

            currentPhase={overview.todayPhase}

            cycleDay={overview.cycleDay}

            cycleLen={overview.cycleLen}

            periodLen={overview.periodLen}

          />



          <div className="cycle-wellness__main-grid grid gap-6 lg:grid-cols-3">

            <div className="lg:col-span-2 space-y-6">

              <ElegantCalendar

                year={year}

                month={month}

                weekStartDay={weekStartDay}

                phaseByDate={phaseByDate}

                logByDate={logByDate}

                selectedDate={selectedDate}

                onPrevMonth={() => shiftMonth(-1)}

                onNextMonth={() => shiftMonth(1)}

                onSelectDate={setSelectedDate}

              />

            </div>

            <div className="space-y-6">

              <CycleInsights

                predictedNext={stats?.predictedNextPeriod ?? null}

                averageCycleDays={stats?.averageCycleLengthDays ?? null}

                logsThisMonth={monthLog.length}

                phaseInsight={overview.phaseInsight}

              />

              <HormonePhaseWidget impact={impact} isLoading={impactLoading} />

            </div>

          </div>

        </>

      )}



      {isLoading && <Loader label="Загружаем ваш цикл…" />}



      {selectedDate && (

        <DayEditModal

          date={selectedDate}

          entry={selectedEntry}

          onClose={() => setSelectedDate(null)}

          onSaved={() => setSelectedDate(null)}

        />

      )}



      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-[min(100%,22rem)] px-4">

        <button

          type="button"

          onClick={() => setSelectedDate(today)}

          className="cycle-floating-log w-full rounded-2xl bg-gradient-to-r from-rose-500 to-violet-500 text-white py-4 px-6 font-semibold text-base shadow-lg hover:brightness-105 active:scale-[0.98] transition-all"

        >

          Записать сегодня

        </button>

      </div>

    </AppPageShell>

  );

}


