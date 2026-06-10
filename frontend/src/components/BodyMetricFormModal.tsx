import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ModalShell } from "./ui/modal";
import { fetchBodyFieldReference } from "../api/body";
import { queryKeys } from "../hooks/queryKeys";
import type { BodyMetricCreate } from "../types";
import {
  BODY_METRIC_FORM_SECTIONS,
  BODY_METRIC_STEP,
  type BodyMetricFieldKey,
  bodyFieldsFromRow,
  buildBodyMetricPayload,
  formatBodyMetricValue,
  isValidBodyMetricInput,
} from "../utils/bodyMetrics";
import { formatDateRu, localTodayIso } from "../utils/format";
import { ErrorAlert } from "./ErrorAlert";

function fmtRefValue(v: unknown): string {
  const s = formatBodyMetricValue(v);
  return s === "—" ? "" : s;
}

function fmtRefHint(
  value: unknown,
  refDate: string | undefined,
  unit?: string,
): string {
  const s = fmtRefValue(value);
  if (!s) return "";
  const withUnit = unit ? `${s} ${unit}` : s;
  if (refDate) {
    return ` (было ${withUnit} · ${formatDateRu(refDate)})`;
  }
  return ` (было ${withUnit})`;
}

function fieldPlaceholder(value: unknown, unit?: string): string {
  const s = fmtRefValue(value);
  if (!s) return "нет данных";
  return unit ? `${s} ${unit}` : s;
}

const GRID_COLS: Record<2 | 3 | 5, string> = {
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 sm:grid-cols-3",
  5: "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5",
};

export function BodyMetricFormModal({
  onClose,
  onSubmit,
  isPending,
  formError,
  initialRow,
}: {
  onClose: () => void;
  onSubmit: (body: BodyMetricCreate) => void;
  isPending: boolean;
  formError: string | null;
  /** Редактирование существующего замера */
  initialRow?: Record<string, unknown>;
}) {
  const isEdit = Boolean(initialRow?.date);
  const today = localTodayIso();
  const [date, setDate] = useState(() => String(initialRow?.date ?? today).slice(0, 10));
  const [allowReplace, setAllowReplace] = useState(true);
  const [values, setValues] = useState<Partial<Record<BodyMetricFieldKey, string>>>({});

  const { data: fieldReference } = useQuery({
    queryKey: queryKeys.bodyFieldReference,
    queryFn: fetchBodyFieldReference,
    enabled: !isEdit,
  });

  useEffect(() => {
    const next: Partial<Record<BodyMetricFieldKey, string>> = {};
    if (initialRow) {
      const source = bodyFieldsFromRow(initialRow);
      for (const section of BODY_METRIC_FORM_SECTIONS) {
        for (const f of section.fields) {
          const v = source[f.key];
          next[f.key] = v != null ? String(v) : "";
        }
      }
      setDate(String(initialRow.date).slice(0, 10));
      setAllowReplace(true);
    } else {
      for (const section of BODY_METRIC_FORM_SECTIONS) {
        for (const f of section.fields) {
          next[f.key] = "";
        }
      }
    }
    setValues(next);
  }, [initialRow]);

  const setField = (key: BodyMetricFieldKey, raw: string) => {
    setValues((prev) => ({ ...prev, [key]: raw }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed: Partial<Record<BodyMetricFieldKey, number | null>> = {};
    let hasPositive = false;
    for (const section of BODY_METRIC_FORM_SECTIONS) {
      for (const f of section.fields) {
        const raw = values[f.key]?.trim() ?? "";
        if (raw === "") {
          parsed[f.key] = null;
          continue;
        }
        if (!isValidBodyMetricInput(raw)) {
          return;
        }
        const num = Number(raw);
        if (!Number.isFinite(num)) {
          return;
        }
        parsed[f.key] = num;
        if (num > 0) hasPositive = true;
      }
    }
    if (!hasPositive) {
      onSubmit(buildBodyMetricPayload(date.slice(0, 10), allowReplace, parsed));
      return;
    }
    if (!date || date.length < 10) {
      return;
    }
    onSubmit(buildBodyMetricPayload(date.slice(0, 10), allowReplace, parsed));
  };

  const refFields = fieldReference?.fields ?? {};
  const refDates = fieldReference?.field_dates ?? {};

  return (
    <ModalShell
      open
      onClose={onClose}
      title={isEdit ? "Редактировать замер" : "Новый замер"}
      size="xl"
      zIndex={50}
      dataEntry
    >
      {!isEdit && (
        <p className="text-sm text-[rgb(var(--app-text-muted))] mb-4 -mt-1">
          Подсказки — последние известные значения по каждому полю из истории
        </p>
      )}
      {formError && <ErrorAlert message={formError} />}

      <form onSubmit={handleSubmit} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block text-sm">
              Дата
              <input
                type="date"
                value={date}
                disabled={isEdit}
                onChange={(e) => setDate(e.target.value)}
                className="input-field mt-1 disabled:opacity-60"
              />
            </label>
            <label className="flex items-end gap-2 text-sm pb-2">
              <input
                type="checkbox"
                checked={allowReplace}
                onChange={(e) => setAllowReplace(e.target.checked)}
                className="h-4 w-4 shrink-0"
              />
              Обновить, если дата уже есть
            </label>
          </div>

          {BODY_METRIC_FORM_SECTIONS.map((section) => (
            <fieldset
              key={section.title}
              className="space-y-2 border-t pt-4"
              style={{ borderColor: "rgb(var(--app-border) / 0.6)" }}
            >
              <legend className="text-sm font-semibold text-[rgb(var(--app-text))]">{section.title}</legend>
              {section.hint && (
                <p className="text-xs text-[rgb(var(--app-text-muted))] -mt-1">{section.hint}</p>
              )}
              <div className={`grid gap-3 ${GRID_COLS[section.columns]}`}>
                {section.fields.map((f) => (
                  <label key={f.key} className="block text-sm">
                    <span className="text-[rgb(var(--app-text))]">
                      {f.label}
                      {!isEdit && (
                        <span className="text-[rgb(var(--app-text-muted))] font-normal">
                          {fmtRefHint(refFields[f.key], refDates[f.key], f.unit)}
                        </span>
                      )}
                    </span>
                    <input
                      type="number"
                      step={f.step ?? BODY_METRIC_STEP}
                      min={0}
                      max={f.max}
                      value={values[f.key] ?? ""}
                      onChange={(e) => setField(f.key, e.target.value)}
                      className="input-field mt-1"
                      placeholder={isEdit ? "—" : fieldPlaceholder(refFields[f.key], f.unit)}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ))}

          <div
            className="flex flex-col sm:flex-row justify-end gap-2 pt-2 border-t"
            style={{ borderColor: "rgb(var(--app-border) / 0.6)" }}
          >
            <button type="button" onClick={onClose} className="btn-secondary sm:w-auto">
              Отмена
            </button>
            <button type="submit" disabled={isPending} className="btn-primary sm:w-auto">
              {isPending ? "Сохранение…" : isEdit ? "Сохранить изменения" : "Сохранить замер"}
            </button>
          </div>
      </form>
    </ModalShell>
  );
}
