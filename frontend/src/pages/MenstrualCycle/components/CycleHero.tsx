import { Settings } from "lucide-react";
import { Link } from "react-router-dom";
import type { CyclePhase } from "../../../shared/menstrualCyclePhases";
import { formatDateRu } from "../../../utils/format";
import { CycleProgressRing } from "./CycleProgressRing";

type Props = {
  todayPhase: CyclePhase | null;
  phaseLabel: string;
  phaseInsight: string;
  cycleDay: number | null;
  cycleLen: number;
  progressPercent: number;
  nextEvent: { label: string; date: string | null; days: number } | null;
};

export function CycleHero({
  todayPhase,
  phaseLabel,
  phaseInsight,
  cycleDay,
  cycleLen,
  progressPercent,
  nextEvent,
}: Props) {
  return (
    <section className="cycle-wellness__hero relative overflow-hidden p-6 sm:p-8 md:p-10">
      <div className="pointer-events-none absolute -right-10 -top-10 h-56 w-56 rounded-full bg-white/25 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-8 bottom-0 h-40 w-40 rounded-full bg-violet-200/30 blur-3xl cycle-marker-pulse" aria-hidden />

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-8">
        <div className="space-y-4 max-w-xl">
          <p className="text-xs font-medium uppercase tracking-[0.2em] text-[hsl(var(--cycle-muted))]">
            Ваш цикл сегодня
          </p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--cycle-ink))]">
            {todayPhase ? phaseLabel : "Настройте цикл"}
          </h1>
          <p className="text-base leading-relaxed text-[hsl(var(--cycle-muted))]">{phaseInsight}</p>

          <div className="flex flex-wrap gap-3 items-center">
            {cycleDay != null && (
              <span className="cycle-wellness__glass rounded-full px-4 py-2 text-sm text-[hsl(var(--cycle-ink))]">
                День {cycleDay} из {cycleLen}
              </span>
            )}
            {nextEvent && nextEvent.date && (
              <span className="cycle-wellness__glass rounded-full px-4 py-2 text-sm text-[hsl(var(--cycle-ink))]">
                {nextEvent.label}: через {nextEvent.days} дн.
                <span className="hidden sm:inline"> · {formatDateRu(nextEvent.date)}</span>
              </span>
            )}
            <Link
              to="/settings?tab=cycle"
              className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium bg-white/40 hover:bg-white/55 text-[hsl(var(--cycle-ink))] transition-colors"
            >
              <Settings className="h-4 w-4" aria-hidden />
              Настройки
            </Link>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end shrink-0">
          <div className="cycle-wellness__glass rounded-3xl p-5">
            <CycleProgressRing
              value={progressPercent}
              label="прогресс"
              sublabel={cycleDay != null ? `день ${cycleDay}` : "цикла"}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
