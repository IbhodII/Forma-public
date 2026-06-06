import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { fetchDailyExpenditure, saveDailyBraceletCalories } from "../../api/analytics";
import {
  foodApi,
  type FoodEntry,
  type FoodEntryPayload,
  type FoodEntryUpdatePayload,
  type FoodPhase,
  type FoodProduct,
  type GoalsPayload,
  type MacroTotals,
  type MealType,
  type OpenFoodFactsPreview,
} from "../../api/food";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useUnits } from "../../hooks/useUnits";
import { formatDateRu } from "../../utils/format";
import { nutritionColumnHeaders } from "../../utils/units";
import { parseApiError } from "../../utils/validation";
import { BraceletCaloriesPanel } from "./BraceletCaloriesPanel";
import { FiberProgress } from "./FiberProgress";
import {
  FoodEntryModal,
  MEAL_ORDER,
  mealTypeLabel,
} from "./FoodEntryModal";
import { AddProductModal } from "./AddProductModal";
import { BarcodeScannerModal } from "./BarcodeScannerModal";
import { GoalsModal } from "./GoalsModal";
import "./food-diary-layout.css";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function sumEntries(items: FoodEntry[]): MacroTotals {
  const totals = { protein: 0, fat: 0, carbs: 0, calories: 0, fiber: 0 };
  for (const row of items) {
    totals.calories += row.calories;
    if (row.is_alcohol) continue;
    totals.protein += row.protein;
    totals.fat += row.fat;
    totals.carbs += row.carbs;
    totals.fiber += row.fiber ?? 0;
  }
  return {
    protein: Math.round(totals.protein * 10) / 10,
    fat: Math.round(totals.fat * 10) / 10,
    carbs: Math.round(totals.carbs * 10) / 10,
    calories: Math.round(totals.calories * 10) / 10,
    fiber: Math.round(totals.fiber * 10) / 10,
  };
}

