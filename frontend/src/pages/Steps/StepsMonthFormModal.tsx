import { useEffect, useState } from "react";
import { ModalShell } from "../../components/ui/modal";
import { ErrorAlert } from "../../components/ErrorAlert";
import type { StepsHistoryPoint } from "../../api/steps";

const MONTH_NAMES = [
  "январь",
  "февраль",
  "март",
  "апрель",
  "май",
  "июнь",
  "июль",
  "август",
  "сентябрь",
  "октябрь",
  "ноябрь",
  "декабрь",
];

export function getPreviousMonthFirstDay(ref = new Date()): string {
  const d = new Date(ref.getFullYear(), ref.getMonth() - 1, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}

export function formatStepsMonthLabel(iso: string): string {
  const [y, m] = iso.slice(0, 10).split("-");
  const mi = Number(m) - 1;
  const name = MONTH_NAMES[mi] ?? m;
  return `${name} ${y}`;
}

export function StepsMonthFormModal({
  open,
  monthDate,
  initial,
  formError,
  isPending,
  onClose,
  onSubmit,
}: {
  open: boolean;
  monthDate: string;
  initial?: StepsHistoryPoint | null;
  formError: string | null;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (payload: { date: string; steps: number; distance_km: number }) => void;
}) {
  const [steps, setSteps] = useState("");
  const [distanceKm, setDistanceKm] = useState("");

  useEffect(() => {
    if (!open) return;
    setSteps(initial?.steps != null ? String(initial.steps) : "");
    setDistanceKm(
      initial?.distance_km != null && initial.distance_km > 0
        ? String(initial.distance_km)
        : "",
    );
  }, [open, initial, monthDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const stepsN = Number(steps.replace(/\s/g, ""));
    const kmN = Number(distanceKm.replace(",", "."));
    if (!Number.isFinite(stepsN) || stepsN <= 0) return;
    if (!Number.isFinite(kmN) || kmN <= 0) return;
    onSubmit({ date: monthDate, steps: Math.round(stepsN), distance_km: kmN });
  };

  const label = formatStepsMonthLabel(monthDate);
  const isUpdate = Boolean(initial);

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      dataEntry
      title={isUpdate ? "Обновить месяц" : "Добавить за месяц"}
      description={`Итоги за ${label}: шаги и пройденная дистанция (км).`}
      size="sm"
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={isPending}>
            Отмена
          </button>
          <button type="submit" form="steps-month-form" className="btn-primary" disabled={isPending}>
            {isPending ? "Сохранение…" : "Сохранить"}
          </button>
        </>
      }
    >
      <form id="steps-month-form" onSubmit={handleSubmit} className="space-y-4">
        {formError && <ErrorAlert message={formError} />}
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="steps-month-steps">
            Шаги за месяц
          </label>
          <input
            id="steps-month-steps"
            type="number"
            min={1}
            step={1}
            required
            className="input-field w-full"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            placeholder="Например, 320000"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="steps-month-km">
            Дистанция, км
          </label>
          <input
            id="steps-month-km"
            type="number"
            min={0.01}
            step={0.01}
            required
            className="input-field w-full"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
            placeholder="Например, 245.5"
          />
          <p className="text-xs text-[rgb(var(--app-text-muted))] mt-1">
            Длина шага будет рассчитана автоматически: км × 1000 / шаги.
          </p>
        </div>
      </form>
    </ModalShell>
  );
}
