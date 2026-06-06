import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchWorkoutExpenditure, type WorkoutExpenditureDay } from "../../api/analytics";
import { Loader } from "../../components/Loader";
import { queryKeys } from "../../hooks/queryKeys";
import { formatDateRu } from "../../utils/format";
import { weekdayLabelsFromStart } from "../../shared/utils/weekCalendar";
import {
  effectiveWorkoutKcal,
  loadPreferChestWorkoutKcal,
  savePreferChestWorkoutKcal,
} from "./workoutExpenditure";

function WatchIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <circle cx="12" cy="12" r="7" />
      <path d="M12 9v3l2 1" />
      <path d="M9 2h6M12 2v2" />
    </svg>
  );
}

function ChestStrapIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      aria-hidden
    >
      <path d="M4.5 9.5c0-2.5 3.5-4 7.5-4s7.5 1.5 7.5 4-3.5 4-7.5 4-7.5-1.5-7.5-4z" />
      <path d="M4.5 14.5c0 2.5 3.5 4 7.5 4s7.5-1.5 7.5-4" />
      <path d="M12 5.5v13" />
    </svg>
  );
}

export function WorkoutExpenditureTable({
  weekDates,
  weekStartDay,
  selectedDate,
  formatEnergy,
  onDayWorkoutKcalChange,
}: {
  weekDates: string[];
  weekStartDay: number;
  selectedDate: string;
  formatEnergy: (kcal: number) => string;
  onDayWorkoutKcalChange?: (kcal: number) => void;
}) {
  const [preferChest, setPreferChest] = useState(() => loadPreferChestWorkoutKcal());
  const from = weekDates[0] ?? selectedDate;
  const to = weekDates[weekDates.length - 1] ?? selectedDate;

  const { data, isLoading, isError } = useQuery({
    queryKey: queryKeys.workoutExpenditure(from, to),
    queryFn: () => fetchWorkoutExpenditure(from, to),
    enabled: Boolean(from && to),
  });

  const byDate = useMemo(() => {
    const map = new Map<string, WorkoutExpenditureDay>();
    for (const row of data ?? []) {
      map.set(row.date.slice(0, 10), row);
    }
    return map;
  }, [data]);

  const weekRows = useMemo(
    () =>
      weekDates.map((d) => {
        const row = byDate.get(d) ?? {
          date: d,
          calories_watch_sum: 0,
          calories_chest_sum: 0,
          calories_hr_sum: 0,
        };
        return { ...row, effective: effectiveWorkoutKcal(row, preferChest) };
      }),
    [weekDates, byDate, preferChest],
  );

  const weekTotal = useMemo(
    () => weekRows.reduce((acc, row) => acc + row.effective, 0),
    [weekRows],
  );

  const dayRow = byDate.get(selectedDate.slice(0, 10));
  const dayEffective = dayRow ? effectiveWorkoutKcal(dayRow, preferChest) : 0;

  useEffect(() => {
    onDayWorkoutKcalChange?.(dayEffective);
  }, [dayEffective, onDayWorkoutKcalChange]);

  const weekdayLabels = weekdayLabelsFromStart(weekStartDay);

  return (
    <div className="card-panel space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">Расход по тренировкам</h3>
          <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1 leading-relaxed">
            Неделя {formatDateRu(from)} — {formatDateRu(to)}. Итог за день учитывается в блоке «Расход».
          </p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={preferChest}
            onChange={(e) => {
              const v = e.target.checked;
              setPreferChest(v);
              savePreferChestWorkoutKcal(v);
            }}
            className="rounded border-slate-300"
          />
          <ChestStrapIcon className="text-rose-500" />
          <span>Использовать пульсометр, если есть</span>
        </label>
      </div>

      {isLoading ? <Loader label="Тренировки…" /> : null}
      {isError ? (
        <p className="text-sm text-rose-600 dark:text-rose-400">Не удалось загрузить расход по тренировкам.</p>
      ) : null}

      {!isLoading && !isError ? (
        <div className="overflow-x-auto -mx-1">
          <table className="w-full text-sm border-collapse min-w-[32rem]">
            <thead>
              <tr className="text-left text-[rgb(var(--app-text-muted))] border-b border-[rgb(var(--app-border))]">
                <th className="py-2 pr-3 font-medium">День</th>
                <th className="py-2 pr-3 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <WatchIcon />
                    Часы
                  </span>
                </th>
                <th className="py-2 pr-3 font-medium">
                  <span className="inline-flex items-center gap-1">
                    <ChestStrapIcon className="text-rose-500" />
                    Пульсометр
                  </span>
                </th>
                <th className="py-2 pr-3 font-medium">Итого за день</th>
              </tr>
            </thead>
            <tbody>
              {weekRows.map((row, i) => {
                const isSelected = row.date === selectedDate.slice(0, 10);
                return (
                  <tr
                    key={row.date}
                    className={`border-b border-[rgb(var(--app-border)/0.5)] ${
                      isSelected ? "bg-[rgb(var(--app-accent)/0.08)]" : ""
                    }`}
                  >
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <span className="text-[rgb(var(--app-text-muted))] mr-1.5">{weekdayLabels[i]}</span>
                      {formatDateRu(row.date)}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.calories_watch_sum > 0 ? formatEnergy(row.calories_watch_sum) : "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums">
                      {row.calories_chest_sum > 0 ? formatEnergy(row.calories_chest_sum) : "—"}
                    </td>
                    <td className="py-2 pr-3 tabular-nums font-medium">
                      {row.effective > 0 ? formatEnergy(row.effective) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold border-t border-[rgb(var(--app-border))]">
                <td className="py-2.5 pr-3">За неделю</td>
                <td colSpan={2} className="py-2.5 pr-3 text-xs font-normal text-[rgb(var(--app-text-muted))]">
                  {preferChest ? "с приоритетом пульсометра" : "по часам"}
                </td>
                <td className="py-2.5 pr-3 tabular-nums">{formatEnergy(weekTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : null}
    </div>
  );
}
