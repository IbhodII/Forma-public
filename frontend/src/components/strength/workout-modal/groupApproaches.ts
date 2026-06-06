import type { WorkoutApproach } from "../workoutApproaches";

export type ExerciseGroup = {
  key: string;
  exercise: string;
  indices: number[];
};

export type CircuitRound = {
  roundNumber: number;
  indices: number[];
};

/** Группировка подходов по упражнению (обычный режим). */
export function groupApproachesByExercise(approaches: WorkoutApproach[]): ExerciseGroup[] {
  const order: string[] = [];
  const map = new Map<string, ExerciseGroup>();

  approaches.forEach((row, idx) => {
    const trimmed = row.exercise.trim();
    const key = trimmed ? trimmed.toLowerCase() : `__row_${row.id}`;
    if (!map.has(key)) {
      const group: ExerciseGroup = { key, exercise: row.exercise, indices: [] };
      map.set(key, group);
      order.push(key);
    }
    map.get(key)!.indices.push(idx);
  });

  return order.map((k) => map.get(k)!);
}

/** Разбиение круговой тренировки на раунды по повтору первого упражнения. */
export function groupApproachesIntoRounds(approaches: WorkoutApproach[]): CircuitRound[] {
  if (!approaches.length) return [];

  const firstKey =
    approaches[0].exercise.trim().toLowerCase() || approaches[0].id;

  const rounds: CircuitRound[] = [];
  let current: number[] = [];

  for (let i = 0; i < approaches.length; i++) {
    const key = approaches[i].exercise.trim().toLowerCase() || approaches[i].id;
    const prevKey =
      i > 0
        ? approaches[i - 1].exercise.trim().toLowerCase() || approaches[i - 1].id
        : null;

    if (current.length > 0 && key === firstKey && prevKey !== firstKey) {
      rounds.push({ roundNumber: rounds.length + 1, indices: current });
      current = [];
    }
    current.push(i);
  }

  if (current.length) {
    rounds.push({ roundNumber: rounds.length + 1, indices: current });
  }

  return rounds.length ? rounds : [{ roundNumber: 1, indices: approaches.map((_, i) => i) }];
}

export function flattenExerciseGroups(
  groups: ExerciseGroup[],
  approaches: WorkoutApproach[],
): WorkoutApproach[] {
  return groups.flatMap((g) => g.indices.map((i) => approaches[i]));
}

export function moveExerciseGroup(
  groups: ExerciseGroup[],
  fromIndex: number,
  toIndex: number,
): ExerciseGroup[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= groups.length || toIndex >= groups.length) {
    return groups;
  }
  const next = [...groups];
  const [item] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, item);
  return next;
}
