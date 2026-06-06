import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import {
  archiveCardioTabType,
  fetchCardioTabSettings,
  restoreCardioTabType,
} from "../api/cardio";
import { ensureWorkoutPreset, fetchWorkoutTypes } from "../api/exercises";
import {
  archivePreset,
  deletePreset,
  fetchPresets,
  restorePreset,
  type WorkoutPreset,
} from "../api/presets";
import {
  PresetHistoryModal,
  type PresetHistoryTarget,
} from "../components/PresetHistoryModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { ErrorAlert } from "../components/ErrorAlert";
import { Loader } from "../components/Loader";
import { useToast } from "../components/Toast";
import { queryKeys } from "../hooks/queryKeys";
import type { CardioTypeSetting } from "../types";
import { cardioTabLabel } from "../utils/constants";
import { parseApiError } from "../utils/validation";
function sessionCountLabel(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "тренировка";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "тренировки";
  return "тренировок";
}

function StrengthPresetRow({
  preset,
  showHistory,
  onHistory,
  onArchive,
  onRestore,
  onDelete,
}: {
  preset: WorkoutPreset;
  showHistory: boolean;
  onHistory: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
}) {
  const archived = preset.is_active === 0;
  return (
    <div
      className={`card-panel flex flex-wrap items-center justify-between gap-3 ${archived ? "opacity-80 border-dashed" : ""}`}
    >
      <div className="min-w-0 flex-1">
        {showHistory ? (
          <button type="button" className="text-left hover:text-brand-700 w-full" onClick={onHistory}>
            <p className="font-medium text-slate-800">{preset.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              Силовой · {preset.workout_count} {sessionCountLabel(preset.workout_count)}
            </p>
          </button>
        ) : (
          <>
            <p className="font-medium text-slate-800">{preset.name}</p>
            <p className="text-xs text-slate-500 mt-1">
              Силовой · {preset.workout_count} {sessionCountLabel(preset.workout_count)}
            </p>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {showHistory && (
          <button type="button" className="text-sm px-3 py-1.5 rounded border" onClick={onHistory}>
            История
          </button>
        )}
        {archived ? (
          <button type="button" className="text-sm px-3 py-1.5 rounded border text-brand-700" onClick={onRestore}>
            Восстановить
          </button>
        ) : (
          <button type="button" className="text-sm px-3 py-1.5 rounded border text-amber-700" onClick={onArchive}>
            Архивировать
          </button>
        )}
        {preset.workout_count === 0 && (
          <button type="button" className="text-sm px-3 py-1.5 rounded border text-red-600" onClick={onDelete}>
            Удалить
          </button>
        )}
      </div>
    </div>
  );
}

function CardioPresetRow({
  setting,
  showHistory,
  onHistory,
  onArchive,
  onRestore,
}: {
  setting: CardioTypeSetting;
  showHistory: boolean;
  onHistory: () => void;
  onArchive: () => void;
  onRestore: () => void;
}) {
  const archived = setting.is_active === 0;
  const label = cardioTabLabel(setting.type);
  const countLine =
    setting.workout_count > 0 ? (
      <p className="text-xs text-slate-500 mt-1">
        Кардио · {setting.workout_count} {sessionCountLabel(setting.workout_count)}
      </p>
    ) : null;
  return (
    <div
      className={`card-panel flex flex-wrap items-center justify-between gap-3 ${archived ? "opacity-80 border-dashed" : ""}`}
    >
      <div className="min-w-0 flex-1">
        {showHistory ? (
          <button type="button" className="text-left hover:text-brand-700 w-full" onClick={onHistory}>
            <p className="font-medium text-slate-800">{label}</p>
            {countLine}
          </button>
        ) : (
          <>
            <p className="font-medium text-slate-800">{label}</p>
            {countLine}
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {showHistory && (
          <button type="button" className="text-sm px-3 py-1.5 rounded border" onClick={onHistory}>
            История
          </button>
        )}
        {archived ? (
          <button type="button" className="text-sm px-3 py-1.5 rounded border text-brand-700" onClick={onRestore}>
            Восстановить
          </button>
        ) : (
          <button type="button" className="text-sm px-3 py-1.5 rounded border text-amber-700" onClick={onArchive}>
            Архивировать
          </button>
        )}
      </div>
    </div>
  );
}

function PresetSection({
  title,
  emptyText,
  strengthItems,
  cardioItems,
  showHistory,
  onStrengthHistory,
  onCardioHistory,
  onStrengthArchive,
  onStrengthRestore,
  onStrengthDelete,
  onCardioArchive,
  onCardioRestore,
}: {
  title: string;
  emptyText: string;
  strengthItems: WorkoutPreset[];
  cardioItems: CardioTypeSetting[];
  showHistory: boolean;
  onStrengthHistory: (p: WorkoutPreset) => void;
  onCardioHistory: (s: CardioTypeSetting) => void;
  onStrengthArchive: (p: WorkoutPreset) => void;
  onStrengthRestore: (p: WorkoutPreset) => void;
  onStrengthDelete: (p: WorkoutPreset) => void;
  onCardioArchive: (s: CardioTypeSetting) => void;
  onCardioRestore: (s: CardioTypeSetting) => void;
}) {
  const empty = !strengthItems.length && !cardioItems.length;
  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {empty && <p className="text-sm text-slate-500">{emptyText}</p>}
      {strengthItems.map((p) => (
        <StrengthPresetRow
          key={`s-${p.id}`}
          preset={p}
          showHistory={showHistory}
          onHistory={() => onStrengthHistory(p)}
          onArchive={() => onStrengthArchive(p)}
          onRestore={() => onStrengthRestore(p)}
          onDelete={() => onStrengthDelete(p)}
        />
      ))}
      {cardioItems.map((s) => (
        <CardioPresetRow
          key={`c-${s.type}`}
          setting={s}
          showHistory={showHistory}
          onHistory={() => onCardioHistory(s)}
          onArchive={() => onCardioArchive(s)}
          onRestore={() => onCardioRestore(s)}
        />
      ))}
    </section>
  );
}

export function PresetsList({ embedded = false }: { embedded?: boolean }) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [historyTarget, setHistoryTarget] = useState<PresetHistoryTarget | null>(null);
  const [confirm, setConfirm] = useState<{
    type: "archive" | "restore" | "delete";
    preset: WorkoutPreset;
  } | null>(null);
  const [cardioConfirm, setCardioConfirm] = useState<{
    type: "archive" | "restore";
    setting: CardioTypeSetting;
  } | null>(null);

  const { data: presets, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.strengthPresets(),
    queryFn: () => fetchPresets(),
  });

  const { data: workoutTypes } = useQuery({
    queryKey: queryKeys.strengthWorkoutTypes,
    queryFn: fetchWorkoutTypes,
  });

  const {
    data: cardioSettings,
    isLoading: cardioLoading,
    isError: cardioIsError,
    error: cardioError,
  } = useQuery({
    queryKey: queryKeys.cardioTabSettings(),
    queryFn: () => fetchCardioTabSettings(),
  });

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["presets"] });
    void qc.invalidateQueries({ queryKey: queryKeys.strengthWorkoutTypes });
  }, [qc]);

  const invalidateCardio = useCallback(() => {
    void qc.invalidateQueries({ queryKey: queryKeys.cardioTabSettings() });
    void qc.invalidateQueries({ queryKey: queryKeys.cardioTypes });
  }, [qc]);

  const archiveMut = useMutation({
    mutationFn: (id: number) => archivePreset(id),
    onSuccess: () => {
      invalidate();
      showToast("Пресет архивирован", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const restoreMut = useMutation({
    mutationFn: (id: number) => restorePreset(id),
    onSuccess: () => {
      invalidate();
      showToast("Пресет восстановлен", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deletePreset(id),
    onSuccess: () => {
      invalidate();
      showToast("Пресет удалён", "success");
      setConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const cardioArchiveMut = useMutation({
    mutationFn: (type: string) => archiveCardioTabType(type),
    onSuccess: () => {
      invalidateCardio();
      showToast("Кардио-тип архивирован", "success");
      setCardioConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const cardioRestoreMut = useMutation({
    mutationFn: (type: string) => restoreCardioTabType(type),
    onSuccess: () => {
      invalidateCardio();
      showToast("Кардио-тип восстановлен", "success");
      setCardioConfirm(null);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const ensurePresetMut = useMutation({
    mutationFn: (type: string) => ensureWorkoutPreset(type, { show_on_main_panel: true }),
    onSuccess: () => {
      invalidate();
      showToast("Тип добавлен в активные пресеты", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const activeStrength = presets?.filter((p) => p.is_active === 1) ?? [];
  const archivedStrength = presets?.filter((p) => p.is_active === 0) ?? [];
  const activeCardio = cardioSettings?.filter((s) => s.is_active === 1) ?? [];
  const archivedCardio = cardioSettings?.filter((s) => s.is_active === 0) ?? [];
  const orphanStrengthTypes = useMemo(() => {
    const presetNames = new Set(presets?.map((p) => p.name) ?? []);
    return (workoutTypes ?? []).filter((name) => !presetNames.has(name));
  }, [presets, workoutTypes]);
  const confirmLoading = archiveMut.isPending || restoreMut.isPending || deleteMut.isPending;
  const cardioConfirmLoading = cardioArchiveMut.isPending || cardioRestoreMut.isPending;

  const openStrengthHistory = (preset: WorkoutPreset) => {
    setHistoryTarget({ kind: "strength", presetId: preset.id, title: preset.name });
  };

  const openCardioHistory = (setting: CardioTypeSetting) => {
    setHistoryTarget({
      kind: "cardio",
      type: setting.type,
      title: cardioTabLabel(setting.type),
    });
  };

  return (
    <div className="space-y-8">
      {!embedded && (
        <div>
          <h2 className="text-xl font-semibold text-slate-800">Настройки отображения</h2>
          <p className="text-sm text-slate-500 mt-1">
            Какие типы тренировок показывать во вкладках. Упражнения и наборы — во вкладке «Набор упражнений».
          </p>
        </div>
      )}

      {(isLoading || cardioLoading) && <Loader />}
      {isError && <ErrorAlert message={parseApiError(error)} />}
      {cardioIsError && (
        <ErrorAlert message={`Не удалось загрузить кардио-типы: ${parseApiError(cardioError)}`} />
      )}

      {presets && cardioSettings && (
        <>
          <PresetSection
            title="Активные пресеты"
            emptyText="Нет активных пресетов."
            strengthItems={activeStrength}
            cardioItems={activeCardio}
            showHistory={false}
            onStrengthHistory={openStrengthHistory}
            onCardioHistory={openCardioHistory}
            onStrengthArchive={(p) => setConfirm({ type: "archive", preset: p })}
            onStrengthRestore={(p) => setConfirm({ type: "restore", preset: p })}
            onStrengthDelete={(p) => setConfirm({ type: "delete", preset: p })}
            onCardioArchive={(s) => setCardioConfirm({ type: "archive", setting: s })}
            onCardioRestore={(s) => setCardioConfirm({ type: "restore", setting: s })}
          />

          <PresetSection
            title="Архивные пресеты"
            emptyText="Нет архивных пресетов."
            strengthItems={archivedStrength}
            cardioItems={archivedCardio}
            showHistory
            onStrengthHistory={openStrengthHistory}
            onCardioHistory={openCardioHistory}
            onStrengthArchive={(p) => setConfirm({ type: "archive", preset: p })}
            onStrengthRestore={(p) => setConfirm({ type: "restore", preset: p })}
            onStrengthDelete={(p) => setConfirm({ type: "delete", preset: p })}
            onCardioArchive={(s) => setCardioConfirm({ type: "archive", setting: s })}
            onCardioRestore={(s) => setCardioConfirm({ type: "restore", setting: s })}
          />

          {orphanStrengthTypes.length > 0 ? (
            <section className="space-y-3">
              <div>
                <h3 className="text-base font-semibold text-slate-800">Типы без пресета</h3>
                <p className="text-sm text-slate-500 mt-1">
                  Есть набор упражнений, но нет вкладки на главной панели — можно вывести или архивировать позже.
                </p>
              </div>
              <div className="space-y-2">
                {orphanStrengthTypes.map((type) => (
                  <div
                    key={type}
                    className="card-panel flex flex-wrap items-center justify-between gap-3 border-dashed"
                  >
                    <div>
                      <p className="font-medium text-slate-800">{type}</p>
                      <p className="text-xs text-slate-500 mt-1">Силовой · набор задан, пресет не создан</p>
                    </div>
                    <button
                      type="button"
                      className="text-sm px-3 py-1.5 rounded border text-brand-700"
                      disabled={ensurePresetMut.isPending}
                      onClick={() => ensurePresetMut.mutate(type)}
                    >
                      На главную панель
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}

      {historyTarget && (
        <PresetHistoryModal target={historyTarget} onClose={() => setHistoryTarget(null)} />
      )}

      {confirm && (
        <ConfirmModal
          open
          title={
            confirm.type === "archive"
              ? "Архивировать пресет?"
              : confirm.type === "restore"
                ? "Восстановить пресет?"
                : "Удалить пресет?"
          }
          message={
            confirm.type === "delete"
              ? `Удалить «${confirm.preset.name}» безвозвратно?`
              : confirm.type === "archive"
                ? `Пресет «${confirm.preset.name}» скроется из вкладок, история сохранится.`
                : `Пресет «${confirm.preset.name}» снова появится во вкладках.`
          }
          confirmLabel={
            confirm.type === "archive"
              ? "Архивировать"
              : confirm.type === "restore"
                ? "Восстановить"
                : "Удалить"
          }
          danger={confirm.type === "delete"}
          loading={confirmLoading}
          onCancel={() => setConfirm(null)}
          onConfirm={() => {
            if (confirm.type === "archive") archiveMut.mutate(confirm.preset.id);
            else if (confirm.type === "restore") restoreMut.mutate(confirm.preset.id);
            else deleteMut.mutate(confirm.preset.id);
          }}
        />
      )}

      {cardioConfirm && (
        <ConfirmModal
          open
          title={
            cardioConfirm.type === "archive" ? "Архивировать кардио-тип?" : "Восстановить кардио-тип?"
          }
          message={
            cardioConfirm.type === "archive"
              ? `«${cardioTabLabel(cardioConfirm.setting.type)}» скроется из вкладок, история останется в разделе «Архивные пресеты».`
              : `«${cardioTabLabel(cardioConfirm.setting.type)}» снова появится во вкладках.`
          }
          confirmLabel={cardioConfirm.type === "archive" ? "Архивировать" : "Восстановить"}
          loading={cardioConfirmLoading}
          onCancel={() => setCardioConfirm(null)}
          onConfirm={() => {
            if (cardioConfirm.type === "archive") cardioArchiveMut.mutate(cardioConfirm.setting.type);
            else cardioRestoreMut.mutate(cardioConfirm.setting.type);
          }}
        />
      )}
    </div>
  );
}
