import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Settings2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { foodApi, type FoodPhase, type MicroNutrientRow } from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { SubTabs } from "../../components/SubTabs";
import { useToast } from "../../components/Toast";
import { Button } from "../../components/ui/button";
import { DataTable } from "../../components/ui/data-table";
import { ModalShell } from "../../components/ui/modal";
import { queryKeys } from "../../hooks/queryKeys";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import { formatMicroAmount } from "../../shared/microNutrients";
import {
  formatWeekLabel,
  shiftWeekStart,
  weekStartForDate,
} from "../../shared/utils/weekCalendar";
import { parseApiError } from "../../utils/validation";
import { FOOD_PHASE_CUT, FOOD_PHASE_TABS, resolveFoodPhase } from "./foodPhases";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function MicroRowCells({ row }: { row: MicroNutrientRow }) {
  if (!row.has_data) {
    return (
      <>
        <td className="text-[rgb(var(--app-text-muted))] italic">Данные не введены</td>
        <td className="text-right tabular-nums text-[rgb(var(--app-text-muted))]">
          {formatMicroAmount(row.goal, row.unit)}
        </td>
        <td className="text-right text-[rgb(var(--app-text-muted))]">—</td>
      </>
    );
  }
  return (
    <>
      <td className="text-right tabular-nums font-medium">
        {formatMicroAmount(row.consumed, row.unit)}
      </td>
      <td className="text-right tabular-nums text-[rgb(var(--app-text-muted))]">
        {formatMicroAmount(row.goal, row.unit)}
      </td>
      <td className="text-right tabular-nums">
        {row.percent != null ? (
          <span
            className={
              row.percent >= 100
                ? "text-emerald-600 dark:text-emerald-400"
                : row.percent >= 70
                  ? "text-[rgb(var(--app-text))]"
                  : "text-amber-600 dark:text-amber-400"
            }
          >
            {row.percent}%
          </span>
        ) : (
          "—"
        )}
      </td>
    </>
  );
}

function MicroGoalsModal({
  open,
  onClose,
  initialGoals,
}: {
  open: boolean;
  onClose: () => void;
  initialGoals: Record<string, number>;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const goalsQuery = useQuery({
    queryKey: queryKeys.foodMicroGoals,
    queryFn: foodApi.getMicroGoals,
    enabled: open,
  });

  const nutrients = goalsQuery.data?.nutrients ?? [];

  useEffect(() => {
    if (!open) return;
    const src = goalsQuery.data?.goals ?? initialGoals;
    const next: Record<string, string> = {};
    for (const [k, v] of Object.entries(src)) {
      next[k] = String(v);
    }
    setDraft(next);
  }, [open, goalsQuery.data?.goals, initialGoals]);

  const saveMut = useMutation({
    mutationFn: () => {
      const goals: Record<string, number | null> = {};
      for (const n of nutrients) {
        const raw = draft[n.key]?.trim();
        if (!raw) {
          goals[n.key] = null;
          continue;
        }
        const val = parseFloat(raw.replace(",", "."));
        goals[n.key] = Number.isFinite(val) && val > 0 ? val : null;
      }
      return foodApi.saveMicroGoals({ goals });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.foodMicroGoals });
      void qc.invalidateQueries({ queryKey: ["food", "micros", "week"] });
      showToast("Нормы сохранены", "success");
      onClose();
    },
    onError: (err) => showToast(parseApiError(err), "error"),
  });

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      dataEntry
      title="Суточные нормы"
      description="Суточные значения; в таблице норма за неделю = суточная × 7."
      size="md"
      zIndex={50}
    >
      {goalsQuery.isLoading && <Loader />}
      {goalsQuery.isError && <ErrorAlert message={parseApiError(goalsQuery.error)} />}
      {!goalsQuery.isLoading && nutrients.length > 0 && (
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            saveMut.mutate();
          }}
        >
          {nutrients.map((n) => (
            <label key={n.key} className="text-sm flex items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {n.label}
                <span className="text-[rgb(var(--app-text-muted))] ml-1">({n.unit}/день)</span>
              </span>
              <input
                type="number"
                min={0}
                step="any"
                className="input-field w-28 shrink-0"
                value={draft[n.key] ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, [n.key]: e.target.value }))}
              />
            </label>
          ))}
          <div className="flex gap-2 pt-2">
            <Button type="submit" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Сохранение…" : "Сохранить"}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}

