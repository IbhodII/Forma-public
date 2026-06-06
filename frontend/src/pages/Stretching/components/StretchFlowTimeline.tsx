import type { StretchingPresetExercise } from "../../../types";
import { StretchCard } from "./StretchCard";

type Props = {
  exercises: StretchingPresetExercise[];
  previewIndex?: number;
};

export function StretchFlowTimeline({ exercises, previewIndex = 0 }: Props) {
  const sorted = [...exercises].sort((a, b) => (a.exercise_order ?? 0) - (b.exercise_order ?? 0));
  const total = sorted.length;

  if (!total) {
    return (
      <p className="text-sm text-[hsl(var(--stretch-muted))] text-center py-8">
        Добавьте упражнения в программу
      </p>
    );
  }

  return (
    <div className="relative space-y-4 pl-1">
      <div
        className="absolute left-[1.125rem] top-6 bottom-6 w-0.5 stretch-timeline-line rounded-full opacity-60"
        aria-hidden
      />
      {sorted.map((ex, i) => {
        let state: "done" | "current" | "upcoming" = "upcoming";
        if (i < previewIndex) state = "done";
        else if (i === previewIndex) state = "current";

        return (
          <div key={`${ex.exercise_id}-${i}`} className="relative pl-10">
            <div
              className={[
                "absolute left-3 top-8 h-3 w-3 rounded-full border-2 border-white shadow-sm z-10",
                state === "current"
                  ? "bg-teal-500 scale-125"
                  : state === "done"
                    ? "bg-teal-400/70"
                    : "bg-white/80 dark:bg-slate-600",
              ].join(" ")}
              aria-hidden
            />
            <StretchCard
              exercise={ex}
              index={i}
              total={total}
              state={state}
              defaultExpanded={state === "current"}
            />
          </div>
        );
      })}
    </div>
  );
}
