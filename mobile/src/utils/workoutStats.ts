import type {StrengthSession, StrengthSessionDetail, StrengthSet} from '../api/workouts';

export function parseReps(set: StrengthSet): number {
  if (set.reps != null && Number.isFinite(set.reps)) {
    return Number(set.reps);
  }
  const n = parseInt(String(set.reps_str ?? ''), 10);
  return Number.isFinite(n) ? n : 0;
}

export function setVolume(set: StrengthSet): number {
  const w = Number(set.weight ?? 0);
  const r = parseReps(set);
  return w > 0 && r > 0 ? w * r : 0;
}

export function sessionVolume(session: StrengthSession | StrengthSessionDetail): number {
  const rows: StrengthSet[] = session.ordered_sets?.length
    ? (session.ordered_sets as StrengthSet[])
    : ((session.exercises ?? []) as StrengthSet[]);
  return rows.reduce((sum, s) => sum + setVolume(s), 0);
}

export function sessionSetCount(session: StrengthSession | StrengthSessionDetail): number {
  if ('sets_count' in session && session.sets_count != null && session.sets_count > 0) {
    return session.sets_count;
  }
  const rows: StrengthSet[] = session.ordered_sets?.length
    ? (session.ordered_sets as StrengthSet[])
    : ((session.exercises ?? []) as StrengthSet[]);
  return rows.length;
}

export function formatVolume(kg: number): string {
  if (kg <= 0) {
    return '—';
  }
  if (kg >= 1000) {
    return `${(kg / 1000).toFixed(1)} т`;
  }
  return `${Math.round(kg)} кг`;
}

export function formatDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatDateShort(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString('ru-RU', {day: 'numeric', month: 'short'});
}

export type GroupedExercise = {
  exercise: string;
  sets: StrengthSet[];
  volume: number;
  bestSet: {weight: number; reps: number} | null;
};

export function groupExercises(session: StrengthSessionDetail): GroupedExercise[] {
  if (session.is_circuit && session.ordered_sets?.length) {
    return session.ordered_sets.map((s, i) => {
      const reps = parseReps(s);
      const weight = Number(s.weight ?? 0);
      return {
        exercise: s.exercise || `Шаг ${i + 1}`,
        sets: [s],
        volume: setVolume(s),
        bestSet: weight > 0 && reps > 0 ? {weight, reps} : null,
      };
    });
  }

  const map = new Map<string, GroupedExercise>();
  for (const s of session.exercises ?? []) {
    const name = s.exercise?.trim() || 'Упражнение';
    const g = map.get(name) ?? {exercise: name, sets: [], volume: 0, bestSet: null};
    g.sets.push(s);
    g.volume += setVolume(s);
    const w = Number(s.weight ?? 0);
    const r = parseReps(s);
    if (w > 0 && r > 0) {
      const vol = w * r;
      const prev = g.bestSet ? g.bestSet.weight * g.bestSet.reps : 0;
      if (vol >= prev) {
        g.bestSet = {weight: w, reps: r};
      }
    }
    map.set(name, g);
  }
  return [...map.values()];
}

export function compareVolumeDelta(current: number, previous: number): string | null {
  if (previous <= 0 || current <= 0) {
    return null;
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) {
    return 'как в прошлый раз';
  }
  return pct > 0 ? `+${pct}% к прошлой` : `${pct}% к прошлой`;
}
