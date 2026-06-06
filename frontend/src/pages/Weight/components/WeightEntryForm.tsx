import { useEffect, useState } from "react";
import { ErrorAlert } from "../../../components/ErrorAlert";
import type { DailyWeightRow } from "../../../api/weight";
import type { BodyMetricRow } from "../../../types";
import { localTodayIso } from "../../../utils/format";
import { validateNotFuture, validatePositive } from "../../../utils/validation";

/** Полная форма: дата, вес, жир (опционально). */
export function WeightEntryForm({
  onSave,
  isPending,
  formError,
  initialRow,
  onCancelEdit,
  embedded = false,
  lookupRowForDate,
}: {
  onSave: (payload: {
    date: string;
    weight_kg: number;
    body_fat_percent: number | null;
    only_weight: boolean;
  }) => void;
  isPending: boolean;
  formError: string | null;
  initialRow?: BodyMetricRow;
  onCancelEdit?: () => void;
  embedded?: boolean;
  /** When date changes, prefill fields if a record exists (daily weight tab). */
  lookupRowForDate?: (dateIso: string) => DailyWeightRow | BodyMetricRow | undefined;
}) {
  const today = localTodayIso();
  const [date, setDate] = useState(() => String(initialRow?.date ?? today).slice(0, 10));
  const [weight, setWeight] = useState(() =>
    initialRow?.weight_kg != null ? String(initialRow.weight_kg) : "",
  );
  const [fat, setFat] = useState(() =>
    initialRow?.body_fat_percent != null ? String(initialRow.body_fat_percent) : "",
  );
  const [onlyWeight, setOnlyWeight] = useState(
    () => !initialRow?.body_fat_percent || Number(initialRow.body_fat_percent) <= 0,
  );
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (initialRow?.date) {
      setDate(String(initialRow.date).slice(0, 10));
      setWeight(initialRow.weight_kg != null ? String(initialRow.weight_kg) : "");
      setFat(
        initialRow.body_fat_percent != null && Number(initialRow.body_fat_percent) > 0
          ? String(initialRow.body_fat_percent)
          : "",
      );
      setOnlyWeight(!initialRow.body_fat_percent || Number(initialRow.body_fat_percent) <= 0);
    }
  }, [initialRow]);

  useEffect(() => {
    if (initialRow?.date || !lookupRowForDate) return;
    const row = lookupRowForDate(date.slice(0, 10));
    if (row) {
      setWeight(row.weight_kg != null ? String(row.weight_kg) : "");
      setFat(
        row.body_fat_percent != null && Number(row.body_fat_percent) > 0
          ? String(row.body_fat_percent)
          : "",
      );
      setOnlyWeight(!row.body_fat_percent || Number(row.body_fat_percent) <= 0);
    } else {
      setWeight("");
      setFat("");
      setOnlyWeight(true);
    }
  }, [date, lookupRowForDate, initialRow]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateErr = validateNotFuture(date);
    if (dateErr) {
      setLocalError(dateErr);
      return;
    }
    const w = Number(weight);
    const wErr = validatePositive(w, "Вес");
    if (wErr) {
      setLocalError(wErr);
      return;
    }
    setLocalError(null);
    onSave({
      date: date.slice(0, 10),
      weight_kg: w,
      body_fat_percent: !onlyWeight && fat.trim() !== "" ? Number(fat) : null,
      only_weight: onlyWeight,
    });
  };

  const existingForDate = lookupRowForDate?.(date.slice(0, 10));
  const isModalEdit = Boolean(initialRow?.date);
  const isEdit = isModalEdit || Boolean(existingForDate?.date);

  const formFields = (
    <form onSubmit={submit} className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 items-end">
      <label className="text-sm block">
        Дата
        <input
          type="date"
          value={date}
          disabled={isModalEdit}
          onChange={(e) => setDate(e.target.value)}
          className="input-field mt-1 disabled:opacity-60"
        />
      </label>
      <label className="text-sm block">
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
      <label className="text-sm block">
        Жир, %
        <input
          type="number"
          step="0.1"
          value={fat}
          onChange={(e) => setFat(e.target.value)}
          disabled={onlyWeight}
          className="input-field mt-1 disabled:opacity-50"
        />
      </label>
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyWeight}
            onChange={(e) => setOnlyWeight(e.target.checked)}
          />
          Только вес
        </label>
        <div className="flex gap-2">
          <button type="submit" disabled={isPending} className="btn-primary">
            {isPending ? "Сохранение…" : "Сохранить"}
          </button>
          {isEdit && onCancelEdit && (
            <button type="button" className="btn-secondary" onClick={onCancelEdit}>
              Отмена
            </button>
          )}
        </div>
      </div>
    </form>
  );

  const errorBlock = (formError || localError) && (
    <div className="mb-3">
      <ErrorAlert message={formError ?? localError ?? ""} />
    </div>
  );

  if (embedded) {
    return (
      <>
        {errorBlock}
        {formFields}
      </>
    );
  }

  return (
    <div className="card-panel">
      <h3 className="font-medium text-slate-800 dark:text-slate-100 mb-1">Ввод веса</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
        {isEdit
          ? "Запись за выбранную дату уже есть — сохранение обновит её"
          : "Быстрый ввод: дата и вес; при необходимости укажите % жира"}
      </p>
      {errorBlock}
      {formFields}
    </div>
  );
}
