import { useHcAnalyticsPrefs } from "../hooks/useHcAnalyticsPrefs";
import { Loader } from "./Loader";

type Props = {
  compact?: boolean;
  className?: string;
};

export function HcAnalyticsMasterToggle({ compact = false, className = "" }: Props) {
  const { prefs, isLoading, isSaving, setMaster } = useHcAnalyticsPrefs();

  if (isLoading) {
    return compact ? null : <Loader label="Загрузка настроек…" />;
  }

  return (
    <label
      className={`flex items-start gap-3 text-sm cursor-pointer rounded-xl border border-[rgb(var(--app-border)/0.5)] bg-[rgb(var(--app-surface)/0.6)] px-4 py-3.5 shadow-[var(--app-shadow-sm)] hover:border-[rgb(var(--app-accent)/0.35)] transition-colors ${className}`}
    >
      <input
        type="checkbox"
        checked={prefs.use_in_analytics}
        disabled={isSaving}
        onChange={(e) => setMaster(e.target.checked)}
        className="mt-0.5 rounded border-slate-300"
      />
      <span className="min-w-0">
        <span className="font-semibold text-[rgb(var(--app-text))] block">
          Использовать данные Health Connect в аналитике
        </span>
        {!compact ? (
          <span className="text-xs text-[rgb(var(--app-text-muted))] mt-1 block leading-relaxed">
            Включено — шаги, сон, пульс и калории HC участвуют в графиках и сводках. Выключено —
            только локальные данные Forma (ручной ввод, Polar, FIT).
          </span>
        ) : null}
      </span>
    </label>
  );
}
