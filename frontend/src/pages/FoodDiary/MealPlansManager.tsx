import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  foodApi,
  type FoodPhase,
  type FoodProduct,
  type MealPlanCreatePayload,
  type MealPlanDayPayload,
  type MealPlanDetail,
  type MealPlanSummary,
  type MealType,
} from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { SubTabs } from "../../components/SubTabs";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ModalShell } from "../../components/ui/modal";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useWeekStartDay } from "../../hooks/useWeekStartDay";
import { weekdayLabelsFromStart } from "../../shared/utils/weekCalendar";
import { MEAL_TYPE_OPTIONS, normalizeMealType } from "./FoodEntryModal";
import { formatDateRu, todayIso } from "../../utils/format";
import { parseApiError } from "../../utils/validation";
import { addCalendarDays, mealPlanApplyRange } from "./mealPlanApplyUtils";
import { WeeklyScheduleTab } from "./WeeklyScheduleTab";
import "./food-diary-layout.css";
import {
  MEAL_MODAL_PANEL_CLASS,
  MEAL_MODAL_SIZE_WIDE,
} from "./mealModalLayout";

const PHASE_TABS = [
  { id: "cut", label: "Сушка" },
  { id: "bulk", label: "Набор" },
] as const;

const SECTION_TABS = [
  { id: "plans", label: "Рационы" },
  { id: "schedule", label: "Расписание" },
] as const;

const PHASE_LABEL: Record<FoodPhase, string> = {
  cut: "Сушка",
  bulk: "Набор",
};

function planTypeLabel(plan: MealPlanSummary): string {
  if (plan.uses_templates) return "Шаблоны";
  if (plan.is_weekly) return "Неделя";
  return "День";
}

function isTemplateBasedPlan(detail: MealPlanDetail): boolean {
  if (detail.uses_templates) return true;
  return (
    (detail.templates?.length ?? 0) > 0 &&
    !(detail.days ?? []).some((d) => (d.meals?.length ?? 0) > 0)
  );
}

type ItemDraft = {
  key: string;
  productId: number;
  productName: string;
  quantity: string;
};

type MealDraft = {
  key: string;
  mealType: MealType;
  items: ItemDraft[];
  /** Для стандартных рационов — id шаблона приёма пищи */
  templateId?: number;
};

type DayDraft = {
  dayOffset: number;
  meals: MealDraft[];
};

type EditorState = {
  name: string;
  phase: FoodPhase;
  description: string;
  isWeekly: boolean;
  activeDay: number;
  days: DayDraft[];
};

function newItem(product?: FoodProduct): ItemDraft {
  return {
    key: `i-${Date.now()}-${Math.random()}`,
    productId: product?.id ?? 0,
    productName: product?.name ?? "",
    quantity: "100",
  };
}

function newMeal(mealType: MealType = "breakfast1"): MealDraft {
  return {
    key: `m-${Date.now()}-${Math.random()}`,
    mealType,
    items: [],
  };
}

function emptyDays(isWeekly: boolean): DayDraft[] {
  const count = isWeekly ? 7 : 1;
  return Array.from({ length: count }, (_, i) => ({
    dayOffset: i,
    meals: i === 0 ? [newMeal()] : [],
  }));
}

function emptyEditor(phase: FoodPhase): EditorState {
  return {
    name: "",
    phase,
    description: "",
    isWeekly: false,
    activeDay: 0,
    days: emptyDays(false),
  };
}

function editorFromDetail(detail: MealPlanDetail): EditorState {
  const isWeekly = Boolean(detail.is_weekly);
  const dayCount = isWeekly ? 7 : 1;
  const days: DayDraft[] = [];
  for (let i = 0; i < dayCount; i++) {
    const src = detail.days.find((x) => x.day_offset === i);
    days.push({
      dayOffset: i,
      meals:
        src?.meals.map((m, mi) => ({
          key: `m-${i}-${mi}`,
          mealType: normalizeMealType(m.meal_type),
          items: m.items.map((it, ii) => ({
            key: `i-${i}-${mi}-${ii}`,
            productId: it.product_id,
            productName: it.product_name,
            quantity: String(it.quantity),
          })),
        })) ?? (i === 0 ? [newMeal()] : []),
    });
  }
  return {
    name: detail.name,
    phase: detail.phase,
    description: detail.description ?? "",
    isWeekly,
    activeDay: 0,
    days,
  };
}

