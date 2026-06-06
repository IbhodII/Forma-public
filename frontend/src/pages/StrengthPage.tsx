import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  deleteStrengthSession,
  fetchSessions,
  fetchWorkoutTypes,
} from "../api/strength";
import { fetchPolarPendingList, isPolarStrengthType, type PolarPendingListItem } from "../api/polar";
import { WorkoutFormModal } from "../components/strength/workout-modal/WorkoutFormModal";
export { WorkoutFormModal } from "../components/strength/workout-modal/WorkoutFormModal";
import { ConfirmModal } from "../components/ConfirmModal";
import { ErrorAlert } from "../components/ErrorAlert";
import { PolarAttachExistingModal } from "../components/PolarAttachExistingModal";
import { PolarStrengthEntryModal } from "../components/PolarStrengthEntryModal";
import { HeroStatsRow, PageSection } from "../components/page-shell";
import { WorkoutHistoryFeed } from "../components/strength/history/WorkoutHistoryFeed";
import { KpiCard } from "../components/ui/kpi-card";
import { Pagination } from "../components/Pagination";
import { useToast } from "../components/Toast";
import { useUnits } from "../hooks/useUnits";
import { queryKeys } from "../hooks/queryKeys";
import type { StrengthSession } from "../types";
import { PAGE_SIZE } from "../utils/constants";
import { formatDateRu } from "../utils/format";
import { parseApiError } from "../utils/validation";
import { workoutVisual } from "../utils/workoutVisuals";
import { WorkoutCategoryIcon } from "../components/fitness/WorkoutCategoryIcon";

