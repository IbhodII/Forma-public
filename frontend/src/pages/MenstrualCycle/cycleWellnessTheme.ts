import type { CyclePhase } from "../../shared/menstrualCyclePhases";
import { CYCLE_PHASE_LABELS } from "../../shared/menstrualCyclePhases";

/** Мягкая палитра для UI (не яркие bootstrap-цвета). */
export const CYCLE_WELLNESS_PHASE: Record<
  CyclePhase,
  {
    label: string;
    dot: string;
    bg: string;
    text: string;
    ring: string;
    timeline: string;
    insight: string;
  }
> = {
  menstrual: {
    label: CYCLE_PHASE_LABELS.menstrual,
    dot: "bg-rose-400",
    bg: "bg-gradient-to-br from-rose-100 to-rose-50 dark:from-rose-950/50 dark:to-rose-900/30",
    text: "text-rose-900 dark:text-rose-100",
    ring: "ring-rose-300/60",
    timeline: "from-rose-300 to-rose-200",
    insight: "Отдых и мягкая нагрузка помогают восстановлению.",
  },
  follicular: {
    label: CYCLE_PHASE_LABELS.follicular,
    dot: "bg-amber-300",
    bg: "bg-gradient-to-br from-amber-50 to-orange-50/80 dark:from-amber-950/40 dark:to-stone-900/30",
    text: "text-amber-950 dark:text-amber-50",
    ring: "ring-amber-200/70",
    timeline: "from-amber-200 to-orange-100",
    insight: "Энергия часто растёт — хорошее время для новых задач.",
  },
  ovulatory: {
    label: CYCLE_PHASE_LABELS.ovulatory,
    dot: "bg-emerald-300",
    bg: "bg-gradient-to-br from-emerald-50 to-teal-50/80 dark:from-emerald-950/40 dark:to-teal-900/30",
    text: "text-emerald-950 dark:text-emerald-50",
    ring: "ring-emerald-200/70",
    timeline: "from-emerald-200 to-teal-100",
    insight: "Пик жизненной силы — планируйте важные активности.",
  },
  luteal: {
    label: CYCLE_PHASE_LABELS.luteal,
    dot: "bg-violet-300",
    bg: "bg-gradient-to-br from-violet-50 to-indigo-50/70 dark:from-violet-950/40 dark:to-indigo-950/30",
    text: "text-violet-950 dark:text-violet-50",
    ring: "ring-violet-200/70",
    timeline: "from-violet-200 to-indigo-100",
    insight: "Тело готовится к новому циклу — берегите сон и питание.",
  },
};

export const PHASE_ORDER: CyclePhase[] = ["menstrual", "follicular", "ovulatory", "luteal"];

export const FLOW_WELLNESS: { value: "light" | "medium" | "heavy"; label: string; desc: string }[] = [
  { value: "light", label: "Лёгкая", desc: "Протектор достаточно" },
  { value: "medium", label: "Умеренная", desc: "Обычный день" },
  { value: "heavy", label: "Обильная", desc: "Нужен отдых" },
];

export const MOOD_CHIPS = [
  "Спокойное",
  "Энергичное",
  "Тревожное",
  "Усталое",
  "Раздражение",
  "Сосредоточенное",
] as const;

export const SYMPTOM_CHIPS = [
  "Спазмы",
  "Головная боль",
  "Вздутие",
  "Чувствительность груди",
  "Боли в пояснице",
  "Тошнота",
] as const;
