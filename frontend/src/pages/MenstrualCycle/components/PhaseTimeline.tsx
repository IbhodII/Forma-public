import type { CyclePhase } from "../../../shared/menstrualCyclePhases";
import { CYCLE_WELLNESS_PHASE, PHASE_ORDER } from "../cycleWellnessTheme";

type Props = {
  currentPhase: CyclePhase | null;
  cycleDay: number | null;
  cycleLen: number;
  periodLen: number;
  onSelectPhase?: (phase: CyclePhase) => void;
};

/** Доли фаз для визуализации (упрощённая модель). */
function phaseWidths(periodLen: number, cycleLen: number): Record<CyclePhase, number> {
  const p = Math.min(periodLen, cycleLen);
  const ov = 3;
  const remaining = Math.max(cycleLen - p - ov, 1);
  const fol = Math.round(remaining * 0.45);
  const lut = remaining - fol;
  return {
    menstrual: (p / cycleLen) * 100,
    follicular: (fol / cycleLen) * 100,
    ovulatory: (ov / cycleLen) * 100,
    luteal: (lut / cycleLen) * 100,
  };
}

export function PhaseTimeline({ currentPhase, cycleDay, cycleLen, periodLen, onSelectPhase }: Props) {
  const widths = phaseWidths(periodLen, cycleLen);
  const markerLeft =
    cycleDay != null ? Math.min(98, Math.max(2, ((cycleDay - 0.5) / cycleLen) * 100)) : null;

  return (
    <section className="cycle-wellness__glass rounded-2xl p-5 sm:p-6 space-y-4" aria-label="Фазы цикла">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold text-[hsl(var(--cycle-ink))]">Линия цикла</h2>
        {cycleDay != null && (
          <span className="text-sm text-[hsl(var(--cycle-muted))] tabular-nums">День {cycleDay}</span>
        )}
      </div>

      <div className="relative h-14 sm:h-16 rounded-2xl overflow-hidden flex shadow-inner bg-white/30 dark:bg-black/10">
        {PHASE_ORDER.map((phase) => (
          <button
            key={phase}
            type="button"
            style={{ width: `${widths[phase]}%` }}
            className={[
              `h-full bg-gradient-to-b ${CYCLE_WELLNESS_PHASE[phase].timeline}`,
              "transition-opacity hover:opacity-90 min-w-[8%]",
              currentPhase === phase ? "opacity-100 ring-2 ring-inset ring-white/50" : "opacity-85",
            ].join(" ")}
            onClick={() => onSelectPhase?.(phase)}
            title={CYCLE_WELLNESS_PHASE[phase].label}
            aria-label={CYCLE_WELLNESS_PHASE[phase].label}
          />
        ))}
        {markerLeft != null && (
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-[hsl(var(--cycle-ink))] shadow-sm cycle-marker-pulse"
            style={{ left: `${markerLeft}%` }}
            aria-hidden
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-[hsl(var(--cycle-ink))] border-2 border-white" />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {PHASE_ORDER.map((phase) => (
          <div
            key={phase}
            className={[
              "rounded-xl px-3 py-2 text-xs",
              currentPhase === phase ? CYCLE_WELLNESS_PHASE[phase].bg : "bg-white/25 dark:bg-white/5",
              currentPhase === phase ? CYCLE_WELLNESS_PHASE[phase].text : "text-[hsl(var(--cycle-muted))]",
            ].join(" ")}
          >
            <span className={`inline-block h-2 w-2 rounded-full mr-1.5 ${CYCLE_WELLNESS_PHASE[phase].dot}`} />
            {CYCLE_WELLNESS_PHASE[phase].label}
          </div>
        ))}
      </div>
    </section>
  );
}
