import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { fetchSourcePriorities, saveSourcePriorities } from "../../../api/user";
import { ErrorAlert } from "../../../components/ErrorAlert";
import { Loader } from "../../../components/Loader";
import { useToast } from "../../../components/Toast";
import { queryKeys } from "../../../hooks/queryKeys";
import { parseApiError } from "../../../utils/validation";
import {
  ALLOWED_SOURCE_TYPES,
  getSourceDisplay,
  SOURCE_PRIORITY_METRICS,
  type SourcePriorityPrefs,
} from "../../../utils/workoutSources";

function emptyPrefs(): SourcePriorityPrefs {
  return {
    hr: [],
    workout_calories: [],
    steps: [],
    weight: [],
    gps: [],
    metadata: [],
  };
}

function PriorityListEditor({
  metricKey,
  label,
  value,
  onChange,
  disabled,
}: {
  metricKey: keyof SourcePriorityPrefs;
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const addSource = (source: string) => {
    if (!source || value.includes(source)) return;
    onChange([...value, source]);
  };

  const removeAt = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const move = (index: number, dir: -1 | 1) => {
    const next = [...value];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  const available = ALLOWED_SOURCE_TYPES.filter((s) => !value.includes(s));

  return (
    <div className="rounded-xl border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface-subtle))] p-3 space-y-2">
      <p className="text-sm font-medium text-[rgb(var(--app-text))]">{label}</p>
      <ol className="space-y-1">
        {value.map((src, index) => {
          const display = getSourceDisplay(src);
          return (
            <li
              key={`${metricKey}-${src}`}
              className="flex items-center gap-2 rounded-lg bg-[rgb(var(--app-surface))] border border-[rgb(var(--app-border)/0.6)] px-2 py-1.5"
            >
              <span className="text-xs text-[rgb(var(--app-text-muted))] w-4">{index + 1}.</span>
              <span className={`text-xs px-2 py-0.5 rounded-full border ${display.colorClass}`}>
                {display.label}
              </span>
              <div className="ml-auto flex gap-1">
                <button
                  type="button"
                  className="btn-ghost text-xs px-1.5 py-0.5"
                  disabled={disabled || index === 0}
                  onClick={() => move(index, -1)}
                  aria-label="Выше"
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs px-1.5 py-0.5"
                  disabled={disabled || index === value.length - 1}
                  onClick={() => move(index, 1)}
                  aria-label="Ниже"
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs px-1.5 py-0.5 text-red-600"
                  disabled={disabled}
                  onClick={() => removeAt(index)}
                  aria-label="Удалить"
                >
                  ×
                </button>
              </div>
            </li>
          );
        })}
      </ol>
      {available.length ? (
        <select
          className="input text-sm w-full max-w-xs"
          disabled={disabled}
          defaultValue=""
          onChange={(e) => {
            addSource(e.target.value);
            e.target.value = "";
          }}
        >
          <option value="" disabled>
            Добавить источник…
          </option>
          {available.map((src) => (
            <option key={src} value={src}>
              {getSourceDisplay(src).label}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

export function SourcePrioritySettings() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [prefs, setPrefs] = useState<SourcePriorityPrefs>(emptyPrefs());
  const [formError, setFormError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.sourcePriorities,
    queryFn: fetchSourcePriorities,
  });

  useEffect(() => {
    if (data) setPrefs(data);
  }, [data]);

  const saveMut = useMutation({
    mutationFn: saveSourcePriorities,
    onSuccess: (saved) => {
      setPrefs(saved);
      void qc.invalidateQueries({ queryKey: queryKeys.sourcePriorities });
      showToast("Приоритеты источников сохранены", "success");
      setFormError(null);
    },
    onError: (err) => setFormError(parseApiError(err)),
  });

  if (isLoading && !data) {
    return <Loader label="Приоритеты источников…" />;
  }

  return (
    <div className="space-y-4">
      {formError ? <ErrorAlert message={formError} /> : null}
      <p className="text-xs text-[rgb(var(--app-text-muted))]">
        Порядок сверху вниз — от высшего приоритета к низшему. Используется при отображении
        источников HR, калорий, GPS и при блокировке Health Connect.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {SOURCE_PRIORITY_METRICS.map(({ key, label }) => (
          <PriorityListEditor
            key={key}
            metricKey={key}
            label={label}
            value={prefs[key]}
            disabled={saveMut.isPending}
            onChange={(next) => setPrefs((p) => ({ ...p, [key]: next }))}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn-primary text-sm"
        disabled={saveMut.isPending}
        onClick={() => saveMut.mutate(prefs)}
      >
        {saveMut.isPending ? "Сохранение…" : "Сохранить приоритеты"}
      </button>
    </div>
  );
}
