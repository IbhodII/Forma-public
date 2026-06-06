import {useMemo} from 'react';
import {useQuery} from '@tanstack/react-query';

import {fetchCtlAtlTsb, fetchCardioTrimp} from '../api/analytics';
import {queryKeys} from '../hooks/queryKeys';
import {fetchCardioWorkouts} from '../api/cardio';
import {fetchCycleImpact} from '../api/cycle';
import {getWeekEntries} from '../api/food';
import type {FoodPhase} from '../types/food';
import {fetchStretchingLog} from '../api/stretching';
import {fetchUserProfile} from '../api/user';
import {
  fetchStrengthSessions,
  fetchWorkoutTypes,
  type StrengthSession,
} from '../api/workouts';
import type {CardioWorkout} from '../types/cardio';
import type {StretchingLogEntry} from '../types/stretching';
import {periodRange} from '../components/analytics/utils';
import {buildInsightContext} from './buildContext';
import {generateInsights} from './generate';
import type {Insight, InsightSurface} from './types';
import {loadOnboardingPreferences} from '../onboarding/storage';
import {isFemaleProfile} from '../utils/profileSex';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function daysAgo(iso: string) {
  const a = new Date(`${iso}T12:00:00`).getTime();
  const b = new Date(`${todayIso()}T12:00:00`).getTime();
  return Math.round((b - a) / 86400000);
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

type Options = {
  enabled?: boolean;
  limit?: number;
  historyDays?: number;
  skipPcApi?: boolean;
};

export function useInsights(surface: InsightSurface, options: Options = {}) {
  const {enabled = true, limit = 5, historyDays = 42, skipPcApi = false} = options;
  const pcEnabled = enabled && !skipPcApi;
  const today = todayIso();

  const profileQuery = useQuery({
    queryKey: ['user-profile'],
    queryFn: fetchUserProfile,
    enabled: pcEnabled,
  });
  const onboardingPrefsQuery = useQuery({
    queryKey: ['onboarding-preferences'],
    queryFn: loadOnboardingPreferences,
    enabled,
    staleTime: Infinity,
  });

  const ctlQuery = useQuery({
    queryKey: queryKeys.analyticsCtl(historyDays),
    queryFn: () => fetchCtlAtlTsb(historyDays),
    enabled: pcEnabled,
    staleTime: 5 * 60 * 1000,
  });

  const cardioQuery = useQuery({
    queryKey: ['home-cardio-recent'],
    queryFn: () => fetchCardioWorkouts({limit: 40, offset: 0}),
    enabled: pcEnabled,
  });

  const typesQuery = useQuery({
    queryKey: ['strength-workout-types'],
    queryFn: fetchWorkoutTypes,
    enabled,
  });

  const firstType = typesQuery.data?.[0] ?? '';

  const strengthQuery = useQuery({
    queryKey: ['home-strength-recent', firstType],
    queryFn: () =>
      fetchStrengthSessions({workout_title: firstType, limit: 20, offset: 0}),
    enabled: enabled && Boolean(firstType),
  });

  const stretchQuery = useQuery({
    queryKey: ['home-stretch-log'],
    queryFn: () => fetchStretchingLog(21),
    enabled,
  });

  const foodQuery = useQuery({
    queryKey: ['home-food-week', today],
    queryFn: () => getWeekEntries(today, 'cut' as FoodPhase),
    enabled,
  });

  const isFemale = isFemaleProfile(profileQuery.data, onboardingPrefsQuery.data?.sex);

  const cycleQuery = useQuery({
    queryKey: ['home-cycle-impact', today],
    queryFn: () => fetchCycleImpact(today),
    enabled,
  });

  const {from, to} = periodRange(30);
  const trimpQuery = useQuery({
    queryKey: queryKeys.analyticsTrimp(from, to),
    queryFn: () => fetchCardioTrimp(from, to),
    enabled: pcEnabled && surface === 'analytics',
    staleTime: 5 * 60 * 1000,
  });

  const isLoading =
    enabled &&
    (pcEnabled
      ? profileQuery.isLoading || ctlQuery.isLoading || cardioQuery.isLoading
      : typesQuery.isLoading);

  const result = useMemo(() => {
    const cardio: CardioWorkout[] = cardioQuery.data?.items ?? [];
    const strength: StrengthSession[] = strengthQuery.data?.items ?? [];
    const stretch: StretchingLogEntry[] = stretchQuery.data ?? [];

    const activityDates = [
      ...cardio.map(w => w.date),
      ...strength.map(s => s.date),
      ...stretch.map(s => s.date),
    ];
    const streak = computeStreak(activityDates);
    const stretchRecent = stretch.some(s => daysAgo(s.date) <= 2);

    const todayFood = foodQuery.data?.days?.find(
      (d: {date: string}) => d.date === today,
    );

    const ctx = buildInsightContext({
      ctlPoints: ctlQuery.data?.items ?? [],
      current: ctlQuery.data?.current,
      activityDates,
      stretchRecent,
      streak,
      kcalToday: todayFood?.daily_totals?.calories ?? 0,
      proteinToday: todayFood?.daily_totals?.protein ?? 0,
      isFemale,
      cycle: cycleQuery.data,
      trimpValues: trimpQuery.data?.items?.map((x: {trimp: number}) => x.trimp) ?? [],
    });

    const insights = generateInsights(ctx, surface, limit);
    const primary = insights[0] ?? null;
    const recoveryInsights =
      surface === 'home' ? generateInsights(ctx, 'recovery', 2) : [];

    return {ctx, insights, primary, recoveryInsights};
  }, [
    surface,
    limit,
    ctlQuery.data,
    cardioQuery.data,
    strengthQuery.data,
    stretchQuery.data,
    foodQuery.data,
    cycleQuery.data,
    trimpQuery.data,
    isFemale,
    today,
  ]);

  return {
    ...result,
    isLoading,
    refetch: () => {
      void ctlQuery.refetch();
      void cardioQuery.refetch();
      void strengthQuery.refetch();
      void stretchQuery.refetch();
      void foodQuery.refetch();
      void cycleQuery.refetch();
      void trimpQuery.refetch();
    },
  };
}

export type {Insight};
