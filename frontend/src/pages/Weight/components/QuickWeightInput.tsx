import { useState } from "react";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { localTodayIso } from "../../../utils/format";
import { validateNotFuture, validatePositive } from "../../../utils/validation";

export function QuickWeightInput({
  onSave,
  isPending,
}: {
  onSave: (date: string, weightKg: number) => void;
  isPending: boolean;
}) {
  const today = localTodayIso();
  const [date, setDate] = useState(today);
  const [weight, setWeight] = useState("");
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateErr = validateNotFuture(date);
    if (dateErr) {
      setError(dateErr);
      return;
    }
    const w = Number(weight);
    const wErr = validatePositive(w, "Вес");
    if (wErr) {
      setError(wErr);
      return;
    }
    setError(null);
    onSave(date, w);
    setWeight("");
  };

  return (
    <div className="card-panel border-dashed">
      <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">Быстрый ввод веса</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Только дата и вес — для ежедневных замеров</p>
      {error && (
        <div className="mb-3">
          <ErrorAlert message={error} />
        </div>
      )}
      <form onSubmit={submit} className="flex flex-wrap gap-3 items-end">
        <label className="text-sm block flex-1 min-w-[140px]">
          Дата
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input-field mt-1"
          />
        </label>
        <label className="text-sm block flex-1 min-w-[120px]">
          Вес, кг
          <input
            type="number"
            step="0.1"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="input-field mt-1"
            required
          />
        </label>
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Сохранение…" : "Добавить"}
        </button>
      </form>
    </div>
  );
}
