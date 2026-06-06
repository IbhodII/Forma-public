export type CyclePhase = "menstrual" | "follicular" | "ovulatory" | "luteal";

export const CYCLE_PHASE_LABELS: Record<CyclePhase, string> = {
  menstrual: "Менструальная",
  follicular: "Фолликулярная",
  ovulatory: "Овуляторная",
  luteal: "Лютеиновая",
};

/** Цвета ячеек календаря */
export const CYCLE_PHASE_CELL_CLASS: Record<CyclePhase, string> = {
  menstrual: "bg-red-500 text-white shadow-sm",
  follicular: "bg-yellow-400 text-yellow-950 shadow-sm",
  ovulatory: "bg-green-500 text-white shadow-sm",
  luteal: "bg-blue-500 text-white shadow-sm",
};

export const CYCLE_PHASE_LEGEND: { phase: CyclePhase; label: string; className: string }[] = [
  { phase: "menstrual", label: CYCLE_PHASE_LABELS.menstrual, className: "bg-red-500" },
  { phase: "follicular", label: CYCLE_PHASE_LABELS.follicular, className: "bg-yellow-400" },
  { phase: "ovulatory", label: CYCLE_PHASE_LABELS.ovulatory, className: "bg-green-500" },
  { phase: "luteal", label: CYCLE_PHASE_LABELS.luteal, className: "bg-blue-500" },
];

export const CYCLE_PHASE_OPTIONS: { value: CyclePhase; label: string }[] = (
  Object.keys(CYCLE_PHASE_LABELS) as CyclePhase[]
).map((p) => ({ value: p, label: CYCLE_PHASE_LABELS[p] }));

export interface CyclePhaseDay {
  date: string;
  phase: CyclePhase;
  source: "manual" | "predicted";
  bmr_multiplier?: number;
  recovery_multiplier?: number;
}

export interface CycleImpact {
  tracking: boolean;
  message?: string;
  date?: string;
  phase?: CyclePhase;
  phase_label?: string;
  source?: string;
  bmr_multiplier?: number;
  recovery_multiplier?: number;
  bmr_adjusted?: boolean;
  bmr_note?: string | null;
  recovery_note?: string | null;
}
