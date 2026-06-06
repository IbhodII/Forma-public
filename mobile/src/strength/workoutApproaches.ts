import type {StrengthSessionDetail, StrengthSetCreate, WorkoutFormPrefill} from '../api/workouts';
import {isPlankExercise} from '../utils/strengthExercise';
import {
  kgToWeightInputFields,
  weightInputFieldsToKg,
  type WeightInputUnit,
} from '../utils/barbellWeightInput';

export interface WorkoutApproach {
  id: string;
  exercise: string;
  reps: string;
  weight: string;
  weightUnit: WeightInputUnit;
  duration_sec: string;
  is_warmup: boolean;
  is_bodyweight: boolean;
  lastHint?: string;
  warmupHint?: string;
}

type StrengthSetBlock = {
  weight: number;
  reps_str: string;
  is_bodyweight?: boolean;
  duration_sec?: number | null;
};

let approachSeq = 0;

export function cloneWorkoutApproach(row: WorkoutApproach): WorkoutApproach {
  approachSeq += 1;
  return {...row, id: `approach-${approachSeq}`};
}

export function newWorkoutApproach(
  useAmerican: boolean,
  opts?: {
    exercise?: string;
    reps?: string;
    weightKg?: number;
    duration_sec?: string;
    is_warmup?: boolean;
    is_bodyweight?: boolean;
    lastHint?: string;
    warmupHint?: string;
  },
): WorkoutApproach {
  approachSeq += 1;
  const kg = opts?.weightKg ?? 0;
  const {weight, weightUnit} = kgToWeightInputFields(kg, useAmerican);
  const exercise = opts?.exercise ?? '';
  const isBw = opts?.is_bodyweight ?? isPlankExercise(exercise);
  return {
    id: `approach-${approachSeq}`,
    exercise,
    reps: opts?.reps ?? (isBw ? '1' : '8'),
    weight,
    weightUnit,
    duration_sec: opts?.duration_sec ?? (isBw ? '30' : ''),
    is_warmup: opts?.is_warmup ?? false,
    is_bodyweight: isBw,
    lastHint: opts?.lastHint,
    warmupHint: opts?.warmupHint,
  };
}

function blocksToApproaches(
  exercise: string,
  isBw: boolean,
  warmupBlocks: StrengthSetBlock[],
  workingBlocks: StrengthSetBlock[],
  useAmerican: boolean,
): WorkoutApproach[] {
  const out: WorkoutApproach[] = [];
  const addFromBlock = (block: StrengthSetBlock, is_warmup: boolean) => {
    const nums = block.reps_str
      .split(/[,+;\s]+/)
      .map(p => parseInt(p, 10))
      .filter(n => n > 0);
    for (const n of nums.length ? nums : [1]) {
      out.push(
        newWorkoutApproach(useAmerican, {
          exercise,
          is_warmup,
          is_bodyweight: isBw || Boolean(block.is_bodyweight),
          reps: String(n),
          weightKg: block.is_bodyweight ? 0 : Number(block.weight ?? 0),
          duration_sec:
            block.duration_sec != null
              ? String(block.duration_sec)
              : block.is_bodyweight
                ? String(n)
                : '',
        }),
      );
    }
  };
  for (const b of warmupBlocks) {
    addFromBlock(b, true);
  }
  for (const b of workingBlocks) {
    addFromBlock(b, false);
  }
  return out;
}

export function approachesFromSessionDetail(
  detail: StrengthSessionDetail,
  useAmerican: boolean,
): WorkoutApproach[] {
  if (detail.uses_ordered_sets && detail.ordered_sets?.length) {
    return detail.ordered_sets.map(s =>
      newWorkoutApproach(useAmerican, {
        exercise: s.exercise,
        is_warmup: Boolean(s.is_warmup),
        is_bodyweight: Boolean(s.is_bodyweight),
        reps: String(s.reps ?? 1),
        weightKg: s.is_bodyweight ? 0 : Number(s.weight ?? 0),
        duration_sec: s.duration_sec != null ? String(s.duration_sec) : '',
      }),
    );
  }
  const out: WorkoutApproach[] = [];
  for (const ex of detail.exercises ?? []) {
    const working =
      ex.working_sets?.length
        ? ex.working_sets
        : ex.reps_str
          ? [
              {
                weight: ex.weight ?? 0,
                reps_str: ex.reps_str,
                is_bodyweight: ex.is_bodyweight,
              } as StrengthSetBlock,
            ]
          : [];
    out.push(
      ...blocksToApproaches(
        ex.exercise,
        Boolean(ex.is_bodyweight) || isPlankExercise(ex.exercise),
        ex.warmup_sets ?? [],
        working,
        useAmerican,
      ),
    );
  }
  return out;
}

