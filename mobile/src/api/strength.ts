import {apiFetch} from './client';
import {getStrengthDerivedRange, toDateRange} from '../analytics/localAnalyticsAdapter';

export interface StrengthOneRmPoint {
  date: string;
  epley_1rm: number;
}

export interface StrengthVolumePoint {
  date: string;
  volume_kg: number;
}

export interface TopExerciseProgressItem {
  exercise: string;
  current_1rm: number | null;
  past_1rm: number | null;
  change: number | null;
  change_percent: number | null;
}

export interface TopExerciseProgressResponse {
  items: TopExerciseProgressItem[];
}

export interface ExerciseProgressPoint {
  date: string;
  max_weight: number;
  max_1rm: number;
  epley_1rm: number;
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function fetchStrengthExercises() {
  try {
    const res = await apiFetch('/api/strength/exercises');
    if (res.ok) {
      return jsonOrThrow<string[]>(res);
    }
  } catch {
    // local fallback below
  }
  const {from, to} = toDateRange(180);
  const byDay = await getStrengthDerivedRange(from, to);
  const set = new Set<string>();
  for (const row of byDay.values()) {
    Object.keys(row.exerciseWeights).forEach(x => set.add(x));
  }
  return [...set].sort();
}

export async function fetchStrength1RmChart(
  exerciseName: string,
  dateFrom?: string,
  dateTo?: string,
) {
  try {
    const sp = new URLSearchParams();
    sp.set('exercise_name', exerciseName);
    if (dateFrom) {
      sp.set('date_from', dateFrom);
    }
    if (dateTo) {
      sp.set('date_to', dateTo);
    }
    const res = await apiFetch(`/api/strength/1rm-chart?${sp.toString()}`);
    if (res.ok) {
      return jsonOrThrow<StrengthOneRmPoint[]>(res);
    }
  } catch {
    // local fallback below
  }
  const range = dateFrom && dateTo ? {from: dateFrom, to: dateTo} : toDateRange(90);
  const byDay = await getStrengthDerivedRange(range.from, range.to);
  const points: StrengthOneRmPoint[] = [];
  for (const [date, row] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const v = row.exercise1rm[exerciseName];
    if (v != null && v > 0) {
      points.push({date, epley_1rm: Math.round(v * 10) / 10});
    }
  }
  return points;
}

export async function fetchStrengthVolume(dateFrom: string, dateTo: string) {
  try {
    const res = await apiFetch(
      `/api/strength/volume?date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}`,
    );
    if (res.ok) {
      const data = await jsonOrThrow<{items: StrengthVolumePoint[]}>(res);
      return data.items;
    }
  } catch {
    // local fallback below
  }
  const byDay = await getStrengthDerivedRange(dateFrom, dateTo);
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => ({date, volume_kg: Math.round(row.volumeKg)}));
}

export async function fetchTopExercisesProgress() {
  try {
    const res = await apiFetch('/api/strength/top-exercises-progress');
    if (res.ok) {
      return jsonOrThrow<TopExerciseProgressResponse>(res);
    }
  } catch {
    // local fallback below
  }
  const {from, to} = toDateRange(120);
  const byDay = await getStrengthDerivedRange(from, to);
  const first: Record<string, number> = {};
  const last: Record<string, number> = {};
  for (const [, row] of [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    for (const [ex, rm] of Object.entries(row.exercise1rm)) {
      if (first[ex] == null) {
        first[ex] = rm;
      }
      last[ex] = rm;
    }
  }
  const items: TopExerciseProgressItem[] = Object.keys(last).map(ex => {
    const current = last[ex] ?? null;
    const past = first[ex] ?? null;
    const change = current != null && past != null ? current - past : null;
    const changePercent =
      change != null && past != null && past > 0 ? (change / past) * 100 : null;
    return {
      exercise: ex,
      current_1rm: current != null ? Math.round(current) : null,
      past_1rm: past != null ? Math.round(past) : null,
      change: change != null ? Math.round(change * 10) / 10 : null,
      change_percent: changePercent != null ? Math.round(changePercent * 10) / 10 : null,
    };
  });
  items.sort((a, b) => (b.change_percent ?? -999) - (a.change_percent ?? -999));
  return {items};
}

export interface StrengthNextWorkoutSuggestion {
  should_increase: boolean;
  suggested_increment?: number | null;
  message?: string;
}

export async function fetchStrengthNextWorkoutSuggestion(params: {
  exercise_name: string;
  workout_title: string;
}) {
  const sp = new URLSearchParams();
  sp.set('exercise_name', params.exercise_name);
  sp.set('workout_title', params.workout_title);
  const res = await apiFetch(`/api/strength/next-workout-suggestion?${sp.toString()}`);
  return jsonOrThrow<StrengthNextWorkoutSuggestion>(res);
}

export async function fetchExerciseProgress(
  exercise: string,
  dateFrom?: string,
  dateTo?: string,
) {
  try {
    const sp = new URLSearchParams();
    if (dateFrom) {
      sp.set('date_from', dateFrom);
    }
    if (dateTo) {
      sp.set('date_to', dateTo);
    }
    const suffix = sp.toString() ? `?${sp.toString()}` : '';
    const res = await apiFetch(
      `/api/strength/progress/${encodeURIComponent(exercise)}${suffix}`,
    );
    if (res.ok) {
      return jsonOrThrow<ExerciseProgressPoint[]>(res);
    }
  } catch {
    // local fallback below
  }
  const range =
    dateFrom && dateTo ? {from: dateFrom, to: dateTo} : toDateRange(120);
  const byDay = await getStrengthDerivedRange(range.from, range.to);
  return [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, row]) => {
      const maxWeight = row.exerciseWeights[exercise] ?? 0;
      const epley = row.exercise1rm[exercise] ?? 0;
      return {
        date,
        max_weight: Math.round(maxWeight * 10) / 10,
        max_1rm: Math.round(epley * 10) / 10,
        epley_1rm: Math.round(epley * 10) / 10,
      };
    })
    .filter(x => x.max_weight > 0 || x.epley_1rm > 0);
}
