import type { StrengthOrderedSetRow, StrengthSessionDetail, StrengthSetCreate } from "../../types";
import { isPlankExercise } from "../../utils/strengthExercise";
import {
  kgToWeightInputFields,
  weightInputFieldsToKg,
  type WeightInputUnit,
} from "../../utils/barbellWeightInput";
import type { PresetSet, StrengthSetBlock } from "../../types";
import type { ExerciseSetBlock, WorkoutFormPrefill } from "../../api/exercises";

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

export type WorkoutBlockType = "normal" | "superset" | "circuit";

export interface WorkoutBlock {
  id: string;
  type: WorkoutBlockType;
  title?: string;
  rounds: number;
  collapsed?: boolean;
  approaches: WorkoutApproach[];
  /** Per-round rows for superset/circuit; when set, save uses these instead of cloning template. */
  roundApproaches?: WorkoutApproach[][];
}

let approachSeq = 0;
let blockSeq = 0;

export function cloneWorkoutApproach(row: WorkoutApproach): WorkoutApproach {
  approachSeq += 1;
  return { ...row, id: `approach-${approachSeq}` };
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
  const { weight, weightUnit } = kgToWeightInputFields(kg, useAmerican);
  const exercise = opts?.exercise ?? "";
  const isBw = opts?.is_bodyweight ?? isPlankExercise(exercise);
  return {
    id: `approach-${approachSeq}`,
    exercise,
    reps: opts?.reps ?? (isBw ? "1" : "8"),
    weight,
    weightUnit,
    duration_sec: opts?.duration_sec ?? (isBw ? "30" : ""),
    is_warmup: opts?.is_warmup ?? false,
    is_bodyweight: isBw,
    lastHint: opts?.lastHint,
    warmupHint: opts?.warmupHint,
  };
}

export function cloneWorkoutBlock(block: WorkoutBlock): WorkoutBlock {
  blockSeq += 1;
  return {
    ...block,
    id: `block-${blockSeq}`,
    approaches: block.approaches.map(cloneWorkoutApproach),
    roundApproaches: block.roundApproaches?.map((round) => round.map(cloneWorkoutApproach)),
    collapsed: false,
  };
}

/** Ensure per-round rows exist for superset/circuit blocks and match rounds count. */
export function ensureBlockRoundApproaches(block: WorkoutBlock, useAmerican: boolean): WorkoutBlock {
  if (block.type === "normal") {
    return { ...block, roundApproaches: undefined };
  }
  const rounds = Math.max(1, Math.floor(block.rounds || 1));
  const template = block.approaches.length
    ? block.approaches.map(cloneWorkoutApproach)
    : [newWorkoutApproach(useAmerican)];
  let roundApproaches = block.roundApproaches?.map((round) => round.map(cloneWorkoutApproach));
  if (!roundApproaches?.length) {
    roundApproaches = [template.map(cloneWorkoutApproach)];
  }
  while (roundApproaches.length < rounds) {
    const src = roundApproaches[roundApproaches.length - 1] ?? template;
    roundApproaches.push(src.map(cloneWorkoutApproach));
  }
  if (roundApproaches.length > rounds) {
    roundApproaches = roundApproaches.slice(0, rounds);
  }
  return {
    ...block,
    rounds,
    approaches: roundApproaches[0]?.map(cloneWorkoutApproach) ?? template,
    roundApproaches,
  };
}

/** Copy one round's values to all other rounds in the block. */
export function applyRoundToAllRounds(block: WorkoutBlock, roundIndex: number): WorkoutBlock {
  if (!block.roundApproaches?.length || roundIndex < 0 || roundIndex >= block.roundApproaches.length) {
    return block;
  }
  const source = block.roundApproaches[roundIndex].map(cloneWorkoutApproach);
  return {
    ...block,
    roundApproaches: block.roundApproaches.map((_, i) =>
      i === roundIndex ? source : source.map(cloneWorkoutApproach),
    ),
    approaches: source.map(cloneWorkoutApproach),
  };
}

