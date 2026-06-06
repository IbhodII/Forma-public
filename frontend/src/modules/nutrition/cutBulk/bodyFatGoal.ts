import type { CutBulkSnapshot } from "../../../api/cutBulk";
import type { FoodPhase } from "../../../api/food";

export function hasBodyFatInSnapshot(snap: CutBulkSnapshot | null | undefined): boolean {
  const bf = snap?.body_fat_percent;
  return bf != null && Number.isFinite(bf);
}

export function defaultTargetBodyFatPercent(current: number, phase: FoodPhase): number {
  if (phase === "cut") {
    return Math.max(5, Math.round((current - 3) * 10) / 10);
  }
  return Math.min(60, Math.round((current + 1) * 10) / 10);
}

export function parseTargetBodyFatPercent(value: string): number | null {
  const v = parseFloat(value.replace(",", "."));
  return Number.isFinite(v) ? v : null;
}

export function validateTargetBodyFat(
  value: string,
  currentBf: number,
  phase: FoodPhase,
  required: boolean,
): { valid: boolean; message: string | null } {
  const parsed = parseTargetBodyFatPercent(value);
  if (parsed == null) {
    return required
      ? { valid: false, message: "Укажите целевой % жира" }
      : { valid: true, message: null };
  }
  if (parsed < 3 || parsed > 60) {
    return { valid: false, message: "Допустимый диапазон: 3–60%" };
  }
  if (phase === "cut" && parsed >= currentBf) {
    return { valid: false, message: `При сушке цель должна быть ниже текущих ${currentBf.toFixed(1)}%` };
  }
  return { valid: true, message: null };
}

export function resolveTargetBodyFatForApi(
  value: string,
  useTargetBf: boolean,
  required: boolean,
): number | null {
  if (!required && !useTargetBf) return null;
  const parsed = parseTargetBodyFatPercent(value);
  return parsed;
}

/** Минимальный целевой вес при заданном % жира без потери сухой массы. */
export function minTargetWeightForBodyFat(
  currentWeightKg: number,
  currentBfPercent: number,
  targetBfPercent: number,
): number {
  const lean = currentWeightKg * (1 - currentBfPercent / 100);
  const denom = 1 - targetBfPercent / 100;
  if (denom <= 0) return currentWeightKg;
  return Math.round((lean / denom) * 10) / 10;
}

/** Сушка: целевой вес и % жира не должны подразумевать потерю сухой массы. */
export function validateCutGoalLeanMass(
  currentWeightKg: number,
  currentBfPercent: number,
  targetWeightKg: number,
  targetBfPercent: number | null,
): { valid: boolean; message: string | null } {
  if (targetBfPercent == null) return { valid: true, message: null };
  const currentLean = currentWeightKg * (1 - currentBfPercent / 100);
  const targetLean = targetWeightKg * (1 - targetBfPercent / 100);
  if (targetLean >= currentLean - 0.1) return { valid: true, message: null };
  const minWeight = minTargetWeightForBodyFat(currentWeightKg, currentBfPercent, targetBfPercent);
  return {
    valid: false,
    message: `Цель недостижима без потери мышц: при ${targetWeightKg.toFixed(1)} кг и ${targetBfPercent.toFixed(1)}% сухая масса ниже текущей. Минимальный вес ≈ ${minWeight.toFixed(1)} кг.`,
  };
}
