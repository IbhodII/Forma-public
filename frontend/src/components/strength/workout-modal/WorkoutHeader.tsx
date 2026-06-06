import { Activity, Flame, Heart } from "lucide-react";

export function WorkoutHeader({
  date,
  workoutTitle,
  workoutTypes,
  readOnlyPreset,
  avgHr,
  kcalChest,
  kcalWatch,
  onDateChange,
  onWorkoutTitleChange,
  onAvgHrChange,
  onKcalChestChange,
  onKcalWatchChange,
}: {
  date: string;
  workoutTitle: string;
  workoutTypes: string[];
  readOnlyPreset?: boolean;
  avgHr: string;
  kcalChest: string;
  kcalWatch: string;
  onDateChange: (v: string) => void;
  onWorkoutTitleChange: (v: string) => void;
  onAvgHrChange: (v: string) => void;
  onKcalChestChange: (v: string) => void;
  onKcalWatchChange: (v: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <label className="block text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Дата
          <input
            type="date"
            value={date}
            onChange={(e) => onDateChange(e.target.value)}
            className="input-field mt-1.5 w-full"
            required
          />
        </label>
        <label className="block text-xs font-medium uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
          Тип тренировки
          <select
            value={workoutTitle}
            disabled={readOnlyPreset}
            onChange={(e) => onWorkoutTitleChange(e.target.value)}
            className="input-field mt-1.5 w-full disabled:opacity-70"
          >
            {workoutTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <label className="rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            <Heart className="h-3.5 w-3.5" aria-hidden />
            Пульс
          </span>
          <input
            type="number"
            value={avgHr}
            onChange={(e) => onAvgHrChange(e.target.value)}
            className="mt-1.5 w-full bg-transparent border-0 p-0 text-lg font-semibold tabular-nums focus:outline-none focus:ring-0 text-[rgb(var(--app-text))]"
            placeholder="—"
          />
        </label>
        <label className="rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            <Flame className="h-3.5 w-3.5" aria-hidden />
            Ккал (пульс.)
          </span>
          <input
            type="number"
            value={kcalChest}
            onChange={(e) => onKcalChestChange(e.target.value)}
            className="mt-1.5 w-full bg-transparent border-0 p-0 text-lg font-semibold tabular-nums focus:outline-none focus:ring-0 text-[rgb(var(--app-text))]"
            placeholder="—"
          />
        </label>
        <label className="rounded-xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-3">
          <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--app-text-muted))]">
            <Activity className="h-3.5 w-3.5" aria-hidden />
            Ккал (часы)
          </span>
          <input
            type="number"
            value={kcalWatch}
            onChange={(e) => onKcalWatchChange(e.target.value)}
            className="mt-1.5 w-full bg-transparent border-0 p-0 text-lg font-semibold tabular-nums focus:outline-none focus:ring-0 text-[rgb(var(--app-text))]"
            placeholder="—"
          />
        </label>
      </div>

      <p className="rounded-2xl border border-[rgb(var(--app-border)/0.75)] bg-[rgb(var(--app-surface-subtle)/0.28)] px-3 py-2.5 text-xs leading-relaxed text-[rgb(var(--app-text-muted))]">
        Круги и суперсеты теперь добавляются ниже как отдельные блоки внутри обычной силовой тренировки.
      </p>
    </div>
  );
}
