import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';

import {fetchCtlAtlTsb, fetchCardioTrimp} from '../api/analytics';
import {queryKeys} from './queryKeys';
import {fetchCardioWorkouts} from '../api/cardio';
import {fetchCycleImpact} from '../api/cycle';
import {getWeekEntries} from '../api/food';
import {fetchStepsHistory} from '../api/steps';
import {fetchSleepSummary} from '../api/sleep';
import {getDayMetrics} from '../database/hcStore';
import {fetchStretchingLog} from '../api/stretching';
import {fetchUserProfile} from '../api/user';
import {getHcLastLocalReadAt} from '../services/hcModuleSettings';
import {buildRecoveryFactors} from '../utils/recoveryAdvice';
import {
  fetchStrengthSessions,
  fetchWorkoutTypes,
  type StrengthSession,
} from '../api/workouts';
import {buildDailyState, type DailyState} from '../home/dailyState';
import {buildGuidanceCards} from '../home/guidance';
import {useOffline} from '../context/OfflineContext';
import {useOperatingMode} from '../context/OperatingModeContext';
import {shouldSkipPcApi} from '../mode/operatingMode';
import {TAB} from '../navigation/routes';
import {useSyncStatusBanner} from './useSyncStatusBanner';
import {loadOnboardingPreferences} from '../onboarding/storage';
import type {CardioWorkout} from '../types/cardio';
import type {FoodPhase} from '../types/food';
import type {StretchingLogEntry} from '../types/stretching';
import {isFemaleProfile} from '../utils/profileSex';

export type PrimaryCta = {
  kind: 'start_workout' | 'recovery' | 'stretch' | 'log_food' | 'log_body';
  label: string;
  subtitle: string;
  tab: string;
  icon: string;
};

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function greetingForHour(h: number) {
  if (h < 6) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 18) return 'Добрый день';
  return 'Добрый вечер';
}