export function StrengthSection({
  embedded = false,
  fixedWorkoutTitle,
  readOnly = false,
  activeWorkoutTypes,
  dateFrom: dateFromProp,
  dateTo: dateToProp,
  periodLabel,
  initialExpandedKey = null,
}: {
  embedded?: boolean;
  /** На странице «Тренировки»: одна вкладка = один тип */
  fixedWorkoutTitle?: string;
  /** Архивный пресет: только просмотр истории */
  readOnly?: boolean;
  activeWorkoutTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  periodLabel?: string;
  /** `date|workout_title` — раскрыть сессию при переходе из модалки пресетов */
  initialExpandedKey?: string | null;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { formatEnergy } = useUnits();
  const { data: workoutTypesApi } = useQuery({
    queryKey: queryKeys.strengthWorkoutTypes,
    queryFn: fetchWorkoutTypes,
  });
  const workoutTypes = activeWorkoutTypes?.length
    ? activeWorkoutTypes
    : workoutTypesApi?.length
      ? workoutTypesApi
      : [];

  const [offset, setOffset] = useState(0);
  const dateFrom = dateFromProp ?? "";
  const dateTo = dateToProp ?? "";
  const [expanded, setExpanded] = useState<string | null>(initialExpandedKey);
  const [showForm, setShowForm] = useState(false);
  const [editSession, setEditSession] = useState<StrengthSession | null>(null);
  const [deleteSession, setDeleteSession] = useState<StrengthSession | null>(null);
  const [polarEntryItems, setPolarEntryItems] = useState<PolarPendingListItem[] | null>(null);
  const [polarAttachItem, setPolarAttachItem] = useState<PolarPendingListItem | undefined>();
  const [polarAttachExisting, setPolarAttachExisting] = useState<PolarPendingListItem | null>(null);

  const { data: polarPending } = useQuery({
    queryKey: queryKeys.polarPendingList,
    queryFn: fetchPolarPendingList,
    staleTime: 60_000,
  });
  const strengthPolarPending = useMemo(
    () => (polarPending?.items ?? []).filter((item) => isPolarStrengthType(item.type)),
    [polarPending?.items],
  );

  const openAddWorkout = () => {
    setEditSession(null);
    setPolarAttachItem(undefined);
    if (strengthPolarPending.length > 0) {
      setPolarEntryItems(strengthPolarPending);
      return;
    }
    setShowForm(true);
  };
  useEffect(() => {
    if (initialExpandedKey) setExpanded(initialExpandedKey);
  }, [initialExpandedKey]);

  useEffect(() => {
    setOffset(0);
  }, [dateFrom, dateTo]);

  const params = {
    limit: PAGE_SIZE,
    offset,
    ...(dateFrom ? { date_from: dateFrom } : {}),
    ...(dateTo ? { date_to: dateTo } : {}),
    ...(fixedWorkoutTitle ? { workout_title: fixedWorkoutTitle } : {}),
  };
  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.strengthSessions(params),
    queryFn: () => fetchSessions(params),
  });

  const deleteMut = useMutation({
    mutationFn: ({ date, title }: { date: string; title: string }) => deleteStrengthSession(date, title),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["strength"] });
      showToast("Удалено", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const visual = fixedWorkoutTitle ? workoutVisual(fixedWorkoutTitle) : null;
  const sessionCount = data?.meta.total ?? 0;

  return (
    <PageSection
      surface={false}
      eyebrow={embedded ? "Силовые" : undefined}
      title={fixedWorkoutTitle ?? "Силовые тренировки"}
      description={
        readOnly
          ? "Архивный пресет — только просмотр истории."
          : fixedWorkoutTitle
            ? `Лента сессий «${fixedWorkoutTitle}» — раскройте карточку для подходов и пульса.`
            : "История в формате ленты: метрики, подходы и пульс без таблиц."
      }
      actions={
        !readOnly ? (
          <button
            type="button"
            onClick={openAddWorkout}
            className="btn-primary min-h-11 px-5 rounded-xl font-semibold shadow-md"
          >
            + Записать тренировку
          </button>
        ) : undefined
      }
      stats={
        data ? (
          <HeroStatsRow>
            <KpiCard label="Сессий" value={sessionCount} />
            <KpiCard
              label="Тип"
              value={
                fixedWorkoutTitle && visual ? (
                  <span className="inline-flex items-center gap-2.5 min-w-0">
                    <WorkoutCategoryIcon visual={visual} size="xs" className="ring-0" />
                    <span className="truncate text-xl font-semibold">{fixedWorkoutTitle}</span>
                  </span>
                ) : (
                  "Все"
                )
              }
              sub={fixedWorkoutTitle ? visual?.label : "Все пресеты"}
              valueClassName={fixedWorkoutTitle && visual ? "text-xl" : undefined}
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

      <WorkoutHistoryFeed
        sessions={data?.items ?? []}
        loading={isLoading}
        expandedKey={expanded}
        onToggle={(key) => setExpanded((prev) => (prev === key ? null : key))}
        onEdit={setEditSession}
        onDelete={setDeleteSession}
        readOnly={readOnly}
        showWorkoutTitle={!fixedWorkoutTitle}
        formatEnergy={formatEnergy}
      />

      {data && data.meta.total > data.meta.limit ? (
        <Pagination total={data.meta.total} limit={data.meta.limit} offset={data.meta.offset} onChange={setOffset} />
      ) : null}

      {(showForm || editSession) && !readOnly && (
        <WorkoutFormModal
          initial={
            editSession
              ? {
                  date: editSession.date,
                  workout_title: editSession.workout_title,
                  avg_hr: editSession.avg_hr,
                  calories_chest: editSession.calories_chest,
                  calories_watch: editSession.calories_watch,
                }
              : undefined
          }
          defaultWorkoutTitle={!editSession ? (fixedWorkoutTitle ?? workoutTypes[0]) : undefined}
          workoutTypes={workoutTypes}
          readOnlyPreset={readOnly}
          polarAttach={polarAttachItem}
          onPolarDone={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
          }}
          onClose={() => {
            setShowForm(false);
            setEditSession(null);
            setPolarAttachItem(undefined);
          }}
          onSaved={() => {}}
        />
      )}

      {polarEntryItems && (
        <PolarStrengthEntryModal
          items={polarEntryItems}
          onClose={() => setPolarEntryItems(null)}
          onManual={() => {
            setPolarEntryItems(null);
            setPolarAttachItem(undefined);
            setShowForm(true);
          }}
          onCreateFromPolar={(item) => {
            setPolarEntryItems(null);
            setPolarAttachItem(item);
            setShowForm(true);
          }}
          onAttach={(item) => {
            setPolarEntryItems(null);
            setPolarAttachExisting(item);
          }}
        />
      )}

      {polarAttachExisting && (
        <PolarAttachExistingModal
          item={polarAttachExisting}
          onClose={() => setPolarAttachExisting(null)}
          onDone={() => {
            void qc.invalidateQueries({ queryKey: queryKeys.polarPendingList });
            setPolarAttachExisting(null);
          }}
        />
      )}

      <ConfirmModal
        open={deleteSession !== null}
        title="Удалить тренировку?"
        message={
          deleteSession
            ? `Удалить «${deleteSession.workout_title || "тренировку"}» от ${formatDateRu(deleteSession.date)}?`
            : ""
        }
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
        onCancel={() => setDeleteSession(null)}
        onConfirm={() => {
          if (deleteSession) {
            deleteMut.mutate({ date: deleteSession.date, title: deleteSession.workout_title });
            setDeleteSession(null);
          }
        }}
      />
    </PageSection>
  );
}