export function newWorkoutBlock(
  useAmerican: boolean,
  type: WorkoutBlockType = "normal",
  opts?: Partial<Pick<WorkoutBlock, "title" | "rounds" | "collapsed">> & {
    approaches?: WorkoutApproach[];
  },
): WorkoutBlock {
  blockSeq += 1;
  return {
    id: `block-${blockSeq}`,
    type,
    title: opts?.title,
    rounds: Math.max(1, Math.floor(opts?.rounds ?? (type === "normal" ? 1 : 3))),
    collapsed: opts?.collapsed ?? false,
    approaches: opts?.approaches?.length
      ? opts.approaches
      : [newWorkoutApproach(useAmerican)],
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
    const nums = block.reps_str.split(/[,+;\s]+/).map((p) => parseInt(p, 10)).filter((n) => n > 0);
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
                : "",
        }),
      );
    }
  };
  for (const b of warmupBlocks) addFromBlock(b, true);
  for (const b of workingBlocks) addFromBlock(b, false);
  return out;
}

function repsNums(raw?: string | null): number[] {
  return raw?.split(/[,+;\s]+/).map((p) => parseInt(p, 10)).filter((n) => n > 0) ?? [];
}

function warmupApproachesFromPrefillExercise(
  ex: WorkoutFormPrefill["exercises"][number] | undefined,
  isBw: boolean,
  useAmerican: boolean,
): WorkoutApproach[] {
  if (!ex?.last_date || !ex.last_warmup_sets?.length) return [];
  return ex.last_warmup_sets.flatMap((set) =>
    repsNums(set.reps_str).map((n) =>
      newWorkoutApproach(useAmerican, {
        exercise: ex.exercise,
        is_warmup: true,
        is_bodyweight: isBw,
        reps: String(isBw ? 1 : n),
        weightKg: isBw ? 0 : Number(set.weight ?? 0),
        duration_sec: isBw ? String(n) : "",
      }),
    ),
  );
}

