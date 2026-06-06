import { ChevronDown, Wind } from "lucide-react";
import { useState } from "react";
import type { StretchingPresetExercise } from "../../../types";
import { ExerciseImage } from "../ExerciseImage";
import { exerciseDescriptionText } from "../stretchingExerciseImages";

function difficultyFromHold(seconds: number): { label: string; tone: string } {
  if (seconds >= 60) return { label: "Глубоко", tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200" };
  if (seconds >= 40) return { label: "Средне", tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200" };
  return { label: "Мягко", tone: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200" };
}

const BREATH_HINTS = [
  "Вдох через нос на 4 счёта, выдох на 6.",
  "Дышите в область растяжения, без рывков.",
  "На выдохе мягко углубляйте позу.",
  "Расслабьте плечи и челюсть.",
];

type Props = {
  exercise: StretchingPresetExercise;
  index: number;
  total: number;
  state?: "done" | "current" | "upcoming";
  defaultExpanded?: boolean;
};

export function StretchCard({
  exercise,
  index,
  total,
  state = "upcoming",
  defaultExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const hold = exercise.hold_seconds ?? 30;
  const diff = difficultyFromHold(hold);
  const breath = BREATH_HINTS[index % BREATH_HINTS.length];
  const title = exercise.exercise_name ?? "Упражнение";

  const borderAccent =
    state === "current"
      ? "ring-2 ring-teal-400/60 ring-offset-2 ring-offset-transparent"
      : state === "done"
        ? "opacity-80"
        : "";

  return (
    <article
      className={`stretch-flow-card stretch-wellness__glass overflow-hidden ${borderAccent}`}
      data-expanded={expanded}
    >
      <button
        type="button"
        className="w-full text-left p-4 sm:p-5 flex gap-4 items-start"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
      >
        <div className="shrink-0 w-20 sm:w-28 rounded-xl overflow-hidden bg-teal-50/80 dark:bg-teal-950/40">
          <ExerciseImage
            imagesJson={exercise.images_json}
            alt={title}
            imgClassName="h-24 sm:h-28 w-full object-cover"
            placeholderClassName="flex h-24 sm:h-28 items-center justify-center text-teal-400/60"
          />
        </div>
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs tabular-nums text-[hsl(var(--stretch-muted))]">
              {index + 1} / {total}
            </span>
            <span className={`text-[10px] font-medium uppercase tracking-wide px-2 py-0.5 rounded-full ${diff.tone}`}>
              {diff.label}
            </span>
            {state === "current" && (
              <span className="text-[10px] font-semibold uppercase tracking-wide text-teal-600 dark:text-teal-400 animate-pulse">
                Сейчас
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-[hsl(var(--stretch-ink))] leading-snug">{title}</h3>
          {exercise.target_muscle_group && (
            <p className="text-sm text-[hsl(var(--stretch-muted))]">{exercise.target_muscle_group}</p>
          )}
          <div className="flex flex-wrap gap-3 text-sm text-[hsl(var(--stretch-muted))]">
            <span className="tabular-nums">{hold} сек</span>
            {exercise.reps > 1 && <span>{exercise.reps} повтор.</span>}
          </div>
        </div>
        <ChevronDown
          className={`h-5 w-5 shrink-0 text-[hsl(var(--stretch-muted))] transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      <div
        className={`grid transition-[grid-template-rows] duration-300 ease-out ${expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden">
          <div className="px-4 sm:px-5 pb-5 pt-0 space-y-4 border-t border-white/30 dark:border-white/10">
            <div className="flex gap-2 items-start rounded-xl bg-teal-50/60 dark:bg-teal-950/30 p-3">
              <Wind className="h-4 w-4 text-teal-600 shrink-0 mt-0.5" aria-hidden />
              <p className="text-sm text-[hsl(var(--stretch-ink))] leading-relaxed">{breath}</p>
            </div>
            <p className="text-sm text-[hsl(var(--stretch-muted))] leading-relaxed whitespace-pre-wrap">
              {exerciseDescriptionText(exercise)}
            </p>
            {exercise.notes?.trim() && (
              <p className="text-sm italic text-[hsl(var(--stretch-muted))]">Заметка: {exercise.notes}</p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