export function DayModalContent({
  initialDate,
  phase,
  products,
  preferChest,
  onPreferChestChange,
  onSavedAndClose,
  onSaved,
  onClose,
  onEditComposite,
}: {
  initialDate: string;
  phase: FoodPhase;
  products: FoodProduct[];
  preferChest: boolean;
  onPreferChestChange: (v: boolean) => void;
  /** Явное закрытие drawer (кнопка «Сохранить» в footer) */
  onSavedAndClose: (savedDate: string) => void;
  /** Обновить неделю без закрытия drawer */
  onSaved?: (savedDate: string) => void;
  onClose: () => void;
  onEditComposite?: (product: FoodProduct) => void;
}) {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const { system, formatEnergy, formatFoodWeight } = useUnits();
  const colHeaders = nutritionColumnHeaders(system);

  const [date, setDate] = useState(initialDate);
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultMealType, setDefaultMealType] = useState<MealType | undefined>();
  const [editing, setEditing] = useState<FoodEntry | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [goalsOpen, setGoalsOpen] = useState(false);
  const [braceletKcal, setBraceletKcal] = useState<number | null>(null);
  const [clearConfirm, setClearConfirm] = useState(false);
  const [deleteEntry, setDeleteEntry] = useState<{ id: number; name: string } | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scanCreatePreview, setScanCreatePreview] = useState<OpenFoodFactsPreview | null>(
    null,
  );
  const [scanMealContext, setScanMealContext] = useState<{
    mealType: MealType;
    quantityG: number;
  } | null>(null);

  useEffect(() => {
    setDate(initialDate);
    setBraceletKcal(null);
    setEditing(null);
    setModalOpen(false);
    setDefaultMealType(undefined);
    setFormError(null);
  }, [initialDate]);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: queryKeys.foodDay(date, phase),
    queryFn: () => foodApi.getDay(date, phase),
  });

  const { data: dailyExp, isLoading: dailyExpLoading } = useQuery({
    queryKey: queryKeys.dailyExpenditure(date, phase, preferChest, braceletKcal),
    queryFn: () =>
      fetchDailyExpenditure(date, phase, {
        preferChest,
        braceletCalories: braceletKcal,
      }),
  });

  const invalidateDay = useCallback(
    (d: string) => {
      void qc.invalidateQueries({ queryKey: queryKeys.foodDay(d, phase) });
    },
    [qc, phase],
  );

  const refreshAfterSave = useCallback(
    (savedDate: string) => {
      invalidateDay(savedDate);
      onSaved?.(savedDate);
    },
    [invalidateDay, onSaved],
  );

  const finishAndClose = useCallback(
    (savedDate: string) => {
      invalidateDay(savedDate);
      onSavedAndClose(savedDate);
    },
    [invalidateDay, onSavedAndClose],
  );

  const addMut = useMutation({
    mutationFn: async (payloads: FoodEntryPayload[]) => {
      for (const p of payloads) await foodApi.addEntry(p);
    },
    onSuccess: (_, payloads) => {
      setModalOpen(false);
      setDefaultMealType(undefined);
      setFormError(null);
      showToast(
        payloads.length === 1 ? "Запись добавлена" : `Добавлено: ${payloads.length}`,
        "success",
      );
      refreshAfterSave(date);
    },
    onError: (e) => setFormError(parseApiError(e)),
  });

  const scanAddMut = useMutation({
    mutationFn: (args: { payload: FoodEntryPayload; productName: string }) =>
      foodApi.addEntry(args.payload),
    onSuccess: (_, { productName }) => {
      setScannerOpen(false);
      showToast(`«${productName}» добавлено в приём`, "success");
      refreshAfterSave(date);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const addScannedToMeal = useCallback(
    (product: FoodProduct, mealType: MealType, quantityG: number) => {
      scanAddMut.mutate({
        productName: product.name,
        payload: {
          date,
          phase,
          product_id: product.id,
          meal_type: mealType,
          quantity: quantityG,
        },
      });
    },
    [date, phase, scanAddMut],
  );

  const updateMut = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: FoodEntryUpdatePayload }) =>
      foodApi.updateEntry(id, payload),
    onSuccess: () => {
      setEditing(null);
      showToast("Обновлено", "success");
      refreshAfterSave(date);
    },
    onError: (e) => setFormError(parseApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => foodApi.deleteEntry(id),
    onSuccess: () => {
      showToast("Удалено", "success");
      refreshAfterSave(date);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const clearMut = useMutation({
    mutationFn: () => foodApi.clearDay(date, phase),
    onSuccess: (res) => {
      showToast(res.deleted > 0 ? `Удалено: ${res.deleted}` : "Записей не было", "success");
      finishAndClose(date);
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const goalsMut = useMutation({
    mutationFn: (g: GoalsPayload) => foodApi.saveGoals(date, phase, g),
    onSuccess: () => {
      invalidateDay(date);
      setGoalsOpen(false);
      showToast("Нормы сохранены", "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const saveBraceletMut = useMutation({
    mutationFn: (total: number) =>
      saveDailyBraceletCalories({ date: date.slice(0, 10), total_calories: total }),
  });

  const handleSaveAndClose = async () => {
    if (braceletKcal != null && braceletKcal > 0) {
      try {
        await saveBraceletMut.mutateAsync(braceletKcal);
      } catch (e) {
        showToast(parseApiError(e), "error");
        return;
      }
    }
    finishAndClose(date);
  };

  const totals = data?.daily_totals;
  const totalBurn = dailyExp?.total_expenditure ?? data?.expenditure.total_burn ?? null;
  const balance =
    totalBurn != null && totals
      ? Math.round((totals.calories - totalBurn) * 10) / 10
      : null;

  const handleSubmit = (
    payload: FoodEntryUpdatePayload | Omit<FoodEntryPayload, "date" | "phase">[],
  ) => {
    if (editing) {
      updateMut.mutate({ id: editing.id, payload: payload as FoodEntryUpdatePayload });
    } else {
      const items = payload as Omit<FoodEntryPayload, "date" | "phase">[];
      addMut.mutate(items.map((p) => ({ ...p, date, phase })));
    }
  };

  return (
    <div className="day-details-drawer-content flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 sm:space-y-4 pr-1 min-h-0">
        <div className="flex flex-wrap items-end gap-2 sm:gap-3 sticky top-0 bg-[rgb(var(--app-bg))] py-2 z-10 border-b border-[rgb(var(--app-border))] -mx-1 px-1">
          <label className="text-sm block flex-1 min-w-0 sm:min-w-[10rem]">
            Дата
            <input
              type="date"
              value={date}
              max={todayIso()}
              onChange={(e) => setDate(e.target.value)}
              className="input-field mt-1 w-full"
            />
          </label>
          <div className="flex flex-wrap gap-2 pb-0.5 w-full sm:w-auto">
            <button
              type="button"
              className="btn-primary text-sm py-1.5 sm:w-auto"
              disabled={products.length === 0}
              onClick={() => {
                setEditing(null);
                setDefaultMealType(undefined);
                setFormError(null);
                setModalOpen(true);
              }}
            >
              + Приём
            </button>
            <button
              type="button"
              className="btn-secondary text-sm py-1.5 sm:w-auto"
              disabled={scanAddMut.isPending}
              onClick={() => {
                setScannerOpen(true);
                setScanCreatePreview(null);
                setScanMealContext(null);
              }}
            >
              Сканер
            </button>
            <button
              type="button"
              className="btn-secondary text-sm py-1.5 sm:w-auto"
              onClick={() => setGoalsOpen(true)}
            >
              Нормы
            </button>
            <button
              type="button"
              className="btn-secondary text-sm py-1.5 text-red-600 dark:text-red-400 sm:w-auto"
              disabled={!data?.entries.length || clearMut.isPending}
              onClick={() => setClearConfirm(true)}
            >
              Очистить
            </button>
          </div>
        </div>

        {isLoading && <Loader label="Загрузка дня…" />}
        {isError && <ErrorAlert message={parseApiError(error)} />}

        {!isLoading && !isError && (
          <>
            {totals && (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-sm">
                <div className="card-metric !py-2">
                  <p className="text-xs text-[rgb(var(--app-text-muted))]">Белки</p>
                  <p className="font-semibold tabular-nums">{totals.protein} г</p>
                </div>
                <div className="card-metric !py-2">
                  <p className="text-xs text-[rgb(var(--app-text-muted))]">Жиры</p>
                  <p className="font-semibold tabular-nums">{totals.fat} г</p>
                </div>
                <div className="card-metric !py-2">
                  <p className="text-xs text-[rgb(var(--app-text-muted))]">Углеводы</p>
                  <p className="font-semibold tabular-nums">{totals.carbs} г</p>
                </div>
                <div className="card-metric !py-2">
                  <p className="text-xs text-[rgb(var(--app-text-muted))]">Калории</p>
                  <p className="font-semibold tabular-nums">{formatEnergy(totals.calories)}</p>
                </div>
                {(data?.alcohol_calories ?? 0) > 0 && (
                  <div className="card-metric !py-2">
                    <p className="text-xs text-[rgb(var(--app-text-muted))]">Алкоголь</p>
                    <p className="font-semibold tabular-nums">
                      {formatEnergy(data!.alcohol_calories!)}
                    </p>
                  </div>
                )}
              </div>
            )}
            {data?.daily_fiber_target != null || data?.daily_totals ? (
              <FiberProgress
                current={data?.current_fiber ?? data?.daily_totals?.fiber ?? 0}
                target={data?.daily_fiber_target?.recommended_grams ?? 30}
              />
            ) : null}

            <BraceletCaloriesPanel
              date={date}
              onBraceletChange={setBraceletKcal}
              onPreferChestChange={onPreferChestChange}
            />

            <div className="card-panel space-y-2 text-sm">
              <h4 className="font-medium">Расход и баланс</h4>
              {dailyExpLoading && (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">Пересчёт…</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <p className="text-[rgb(var(--app-text-muted))]">Расход</p>
                  <p className="font-semibold tabular-nums">
                    {totalBurn != null ? formatEnergy(totalBurn) : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-[rgb(var(--app-text-muted))]">Баланс</p>
                  <p
                    className={`font-semibold tabular-nums ${
                      balance == null
                        ? ""
                        : balance < 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-amber-600 dark:text-amber-400"
                    }`}
                  >
                    {balance != null
                      ? balance > 0
                        ? `+${formatEnergy(balance)}`
                        : formatEnergy(balance)
                      : "—"}
                  </p>
                </div>
              </div>
              {dailyExp?.hc_stale_warning ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  {dailyExp.hc_stale_warning}
                </p>
              ) : null}
              {dailyExp?.bracelet_source ? (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  Калории браслета:{" "}
                  {dailyExp.bracelet_source === "health_connect"
                    ? "Health Connect"
                    : dailyExp.bracelet_source}
                </p>
              ) : null}
              {dailyExp?.has_fallback && dailyExp.fallback_used_for?.length ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ {dailyExp.fallback_used_for.map((n) => `«${n}»`).join(", ")} — калории с
                  часов (нет пульсометра).
                </p>
              ) : null}
            </div>

            {MEAL_ORDER.map((meal) => {
              const items = data?.by_meal?.[meal] ?? [];
              const mealTotals = data?.by_meal_totals?.[meal] ?? sumEntries(items);
              return (
                <section
                  key={meal}
                  className="border border-[rgb(var(--app-border))] rounded-lg p-2.5 sm:p-3"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h4 className="font-medium">{mealTypeLabel(meal)}</h4>
                    <button
                      type="button"
                      className="text-xs font-medium text-[rgb(var(--app-accent))] hover:underline"
                      disabled={products.length === 0}
                      onClick={() => {
                        setEditing(null);
                        setDefaultMealType(meal);
                        setFormError(null);
                        setModalOpen(true);
                      }}
                    >
                      + добавить
                    </button>
                  </div>
                  {items.length === 0 ? (
                    <p className="text-xs text-[rgb(var(--app-text-muted))] py-1">Пока пусто</p>
                  ) : (
                  <div className="overflow-x-auto min-w-0">
                    <table className="food-day-meal-table text-sm">
                      <colgroup>
                        <col />
                        <col className="food-day-meal-table__col-qty" />
                        <col className="food-day-meal-table__col-macro" span={3} />
                        <col className="food-day-meal-table__col-macro" />
                        <col className="food-day-meal-table__col-kcal" />
                        <col className="food-day-meal-table__col-actions" />
                      </colgroup>
                      <thead>
                        <tr className="text-[rgb(var(--app-text-muted))] border-b border-[rgb(var(--app-border))]">
                          <th className="py-1 text-left">Продукт</th>
                          <th className="py-1 text-right food-day-meal-table__num">г</th>
                          <th className="py-1 text-right food-day-meal-table__num hidden sm:table-cell">
                            Б
                          </th>
                          <th className="py-1 text-right food-day-meal-table__num hidden sm:table-cell">
                            Ж
                          </th>
                          <th className="py-1 text-right food-day-meal-table__num hidden sm:table-cell">
                            У
                          </th>
                          <th className="py-1 text-right food-day-meal-table__num hidden md:table-cell">
                            Кл.
                          </th>
                          <th className="py-1 text-right food-day-meal-table__num">
                            {colHeaders.calories}
                          </th>
                          <th className="py-1 food-day-meal-table__actions sticky right-0 bg-[rgb(var(--app-bg))]" />
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-[rgb(var(--app-border))]/60"
                          >
                            <td className="py-1 food-day-meal-table__name">
                              <div className="food-day-meal-table__name-inner">
                                <span
                                  className="food-day-meal-table__name-text"
                                  title={row.product_name}
                                >
                                  {row.product_name}
                                </span>
                                {row.is_alcohol && (
                                  <span className="shrink-0 text-xs text-[rgb(var(--app-text-muted))]">
                                    (алк.)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="py-1 text-right tabular-nums text-xs food-day-meal-table__num">
                              {formatFoodWeight(row.quantity)}
                            </td>
                            <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                              {row.is_alcohol ? "—" : row.protein}
                            </td>
                            <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                              {row.is_alcohol ? "—" : row.fat}
                            </td>
                            <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                              {row.is_alcohol ? "—" : row.carbs}
                            </td>
                            <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden md:table-cell">
                              {row.is_alcohol ? "—" : (row.fiber ?? 0)}
                            </td>
                            <td className="py-1 text-right tabular-nums food-day-meal-table__num">
                              {formatEnergy(row.calories)}
                            </td>
                            <td className="py-1 text-right food-day-meal-table__actions sticky right-0 bg-[rgb(var(--app-bg))]">
                              <button
                                type="button"
                                className="text-brand-600 dark:text-brand-400 mr-2 min-w-[1.25rem] inline-flex justify-center"
                                onClick={() => {
                                  setEditing(row);
                                  setFormError(null);
                                }}
                              >
                                ✎
                              </button>
                              <button
                                type="button"
                                className="text-red-600 dark:text-red-400 inline-flex justify-center"
                                onClick={() =>
                                  setDeleteEntry({ id: row.id, name: row.product_name })
                                }
                              >
                                🗑
                              </button>
                            </td>
                          </tr>
                        ))}
                        <tr className="font-medium text-[rgb(var(--app-text-muted))]">
                          <td className="py-1 food-day-meal-table__name">Итого</td>
                          <td className="py-1" />
                          <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                            {mealTotals.protein}
                          </td>
                          <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                            {mealTotals.fat}
                          </td>
                          <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden sm:table-cell">
                            {mealTotals.carbs}
                          </td>
                          <td className="py-1 text-right tabular-nums food-day-meal-table__num hidden md:table-cell">
                            {mealTotals.fiber}
                          </td>
                          <td className="py-1 text-right tabular-nums food-day-meal-table__num">
                            {formatEnergy(mealTotals.calories)}
                          </td>
                          <td className="food-day-meal-table__actions" />
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  )}
                </section>
              );
            })}

            {data && data.entries.length === 0 && (
              <p className="text-sm text-[rgb(var(--app-text-muted))] text-center py-6">
                Нет записей. Нажмите «+ Приём».
              </p>
            )}
          </>
        )}
      </div>

      <div className="flex flex-col sm:flex-row flex-wrap gap-2 justify-end pt-3 mt-2 border-t border-[rgb(var(--app-border))] shrink-0">
        <button
          type="button"
          className="btn-secondary text-sm py-1.5 sm:w-auto"
          onClick={onClose}
        >
          Закрыть
        </button>
        <button
          type="button"
          className="btn-primary text-sm py-1.5 sm:w-auto bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-600 dark:hover:bg-emerald-500 border-emerald-700"
          disabled={saveBraceletMut.isPending}
          onClick={() => void handleSaveAndClose()}
        >
          {saveBraceletMut.isPending ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {(modalOpen || editing) && (
        <FoodEntryModal
          date={date}
          products={products}
          initial={editing}
          defaultMealType={editing ? undefined : defaultMealType}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
            setDefaultMealType(undefined);
            setFormError(null);
          }}
          onSubmit={handleSubmit}
          onEditComposite={onEditComposite}
          isPending={addMut.isPending || updateMut.isPending}
          formError={formError}
        />
      )}

      {goalsOpen && (
        <GoalsModal
          date={date}
          initial={data?.goals ?? null}
          onClose={() => setGoalsOpen(false)}
          onSubmit={(g) => goalsMut.mutate(g)}
          isPending={goalsMut.isPending}
          formError={goalsMut.isError ? parseApiError(goalsMut.error) : null}
        />
      )}

      <ConfirmModal
        open={clearConfirm}
        title="Очистить день?"
        message={`Очистить все записи за ${formatDateRu(date)}?`}
        confirmLabel="Очистить"
        danger
        loading={clearMut.isPending}
        onCancel={() => setClearConfirm(false)}
        onConfirm={() => {
          clearMut.mutate();
          setClearConfirm(false);
        }}
      />

      <ConfirmModal
        open={deleteEntry !== null}
        title="Удалить запись?"
        message={deleteEntry ? `Удалить «${deleteEntry.name}»?` : ""}
        confirmLabel="Удалить"
        danger
        loading={deleteMut.isPending}
        onCancel={() => setDeleteEntry(null)}
        onConfirm={() => {
          if (deleteEntry) {
            deleteMut.mutate(deleteEntry.id);
            setDeleteEntry(null);
          }
        }}
      />

      {scannerOpen && (
        <BarcodeScannerModal
          onClose={() => setScannerOpen(false)}
          onAddExisting={addScannedToMeal}
          onCreateNew={(preview, mealType, quantityG) => {
            setScannerOpen(false);
            setScanCreatePreview(preview);
            setScanMealContext({ mealType, quantityG });
          }}
        />
      )}

      {scanCreatePreview && scanMealContext && (
        <AddProductModal
          title="Новый продукт из штрихкода"
          initialPreview={scanCreatePreview}
          products={products}
          onClose={() => {
            setScanCreatePreview(null);
            setScanMealContext(null);
          }}
          onCreated={(product) => {
            const ctx = scanMealContext;
            setScanCreatePreview(null);
            setScanMealContext(null);
            void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
            addScannedToMeal(product, ctx.mealType, ctx.quantityG);
          }}
        />
      )}
    </div>
  );
}