export function approachesFromSessionDetail(
  detail: StrengthSessionDetail,
  useAmerican: boolean,
): WorkoutApproach[] {
  if (detail.uses_ordered_sets && detail.ordered_sets?.length) {
    return detail.ordered_sets.map((s) =>
      newWorkoutApproach(useAmerican, {
        exercise: s.exercise,
        is_warmup: s.is_warmup,
        is_bodyweight: s.is_bodyweight,
        reps: String(s.reps),
        weightKg: s.is_bodyweight ? 0 : s.weight,
        duration_sec: s.duration_sec != null ? String(s.duration_sec) : "",
      }),
    );
  }
  const out: WorkoutApproach[] = [];
  for (const ex of detail.exercises) {
    const working =
      ex.working_sets?.length
        ? ex.working_sets
        : ex.reps_str
          ? [
              {
                weight: ex.weight,
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
  formatDateRu: (d: string) => string,
): WorkoutApproach[] {
  if (prefill.is_circuit && prefill.circuit_steps?.length) {
    return prefill.circuit_steps.map((step) => {
      const isBw = Boolean(step.is_bodyweight) || isPlankExercise(step.exercise);
      return newWorkoutApproach(useAmerican, {
        exercise: step.exercise,
        is_warmup: Boolean(step.is_warmup),
        is_bodyweight: isBw,
        reps: String(step.reps),
        weightKg: isBw ? 0 : (step.weight ?? 0),
        duration_sec:
          step.duration_sec != null ? String(step.duration_sec) : isBw ? String(step.reps) : "",
      });
    });
  }

  const rows: WorkoutApproach[] = [];
  for (const ex of prefill.exercises) {
    const isBw = Boolean(ex.is_bodyweight) || isPlankExercise(ex.exercise);
    const hint =
      ex.last_date && (ex.last_weight != null || ex.last_reps)
        ? `было ${formatDateRu(ex.last_date)}: ${
            isBw
              ? `${ex.last_reps ?? "—"} сек`
              : `${ex.last_weight != null ? formatBarbellWeight(ex.last_weight) : "—"}, ${ex.last_reps ?? "—"}`
          }`
        : undefined;
    const warmupRows = warmupApproachesFromPrefillExercise(ex, isBw, useAmerican);

    if (ex.last_reps) {
      rows.push(...warmupRows);
      const nums = repsNums(ex.last_reps);
      for (const n of nums.length ? nums : [8]) {
        rows.push(
          newWorkoutApproach(useAmerican, {
            exercise: ex.exercise,
            is_bodyweight: isBw,
            reps: String(n),
            weightKg: ex.last_weight != null ? ex.last_weight : 0,
            duration_sec: isBw ? String(n) : "",
            lastHint: hint,
          }),
        );
      }
    } else if (warmupRows.length) {
      rows.push(...warmupRows);
    } else if (ex.sets?.length) {
      for (const s of ex.sets) {
        rows.push(
          newWorkoutApproach(useAmerican, {
            exercise: ex.exercise,
            is_warmup: Boolean(s.is_warmup),
            is_bodyweight: isBw,
            reps: String(s.reps),
            weightKg: s.weight != null ? s.weight : 0,
            duration_sec: s.duration_sec != null ? String(s.duration_sec) : "",
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
      throw new Error("Укажите название упражнения для каждого подхода");
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
        throw new Error("Вес не может быть отрицательным");
      }
      const reps = Number(row.reps);
      if (Number.isNaN(reps) || reps <= 0) {
        throw new Error("Укажите число повторений");
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
    throw new Error("Добавьте хотя бы один подход");
  }
  return built;
}

function approachToStrengthSet(row: WorkoutApproach, useAmerican: boolean): StrengthSetCreate {
  if (!row.exercise.trim()) {
    throw new Error("Укажите название упражнения для каждого подхода");
  }
  const isBw = row.is_bodyweight || isPlankExercise(row.exercise);
  if (isBw) {
    const dur = Number(row.duration_sec);
    if (Number.isNaN(dur) || dur <= 0) {
      throw new Error(`Укажите время (сек) для «${row.exercise}»`);
    }
    return {
      exercise: row.exercise.trim(),
      weight: 0,
      reps: 1,
      duration_sec: dur,
      is_bodyweight: true,
      is_warmup: row.is_warmup,
    };
  }
  const w = weightInputFieldsToKg(row.weight, row.weightUnit, useAmerican);
  if (Number.isNaN(w) || w < 0) {
    throw new Error("Вес не может быть отрицательным");
  }
  const reps = Number(row.reps);
  if (Number.isNaN(reps) || reps <= 0) {
    throw new Error("Укажите число повторений");
  }
  return {
    exercise: row.exercise.trim(),
    weight: w,
    reps,
    is_warmup: row.is_warmup,
  };
}

export function flattenWorkoutBlocks(blocks: WorkoutBlock[]): WorkoutApproach[] {
  return blocks.flatMap((block) => block.approaches);
}

export function blocksToStrengthSets(
  blocks: WorkoutBlock[],
  useAmerican: boolean,
): StrengthSetCreate[] {
  const built: StrengthSetCreate[] = [];
  blocks.forEach((block, blockIndex) => {
    if (!block.approaches.length) return;
    if (block.type !== "normal" && block.approaches.length < 2) {
      throw new Error("Для суперсета или круга добавьте минимум 2 упражнения");
    }
    const rounds = block.type === "normal" ? 1 : Math.max(1, Math.floor(block.rounds || 1));
    const perRound =
      block.type !== "normal" && block.roundApproaches?.length
        ? block.roundApproaches.slice(0, rounds)
        : null;
    for (let round = 1; round <= rounds; round += 1) {
      const rows = perRound?.[round - 1] ?? block.approaches;
      rows.forEach((row, exerciseIndex) => {
        if (block.type !== "normal" && row.is_warmup && round > 1) {
          return;
        }
        const set = approachToStrengthSet(row, useAmerican);
        built.push({
          ...set,
          block_uid: block.id,
          block_type: block.type,
          block_order: blockIndex,
          block_rounds: rounds,
          block_exercise_order: exerciseIndex,
          round_index: block.type === "normal" ? 1 : round,
          block_title: block.title?.trim() || null,
        });
      });
    }
  });
  if (!built.length) {
    throw new Error("Добавьте хотя бы один подход");
  }
  return built;
}

function approachFromOrderedSet(s: StrengthOrderedSetRow, useAmerican: boolean): WorkoutApproach {
  return newWorkoutApproach(useAmerican, {
    exercise: s.exercise,
    is_warmup: Boolean(s.is_warmup),
    is_bodyweight: Boolean(s.is_bodyweight),
    reps: String(s.reps),
    weightKg: s.is_bodyweight ? 0 : s.weight,
    duration_sec: s.duration_sec != null ? String(s.duration_sec) : "",
  });
}

function hasBlockMetadata(detail: StrengthSessionDetail): boolean {
  return Boolean(
    detail.ordered_sets?.some(
      (s) => s.block_uid || s.block_type || s.block_order != null || s.round_index != null,
    ),
  );
}

export function blocksFromSessionDetail(
  detail: StrengthSessionDetail,
  useAmerican: boolean,
): WorkoutBlock[] {
  if (hasBlockMetadata(detail) && detail.ordered_sets?.length) {
    const groups = new Map<string, StrengthOrderedSetRow[]>();
    for (const set of detail.ordered_sets) {
      const key = set.block_uid || `block-${set.block_order ?? 0}`;
      groups.set(key, [...(groups.get(key) ?? []), set]);
    }
    return [...groups.entries()]
      .map(([key, rows]) => {
        const sorted = [...rows].sort(
          (a, b) =>
            (a.block_order ?? 0) - (b.block_order ?? 0) ||
            (a.round_index ?? 1) - (b.round_index ?? 1) ||
            (a.block_exercise_order ?? 0) - (b.block_exercise_order ?? 0) ||
            (a.order_index ?? 0) - (b.order_index ?? 0),
        );
        const first = sorted[0];
        const type = first.block_type || "normal";
        const roundCount =
          first.block_rounds ??
          Math.max(1, ...sorted.map((s) => Number(s.round_index ?? 1)));
        const sortExerciseRows = (rows: StrengthOrderedSetRow[]) =>
          [...rows].sort(
            (a, b) =>
              (a.block_exercise_order ?? 0) - (b.block_exercise_order ?? 0) ||
              (a.order_index ?? 0) - (b.order_index ?? 0),
          );
        if (type === "normal") {
          return {
            id: key,
            type,
            title: first.block_title || undefined,
            rounds: 1,
            collapsed: false,
            approaches: sortExerciseRows(sorted).map((s) => approachFromOrderedSet(s, useAmerican)),
          } satisfies WorkoutBlock;
        }
        const roundApproaches: WorkoutApproach[][] = [];
        for (let r = 1; r <= roundCount; r += 1) {
          const roundRows = sortExerciseRows(
            sorted.filter((s) => (s.round_index ?? 1) === r),
          );
          if (roundRows.length) {
            roundApproaches.push(roundRows.map((s) => approachFromOrderedSet(s, useAmerican)));
          }
        }
        const templateApproaches =
          roundApproaches[0]?.map(cloneWorkoutApproach) ??
          sortExerciseRows(
            sorted.filter((s) => (s.round_index ?? 1) === Math.min(...sorted.map((x) => x.round_index ?? 1))),
          ).map((s) => approachFromOrderedSet(s, useAmerican));
        return {
          id: key,
          type,
          title: first.block_title || undefined,
          rounds: roundCount,
          collapsed: false,
          approaches: templateApproaches,
          roundApproaches: roundApproaches.length ? roundApproaches : undefined,
        } satisfies WorkoutBlock;
      })
      .sort((a, b) => {
        const ao = detail.ordered_sets?.find((s) => (s.block_uid || `block-${s.block_order ?? 0}`) === a.id)?.block_order ?? 0;
        const bo = detail.ordered_sets?.find((s) => (s.block_uid || `block-${s.block_order ?? 0}`) === b.id)?.block_order ?? 0;
        return ao - bo;
      });
  }

  if (detail.uses_ordered_sets && detail.ordered_sets?.length) {
    return [
      newWorkoutBlock(useAmerican, detail.is_circuit ? "circuit" : "normal", {
        title: detail.is_circuit ? "Круговая тренировка" : undefined,
        rounds: 1,
        approaches: detail.ordered_sets.map((s) => approachFromOrderedSet(s, useAmerican)),
      }),
    ];
  }

  const blocks: WorkoutBlock[] = [];
  for (const ex of detail.exercises) {
    const approaches = blocksToApproaches(
      ex.exercise,
      Boolean(ex.is_bodyweight) || isPlankExercise(ex.exercise),
      ex.warmup_sets ?? [],
      ex.working_sets?.length
        ? ex.working_sets
        : ex.reps_str
          ? [{ weight: ex.weight, reps_str: ex.reps_str, is_bodyweight: ex.is_bodyweight } as StrengthSetBlock]
          : [],
      useAmerican,
    );
    if (approaches.length) {
      blocks.push(newWorkoutBlock(useAmerican, "normal", { approaches }));
    }
  }
  return blocks;
}

function exerciseBlockKey(name: string, fallback: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.toLocaleLowerCase("ru-RU") : fallback;
}

function approachesFromTemplateExerciseRow(
  row: ExerciseSetBlock["exercises"][number],
  ex: WorkoutFormPrefill["exercises"][number] | undefined,
  blockType: WorkoutBlockType,
  useAmerican: boolean,
  hintFor: (ex: WorkoutFormPrefill["exercises"][number] | undefined, isBw: boolean) => string | undefined,
): WorkoutApproach[] {
  const isBw = Boolean(row.is_bodyweight || ex?.is_bodyweight) || isPlankExercise(row.exercise);
  const nums = ex?.last_date ? repsNums(ex.last_reps) : [];
  const warmupRows = warmupApproachesFromPrefillExercise(ex, isBw, useAmerican);
  const templateRep = row.reps ?? (isBw ? row.duration_sec : null) ?? 8;
  const templateWeight = row.weight ?? 0;
  const build = (n: number) =>
    newWorkoutApproach(useAmerican, {
      exercise: row.exercise,
      reps: String(isBw ? 1 : n),
      weightKg: isBw ? 0 : (ex?.last_date && ex.last_weight != null ? ex.last_weight : templateWeight),
      duration_sec: isBw
        ? String(ex?.last_date ? n : row.duration_sec ?? templateRep)
        : row.duration_sec != null
          ? String(row.duration_sec)
          : undefined,
      is_bodyweight: isBw,
      is_warmup: ex?.last_date ? false : row.is_warmup,
      lastHint: hintFor(ex, isBw),
    });

  if (blockType === "normal" && nums.length) {
    return [...warmupRows, ...nums.map(build)];
  }
  return [...warmupRows, build(nums[0] ?? templateRep)];
}

/** One normal block per exercise; supersets/circuits stay grouped. */
export function splitNormalBlocksByExercise(blocks: WorkoutBlock[], useAmerican: boolean): WorkoutBlock[] {
  const out: WorkoutBlock[] = [];
  for (const block of blocks) {
    if (block.type !== "normal") {
      out.push(block);
      continue;
    }
    const order: string[] = [];
    const grouped = new Map<string, WorkoutApproach[]>();
    for (const row of block.approaches) {
      const key = exerciseBlockKey(row.exercise, row.id);
      if (!grouped.has(key)) {
        grouped.set(key, []);
        order.push(key);
      }
      grouped.get(key)!.push(row);
    }
    if (order.length <= 1) {
      out.push(block);
      continue;
    }
    for (const key of order) {
      out.push(newWorkoutBlock(useAmerican, "normal", { approaches: grouped.get(key) ?? [] }));
    }
  }
  return out;
}

export function blocksFromPrefill(
  prefill: WorkoutFormPrefill,
  useAmerican: boolean,
  formatBarbellWeight: (kg: number) => string,
  formatDateRu: (d: string) => string,
): WorkoutBlock[] {
  if (prefill.blocks?.length) {
    const exerciseByName = new Map(
      prefill.exercises.map((ex) => [ex.exercise.trim().toLowerCase(), ex]),
    );
    const hintFor = (ex: WorkoutFormPrefill["exercises"][number] | undefined, isBw: boolean) =>
      ex?.last_date && (ex.last_weight != null || ex.last_reps)
        ? `было ${formatDateRu(ex.last_date)}: ${
            isBw
              ? `${ex.last_reps ?? "—"} сек`
              : `${ex.last_weight != null ? formatBarbellWeight(ex.last_weight) : "—"}, ${ex.last_reps ?? "—"}`
          }`
        : undefined;

    return prefill.blocks.flatMap((block) => {
      if (block.type === "normal") {
        const order: string[] = [];
        const templateByExercise = new Map<string, ExerciseSetBlock["exercises"][number]>();
        for (const row of block.exercises) {
          const key = row.exercise.trim().toLowerCase();
          if (!key || templateByExercise.has(key)) continue;
          templateByExercise.set(key, row);
          order.push(key);
        }
        return order.map((key) => {
          const row = templateByExercise.get(key)!;
          const ex = exerciseByName.get(key);
          return newWorkoutBlock(useAmerican, "normal", {
            approaches: approachesFromTemplateExerciseRow(
              row,
              ex,
              block.type,
              useAmerican,
              hintFor,
            ),
          });
        });
      }

      const perExerciseReps = block.exercises.map((row) => {
        const ex = exerciseByName.get(row.exercise.trim().toLowerCase());
        return repsNums(ex?.last_date ? ex.last_reps : null);
      });
      const factualRounds = Math.max(0, ...perExerciseReps.map((nums) => nums.length));
      const rounds = factualRounds || block.rounds;
      const hydratedExercises = new Set<string>();
      return [
        newWorkoutBlock(useAmerican, block.type, {
          title: block.title ?? undefined,
          rounds,
          approaches: block.exercises.flatMap((row) => {
            const key = row.exercise.trim().toLowerCase();
            const ex = exerciseByName.get(key);
            if (ex?.last_date) {
              if (hydratedExercises.has(key)) return [];
              hydratedExercises.add(key);
            }
            return approachesFromTemplateExerciseRow(
              row,
              ex,
              block.type,
              useAmerican,
              hintFor,
            );
          }),
        }),
      ];
    });
  }
  const approaches = approachesFromPrefill(prefill, useAmerican, formatBarbellWeight, formatDateRu);
  if (prefill.is_circuit && approaches.length) {
    return [
      newWorkoutBlock(useAmerican, "circuit", {
        title: "Круг",
        rounds: 1,
        approaches,
      }),
    ];
  }
  const order: string[] = [];
  const grouped = new Map<string, WorkoutApproach[]>();
  for (const row of approaches) {
    const key = row.exercise.trim().toLowerCase() || row.id;
    if (!grouped.has(key)) {
      grouped.set(key, []);
      order.push(key);
    }
    grouped.get(key)!.push(row);
  }
  return order.map((key) =>
    newWorkoutBlock(useAmerican, "normal", { approaches: grouped.get(key) ?? [] }),
  );
}

export function workoutBlocksToExerciseSetBlocks(blocks: WorkoutBlock[], useAmerican: boolean): ExerciseSetBlock[] {
  return splitNormalBlocksByExercise(blocks, useAmerican).map((block) => ({
    id: block.id,
    type: block.type,
    title: block.title ?? null,
    rounds: Math.max(1, Math.floor(block.rounds || 1)),
    exercises: block.approaches
      .filter((row) => row.exercise.trim())
      .map((row) => {
        const isBw = row.is_bodyweight || isPlankExercise(row.exercise);
        return {
          exercise: row.exercise.trim(),
          reps: isBw ? 1 : Number(row.reps) || 8,
          weight: isBw ? null : weightInputFieldsToKg(row.weight, row.weightUnit, useAmerican),
          duration_sec: isBw ? Number(row.duration_sec) || 30 : null,
          is_bodyweight: isBw,
          is_warmup: row.is_warmup,
        };
      }),
  }));
}

export function workoutBlocksFromExerciseSetBlocks(
  blocks: ExerciseSetBlock[] | undefined,
  exercises: string[],
  useAmerican: boolean,
): WorkoutBlock[] {
  if (blocks?.length) {
    const loaded = blocks.map((block) =>
      newWorkoutBlock(useAmerican, block.type, {
        title: block.title ?? undefined,
        rounds: block.rounds,
        approaches: block.exercises.map((row) =>
          newWorkoutApproach(useAmerican, {
            exercise: row.exercise,
            reps: row.reps != null ? String(row.reps) : undefined,
            weightKg: row.weight ?? 0,
            duration_sec: row.duration_sec != null ? String(row.duration_sec) : undefined,
            is_bodyweight: row.is_bodyweight,
            is_warmup: row.is_warmup,
          }),
        ),
      }),
    );
    return splitNormalBlocksByExercise(loaded, useAmerican);
  }
  return exercises.map((exercise) =>
    newWorkoutBlock(useAmerican, "normal", {
      approaches: [newWorkoutApproach(useAmerican, { exercise })],
    }),
  );
}

/** Строка подхода для отображения в истории тренировки. */
export interface SessionDisplaySet {
  exercise: string;
  is_warmup: boolean;
  is_bodyweight: boolean;
  weight: number;
  reps_str: string;
  order_index?: number;
  block_uid?: string | null;
  block_type?: WorkoutBlockType | null;
  block_order?: number | null;
  block_rounds?: number | null;
  block_exercise_order?: number | null;
  round_index?: number | null;
  block_title?: string | null;
}

export interface SessionDisplayBlock {
  id: string;
  type: WorkoutBlockType;
  title?: string;
  rounds: number;
  sets: SessionDisplaySet[];
}

export type SessionTimelineItem =
  | {
      kind: "normal";
      order: number;
      exercise: string;
      is_bodyweight: boolean;
      sets: SessionDisplaySet[];
    }
  | {
      kind: "block";
      order: number;
      block: SessionDisplayBlock;
    };

/** Число подходов в reps_str («7+7+7» → 3). */
export function countSetsInRepsStr(repsStr: string): number {
  if (!repsStr || repsStr.includes("сек")) return 1;
  const parts = repsStr.split("+").map((p) => p.trim()).filter(Boolean);
  return parts.length > 0 ? parts.length : 1;
}

/** Подпись «N подход(а/ов)» с учётом склейки «7+7+7+7» в одной строке. */
export function formatSessionSetLabel(repsStr: string, priorSetCount: number): string {
  const n = countSetsInRepsStr(repsStr);
  if (n === 1) {
    return `${priorSetCount + 1} подход`;
  }
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} подход`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} подхода`;
  return `${n} подходов`;
}

/** Подходы с учётом группировки «7+7+7+7» в одной строке. */
export function countStrengthSetsFromDetail(detail: StrengthSessionDetail): number {
  const sets = sessionDisplaySetsFromDetail(detail);
  return sets.reduce((sum, s) => sum + countSetsInRepsStr(s.reps_str), 0);
}

export function sessionDisplaySetsFromDetail(detail: StrengthSessionDetail): SessionDisplaySet[] {
  const isOrdered = Boolean(detail.uses_ordered_sets || detail.is_circuit);
  if (!isOrdered && detail.exercises?.length) {
    const out: SessionDisplaySet[] = [];
    for (const ex of detail.exercises) {
      const isBw = Boolean(ex.is_bodyweight) || isPlankExercise(ex.exercise);
      const pushBlock = (block: StrengthSetBlock, warmup: boolean) => {
        out.push({
          exercise: ex.exercise,
          is_warmup: warmup,
          is_bodyweight: isBw || Boolean(block.is_bodyweight),
          weight: block.weight,
          reps_str: block.reps_str,
        });
      };
      for (const b of ex.warmup_sets ?? []) pushBlock(b, true);
      const working =
        ex.working_sets?.length
          ? ex.working_sets
          : ex.reps_str
            ? [{ weight: ex.weight, reps_str: ex.reps_str }]
            : [];
      for (const b of working) pushBlock(b, false);
    }
    return out;
  }
  if (isOrdered && detail.ordered_sets?.length) {
    return detail.ordered_sets.map((s: StrengthOrderedSetRow) => ({
      exercise: s.exercise,
      is_warmup: Boolean(s.is_warmup),
      is_bodyweight: Boolean(s.is_bodyweight),
      weight: s.weight,
      reps_str: s.reps_str,
      order_index: s.order_index,
      block_uid: s.block_uid,
      block_type: s.block_type,
      block_order: s.block_order,
      block_rounds: s.block_rounds,
      block_exercise_order: s.block_exercise_order,
      round_index: s.round_index,
      block_title: s.block_title,
    }));
  }
  return [];
}

export function sessionDisplayBlocksFromDetail(detail: StrengthSessionDetail): SessionDisplayBlock[] {
  const sets = sessionDisplaySetsFromDetail(detail);
  const withMetadata = sets.filter(
    (s) => s.block_uid || s.block_type || s.block_order != null || s.round_index != null,
  );
  if (!withMetadata.length) return [];
  const groups = new Map<string, SessionDisplaySet[]>();
  for (const set of withMetadata) {
    const key = set.block_uid || `block-${set.block_order ?? 0}`;
    groups.set(key, [...(groups.get(key) ?? []), set]);
  }
  return [...groups.entries()]
    .map(([id, rows]) => {
      const sorted = [...rows].sort(
        (a, b) =>
          (a.block_order ?? 0) - (b.block_order ?? 0) ||
          (a.round_index ?? 1) - (b.round_index ?? 1) ||
          (a.block_exercise_order ?? 0) - (b.block_exercise_order ?? 0) ||
          (a.order_index ?? 0) - (b.order_index ?? 0),
      );
      const first = sorted[0];
      return {
        id,
        type: first.block_type || "normal",
        title: first.block_title || undefined,
        rounds: first.block_rounds ?? Math.max(1, ...sorted.map((s) => s.round_index ?? 1)),
        sets: sorted,
      };
    })
    .sort((a, b) => {
      const ao = a.sets[0]?.block_order ?? 0;
      const bo = b.sets[0]?.block_order ?? 0;
      return ao - bo;
    });
}

export function groupSessionSetsByExercise(
  sets: SessionDisplaySet[],
): { exercise: string; is_bodyweight: boolean; sets: SessionDisplaySet[] }[] {
  const order: string[] = [];
  const map = new Map<string, { exercise: string; is_bodyweight: boolean; sets: SessionDisplaySet[] }>();
  for (const s of sets) {
    const key = s.exercise.trim().toLowerCase();
    if (!map.has(key)) {
      map.set(key, { exercise: s.exercise, is_bodyweight: s.is_bodyweight, sets: [] });
      order.push(key);
    }
    const group = map.get(key)!;
    const prev = group.sets[group.sets.length - 1];
    const canMerge =
      prev &&
      !prev.reps_str.includes("сек") &&
      !s.reps_str.includes("сек") &&
      prev.is_warmup === s.is_warmup &&
      prev.is_bodyweight === s.is_bodyweight &&
      Number(prev.weight ?? 0) === Number(s.weight ?? 0);
    if (canMerge) {
      prev.reps_str = `${prev.reps_str}+${s.reps_str}`;
    } else {
      group.sets.push({ ...s });
    }
  }
  return order.map((k) => map.get(k)!);
}

export function sessionTimelineItemsFromDetail(detail: StrengthSessionDetail): SessionTimelineItem[] {
  const sets = sessionDisplaySetsFromDetail(detail);
  const structuralBlocks = sessionDisplayBlocksFromDetail(detail).filter((block) => block.type !== "normal");
  const structuralExerciseKeys = new Set(
    structuralBlocks.flatMap((block) =>
      block.sets.map((s) => s.exercise.trim().toLowerCase()).filter(Boolean),
    ),
  );
  const normalSets = sets.filter((s) => {
    const key = s.exercise.trim().toLowerCase();
    return (!s.block_type || s.block_type === "normal") && !structuralExerciseKeys.has(key);
  });

  const items: SessionTimelineItem[] = [];
  for (const group of groupSessionSetsByExercise(normalSets)) {
    const order = Math.min(
      ...group.sets.map((s) => Number(s.order_index ?? Number.MAX_SAFE_INTEGER)),
    );
    items.push({
      kind: "normal",
      order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
      ...group,
    });
  }
  for (const block of structuralBlocks) {
    const order = Math.min(
      ...block.sets.map((s) => Number(s.order_index ?? Number.MAX_SAFE_INTEGER)),
    );
    items.push({
      kind: "block",
      order: Number.isFinite(order) ? order : Number.MAX_SAFE_INTEGER,
      block,
    });
  }
  return items.sort((a, b) => a.order - b.order);
}

export function setRowsFromPreset(sets: PresetSet[], useAmerican: boolean): WorkoutApproach[] {
  return sets.map((s) =>
    newWorkoutApproach(useAmerican, {
      exercise: "",
      is_warmup: Boolean(s.is_warmup),
      reps: String(s.reps),
      weightKg: s.weight != null ? s.weight : 0,
      duration_sec: s.duration_sec != null ? String(s.duration_sec) : "",
    }),
  );
}
