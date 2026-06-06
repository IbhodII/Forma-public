import type {WorkoutApproach} from './workoutApproaches';

export type ExerciseGroup = {
  key: string;
  exercise: string;
  indices: number[];
};

export function groupApproachesByExercise(approaches: WorkoutApproach[]): ExerciseGroup[] {
  const order: string[] = [];
  const map = new Map<string, ExerciseGroup>();

  approaches.forEach((row, idx) => {
    const trimmed = row.exercise.trim();
    const key = trimmed ? trimmed.toLowerCase() : `__row_${row.id}`;
    if (!map.has(key)) {
      const group: ExerciseGroup = {key, exercise: row.exercise, indices: []};
      map.set(key, group);
      order.push(key);
    }
    map.get(key)!.indices.push(idx);
  });

  return order.map(k => map.get(k)!);
}
