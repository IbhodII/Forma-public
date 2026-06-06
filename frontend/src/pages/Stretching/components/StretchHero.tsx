import { Sparkles } from "lucide-react";
import { StretchProgressRing } from "./StretchProgressRing";
import type { RecoveryStatus } from "../hooks/useStretchingStats";
import { RECOVERY_LABELS } from "../hooks/useStretchingStats";

type Props = {
  mobilityScore: number;
  recoveryStatus: RecoveryStatus;
  todayDone: boolean;
  estimatedSessionMin: number;
};

export function StretchHero({
  mobilityScore,
  recoveryStatus,
  todayDone,
  estimatedSessionMin,
}: Props) {
  return (
    <section className="stretch-wellness__hero relative overflow-hidden p-4 sm:p-8 md:p-10">
      <div
        className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full bg-white/30 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-12 -left-8 h-40 w-40 rounded-full bg-teal-300/25 blur-3xl stretch-breathe-dot"
        aria-hidden
      />

      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-5 sm:gap-8">
        <div className="space-y-3 sm:space-y-4 max-w-xl">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/40 dark:bg-white/10 px-3 py-1 text-xs font-medium text-[hsl(var(--stretch-ink))]">
            <Sparkles className="h-3.5 w-3.5 text-teal-600" aria-hidden />
            Мобильность и восстановление
          </div>
          <h1 className="text-2xl sm:text-4xl font-semibold tracking-tight text-[hsl(var(--stretch-ink))]">
            Ваше пространство
            <span className="block text-teal-700/90 dark:text-teal-300/95 font-normal text-xl sm:text-3xl mt-1">
              для мягкой растяжки
            </span>
          </h1>
          <p className="text-sm sm:text-base text-[hsl(var(--stretch-muted))] leading-relaxed">
            {todayDone
              ? "Сегодня вы уже позаботились о теле. Отдохните или добавьте короткую сессию."
              : `Рекомендуем ~${estimatedSessionMin} мин спокойной работы с дыханием и удержаниями.`}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span className="stretch-wellness__glass rounded-full px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm text-[hsl(var(--stretch-ink))]">
              {RECOVERY_LABELS[recoveryStatus]}
            </span>
          </div>
        </div>

        <div className="flex justify-center lg:justify-end shrink-0">
          <div className="stretch-wellness__glass rounded-2xl sm:rounded-3xl p-4 sm:p-6">
            <StretchProgressRing
              value={mobilityScore}
              size={140}
              label="мобильность"
              sublabel="за 7 дней"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
