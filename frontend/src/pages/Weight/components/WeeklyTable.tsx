import { useMemo, useState } from "react";
import type { WeeklyAggregate } from "../../../utils/weeklyAggregation";
import { formatWeeklyNum } from "../../../utils/weeklyAggregation";
import { DataTable } from "../../../components/ui/data-table";

const PAGE_SIZE = 10;

export function WeeklyTable({
  weeks,
  onSelectWeek,
  muscleColumnLabel = "Мышцы",
  formatBodyWeight,
  formatBarbellWeight,
}: {
  weeks: WeeklyAggregate[];
  onSelectWeek: (week: WeeklyAggregate) => void;
  muscleColumnLabel?: string;
  formatBodyWeight: (kg: number) => string;
  formatBarbellWeight: (kg: number) => string;
}) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(weeks.length / PAGE_SIZE));

  const pageWeeks = useMemo(() => {
    const start = page * PAGE_SIZE;
    return weeks.slice(start, start + PAGE_SIZE);
  }, [weeks, page]);

  if (!weeks.length) {
    return <p className="text-sm text-slate-500 py-6 text-center">Нет записей за выбранный период</p>;
  }

  const rowCells = (week: WeeklyAggregate) => (
    <>
      <td className="font-medium">{week.weekLabel}</td>
      <td className="text-right tabular-nums">
        {week.avgWeight != null ? formatBodyWeight(week.avgWeight) : "—"}
      </td>
      <td className="text-right tabular-nums">
        {week.avgFat != null ? `${formatWeeklyNum(week.avgFat, 1)}%` : "—"}
      </td>
      <td className="text-right tabular-nums hidden sm:table-cell">
        {week.avgMuscle != null ? formatBarbellWeight(week.avgMuscle) : "—"}
      </td>
      <td className="text-right tabular-nums">{week.count}</td>
      <td className="text-right">
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={(e) => {
            e.stopPropagation();
            onSelectWeek(week);
          }}
        >
          Подробнее
        </button>
      </td>
    </>
  );

  return (
    <div className="space-y-4">
      <div className="hidden md:block">
        <DataTable density="compact">
          <thead>
            <tr>
              <th>Неделя</th>
              <th className="text-right">Вес</th>
              <th className="text-right">Жир, %</th>
              <th>{muscleColumnLabel}</th>
              <th className="text-right">Замеров</th>
              <th className="w-28 text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {pageWeeks.map((week) => (
              <tr
                key={week.weekStart}
                className="cursor-pointer"
                onClick={() => onSelectWeek(week)}
              >
                {rowCells(week)}
              </tr>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="md:hidden space-y-3">
        {pageWeeks.map((week) => (
          <button
            key={week.weekStart}
            type="button"
            className="w-full text-left card-panel hover:border-brand-300 transition-colors"
            onClick={() => onSelectWeek(week)}
          >
            <p className="font-semibold text-slate-800">{week.weekLabel}</p>
            <div className="grid grid-cols-2 gap-2 mt-2 text-sm text-slate-600">
              <span>
                Вес: {week.avgWeight != null ? formatBodyWeight(week.avgWeight) : "—"}
              </span>
              <span>Жир: {week.avgFat != null ? `${formatWeeklyNum(week.avgFat, 1)}%` : "—"}</span>
              <span>
                {muscleColumnLabel}:{" "}
                {week.avgMuscle != null ? formatBarbellWeight(week.avgMuscle) : "—"}
              </span>
              <span>Замеров: {week.count}</span>
            </div>
          </button>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            type="button"
            className="btn-secondary"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            Назад
          </button>
          <span className="text-slate-500">
            Стр. {page + 1} из {totalPages}
          </span>
          <button
            type="button"
            className="btn-secondary"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
          >
            Вперёд
          </button>
        </div>
      )}
    </div>
  );
}
