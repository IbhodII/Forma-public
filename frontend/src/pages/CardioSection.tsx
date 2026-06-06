import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  backfillBikePower,
  createCardioWorkout,
  deleteCardioWorkout,
  fetchCardioWorkouts,
  updateCardioWorkout,
} from "../api/cardio";
import {
  attachPolarToCardio,
  isPolarPendingNotFound,
  type PolarPendingListItem,
} from "../api/polar";
import { resolvePolarAfterManualSave } from "../hooks/usePolarAutoAttach";
import { polarAttachToast } from "../utils/polarAttachFeedback";
import { CardioMetricChart } from "../components/CardioMetricChart";
import { CardioHistoryFeed } from "../components/cardio/history/CardioHistoryFeed";
import { HeroStatsRow, PageSection } from "../components/page-shell";
import { WorkoutCategoryIcon } from "../components/fitness/WorkoutCategoryIcon";
import { KpiCard } from "../components/ui/kpi-card";
import { PolarPickPendingModal } from "../components/PolarSameDateModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { ErrorAlert } from "../components/ErrorAlert";
import { FitImportButton } from "../components/FitImportButton";
import { Loader } from "../components/Loader";
import { Pagination } from "../components/Pagination";
import { useToast } from "../components/Toast";
import { ModalShell } from "../components/ui/modal";
import { fetchIntegrationSettings } from "../api/user";
import { queryKeys } from "../hooks/queryKeys";
import { useUnits } from "../hooks/useUnits";
import { useCardioAvailability, useCardioWorkouts } from "../hooks/useCardioWorkouts";
import type { CardioWorkout, CardioWorkoutCreate } from "../types";
import {
  CARDIO_BIKE,
  CARDIO_POOL,
  CARDIO_TYPES,
  PAGE_SIZE,
  cardioTabLabel,
  cardioTypeLabel,
} from "../utils/constants";
import { buildAvailabilityMap } from "../utils/cardioAvailability";
import { formatDateRu } from "../utils/format";
import { cardioVisual } from "../utils/workoutVisuals";
import { parseApiError, validateNotFuture, validateNonNegative } from "../utils/validation";
import { invalidateAfterPolarAttach } from "../utils/polarQueryInvalidation";
import { useWorkoutFormGate } from "../contexts/WorkoutFormGateContext";

