import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { fetchCutBulkSnapshot } from "../../api/cutBulk";
import { foodApi, type FoodPhase, type FoodProduct } from "../../api/food";
import { fetchUserProfile } from "../../api/user";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useUnits } from "../../hooks/useUnits";
import { useUserProfile } from "../../hooks/useUserProfile";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import {
  shiftWeekStart,
  weekDatesFromAnchor,
  weekStartForDate,
} from "../../shared/utils/weekCalendar";
import { parseApiError } from "../../utils/validation";
import { CompositeProductModal } from "./CompositeProductModal";
import { BodySnapshotPanel } from "./premium/BodySnapshotPanel";
import { DayDetailsDrawer } from "./premium/DayDetailsDrawer";
import { GoalProjectionSection } from "./premium/GoalProjectionSection";
import { MainWeeklyCharts } from "./premium/MainWeeklyCharts";
import { WeekCommandHeader } from "./premium/WeekCommandHeader";
import { WeeklyOverviewCarousel } from "./premium/WeeklyOverviewCarousel";
import { loadPreferChestWorkoutKcal } from "./workoutExpenditure";
import { useFoodWeekData } from "./useFoodWeekData";
import { useWeekSummary } from "./useWeekSummary";
import "./food-diary-layout.css";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function FoodDiary({ phase: phaseProp }: { phase: FoodPhase }) {
  const { showToast } = useToast();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [, setSearchParams] = useSearchParams();
  const { formatEnergy } = useUnits();
  const weekStartDay = useWeekStartDay();

  const [weekAnchor, setWeekAnchor] = useState(() =>
    weekStartForDate(todayIso(), weekStartDay),
  );
  const [dayDrawerDate, setDayDrawerDate] = useState<string | null>(null);
  const [preferChest, setPreferChest] = useState(() => loadPreferChestWorkoutKcal());
  const [editComposite, setEditComposite] = useState<FoodProduct | null>(null);
  const [compositeFormError, setCompositeFormError] = useState<string | null>(null);
  const phase = phaseProp;
  const setPhase = useCallback(
    (p: FoodPhase) => setSearchParams({ phase: p }),
    [setSearchParams],
  );

  const { data: userProfile } = useUserProfile();
  useEffect(() => {
    if (userProfile?.use_chest_strap_priority != null) {
      setPreferChest(userProfile.use_chest_strap_priority);
    }
  }, [userProfile?.use_chest_strap_priority]);

  const snapQuery = useQuery({
    queryKey: queryKeys.cutBulkSnapshot,
    queryFn: fetchCutBulkSnapshot,
    retry: false,
  });

  const profileQuery = useQuery({
    queryKey: queryKeys.userProfile,
    queryFn: fetchUserProfile,
  });

  const maxDeficitPerKgFat = profileQuery.data?.max_deficit_per_kg_fat ?? 35;
  const fatKg = useMemo(() => {
    const w = snapQuery.data?.weight_kg;
    const bf = snapQuery.data?.body_fat_percent;
    if (w == null || bf == null) return null;
    return (w * bf) / 100;
  }, [snapQuery.data]);

  const { data: products = [], isError: productsError, error: productsErr, refetch: refetchProducts } =
    useQuery({
      queryKey: queryKeys.foodProducts(),
      queryFn: () => foodApi.getProducts(),
      retry: 1,
    });

  const { week, cells, isLoading, isError, error, refetch } = useFoodWeekData(
    weekAnchor,
    phase,
    weekStartDay,
    preferChest,
  );

  const summary = useWeekSummary(cells, week);

  const canGoNextWeek = weekAnchor < weekStartForDate(todayIso(), weekStartDay);

  const invalidateWeekForDate = useCallback(
    (changedDate: string) => {
      const changedAnchor = weekStartForDate(changedDate, weekStartDay);
      void qc.invalidateQueries({ queryKey: queryKeys.foodDay(changedDate, phase) });
      void qc.invalidateQueries({ queryKey: queryKeys.foodWeek(changedAnchor, phase) });
      void qc.invalidateQueries({
        queryKey: queryKeys.weekDailyExpenditure(changedAnchor, phase, preferChest),
      });
      void qc.invalidateQueries({ queryKey: ["nutrition", "deficit-control"] });
      void qc.invalidateQueries({ queryKey: ["nutrition", "gain-control"] });
      void qc.invalidateQueries({ queryKey: queryKeys.forecastReadiness(phase) });
      void qc.invalidateQueries({ queryKey: ["nutrition", "forecast"] });
      if (changedAnchor === weekAnchor) void refetch();
    },
    [qc, weekAnchor, phase, preferChest, weekStartDay, refetch],
  );

  const updateCompositeMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Parameters<typeof foodApi.updateCompositeProduct>[1];
    }) => foodApi.updateCompositeProduct(id, body),
    onSuccess: (_, { id }) => {
      void refetchProducts();
      void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
      void qc.invalidateQueries({ queryKey: queryKeys.foodProduct(id, true) });
      setEditComposite(null);
      showToast("Блюдо обновлено", "success");
    },
    onError: (e) => setCompositeFormError(parseApiError(e)),
  });

  return (
    <div className="food-diary-page relative min-h-[50vh] pb-4 sm:pb-8">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden hidden sm:block">
        <div className="absolute -top-40 right-0 h-[28rem] w-[28rem] rounded-full bg-emerald-400/10 blur-3xl" />
        <div className="absolute top-1/2 -left-32 h-96 w-96 rounded-full bg-violet-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-80 w-80 rounded-full bg-sky-500/10 blur-3xl" />
      </div>

      <WeekCommandHeader
        weekNumber={week?.week_number}
        weekStart={week?.week_start ?? weekAnchor}
        weekEnd={week?.week_end ?? weekDatesFromAnchor(weekAnchor, weekStartDay)[6]}
        phase={phase}
        onPhaseChange={setPhase}
        onPrevWeek={() => setWeekAnchor((w) => shiftWeekStart(w, -1))}
        onNextWeek={() => {
          setWeekAnchor((w) => {
            const next = shiftWeekStart(w, 1);
            return next <= weekStartForDate(todayIso(), weekStartDay) ? next : w;
          });
        }}
        canNextWeek={canGoNextWeek}
        summary={summary}
        onAddMeal={() => setDayDrawerDate(todayIso())}
        canAdd={products.length > 0}
        formatEnergy={formatEnergy}
      />

      <BodySnapshotPanel
        className="mt-2 sm:mt-3"
        phase={phase}
        snap={snapQuery.data ?? null}
        goalLabel={week?.body_summary?.goal_label}
      />

      <div className="mt-3 sm:mt-4 food-diary-layout__grid">
        {productsError && (
          <ErrorAlert message={`Справочник: ${parseApiError(productsErr)}`} />
        )}
        {isLoading && <Loader label="Загрузка недели…" />}
        {isError && <ErrorAlert message={parseApiError(error)} />}

        {!isLoading && !isError && cells.length > 0 && (
          <div className="food-diary-layout__stack">
            <WeeklyOverviewCarousel
              cells={cells}
              phase={phase}
              maxDeficitPerKgFat={maxDeficitPerKgFat}
              fatKg={fatKg}
              selectedDate={dayDrawerDate}
              onSelectDay={setDayDrawerDate}
              formatEnergy={formatEnergy}
            />

            <div className="food-diary-layout__body">
              <div className="food-diary-layout__charts-row">
                <MainWeeklyCharts cells={cells} formatEnergy={formatEnergy} />
              </div>

              <div className="food-diary-layout__goals">
                <GoalProjectionSection
                  phase={phase}
                  preferChest={preferChest}
                  snap={snapQuery.data ?? null}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {dayDrawerDate && (
        <DayDetailsDrawer
          date={dayDrawerDate}
          phase={phase}
          products={products}
          preferChest={preferChest}
          onPreferChestChange={setPreferChest}
          onClose={() => setDayDrawerDate(null)}
          onSaved={invalidateWeekForDate}
          onEditComposite={setEditComposite}
        />
      )}

      {editComposite && (
        <CompositeProductModal
          products={products}
          existingProduct={editComposite}
          onClose={() => setEditComposite(null)}
          onOpenAddProduct={() => navigate("/food/products")}
          onSubmit={(body, editProductId) => {
            if (editProductId != null) {
              updateCompositeMut.mutate({ id: editProductId, body });
            }
          }}
          isPending={updateCompositeMut.isPending}
          formError={compositeFormError}
        />
      )}

    </div>
  );
}