function daysToPayload(days: DayDraft[]): MealPlanDayPayload[] {
  return days
    .map((d) => ({
      day_offset: d.dayOffset,
      meals: d.meals
        .map((m) => ({
          meal_type: m.mealType,
          items: m.items
            .filter((it) => it.productId > 0)
            .map((it) => {
              const q = parseFloat(it.quantity.replace(",", "."));
              return { product_id: it.productId, quantity: q };
            })
            .filter((it) => Number.isFinite(it.quantity) && it.quantity > 0),
        }))
        .filter((m) => m.items.length > 0),
    }))
    .filter((d) => d.meals.length > 0);
}

function ProductLine({
  item,
  products,
  onChange,
  onRemove,
}: {
  item: ItemDraft;
  products: FoodProduct[];
  onChange: (next: ItemDraft) => void;
  onRemove: () => void;
}) {
  const [search, setSearch] = useState(item.productName);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, search]);

  return (
    <div className="meal-plan-product-line">
      <label className="text-xs min-w-0">
        Продукт
        <input
          className="input-field mt-1 w-full text-sm"
          value={search}
          onChange={(e) => {
            const v = e.target.value;
            setSearch(v);
            const exact = products.find(
              (p) => p.name.toLowerCase() === v.trim().toLowerCase(),
            );
            if (exact) {
              onChange({ ...item, productId: exact.id, productName: exact.name });
            }
          }}
          onBlur={() => {
            const exact = products.find(
              (p) => p.name.toLowerCase() === search.trim().toLowerCase(),
            );
            if (exact) {
              onChange({ ...item, productId: exact.id, productName: exact.name });
              setSearch(exact.name);
            }
          }}
          list={`products-${item.key}`}
        />
        <datalist id={`products-${item.key}`}>
          {filtered.map((p) => (
            <option key={p.id} value={p.name} />
          ))}
        </datalist>
      </label>
      <label className="text-xs">
        г
        <input
          type="number"
          min={1}
          step={1}
          className="input-field mt-1 w-full text-sm"
          value={item.quantity}
          onChange={(e) => onChange({ ...item, quantity: e.target.value })}
        />
      </label>
      <button
        type="button"
        className="text-xs text-red-600 min-h-[44px] sm:min-h-0 self-end"
        onClick={onRemove}
      >
        Удалить
      </button>
    </div>
  );
}

