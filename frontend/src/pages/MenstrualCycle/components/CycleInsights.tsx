import { ChevronDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { formatDateRu } from "../../../utils/format";

type Props = {
  predictedNext: string | null;
  averageCycleDays: number | null;
  logsThisMonth: number;
  phaseInsight: string;
};

export function CycleInsights({
  predictedNext,
  averageCycleDays,
  logsThisMonth,
  phaseInsight,
}: Props) {
  const [open, setOpen] = useState(true);

  return (
    <section className="cycle-wellness__glass rounded-2xl overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center justify-between gap-3 p-5 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="inline-flex items-center gap-2 text-base font-semibold text-[hsl(var(--cycle-ink))]">
          <TrendingUp className="h-4 w-4 text-rose-500" aria-hidden />
          Инсайты
        </span>
        <ChevronDown
          className={`h-5 w-5 text-[hsl(var(--cycle-muted))] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-4 border-t border-white/30 dark:border-white/10">
          <p className="text-sm leading-relaxed text-[hsl(var(--cycle-muted))] pt-4">{phaseInsight}</p>

          <div className="space-y-3">
            <InsightRow
              label="Следующая менструация"
              value={predictedNext ? formatDateRu(predictedNext) : "Укажите дату начала"}
            />
            <InsightRow
              label="Средняя длина цикла"
              value={averageCycleDays != null ? `${averageCycleDays} дней` : "Нужно больше записей"}
            />
            <InsightRow label="Записей в этом месяце" value={String(logsThisMonth)} />
          </div>

          <p className="text-xs text-[hsl(var(--cycle-muted))] rounded-xl bg-white/30 dark:bg-white/5 p-3">
            Регулярные отметки помогают точнее предсказывать фазы и нагрузку на тренировки.
          </p>
        </div>
      )}
    </section>
  );
}

function InsightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-[hsl(var(--cycle-muted))]">{label}</span>
      <span className="font-medium text-[hsl(var(--cycle-ink))] text-right">{value}</span>
    </div>
  );
}