export function CardioFormModal({
  initial,
  defaultType,
  activeCardioTypes,
  polarAttach,
  onPolarDone,
  onClose,
}: {
  initial?: CardioWorkout | null;
  defaultType?: string;
  activeCardioTypes?: string[];
  /** При создании из очереди Polar — предзаполнение и авто-привязка после сохранения */
  polarAttach?: PolarPendingListItem;
  onPolarDone?: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { registerWorkoutFormOpen } = useWorkoutFormGate();
  const [date, setDate] = useState(
    initial?.date ?? polarAttach?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [type, setType] = useState(
    initial?.type ?? polarAttach?.type ?? defaultType ?? activeCardioTypes?.[0] ?? CARDIO_TYPES[0],
  );
  const typeOptions = activeCardioTypes?.length ? activeCardioTypes : [...CARDIO_TYPES];
  const [distance, setDistance] = useState(
    String(initial?.distance_km ?? polarAttach?.distance_km ?? 0),
  );
  const polarDurSec = polarAttach?.duration_sec ?? 0;
  const [durMin, setDurMin] = useState(
    String(initial ? Math.floor((initial.duration_sec ?? 0) / 60) : Math.floor(polarDurSec / 60)),
  );
  const [durSec, setDurSec] = useState(
    String(initial ? (initial.duration_sec ?? 0) % 60 : polarDurSec % 60),
  );
  const [avgHr, setAvgHr] = useState(initial?.avg_hr?.toString() ?? "");
  const [kcalChest, setKcalChest] = useState(
    String(initial?.calories_chest ?? polarAttach?.calories ?? ""),
  );
  const [kcalWatch, setKcalWatch] = useState(String(initial?.calories_watch ?? ""));
  const [swolf, setSwolf] = useState(initial?.swolf?.toString() ?? "");
  const [formError, setFormError] = useState<string | null>(null);
  const [polarPick, setPolarPick] = useState<{
    workoutId: number;
    candidates: PolarPendingListItem[];
  } | null>(null);
  const isPool = type === CARDIO_POOL;

  useEffect(() => {
    registerWorkoutFormOpen(true);
    return () => registerWorkoutFormOpen(false);
  }, [registerWorkoutFormOpen]);

  const saveMut = useMutation({
    mutationFn: async (body: CardioWorkoutCreate) => {
      if (initial) {
        const updated = await updateCardioWorkout(initial.id, body);
        return { id: updated.id, date: body.date, type: body.type };
      }
      const created = await createCardioWorkout(body);
      return { id: created.id, date: body.date, type: body.type };
    },
    onSuccess: async (result) => {
      showToast(initial ? "Обновлено" : "Сохранено", "success");
      if (polarAttach && result.id > 0) {
        try {
          const attachRes = await attachPolarToCardio(result.id, polarAttach.polar_transaction_id);
          await invalidateAfterPolarAttach(qc, { kind: "cardio", workoutId: result.id });
          const toast = polarAttachToast(attachRes);
          showToast(toast.message, toast.kind);
          onPolarDone?.();
          onClose();
          return;
        } catch (e) {
          showToast(parseApiError(e), "error");
        }
      }
      if (result.id > 0) {
        try {
          const resolved = await resolvePolarAfterManualSave(
            result.date,
            result.type,
            result.id,
            "cardio",
          );
          if (resolved.action === "attached") {
            await invalidateAfterPolarAttach(qc, { kind: "cardio", workoutId: result.id });
            const toast = polarAttachToast(resolved.attachResult);
            showToast(toast.message, toast.kind);
            onClose();
            return;
          }
          if (resolved.action === "pick") {
            setPolarPick({ workoutId: result.id, candidates: resolved.candidates });
            return;
          }
        } catch (e) {
          if (!isPolarPendingNotFound(e)) {
            showToast(parseApiError(e), "error");
          }
        }
      }
      void qc.invalidateQueries({ queryKey: ["cardio"] });
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const dateErr = validateNotFuture(date);
    if (dateErr) { setFormError(dateErr); return; }
    const dist = Number(distance);
    const dm = Number(durMin);
    const ds = Number(durSec);
    if (validateNonNegative(dist, "Дистанция")) { setFormError("Дистанция не может быть отрицательной"); return; }
    setFormError(null);
    saveMut.mutate({
      date,
      type,
      distance_km: dist,
      duration_min: dm,
      duration_sec: ds,
      avg_hr: avgHr ? Number(avgHr) : null,
      calories_chest: kcalChest ? Number(kcalChest) : null,
      calories_watch: kcalWatch ? Number(kcalWatch) : null,
      ...(isPool && swolf.trim() ? { swolf: Number(swolf) } : {}),
    });
  };

  return (
    <>
      <ModalShell
        open={!polarPick}
        onClose={onClose}
        dataEntry
        title={initial ? "Редактировать" : "Добавить кардио"}
        size="md"
        zIndex={50}
      >
        {formError && <ErrorAlert message={formError} />}
        <form onSubmit={submit} className="space-y-3">
          <label className="block text-sm">Дата<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="input-field mt-1" /></label>
          <label className="block text-sm">Тип
            <select value={type} onChange={(e) => setType(e.target.value)} className="input-field mt-1" disabled={Boolean(defaultType && !initial)}>
              {typeOptions.map((t) => <option key={t} value={t}>{cardioTypeLabel(t)}</option>)}
            </select>
          </label>
          <label className="block text-sm">Дистанция, км<input type="number" step="0.01" value={distance} onChange={(e) => setDistance(e.target.value)} className="input-field mt-1" /></label>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-sm">Мин<input type="number" value={durMin} onChange={(e) => setDurMin(e.target.value)} className="input-field mt-1" /></label>
            <label className="text-sm">Сек<input type="number" value={durSec} onChange={(e) => setDurSec(e.target.value)} className="input-field mt-1" /></label>
          </div>
          <label className="block text-sm">Ср. пульс<input type="number" value={avgHr} onChange={(e) => setAvgHr(e.target.value)} className="input-field mt-1" /></label>
          {isPool && (
            <label className="block text-sm">
              SWOLF
              <input
                type="number"
                min={0}
                step={1}
                value={swolf}
                onChange={(e) => setSwolf(e.target.value)}
                placeholder="например, 42"
                className="input-field mt-1"
              />
              <span className="text-xs text-slate-500 mt-0.5 block">Сумма времени на 25 м и гребков (чем меньше, тем лучше)</span>
            </label>
          )}
          <label className="block text-sm">Ккал, пульсометр<input type="number" value={kcalChest} onChange={(e) => setKcalChest(e.target.value)} className="input-field mt-1" /></label>
          <label className="block text-sm">Ккал, часы<input type="number" value={kcalWatch} onChange={(e) => setKcalWatch(e.target.value)} className="input-field mt-1" /></label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Отмена</button>
            <button type="submit" disabled={saveMut.isPending} className="btn-primary">Сохранить</button>
          </div>
        </form>
      </ModalShell>
      {polarPick && (
        <PolarPickPendingModal
          workoutId={polarPick.workoutId}
          kind="cardio"
          candidates={polarPick.candidates}
          onClose={() => {
            setPolarPick(null);
            onClose();
          }}
          onDone={() => {
            void qc.invalidateQueries({ queryKey: ["cardio"] });
            setPolarPick(null);
            onClose();
          }}
        />
      )}
    </>
  );
}

export function CardioSection({
  fixedType,
  readOnly = false,
  activeCardioTypes,
  dateFrom: dateFromProp = "",
  dateTo: dateToProp = "",
  periodLabel,
  embedded = false,
}: {
  fixedType: string;
  readOnly?: boolean;
  activeCardioTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  periodLabel?: string;
  embedded?: boolean;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const units = useUnits();
  const dateFrom = dateFromProp;
  const dateTo = dateToProp;
  const [offset, setOffset] = useState(0);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showTrendChart, setShowTrendChart] = useState(false);
  const [modal, setModal] = useState<CardioWorkout | null | "new">(null);
  const [deleteTarget, setDeleteTarget] = useState<CardioWorkout | null>(null);

  const CHART_WORKOUT_LIMIT = 100;

  useEffect(() => {
    setOffset(0);
    setShowTrendChart(false);
  }, [dateFrom, dateTo]);

  const params = {
    limit: PAGE_SIZE,
    offset,
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    type: fixedType,
  };

  const { data, isLoading, isError, error } = useCardioWorkouts(params);

  const { data: integrationSettings } = useQuery({
    queryKey: queryKeys.integrationSettings,
    queryFn: fetchIntegrationSettings,
  });

  const ids = data?.items.map((w) => w.id) ?? [];
  const { data: availability } = useCardioAvailability(ids);
  const availabilityMap = buildAvailabilityMap(availability);

  const isBikeTab = fixedType === CARDIO_BIKE;
  const isPoolTab = fixedType === CARDIO_POOL;
  const showMetricChart = isBikeTab || isPoolTab;

  const chartQuery = useQuery({
    queryKey: queryKeys.cardioWorkouts({
      limit: CHART_WORKOUT_LIMIT,
      offset: 0,
      ...(dateFrom ? { date_from: dateFrom } : {}),
      ...(dateTo ? { date_to: dateTo } : {}),
      type: fixedType,
      scope: "metric-chart",
    }),
    queryFn: () =>
      fetchCardioWorkouts({
        limit: CHART_WORKOUT_LIMIT,
        offset: 0,
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        type: fixedType,
      }),
    enabled: showMetricChart && showTrendChart,
    staleTime: 60_000,
  });

  const deleteMut = useMutation({
    mutationFn: deleteCardioWorkout,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["cardio"] });
      showToast("Удалено", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  useEffect(() => {
    if (!isBikeTab) return;
    void backfillBikePower().then((result) => {
      if (result.estimated > 0) {
        void qc.invalidateQueries({ queryKey: ["cardio"] });
      }
    });
  }, [isBikeTab, qc]);

  const visual = cardioVisual(fixedType);
  const sessionCount = data?.meta.total ?? 0;
  const tabLabel = cardioTabLabel(fixedType);

  const heroDescription =
    readOnly
      ? "Архивная вкладка — только просмотр истории."
      : fixedType === CARDIO_BIKE
        ? "Заезды в ленте: дистанция, мощность, карта и пульс внутри карточки."
        : fixedType === CARDIO_POOL
          ? "Заплывы в ленте: темп, SWOLF и детали сессии без таблиц."
          : "Пробежки в ленте — раскройте карточку для темпа и пульса.";

  return (
    <PageSection
      surface={false}
      eyebrow={embedded ? "Кардио" : undefined}
      title={tabLabel}
      description={heroDescription}
      actions={
        !readOnly ? (
          <div className="flex flex-wrap gap-2">
            {isBikeTab ? (
              <>
                <FitImportButton fitFolderPath={integrationSettings?.fit_folder_path ?? null} />
                <Link to="/my-bike" className="btn-secondary text-sm shrink-0 rounded-xl">
                  Мой велосипед
                </Link>
              </>
            ) : null}
            <button
              type="button"
              onClick={() => setModal("new")}
              className="btn-primary min-h-11 px-5 rounded-xl font-semibold shadow-md"
            >
              + Записать
            </button>
          </div>
        ) : undefined
      }
      stats={
        data ? (
          <HeroStatsRow>
            <KpiCard label="Сессий" value={sessionCount} />
            <KpiCard
              label="Вид"
              value={
                <span className="inline-flex items-center gap-2.5 min-w-0">
                  <WorkoutCategoryIcon visual={visual} size="xs" className="ring-0" />
                  <span className="truncate text-xl font-semibold">{tabLabel}</span>
                </span>
              }
              valueClassName="text-xl"
            />
            <KpiCard
              label="Период"
              value={periodLabel ?? (dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : "Всё время")}
              sub={dateFrom && dateTo ? `${dateFrom} — ${dateTo}` : undefined}
            />
            <KpiCard label="На странице" value={data.meta.limit} sub="сессий за раз" />
          </HeroStatsRow>
        ) : undefined
      }
    >
      {isError && <ErrorAlert message={parseApiError(error)} />}

      {data && (
        <>
          <CardioHistoryFeed
            workouts={data.items}
            fixedType={fixedType}
            expandedId={expandedId}
            onToggle={(id) => setExpandedId((prev) => (prev === id ? null : id))}
            onEdit={(w) => setModal(w)}
            onDelete={(w) => setDeleteTarget(w)}
            readOnly={readOnly}
            units={units}
            availabilityMap={availabilityMap}
            loading={isLoading}
          />

          {showMetricChart && data.items.length > 0 && (
            <div className="mt-4">
              {!showTrendChart ? (
                <button
                  type="button"
                  className="btn-secondary text-sm"
                  onClick={() => setShowTrendChart(true)}
                >
                  Показать график {isBikeTab ? "скорости" : "темпа"} за период
                </button>
              ) : (
                <>
                  {chartQuery.isLoading && <Loader label="График…" />}
                  {!chartQuery.isLoading && (
                    <CardioMetricChart
                      workouts={chartQuery.data?.items ?? []}
                      kind={isBikeTab ? "bike-speed" : "pool-pace"}
                    />
                  )}
                  {chartQuery.data && chartQuery.data.meta.total > CHART_WORKOUT_LIMIT && (
                    <p className="text-xs text-slate-500 mt-2">
                      Показаны последние {CHART_WORKOUT_LIMIT} из {chartQuery.data.meta.total} тренировок за период.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <Pagination total={data.meta.total} limit={data.meta.limit} offset={data.meta.offset} onChange={setOffset} />
        </>
      )}

      {modal !== null && !readOnly && (
        <CardioFormModal
          initial={modal === "new" ? null : modal}
          defaultType={fixedType}
          activeCardioTypes={activeCardioTypes}
          onClose={() => setModal(null)}
        />
      )}

      <ConfirmModal
        open={deleteTarget !== null}
        title="Удалить тренировку?"
        message={
          deleteTarget
            ? `Удалить запись «${cardioTypeLabel(deleteTarget.type)}» от ${formatDateRu(deleteTarget.date)}?`
            : ""
        }
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
    </PageSection>
  );
}