function MealPlanEditorModal({
  editor,
  editingId,
  isTemplateEdit,
  products,
  formError,
  saving,
  weekdayLabels,
  onChange,
  onSave,
  onClose,
}: {
  editor: EditorState;
  editingId: number | null;
  isTemplateEdit: boolean;
  products: FoodProduct[];
  formError: string | null;
  saving: boolean;
  weekdayLabels: string[];
  onChange: (next: EditorState) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const activeDay = editor.days.find((d) => d.dayOffset === editor.activeDay) ?? editor.days[0];

  const setActiveDay = (patch: Partial<DayDraft>) => {
    onChange({
      ...editor,
      days: editor.days.map((d) =>
        d.dayOffset === editor.activeDay ? { ...d, ...patch } : d,
      ),
    });
  };

  const copyFromDay = (fromOffset: number) => {
    const src = editor.days.find((d) => d.dayOffset === fromOffset);
    if (!src) return;
    const cloned: MealDraft[] = src.meals.map((m, i) => ({
      key: `m-copy-${Date.now()}-${i}`,
      mealType: m.mealType,
      items: m.items.map((it, j) => ({
        ...it,
        key: `i-copy-${Date.now()}-${j}`,
      })),
    }));
    setActiveDay({ meals: cloned });
  };

  return (
    <ModalShell
      open
      onClose={onClose}
      dataEntry
      title={
        isTemplateEdit
          ? `Редактировать «${editor.name}»`
          : editingId
            ? "Редактировать рацион"
            : "Новый рацион"
      }
      size={MEAL_MODAL_SIZE_WIDE}
      className={MEAL_MODAL_PANEL_CLASS}
      zIndex={60}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={!editor.name.trim() || saving}
            onClick={onSave}
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
        </>
      }
    >
        {formError && <ErrorAlert message={formError} />}
        {isTemplateEdit ? (
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Рацион на шаблонах: меняется состав приёмов пищи. Название и фаза не редактируются.
          </p>
        ) : (
          <label className="text-sm block">
            Название
            <input
              className="input-field mt-1 w-full"
              value={editor.name}
              onChange={(e) => onChange({ ...editor, name: e.target.value })}
            />
          </label>
        )}
        {!isTemplateEdit && (
          <>
            <div>
              <span className="text-sm">Фаза</span>
              <SubTabs
                items={[...PHASE_TABS]}
                activeId={editor.phase}
                onChange={(id) => onChange({ ...editor, phase: id as FoodPhase })}
              />
            </div>
            <label className="text-sm block">
              Описание
              <input
                className="input-field mt-1 w-full"
                value={editor.description}
                onChange={(e) => onChange({ ...editor, description: e.target.value })}
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editor.isWeekly}
                onChange={(e) => {
                  const isWeekly = e.target.checked;
                  onChange({
                    ...editor,
                    isWeekly,
                    activeDay: 0,
                    days: emptyDays(isWeekly),
                  });
                }}
              />
              Рацион на неделю (7 дней)
            </label>
          </>
        )}
        {editor.isWeekly && (
          <div className="flex flex-wrap gap-1 items-center">
            {weekdayLabels.map((label, i) => (
              <button
                key={`${label}-${i}`}
                type="button"
                className={`px-2 py-1 rounded text-xs border ${
                  editor.activeDay === i
                    ? "bg-brand-600 text-white border-brand-600"
                    : "border-slate-200 dark:border-slate-700"
                }`}
                onClick={() => onChange({ ...editor, activeDay: i })}
              >
                {label}
              </button>
            ))}
            {editor.activeDay > 0 && (
              <button
                type="button"
                className="text-xs text-brand-600 ml-2"
                onClick={() => copyFromDay(0)}
              >
                Копировать с {weekdayLabels[0]}
              </button>
            )}
          </div>
        )}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <p className="text-sm font-medium">
              Приёмы пищи
              {editor.isWeekly ? ` · ${weekdayLabels[editor.activeDay] ?? ""}` : ""}
            </p>
            {!isTemplateEdit && (
              <button
                type="button"
                className="btn-secondary text-xs py-1"
                onClick={() =>
                  setActiveDay({ meals: [...(activeDay?.meals ?? []), newMeal()] })
                }
              >
                + Добавить приём
              </button>
            )}
          </div>
          {(activeDay?.meals ?? []).map((meal) => (
            <div
              key={meal.key}
              className="border rounded-lg p-3 sm:p-4 bg-slate-50 dark:bg-slate-800/50 space-y-3"
            >
              <div className="flex flex-wrap gap-2 items-center">
                <select
                  className="input-field text-sm"
                  value={meal.mealType}
                  onChange={(e) => {
                    const mt = normalizeMealType(e.target.value);
                    setActiveDay({
                      meals: activeDay.meals.map((m) =>
                        m.key === meal.key ? { ...m, mealType: mt } : m,
                      ),
                    });
                  }}
                >
                  {MEAL_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="text-xs text-red-600"
                  onClick={() =>
                    setActiveDay({
                      meals: activeDay.meals.filter((m) => m.key !== meal.key),
                    })
                  }
                >
                  Удалить приём
                </button>
                <button
                  type="button"
                  className="text-xs text-brand-600"
                  onClick={() =>
                    setActiveDay({
                      meals: activeDay.meals.map((m) =>
                        m.key === meal.key
                          ? { ...m, items: [...m.items, newItem()] }
                          : m,
                      ),
                    })
                  }
                >
                  + Продукт
                </button>
              </div>
              {meal.items.length === 0 ? (
                <p className="text-xs text-slate-500">Добавьте продукты в приём</p>
              ) : (
                meal.items.map((item) => (
                  <ProductLine
                    key={item.key}
                    item={item}
                    products={products}
                    onChange={(next) =>
                      setActiveDay({
                        meals: activeDay.meals.map((m) =>
                          m.key === meal.key
                            ? {
                                ...m,
                                items: m.items.map((it) =>
                                  it.key === item.key ? next : it,
                                ),
                              }
                            : m,
                        ),
                      })
                    }
                    onRemove={() =>
                      setActiveDay({
                        meals: activeDay.meals.map((m) =>
                          m.key === meal.key
                            ? { ...m, items: m.items.filter((it) => it.key !== item.key) }
                            : m,
                        ),
                      })
                    }
                  />
                ))
              )}
            </div>
          ))}
        </div>
    </ModalShell>
  );
}

