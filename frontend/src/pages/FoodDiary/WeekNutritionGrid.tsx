import type { FoodPhase } from "../../api/food";
import { useUnits } from "../../hooks/useUnits";
import { formatDateRu } from "../../utils/format";
import type { WeekDayCell } from "./useFoodWeekData";

function cellTone(
  phase: FoodPhase,
  balance: number | null,
  opts: {
    maxDeficitPerKgFat: number;
    fatKg: number | null;
    intake: number;
    expenditure: number | null;
  },
): string {
  if (balance == null || opts.expenditure == null) {
    return "bg-[rgb(var(--app-surface-muted))]/50 border-[rgb(var(--app-border))]";
  }
  if (balance > 0) {
    return "bg-emerald-50/90 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800";
  }
  if (phase === "cut" && opts.fatKg && opts.fatKg > 0) {
    const deficitKcal = -balance;
    const perKg = deficitKcal / opts.fatKg;
    if (perKg > opts.maxDeficitPerKgFat) {
      return "bg-rose-50/90 dark:bg-rose-950/40 border-rose-300 dark:border-rose-800";
    }
    if (deficitKcal > 0) {
      return "bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
    }
  }
  if (balance < 0) {
    return "bg-amber-50/80 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800";
  }
  return "bg-[rgb(var(--app-surface))] border-[rgb(var(--app-border))]";
}

