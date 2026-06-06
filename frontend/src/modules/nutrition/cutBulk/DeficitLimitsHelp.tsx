import { Info } from "lucide-react";

export function DeficitLimitsHelp({
  safePerKg = 35,
  physiologicalPerKg = 70,
}: {
  safePerKg?: number;
  physiologicalPerKg?: number;
}) {
  return (
    <p className="flex items-start gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
      <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
      <span>
        Физиологический предел {physiologicalPerKg} ккал/кг жира в день — выше этого организм чаще
        сжигает мышцы. Рекомендуемый безопасный дефицит — до {safePerKg} ккал/кг жира в день
        (настраивается в блоке контроля дефицита).
      </span>
    </p>
  );
}