function MealPlanApplyModal({
  plan,
  onClose,
  onApplied,
}: {
  plan: MealPlanSummary;
  onClose: () => void;
  onApplied: () => void;
}) {
  const { showToast } = useToast();
  const isWeekly = Boolean(plan.is_weekly);
  const [startDate, setStartDate] = useState(todayIso());
  const [endDate, setEndDate] = useState(() => addCalendarDays(todayIso(), 6));
  const [overwrite, setOverwrite] = useState(false);

  const applyRange = useMemo(
    () => mealPlanApplyRange(startDate, isWeekly, isWeekly ? endDate : null),
    [startDate, endDate, isWeekly],
  );

  const previewQuery = useQuery({
    queryKey: [
      "food",
      "meal-plan-apply-preview",
      plan.id,
      applyRange.start,
      applyRange.end,
      plan.phase,
    ],
    queryFn: () =>
      foodApi.previewMealPlanApply(plan.id, {
        start_date: applyRange.start,
        end_date: applyRange.end,
        phase: plan.phase,
      }),
    placeholderData: keepPreviousData,
  });

  const preview = previewQuery.data;
  const existingTotal = preview?.total_existing_entries ?? 0;
  const displayStart = preview?.start_date ?? applyRange.start;
  const displayEnd = preview?.end_date ?? applyRange.end;
  const displayDates = preview?.dates?.length ? preview.dates : applyRange.dates;

  const applyMut = useMutation({
    mutationFn: () =>
      foodApi.applyMealPlanRange(plan.id, {
        start_date: applyRange.start,
        end_date: applyRange.end,
        phase: plan.phase,
        overwrite,
      }),
    onSuccess: (res) => {
      showToast(
        `Добавлено записей: ${res.total_added}${overwrite ? " (с заменой дня)" : ""}`,
        "success",
      );
      onApplied();
      onClose();
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  return (
    <ModalShell
      open
      onClose={onClose}
      dataEntry
      title={`Применить «${plan.name}»`}
      size="md"
      className={MEAL_MODAL_PANEL_CLASS}
      zIndex={60}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onClose}>
            Отмена
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled={applyMut.isPending}
            onClick={() => applyMut.mutate()}
          >
            {applyMut.isPending ? "Применение…" : overwrite ? "Заменить и применить" : "Добавить к дневнику"}
          </button>
        </>
      }
    >
        <div className={isWeekly ? "grid gap-3 sm:grid-cols-2" : ""}>
          <label className="text-sm block">
            {isWeekly ? "С даты (день 1 рациона)" : "Дата"}
            <input
              type="date"
              className="input-field mt-1 w-full"
              value={startDate}
              max={isWeekly ? endDate : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setStartDate(next);
                if (isWeekly) {
                  setEndDate(addCalendarDays(next, 6));
                }
              }}
            />
          </label>
          {isWeekly ? (
            <label className="text-sm block">
              По дату (включительно)
              <input
                type="date"
                className="input-field mt-1 w-full"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </label>
          ) : null}
        </div>

        <div className="rounded-lg border border-[rgb(var(--app-border)/0.45)] bg-[rgb(var(--app-surface-subtle)/0.35)] p-3 text-sm space-y-2">
          <p>
            Будет применено:{" "}
            <span className="font-medium tabular-nums">
              {formatDateRu(displayStart)} — {formatDateRu(displayEnd)}
            </span>
            {isWeekly ? (
              <span className="text-[rgb(var(--app-text-muted))]">
                {" "}
                · {displayDates.length}{" "}
                {displayDates.length === 1
                  ? "день"
                  : displayDates.length < 5
                    ? "дня"
                    : "дней"}
              </span>
            ) : null}
          </p>
          {isWeekly && displayDates.length > 0 ? (
            <ul className="text-xs text-[rgb(var(--app-text-muted))] grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1">
              {displayDates.map((iso, i) => (
                <li key={iso}>
                  {i + 1}. {formatDateRu(iso)}
                  {preview?.days.find((d) => d.date === iso)?.existing_entries
                    ? ` · ${preview!.days.find((d) => d.date === iso)!.existing_entries} зап.`
                    : ""}
                </li>
              ))}
            </ul>
          ) : null}
          {existingTotal > 0 && !overwrite ? (
            <p className="text-amber-800 dark:text-amber-200 text-xs leading-snug">
              В выбранном периоде уже есть {existingTotal} записей. Они сохранятся; из рациона
              добавятся только новые позиции (без дублей).
            </p>
          ) : null}
          {existingTotal > 0 && overwrite ? (
            <p className="text-red-700 dark:text-red-300 text-xs leading-snug">
              Будут удалены все {existingTotal} существующих записей за эти дни перед применением
              рациона.
            </p>
          ) : null}
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={overwrite}
            onChange={(e) => setOverwrite(e.target.checked)}
          />
          <span>
            Заменить существующие записи за выбранные дни
            <span className="block text-xs text-[rgb(var(--app-text-muted))] mt-0.5">
              Без галочки: ручные записи и другие приёмы сохраняются, дубликаты из рациона не
              добавляются повторно.
            </span>
          </span>
        </label>
    </ModalShell>
  );
}