export function WeekNutritionGrid({
  cells,
  phase,
  maxDeficitPerKgFat,
  fatKg,
  onDayClick,
}: {
  cells: WeekDayCell[];
  phase: FoodPhase;
  maxDeficitPerKgFat: number;
  fatKg: number | null;
  onDayClick: (date: string) => void;
}) {
  const { formatEnergy, formatFoodWeight } = useUnits();

  const totals = cells.reduce(
    (acc, c) => {
      acc.protein += c.protein;
      acc.fat += c.fat;
      acc.carbs += c.carbs;
      acc.fiber += c.fiber;
      acc.intake += c.intake;
      if (c.expenditure != null) acc.expenditure += c.expenditure;
      if (c.balance != null) acc.balance += c.balance;
      if (c.expenditure != null) acc.daysWithExp += 1;
      return acc;
    },
    {
      protein: 0,
      fat: 0,
      carbs: 0,
      fiber: 0,
      intake: 0,
      expenditure: 0,
      balance: 0,
      daysWithExp: 0,
    },
  );

  const n = cells.length || 1;
  const avg = {
    protein: totals.protein / n,
    fat: totals.fat / n,
    carbs: totals.carbs / n,
    fiber: totals.fiber / n,
    intake: totals.intake / n,
  };
  const avgExp = totals.daysWithExp ? totals.expenditure / totals.daysWithExp : null;
  const avgBalance = totals.daysWithExp ? totals.balance / totals.daysWithExp : null;

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        <div className="food-week-grid">
          {cells.map((cell) => {
            const tone = cellTone(phase, cell.balance, {
              maxDeficitPerKgFat,
              fatKg,
              intake: cell.intake,
              expenditure: cell.expenditure,
            });
            const month = String(new Date(`${cell.date}T12:00:00`).getMonth() + 1).padStart(2, "0");
            const dayStr = `${String(cell.dayNum).padStart(2, "0")}.${month}`;

            return (
              <button
                key={cell.date}
                type="button"
                onClick={() => onDayClick(cell.date)}
                className={`rounded-xl border p-2.5 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 ${tone} ${
                  cell.isSunday ? "ring-1 ring-amber-400/40" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-1 mb-1.5">
                  <div>
                    <p className="text-xs font-medium text-[rgb(var(--app-text-muted))] leading-tight">
                      {cell.weekdayLabel} {dayStr}
                    </p>
                  </div>
                  <span className="text-[rgb(var(--app-text-muted))] text-xs" aria-hidden>
                    ✏️
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] leading-snug tabular-nums">
                  <p>
                    Б:{formatFoodWeight(cell.protein)} Ж:{formatFoodWeight(cell.fat)} У:
                    {formatFoodWeight(cell.carbs)}
                  </p>
                  <p className="text-[rgb(var(--app-text-muted))]">
                    Клетч.: {formatFoodWeight(cell.fiber)}
                  </p>
                  <p>
                    <span className="text-[rgb(var(--app-text-muted))]">Ккал </span>
                    <span className="font-medium">
                      {cell.hasEntries ? formatEnergy(cell.intake) : "—"}
                    </span>
                  </p>
                  {cell.expenditure != null && cell.expenditureIsForecast && cell.expenditureForecast ? (
                    <div className="food-expenditure-forecast food-expenditure-forecast--compact">
                      <p className="food-expenditure-forecast__label">
                        {cell.expenditureForecast.label}
                      </p>
                      <p className="food-expenditure-forecast__value tabular-nums">
                        {formatEnergy(cell.expenditure)}
                      </p>
                    </div>
                  ) : cell.expenditure != null ? (
                    <p className="text-[rgb(var(--app-text-muted))]">
                      Расх. {formatEnergy(cell.expenditure)}
                    </p>
                  ) : null}
                  <p
                    className={`font-semibold flex items-center gap-0.5 ${
                      cell.balance == null
                        ? ""
                        : cell.balance < 0
                          ? "text-emerald-700 dark:text-emerald-300"
                          : "text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <span className="text-[rgb(var(--app-text-muted))] font-normal">Баланс </span>
                    {cell.balance != null && cell.balance < 0 && (
                      <span aria-hidden title="дефицит">
                        ↓
                      </span>
                    )}
                    {cell.balance != null && cell.balance > 0 && (
                      <span aria-hidden title="профицит">
                        ↑
                      </span>
                    )}
                    {cell.hasFallback && (
                      <span
                        className="text-amber-600 dark:text-amber-400"
                        title="Часть тренировок без пульсометра"
                      >
                        ⚠
                      </span>
                    )}
                    {cell.balance != null
                      ? cell.balance > 0
                        ? `+${formatEnergy(cell.balance)}`
                        : formatEnergy(cell.balance)
                      : "—"}
                  </p>
                </div>
                {!cell.hasEntries && (
                  <p className="mt-1.5 text-[10px] text-[rgb(var(--app-text-muted))]">
                    Добавить приём
                  </p>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="rounded-lg border border-[rgb(var(--app-border))] overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead>
            <tr className="bg-[rgb(var(--app-surface-muted))] text-[rgb(var(--app-text-muted))]">
              <th className="py-2 px-3 text-left font-medium">Итого за неделю</th>
              <th className="py-2 px-3 text-right font-medium">Б / Ж / У</th>
              <th className="py-2 px-3 text-right font-medium">Клетч.</th>
              <th className="py-2 px-3 text-right font-medium">Ккал</th>
              <th className="py-2 px-3 text-right font-medium">Среднее/день</th>
              <th className="py-2 px-3 text-right font-medium">Баланс (ср.)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="py-2 px-3 text-[rgb(var(--app-text-muted))]">7 дней</td>
              <td className="py-2 px-3 text-right tabular-nums text-xs">
                {formatFoodWeight(totals.protein)} / {formatFoodWeight(totals.fat)} /{" "}
                {formatFoodWeight(totals.carbs)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums font-medium">
                {formatFoodWeight(totals.fiber)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums font-medium">
                {formatEnergy(totals.intake)}
              </td>
              <td className="py-2 px-3 text-right tabular-nums text-xs">
                <span className="block">
                  Б:{formatFoodWeight(avg.protein)} Ж:{formatFoodWeight(avg.fat)} У:
                  {formatFoodWeight(avg.carbs)}
                </span>
                <span className="text-[rgb(var(--app-text-muted))]">
                  клетч. {formatFoodWeight(avg.fiber)} · {formatEnergy(Math.round(avg.intake))}
                </span>
                {avgExp != null && (
                  <span className="block text-[rgb(var(--app-text-muted))]">
                    расх. {formatEnergy(Math.round(avgExp))}
                  </span>
                )}
              </td>
              <td
                className={`py-2 px-3 text-right tabular-nums font-semibold ${
                  avgBalance == null
                    ? ""
                    : avgBalance < 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-amber-600 dark:text-amber-400"
                }`}
              >
                {avgBalance != null
                  ? avgBalance > 0
                    ? `+${formatEnergy(Math.round(avgBalance))}`
                    : formatEnergy(Math.round(avgBalance))
                  : "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function WeekRangeLabel({
  weekStart,
  weekEnd,
  weekNumber,
}: {
  weekStart: string;
  weekEnd: string;
  weekNumber?: number;
}) {
  return (
    <p className="text-sm text-[rgb(var(--app-text-muted))]">
      {weekNumber != null && (
        <span className="font-medium text-[rgb(var(--app-text))]">Неделя {weekNumber} · </span>
      )}
      {formatDateRu(weekStart)} — {formatDateRu(weekEnd)}
    </p>
  );
}