function daysAgo(iso: string) {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(`${todayIso()}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
}

function hoursAgo(iso: string) {
  const a = new Date(iso).getTime();
  const b = Date.now();
  return Math.round((b - a) / 3600000);
}

function computeStreak(dates: string[]) {
  const set = new Set(dates.map(d => d.slice(0, 10)));
  let streak = 0;
  const cursor = new Date(`${todayIso()}T12:00:00`);
  for (;;) {
    const key = cursor.toISOString().slice(0, 10);
    if (!set.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function buildPrimaryCta(
  daily: DailyState,
  stretchRecent: boolean,
  daysSinceWorkout: number,
  kcalToday: number,
): PrimaryCta {
  if (
    daily.intensity === 'rest' ||
    daily.kind === 'recovery_day' ||
    daily.kind === 'high_fatigue'
  ) {
    return {
      kind: 'recovery',
      label: 'Восстановление сегодня',
      subtitle: 'Растяжка, прогулка или отдых — без тяжёлой нагрузки',
      tab: TAB.Workouts,
      icon: 'leaf-outline',
    };
  }

  if (!stretchRecent && daysSinceWorkout <= 2) {
    return {
      kind: 'stretch',
      label: 'Мобильность и растяжка',
      subtitle: '15 минут помогут телу восстановиться после нагрузки',
      tab: TAB.Workouts,
      icon: 'body-outline',
    };
  }

  if (daysSinceWorkout >= 4 || daily.kind === 'return_to_movement') {
    return {
      kind: 'start_workout',
      label: 'Вернуться к движению',
      subtitle: 'Короткая сессия вернёт ритм — начните с умеренной интенсивности',
      tab: TAB.Workouts,
      icon: 'walk-outline',
    };
  }

  if (kcalToday === 0 && daily.kind === 'getting_started') {
    return {
      kind: 'log_food',
      label: 'Отметить питание',
      subtitle: 'Первый шаг — дневник поможет собрать картину дня',
      tab: TAB.Food,
      icon: 'nutrition-outline',
    };
  }

  if (daily.kind === 'high_readiness') {
    return {
      kind: 'start_workout',
      label: 'Тренировка по плану',
      subtitle: 'Высокая готовность — хороший день для целевой работы',
      tab: TAB.Workouts,
      icon: 'barbell-outline',
    };
  }

  if (daily.intensity === 'light') {
    return {
      kind: 'stretch',
      label: 'Лёгкая активность',
      subtitle: 'Движение без перегруза — кардио, мобильность или короткая силовая',
      tab: TAB.Workouts,
      icon: 'fitness-outline',
    };
  }

  return {
    kind: 'start_workout',
    label: 'Запланировать тренировку',
    subtitle: 'Силовая или кардио — ориентируйтесь на самочувствие',
    tab: TAB.Workouts,
    icon: 'barbell-outline',
  };
}

export function useHomeCompanion() {
  const today = todayIso();
  const hour = new Date().getHours();
  const {dbReady, dbInitError, retryDbInit} = useOffline();
  const {mode, apiReachable: pcApiReachable} = useOperatingMode();
  const skipPcApi = shouldSkipPcApi(mode, pcApiReachable);

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
    enabled: !skipPcApi,
    retry: 0,
  });
  const onboardingPrefsQuery = useQuery({
    queryKey: ['onboarding-preferences'],
    queryFn: loadOnboardingPreferences,
    staleTime: Infinity,
  });

  const ctlQuery = useQuery({
    queryKey: queryKeys.analyticsCtl(90),
    queryFn: () => fetchCtlAtlTsb(90),
    enabled: !skipPcApi,
    staleTime: 60_000,
    retry: 0,
  });

  const cardioQuery = useQuery({
    queryKey: ['home-cardio-recent'],
    queryFn: () => fetchCardioWorkouts({limit: 12, offset: 0}),
    enabled: !skipPcApi,
    retry: 0,
  });

  const typesQuery = useQuery({
    queryKey: ['strength-workout-types', mode, pcApiReachable],
    queryFn: () => fetchWorkoutTypes({operatingMode: mode, pcApiReachable}),
  });

  const firstType = typesQuery.data?.[0] ?? '';

  const strengthQuery = useQuery({
    queryKey: ['home-strength-recent', firstType],
    queryFn: () =>
      fetchStrengthSessions({workout_title: firstType, limit: 8, offset: 0}),
    enabled: Boolean(firstType),
  });

  const stretchQuery = useQuery({
    queryKey: ['home-stretch-log'],
    queryFn: () => fetchStretchingLog(14),
  });

  const foodQuery = useQuery({
    queryKey: ['home-food-week', today],
    queryFn: () => getWeekEntries(today, 'cut' as FoodPhase),
    staleTime: 60_000,
    retry: 0,
  });

  const stepsApiQuery = useQuery({
    queryKey: ['home-steps', today],
    queryFn: () => fetchStepsHistory({date_from: today, date_to: today}),
    enabled: !skipPcApi,
    staleTime: 60_000,
    retry: 0,
  });

  const hcDayQuery = useQuery({
    queryKey: ['home-hc-day', today],
    queryFn: () => getDayMetrics(today),
    staleTime: 60_000,
    enabled: dbReady,
  });
  const hcLastReadQuery = useQuery({
    queryKey: ['home-hc-last-read'],
    queryFn: () => getHcLastLocalReadAt(),
    staleTime: 60_000,
    enabled: dbReady,
  });

  const isFemale = isFemaleProfile(profileQuery.data, onboardingPrefsQuery.data?.sex);

  const cycleQuery = useQuery({
    queryKey: ['home-cycle-impact', today],
    queryFn: () => fetchCycleImpact(today),
    enabled: isFemale && !skipPcApi,
  });

  const trimpFrom = useMemo(() => {
    const d = new Date(`${today}T12:00:00`);
    d.setDate(d.getDate() - 6);
    return d.toISOString().slice(0, 10);
  }, [today]);

  const trimpQuery = useQuery({
    queryKey: ['home-trimp', trimpFrom, today],
    queryFn: () => fetchCardioTrimp(trimpFrom, today),
    enabled: !skipPcApi,
  });

  const sleepQuery = useQuery({
    queryKey: ['home-sleep-summary', 7],
    queryFn: () => fetchSleepSummary(7),
    enabled: !skipPcApi,
    retry: 0,
  });

  const dbBlocking = !dbReady && !dbInitError;
  const isLoading = dbBlocking ? true : skipPcApi ? hcDayQuery.isLoading : false;

  const refetch = () => {
    void profileQuery.refetch();
    void ctlQuery.refetch();
    void cardioQuery.refetch();
    void strengthQuery.refetch();
    void stretchQuery.refetch();
    void foodQuery.refetch();
    void cycleQuery.refetch();
  };

  const companion = useMemo(() => {
    const ctl = ctlQuery.data?.current;
    const tsb = ctl?.tsb ?? null;
    const atl = ctl?.atl ?? null;
    const ctlVal = ctl?.ctl ?? null;

    const cardio: CardioWorkout[] = cardioQuery.data?.items ?? [];
    const strength: StrengthSession[] = strengthQuery.data?.items ?? [];
    const stretch: StretchingLogEntry[] = stretchQuery.data ?? [];

    const activityDates = [
      ...cardio.map(w => w.date),
      ...strength.map(s => s.date),
      ...stretch.map(s => s.date),
    ];
    const streak = computeStreak(activityDates);

    const lastStrength = strength[0];
    const lastCardio = cardio[0];
    const lastWorkoutDate =
      [...cardio, ...strength]
        .map(w => ('date' in w ? w.date : ''))
        .filter(Boolean)
        .sort()
        .reverse()[0] ?? null;
    const daysSinceWorkout = lastWorkoutDate ? daysAgo(lastWorkoutDate) : 99;

    const lastWorkoutTitle =
      lastStrength && lastWorkoutDate === lastStrength.date
        ? lastStrength.workout_title
        : lastCardio && lastWorkoutDate === lastCardio.date
          ? lastCardio.type === 'вело'
            ? 'Велосипед'
            : lastCardio.type === 'бег'
              ? 'Бег'
              : 'Кардио'
          : lastStrength?.workout_title ?? null;

    const stretchRecent = stretch.some(s => daysAgo(s.date) <= 2);
    const cycle = cycleQuery.data;

    const daily = buildDailyState({
      tsb,
      atl,
      ctl: ctlVal,
      daysSinceWorkout,
      lastWorkoutDate,
      streak,
      stretchRecent,
      cycle,
      isFemale,
    });

    const todayFood = foodQuery.data?.days?.find(
      (d: {date: string}) => d.date === today,
    );
    const kcal = todayFood?.daily_totals?.calories ?? 0;
    const protein = todayFood?.daily_totals?.protein ?? 0;

    const primary = buildPrimaryCta(daily, stretchRecent, daysSinceWorkout, kcal);

    const guidanceCards = buildGuidanceCards({
      daily,
      streak,
      stretchRecent,
      daysSinceWorkout,
      kcalToday: kcal,
      proteinToday: protein,
      cycle,
      isFemale,
      lastWorkoutTitle,
    });

    const intensityHint = `Рекомендуемая нагрузка: ${daily.intensityLabel}`;

    const recoveryAdvice = buildRecoveryFactors({
      ctlSeries: ctlQuery.data?.items ?? [],
      dailyTrimp: trimpQuery.data?.items ?? [],
      sleepSummary: sleepQuery.data?.has_data ? sleepQuery.data : null,
    });

    const sleepHours =
      sleepQuery.data?.has_data && sleepQuery.data.avg_duration_hours != null
        ? sleepQuery.data.avg_duration_hours
        : null;

    const stepsFromApi = stepsApiQuery.data?.items?.find(
      (i: {date: string; steps: number}) => i.date === today,
    )?.steps;
    const stepsFromHc = hcDayQuery.data?.payload?.steps;
    const stepsToday = stepsFromApi ?? stepsFromHc ?? null;

    const staleFlags: string[] = [];
    if (skipPcApi) {
      staleFlags.push('API недоступен');
    }
    if (hcLastReadQuery.data) {
      const h = hoursAgo(hcLastReadQuery.data);
      if (h > 24) {
        staleFlags.push(`HC не обновлялся ${Math.round(h / 24)} дн`);
      } else {
        staleFlags.push(`HC обновлён ${h} ч назад`);
      }
    }

    return {
      greeting: greetingForHour(hour),
      daily,
      primary,
      guidanceCards,
      intensityHint,
      recoveryFactors: recoveryAdvice.factors,
      streak,
      metrics: {
        calories: kcal || null,
        protein: protein || null,
        steps: stepsToday,
        sleepHours,
        ctl: ctlVal,
        atl,
        tsb,
      },
      latestStrength: lastStrength
        ? {title: lastStrength.workout_title, date: lastStrength.date}
        : null,
      latestCardio: lastCardio
        ? {
            title:
              lastCardio.type === 'вело'
                ? 'Велосипед'
                : lastCardio.type === 'бег'
                  ? 'Бег'
                  : 'Кардио',
            date: lastCardio.date,
          }
        : null,
      staleFlags,
    };
  }, [
    hour,
    ctlQuery.data,
    trimpQuery.data,
    sleepQuery.data,
    cardioQuery.data,
    strengthQuery.data,
    stretchQuery.data,
    foodQuery.data,
    cycleQuery.data,
    stepsApiQuery.data,
    hcDayQuery.data,
    hcLastReadQuery.data,
    isFemale,
    skipPcApi,
    today,
  ]);

  const banner = useSyncStatusBanner();

  return {
    ...companion,
    isLoading,
    dbInitError,
    retryDbInit,
    isFemale,
    refetch,
    isRefetching:
      profileQuery.isFetching ||
      ctlQuery.isFetching ||
      cardioQuery.isFetching,
    syncPending: banner.pendingCount,
  };
}