async function editorFromStandardPlan(detail: MealPlanDetail): Promise<EditorState> {
  const sorted = [...detail.templates].sort((a, b) => a.sort_order - b.sort_order);
  const meals: MealDraft[] = [];
  for (const ref of sorted) {
    const tpl = await foodApi.getTemplate(ref.template_id);
    meals.push({
      key: `m-tpl-${ref.template_id}`,
      mealType: normalizeMealType(tpl.meal_type),
      templateId: ref.template_id,
      items: tpl.items.map((it, ii) => ({
        key: `i-${ref.template_id}-${ii}`,
        productId: it.product_id,
        productName: it.product_name,
        quantity: String(it.quantity),
      })),
    });
  }
  return {
    name: detail.name,
    phase: detail.phase,
    description: detail.description ?? "",
    isWeekly: false,
    activeDay: 0,
    days: [{ dayOffset: 0, meals: meals.length ? meals : [newMeal()] }],
  };
}

export function MealPlansManager() {
  const { showToast } = useToast();
  const qc = useQueryClient();
  const weekStartDay = useWeekStartDay();
  const weekdayLabels = useMemo(() => weekdayLabelsFromStart(weekStartDay), [weekStartDay]);
  const [section, setSection] = useState<(typeof SECTION_TABS)[number]["id"]>("schedule");
  const [listPhase, setListPhase] = useState<FoodPhase | "all">("all");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [applyPlan, setApplyPlan] = useState<MealPlanSummary | null>(null);
  const [deletePlan, setDeletePlan] = useState<MealPlanSummary | null>(null);
  const [editingTemplateBased, setEditingTemplateBased] = useState(false);

  const { data: plans = [], isLoading, isError, error } = useQuery({
    queryKey: queryKeys.foodMealPlansAll,
    queryFn: () => foodApi.getMealPlans(),
  });

  const { data: products = [] } = useQuery({
    queryKey: queryKeys.foodProducts(),
    queryFn: () => foodApi.getProducts(),
    enabled: editor !== null,
  });

  const filteredPlans = useMemo(() => {
    if (listPhase === "all") return plans;
    return plans.filter((p) => p.phase === listPhase);
  }, [plans, listPhase]);

  const invalidateAll = () => {
    void qc.invalidateQueries({ queryKey: queryKeys.foodMealPlansAll });
    void qc.invalidateQueries({ queryKey: queryKeys.foodWeeklySchedule });
    void qc.invalidateQueries({ queryKey: ["food", "day"] });
    void qc.invalidateQueries({ queryKey: ["food", "week"] });
  };

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!editor) throw new Error("Форма не открыта");

      if (editingTemplateBased && editingId) {
        const day = editor.days[0];
        for (const meal of day?.meals ?? []) {
          if (!meal.templateId) continue;
          const items = meal.items
            .filter((it) => it.productId > 0)
            .map((it) => {
              const q = parseFloat(it.quantity.replace(",", "."));
              return { product_id: it.productId, quantity: q };
            })
            .filter((it) => Number.isFinite(it.quantity) && it.quantity > 0);
          if (!items.length) {
            throw new Error(`Добавьте продукты в приём «${meal.mealType}»`);
          }
          await foodApi.updateTemplate(meal.templateId, { items });
        }
        return foodApi.getMealPlan(editingId);
      }

      const days = daysToPayload(editor.days);
      if (!days.length) throw new Error("Добавьте хотя бы один приём с продуктами");
      const payload: MealPlanCreatePayload = {
        name: editor.name.trim(),
        phase: editor.phase,
        description: editor.description.trim() || null,
        is_weekly: editor.isWeekly,
        days,
      };
      if (editingId) return foodApi.updateMealPlan(editingId, payload);
      return foodApi.createMealPlan(payload);
    },
    onSuccess: () => {
      invalidateAll();
      setEditor(null);
      setEditingId(null);
      setEditingTemplateBased(false);
      setFormError(null);
      showToast(
        editingId ? "Рацион обновлён" : "Рацион создан",
        "success",
      );
    },
    onError: (e) => setFormError(parseApiError(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (plan: MealPlanSummary) => foodApi.deleteMealPlan(plan.id),
    onSuccess: (res) => {
      invalidateAll();
      setDeletePlan(null);
      showToast(`«${res.name}» удалён`, "success");
    },
    onError: (e) => showToast(parseApiError(e), "error"),
  });

  const openCreate = () => {
    setEditingId(null);
    setEditingTemplateBased(false);
    setEditor(emptyEditor(listPhase === "all" ? "cut" : listPhase));
    setFormError(null);
  };

  const openEdit = async (plan: MealPlanSummary) => {
    setFormError(null);
    try {
      const detail = await foodApi.getMealPlan(plan.id);
      const templateBased = isTemplateBasedPlan(detail);
      setEditingId(plan.id);
      setEditingTemplateBased(templateBased);
      setEditor(
        templateBased ? await editorFromStandardPlan(detail) : editorFromDetail(detail),
      );
    } catch (e) {
      showToast(parseApiError(e), "error");
    }
  };

  if (isLoading) return <Loader label="Рационы…" />;
  if (isError) {
    return (
      <div className="space-y-3">
        <ErrorAlert message={parseApiError(error)} />
        <button
          type="button"
          className="btn-secondary text-sm"
          onClick={() => void qc.invalidateQueries({ queryKey: queryKeys.foodMealPlansAll })}
        >
          Повторить
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <SubTabs
        items={[...SECTION_TABS]}
        activeId={section}
        onChange={(id) => setSection(id as (typeof SECTION_TABS)[number]["id"])}
      />
      {section === "schedule" ? (
        <WeeklyScheduleTab />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <button type="button" className="btn-primary" onClick={openCreate}>
              Создать рацион
            </button>
            <SubTabs
              items={[
                { id: "all", label: "Все" },
                ...PHASE_TABS,
              ]}
              activeId={listPhase}
              onChange={(id) => setListPhase(id as FoodPhase | "all")}
            />
          </div>
          {filteredPlans.length === 0 ? (
            <p className="text-sm text-[rgb(var(--app-text-muted))]">
              Нет рационов. Создайте рацион с продуктами по приёмам пищи.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">Название</th>
                    <th className="py-2 pr-3">Фаза</th>
                    <th className="py-2 pr-3">Тип</th>
                    <th className="py-2 pr-3">Приёмов</th>
                    <th className="py-2">Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPlans.map((plan) => (
                    <tr key={plan.id} className="border-b border-slate-100 dark:border-slate-800">
                      <td className="py-2 pr-3 font-medium">{plan.name}</td>
                      <td className="py-2 pr-3">{PHASE_LABEL[plan.phase]}</td>
                      <td className="py-2 pr-3">{planTypeLabel(plan)}</td>
                      <td className="py-2 pr-3">{plan.meals_count}</td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1"
                            onClick={() => setApplyPlan(plan)}
                          >
                            Применить
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1"
                            onClick={() => void openEdit(plan)}
                          >
                            Редактировать
                          </button>
                          <button
                            type="button"
                            className="btn-secondary text-xs py-1 text-red-600"
                            onClick={() => setDeletePlan(plan)}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
      {editor && (
        <MealPlanEditorModal
          editor={editor}
          editingId={editingId}
          isTemplateEdit={editingTemplateBased}
          products={products}
          formError={formError}
          saving={saveMut.isPending}
          weekdayLabels={weekdayLabels}
          onChange={setEditor}
          onSave={() => saveMut.mutate()}
          onClose={() => {
            setEditor(null);
            setEditingId(null);
            setEditingTemplateBased(false);
            setFormError(null);
          }}
        />
      )}
      {applyPlan && (
        <MealPlanApplyModal
          plan={applyPlan}
          onClose={() => setApplyPlan(null)}
          onApplied={invalidateAll}
        />
      )}
      {deletePlan && (
        <ConfirmModal
          open={Boolean(deletePlan)}
          title="Удалить рацион?"
          message={`Удалить «${deletePlan.name}»? Привязки в расписании по дням недели будут сняты.`}
          confirmLabel="Удалить"
          danger
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deletePlan)}
          onCancel={() => setDeletePlan(null)}
        />
      )}
    </div>
  );
}
