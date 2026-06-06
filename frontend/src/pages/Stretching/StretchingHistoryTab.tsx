import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  createStretchingLog,
  deleteStretchingLog,
  fetchStretchingLog,
  fetchStretchingPresets,
} from "../../api/stretching";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import type { StretchingLogEntry, StretchingPreset } from "../../types";
import { formatDateRu } from "../../utils/format";
import { parseApiError } from "../../utils/validation";
import { monthRange, StretchingMonthCalendar } from "./StretchingMonthCalendar";

function DayDetailModal({
  date,
  entries,
  onClose,
  onDeleted,
}: {
  date: string;
  entries: StretchingLogEntry[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();

  const deleteMut = useMutation({
    mutationFn: deleteStretchingLog,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast("Запись удалена", "success");
      onDeleted();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const [deleteTarget, setDeleteTarget] = useState<StretchingLogEntry | null>(null);

  return (
    <>
      <ModalShell
        open
        onClose={onClose}
        title={formatDateRu(date)}
        description="Выполненные пресеты"
        size="md"
        zIndex={50}
        footer={
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        }
      >
        {entries.length === 0 ? (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">Записей нет</p>
        ) : (
          <ul className="space-y-3">
            {entries.map((e) => (
              <li
                key={e.id}
                className="rounded-lg border border-[rgb(var(--app-border))] p-3 space-y-2"
              >
                <p className="font-medium text-[rgb(var(--app-text))]">{e.preset_name}</p>
                {e.duration_minutes != null && (
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">
                    Длительность: {e.duration_minutes} мин
                  </p>
                )}
                {e.notes && (
                  <p className="text-sm text-[rgb(var(--app-text-muted))] whitespace-pre-wrap">{e.notes}</p>
                )}
                <button
                  type="button"
                  className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                  disabled={deleteMut.isPending}
                  onClick={() => setDeleteTarget(e)}
                >
                  Удалить
                </button>
              </li>
            ))}
          </ul>
        )}
      </ModalShell>
      <ConfirmModal
        open={deleteTarget !== null}
        title="Удалить запись?"
        message={deleteTarget ? `Удалить запись «${deleteTarget.preset_name}»?` : ""}
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => {
          if (deleteTarget) {
            deleteMut.mutate(deleteTarget.id);
            setDeleteTarget(null);
          }
        }}
      />
    </>
  );
}

export function AddStretchingLogModal({
  presets,
  initialPresetId,
  initialDate,
  onClose,
  onSaved,
}: {
  presets: StretchingPreset[];
  initialPresetId?: number;
  initialDate?: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(initialDate ?? today);
  const [presetId, setPresetId] = useState(String(initialPresetId ?? presets[0]?.id ?? ""));
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");

  const saveMut = useMutation({
    mutationFn: () =>
      createStretchingLog({
        date,
        preset_id: Number(presetId),
        duration_minutes: duration ? Number(duration) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["stretching"] });
      showToast("Запись сохранена", "success");
      onSaved?.();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const activePresets = presets.filter((p) => p.is_active === 1);

  return (
    <ModalShell open onClose={onClose} dataEntry title="Добавить тренировку" size="md" zIndex={50}>
      <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!presetId) {
              showToast("Выберите пресет", "error");
              return;
            }
            saveMut.mutate();
          }}
        >
          <label className="block text-sm">
            Дата
            <input
              type="date"
              className="input-field mt-1 w-full"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
          <label className="block text-sm">
            Пресет
            <select
              className="input-field mt-1 w-full"
              value={presetId}
              onChange={(e) => setPresetId(e.target.value)}
              required
            >
              <option value="">— выберите —</option>
              {activePresets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Длительность (мин), необязательно
            <input
              type="number"
              min={1}
              className="input-field mt-1 w-full"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            Примечания
            <textarea
              className="input-field mt-1 w-full min-h-[72px]"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="flex gap-2 justify-end pt-2">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Отмена
            </button>
            <button type="submit" className="btn-primary" disabled={saveMut.isPending}>
              {saveMut.isPending ? "Сохранение…" : "Сохранить"}
            </button>
          </div>
        </form>
    </ModalShell>
  );
}

export function StretchingHistoryTab({
  showAddExternal,
  onAddClose,
  addPresetId,
}: {
  showAddExternal?: boolean;
  onAddClose?: () => void;
  addPresetId?: number;
}) {
  const now = new Date();
  const weekStartDay = useWeekStartDay();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showAddInternal, setShowAddInternal] = useState(false);

  const showAdd = (showAddExternal ?? false) || showAddInternal;
  const closeAdd = () => {
    setShowAddInternal(false);
    onAddClose?.();
  };

  const range = useMemo(
    () => monthRange(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const logQuery = useQuery({
    queryKey: queryKeys.stretchingLog({ from: range.from, to: range.to }),
    queryFn: () => fetchStretchingLog({ date_from: range.from, date_to: range.to }),
  });

  const presetsQuery = useQuery({
    queryKey: queryKeys.stretchingPresets(true),
    queryFn: () => fetchStretchingPresets(true),
  });

  const entriesByDate = useMemo(() => {
    const map = new Map<string, StretchingLogEntry[]>();
    for (const entry of logQuery.data ?? []) {
      const list = map.get(entry.date) ?? [];
      list.push(entry);
      map.set(entry.date, list);
    }
    return map;
  }, [logQuery.data]);

  const datesWithWorkouts = useMemo(
    () => new Set(entriesByDate.keys()),
    [entriesByDate],
  );

  const selectedEntries = selectedDate ? entriesByDate.get(selectedDate) ?? [] : [];

  const goPrevMonth = () => {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const goNextMonth = () => {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  if (logQuery.isLoading) {
    return <Loader label="Календарь…" />;
  }

  if (logQuery.isError) {
    return <ErrorAlert message={parseApiError(logQuery.error)} />;
  }

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[hsl(var(--stretch-ink))]">Журнал практики</h2>
          <p className="text-sm text-[hsl(var(--stretch-muted))] mt-1 max-w-md">
            Отмечайте дни мягкой мобильности. Нажмите на день, чтобы увидеть сессии.
          </p>
        </div>
        <button
          type="button"
          className="rounded-full bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors"
          onClick={() => setShowAddInternal(true)}
        >
          Записать сессию
        </button>
      </div>

      <StretchingMonthCalendar
        year={viewYear}
        month={viewMonth}
        weekStartDay={weekStartDay}
        datesWithWorkouts={datesWithWorkouts}
        onPrevMonth={goPrevMonth}
        onNextMonth={goNextMonth}
        onSelectDate={setSelectedDate}
      />

      {selectedDate && (
        <DayDetailModal
          date={selectedDate}
          entries={selectedEntries}
          onClose={() => setSelectedDate(null)}
          onDeleted={() => {
            if (selectedEntries.length <= 1) setSelectedDate(null);
          }}
        />
      )}

      {showAdd && presetsQuery.data && (
        <AddStretchingLogModal
          presets={presetsQuery.data}
          initialPresetId={addPresetId}
          initialDate={selectedDate ?? undefined}
          onClose={closeAdd}
          onSaved={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