export function approachesFromPrefill(
  prefill: WorkoutFormPrefill,
  useAmerican: boolean,
  formatBarbellWeight: (kg: number) => string,
  formatDate: (d: string) => string,
): WorkoutApproach[] {
  const rows: WorkoutApproach[] = [];
  for (const ex of prefill.exercises) {
    const isBw = Boolean(ex.is_bodyweight) || isPlankExercise(ex.exercise);
    const hint =
      ex.last_date && (ex.last_weight != null || ex.last_reps)
        ? `было ${formatDate(ex.last_date)}: ${
            isBw
              ? `${ex.last_reps ?? '—'} сек`
              : `${ex.last_weight != null ? formatBarbellWeight(ex.last_weight) : '—'}, ${ex.last_reps ?? '—'}`
          }`
        : undefined;

    if (ex.sets?.length) {
      for (const s of ex.sets) {
        rows.push(
          newWorkoutApproach(useAmerican, {
            exercise: ex.exercise,
            is_warmup: Boolean(s.is_warmup),
            is_bodyweight: isBw,
            reps: String(s.reps),
            weightKg: s.weight != null ? s.weight : 0,
            duration_sec: s.duration_sec != null ? String(s.duration_sec) : '',
            lastHint: hint,
          }),
        );
      }
    } else if (ex.last_reps) {
      const nums = ex.last_reps
        .split(/[,+;\s]+/)
        .map(p => parseInt(p, 10))
        .filter(n => n > 0);
      for (const n of nums.length ? nums : [8]) {
        rows.push(
          newWorkoutApproach(useAmerican, {
            exercise: ex.exercise,
            is_bodyweight: isBw,
            reps: String(n),
            weightKg: ex.last_weight != null ? ex.last_weight : 0,
            duration_sec: isBw ? String(n) : '',
            lastHint: hint,
          }),
        );
      }
    } else {
      rows.push(
        newWorkoutApproach(useAmerican, {
          exercise: ex.exercise,
          is_bodyweight: isBw,
          lastHint: hint,
        }),
      );
    }
  }
  return rows;
}

export function approachesToStrengthSets(
  approaches: WorkoutApproach[],
  useAmerican: boolean,
): StrengthSetCreate[] {
  const built: StrengthSetCreate[] = [];
  for (const row of approaches) {
    if (!row.exercise.trim()) {
      throw new Error('Укажите название упражнения для каждого подхода');
    }
    const isBw = row.is_bodyweight || isPlankExercise(row.exercise);
    if (isBw) {
      const dur = Number(row.duration_sec);
      if (Number.isNaN(dur) || dur <= 0) {
        throw new Error(`Укажите время (сек) для «${row.exercise}»`);
      }
      built.push({
        exercise: row.exercise.trim(),
        weight: 0,
        reps: 1,
        duration_sec: dur,
        is_bodyweight: true,
        is_warmup: row.is_warmup,
      });
    } else {
      const w = weightInputFieldsToKg(row.weight, row.weightUnit, useAmerican);
      if (Number.isNaN(w) || w < 0) {
        throw new Error('Вес не может быть отрицательным');
      }
      const reps = Number(row.reps);
      if (Number.isNaN(reps) || reps <= 0) {
        throw new Error('Укажите число повторений');
      }
      built.push({
        exercise: row.exercise.trim(),
        weight: w,
        reps,
        is_warmup: row.is_warmup,
      });
    }
  }
  if (!built.length) {
    throw new Error('Добавьте хотя бы один подход');
  }
  return built;
}
