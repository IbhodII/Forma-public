import type { FlowIntensity } from "../../../api/menstrualCycle";
import { CYCLE_PHASE_OPTIONS, type CyclePhase } from "../../../shared/menstrualCyclePhases";
import { FLOW_WELLNESS, MOOD_CHIPS, SYMPTOM_CHIPS, CYCLE_WELLNESS_PHASE } from "../cycleWellnessTheme";
import { WellnessCard } from "./WellnessCard";

type Props = {
  phase: CyclePhase | "";
  onPhaseChange: (p: CyclePhase | "") => void;
  flow: "" | FlowIntensity;
  onFlowChange: (f: "" | FlowIntensity) => void;
  moodChips: string[];
  onMoodToggle: (mood: string) => void;
  symptomChips: string[];
  onSymptomToggle: (s: string) => void;
  energy: number;
  onEnergyChange: (n: number) => void;
  notes: string;
  onNotesChange: (n: string) => void;
  extraSymptoms: string;
  onExtraSymptomsChange: (s: string) => void;
};

export function SymptomTracker({
  phase,
  onPhaseChange,
  flow,
  onFlowChange,
  moodChips,
  onMoodToggle,
  symptomChips,
  onSymptomToggle,
  energy,
  onEnergyChange,
  notes,
  onNotesChange,
  extraSymptoms,
  onExtraSymptomsChange,
}: Props) {
  return (
    <div className="space-y-4">
      <WellnessCard title="Фаза цикла" description="Можно оставить автоматический расчёт">
        <div className="flex flex-wrap gap-2">
          <ChipButton active={phase === ""} onClick={() => onPhaseChange("")} label="Авто" />
          {CYCLE_PHASE_OPTIONS.map((o) => (
            <ChipButton
              key={o.value}
              active={phase === o.value}
              onClick={() => onPhaseChange(o.value)}
              label={o.label}
              dotClass={CYCLE_WELLNESS_PHASE[o.value].dot}
            />
          ))}
        </div>
      </WellnessCard>

      <WellnessCard title="Интенсивность" description="Для дней менструации">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ChipButton active={flow === ""} onClick={() => onFlowChange("")} label="Не указано" />
          {FLOW_WELLNESS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => onFlowChange(f.value)}
              className={[
                "rounded-xl px-4 py-3 text-left transition-all border",
                flow === f.value
                  ? "border-rose-300 bg-rose-50/80 dark:bg-rose-950/30"
                  : "border-transparent bg-white/35 dark:bg-white/5 hover:bg-white/50",
              ].join(" ")}
            >
              <span className="block text-sm font-medium text-[hsl(var(--cycle-ink))]">{f.label}</span>
              <span className="block text-xs text-[hsl(var(--cycle-muted))] mt-0.5">{f.desc}</span>
            </button>
          ))}
        </div>
      </WellnessCard>

      <WellnessCard title="Настроение">
        <div className="flex flex-wrap gap-2">
          {MOOD_CHIPS.map((m) => (
            <ChipButton key={m} active={moodChips.includes(m)} onClick={() => onMoodToggle(m)} label={m} />
          ))}
        </div>
      </WellnessCard>

      <WellnessCard title="Симптомы">
        <div className="flex flex-wrap gap-2 mb-3">
          {SYMPTOM_CHIPS.map((s) => (
            <ChipButton key={s} active={symptomChips.includes(s)} onClick={() => onSymptomToggle(s)} label={s} />
          ))}
        </div>
        <input
          className="w-full rounded-xl border-0 bg-white/40 dark:bg-white/5 px-4 py-3 text-sm text-[hsl(var(--cycle-ink))] placeholder:text-[hsl(var(--cycle-muted))] focus:ring-2 focus:ring-rose-300/50"
          placeholder="Другое…"
          value={extraSymptoms}
          onChange={(e) => onExtraSymptomsChange(e.target.value)}
        />
      </WellnessCard>

      <WellnessCard title="Энергия" description="Субъективная шкала 1–5">
        <div className="flex items-center gap-4">
          <input
            type="range"
            min={1}
            max={5}
            value={energy}
            onChange={(e) => onEnergyChange(Number(e.target.value))}
            className="flex-1 accent-rose-400 h-2"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={energy}
          />
          <span className="text-lg font-semibold tabular-nums text-[hsl(var(--cycle-ink))] w-8 text-center">
            {energy}
          </span>
        </div>
        <div className="flex justify-between text-[10px] text-[hsl(var(--cycle-muted))] mt-1 px-0.5">
          <span>Низкая</span>
          <span>Высокая</span>
        </div>
      </WellnessCard>

      <WellnessCard title="Заметки" description="Сон, питание, гидратация — всё в одном месте">
        <textarea
          rows={4}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          placeholder="Как вы себя чувствуете сегодня…"
          className="w-full rounded-xl border-0 bg-white/40 dark:bg-white/5 px-4 py-3 text-sm resize-y min-h-[5rem] text-[hsl(var(--cycle-ink))] focus:ring-2 focus:ring-rose-300/50"
        />
      </WellnessCard>
    </div>
  );
}

function ChipButton({
  active,
  onClick,
  label,
  dotClass,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  dotClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-sm font-medium transition-all",
        active
          ? "bg-rose-200/80 dark:bg-rose-900/50 text-rose-950 dark:text-rose-50 shadow-sm"
          : "bg-white/40 dark:bg-white/5 text-[hsl(var(--cycle-muted))] hover:bg-white/60",
      ].join(" ")}
    >
      {dotClass && <span className={`h-2 w-2 rounded-full ${dotClass}`} aria-hidden />}
      {label}
    </button>
  );
}

/** Собирает строку symptoms для API из чипов и доп. текста. */
export function buildSymptomsPayload(moods: string[], symptoms: string[], extra: string, energy: number): string | null {
  const parts: string[] = [];
  if (moods.length) parts.push(`Настроение: ${moods.join(", ")}`);
  if (symptoms.length) parts.push(symptoms.join(", "));
  const extraTrim = extra.trim();
  if (extraTrim) parts.push(extraTrim);
  parts.push(`Энергия: ${energy}/5`);
  const joined = parts.join("; ").trim();
  return joined || null;
}

/** Парсит сохранённую строку обратно в чипы (best-effort). */
export function parseSymptomsString(raw: string | null): {
  moods: string[];
  symptoms: string[];
  extra: string;
  energy: number;
} {
  if (!raw?.trim()) return { moods: [], symptoms: [], extra: "", energy: 3 };
  let moods: string[] = [];
  let symptoms: string[] = [];
  let extra = "";
  let energy = 3;

  const parts = raw.split(";").map((p) => p.trim());
  for (const part of parts) {
    if (part.startsWith("Настроение:")) {
      const list = part.replace("Настроение:", "").trim();
      moods = list
        .split(",")
        .map((s) => s.trim())
        .filter((m) => (MOOD_CHIPS as readonly string[]).includes(m));
    } else if (part.startsWith("Энергия:")) {
      const m = part.match(/(\d)/);
      if (m) energy = Math.min(5, Math.max(1, Number(m[1])));
    } else {
      const asChip = SYMPTOM_CHIPS.find((c) => part === c || part.includes(c));
      if (asChip && SYMPTOM_CHIPS.includes(asChip)) {
        if (!symptoms.includes(asChip)) symptoms.push(asChip);
      } else if (part) {
        extra = extra ? `${extra}; ${part}` : part;
      }
    }
  }
  for (const chip of SYMPTOM_CHIPS) {
    if (raw.includes(chip) && !symptoms.includes(chip)) symptoms.push(chip);
  }
  return { moods, symptoms, extra, energy };
}