export function MicrosTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const phaseParam = searchParams.get("phase");
  const phase = resolveFoodPhase(phaseParam);
  const weekStartDay = useWeekStartDay();
  const [weekAnchor, setWeekAnchor] = useState(() => weekStartForDate(todayIso(), weekStartDay));
  const [goalsOpen, setGoalsOpen] = useState(false);

  const todayWeekStart = useMemo(
    () => weekStartForDate(todayIso(), weekStartDay),
    [weekStartDay],
  );
  const canNextWeek = weekAnchor < todayWeekStart;

  useEffect(() => {
    const valid = FOOD_PHASE_TABS.some((t) => t.id === phaseParam);
    if (!phaseParam || !valid) {
      setSearchParams({ phase: FOOD_PHASE_CUT }, { replace: true });
    }
  }, [phaseParam, setSearchParams]);

  const setPhase = (p: FoodPhase) => setSearchParams({ phase: p });

  const microsQuery = useQuery({
    queryKey: queryKeys.foodMicrosWeek(weekAnchor, phase),
    queryFn: () => foodApi.getMicrosWeek(weekAnchor, phase),
  });

  const goalsQuery = useQuery({
    queryKey: queryKeys.foodMicroGoals,
    queryFn: foodApi.getMicroGoals,
  });

  const rows = microsQuery.data?.nutrients ?? [];
  const weekLabel = microsQuery.data
    ? formatWeekLabel(microsQuery.data.week_start)
    : formatWeekLabel(weekAnchor);

  const summary = useMemo(() => {
    const withData = rows.filter((r) => r.has_data);
    const avgPct =
      withData.length > 0
        ? Math.round(
            withData.reduce((s, r) => s + (r.percent ?? 0), 0) / withData.length,
          )
        : null;
    return { tracked: withData.length, total: rows.length, avgPct };
  }, [rows]);

  return (
    <div className="space-y-4">
      <div className="card-panel p-4 space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <SubTabs
            items={[...FOOD_PHASE_TABS]}
            activeId={phase}
            onChange={(id) => setPhase(id as FoodPhase)}
          />
          <Button type="button" variant="secondary" className="shrink-0" onClick={() => setGoalsOpen(true)}>
            <Settings2 className="w-4 h-4 mr-1.5" aria-hidden />
            Нормы
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-secondary p-2"
            onClick={() => setWeekAnchor((w) => shiftWeekStart(w, -1))}
            aria-label="Предыдущая неделя"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium tabular-nums min-w-0 sm:min-w-[9rem] text-center">
            {weekLabel}
          </span>
          <button
            type="button"
            className="btn-secondary p-2"
            onClick={() => setWeekAnchor((w) => shiftWeekStart(w, 1))}
            disabled={!canNextWeek}
            aria-label="Следующая неделя"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <button
            type="button"
            className="btn-secondary text-sm sm:ml-auto sm:w-auto"
            onClick={() => setWeekAnchor(todayWeekStart)}
            disabled={weekAnchor === todayWeekStart}
          >
            Текущая неделя
          </button>
        </div>

        {!microsQuery.isLoading && microsQuery.data && (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            {microsQuery.data.has_entries ? (
              microsQuery.data.has_any_micro_data ? (
                <>
                  Дней с записями: {microsQuery.data.days_with_entries} из 7 · нутриентов с данными:{" "}
                  {summary.tracked} из {summary.total}
                  {summary.avgPct != null ? ` · средний % недельной нормы: ${summary.avgPct}` : ""}
                </>
              ) : (
                "За неделю есть записи, но в продуктах не указаны микронутриенты. Добавьте их в справочнике."
              )
            ) : (
              "Нет записей питания за эту неделю."
            )}
          </p>
        )}
      </div>

      {microsQuery.isLoading && <Loader />}
      {microsQuery.isError && <ErrorAlert message={parseApiError(microsQuery.error)} />}

      {microsQuery.data && (
        <DataTable>
          <thead>
            <tr>
              <th>Нутриент</th>
              <th className="text-right">За неделю</th>
              <th className="text-right">Норма × 7 дн.</th>
              <th className="text-right w-24">%</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="font-medium">{row.label}</td>
                <MicroRowCells row={row} />
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}

      <MicroGoalsModal
        open={goalsOpen}
        onClose={() => setGoalsOpen(false)}
        initialGoals={goalsQuery.data?.goals ?? {}}
      />
    </div>
  );
}
