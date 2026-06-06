import { useEffect, useMemo, useState } from "react";
import {
  previewMacros,
  type FoodEntry,
  type FoodEntryPayload,
  type FoodEntryUpdatePayload,
  type FoodProduct,
  type MealType,
} from "../../api/food";
import { ConfirmModal } from "../../components/ConfirmModal";
import { ErrorAlert } from "../../components/ErrorAlert";
import { useConfirmClose } from "../../hooks/useConfirmClose";
import { useUnits } from "../../hooks/useUnits";
import { ModalShell } from "../../components/ui/modal";
import { EditCompositeButton } from "./EditCompositeButton";

export const MEAL_TYPE_OPTIONS: { value: MealType; label: string }[] = [
  { value: "breakfast1", label: "Завтрак 1" },
  { value: "breakfast2", label: "Завтрак 2" },
  { value: "lunch", label: "Обед" },
  { value: "dinner", label: "Ужин" },
  { value: "snack", label: "Перекус" },
];

const MEAL_TYPE_LABELS: Record<string, string> = {
  breakfast1: "Завтрак 1",
  breakfast2: "Завтрак 2",
  breakfast: "Завтрак 1",
  lunch: "Обед",
  dinner: "Ужин",
  snack: "Перекус",
};

export function normalizeMealType(type: string): MealType {
  const t = type.trim().toLowerCase();
  if (t === "breakfast") return "breakfast1";
  if (
    t === "breakfast1" ||
    t === "breakfast2" ||
    t === "lunch" ||
    t === "dinner" ||
    t === "snack"
  ) {
    return t;
  }
  return "breakfast1";
}

export function mealTypeLabel(type: string): string {
  return MEAL_TYPE_LABELS[type.trim().toLowerCase()] ?? type;
}

export const MEAL_ORDER: MealType[] = [
  "breakfast1",
  "breakfast2",
  "lunch",
  "dinner",
  "snack",
];

type EntryLine = {
  key: string;
  productId: number;
  productName: string;
  quantity: string;
  isComposite: boolean;
  isAlcohol: boolean;
};

type CreateEntryItem = Omit<FoodEntryPayload, "date" | "phase">;

function parseQty(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function newLine(p: FoodProduct): EntryLine {
  const defaultQty = p.default_portion_g != null && p.default_portion_g > 0 ? p.default_portion_g : 100;
  return {
    key: `${p.id}-${Date.now()}-${Math.random()}`,
    productId: p.id,
    productName: p.name,
    quantity: String(defaultQty),
    isComposite: p.is_composite,
    isAlcohol: p.is_alcohol,
  };
}

export function FoodEntryModal({
  date,
  products,
  initial,
  defaultMealType,
  onClose,
  onSubmit,
  onEditComposite,
  isPending,
  formError,
}: {
  date: string;
  products: FoodProduct[];
  initial?: FoodEntry | null;
  defaultMealType?: MealType;
  onClose: () => void;
  onSubmit: (payload: FoodEntryUpdatePayload | CreateEntryItem[]) => void;
  onEditComposite?: (product: FoodProduct) => void;
  isPending: boolean;
  formError: string | null;
}) {
  const { formatFoodWeight, formatEnergy } = useUnits();
  const isEdit = Boolean(initial?.id);

  const formatMacroPreview = (
    protein: number,
    fat: number,
    carbs: number,
    calories: number,
    fiber = 0,
  ) =>
    `Б ${formatFoodWeight(protein)} · Ж ${formatFoodWeight(fat)} · У ${formatFoodWeight(carbs)} · Кл ${formatFoodWeight(fiber)} · ${formatEnergy(calories)}`;

  const formatProductPer100 = (p: FoodProduct) =>
    `Б${formatFoodWeight(p.protein)} Ж${formatFoodWeight(p.fat)} У${formatFoodWeight(p.carbs)} · ${formatEnergy(p.calories)}/100г`;

  const [mealType, setMealType] = useState<MealType>(
    initial
      ? normalizeMealType(initial.meal_type)
      : defaultMealType
        ? normalizeMealType(defaultMealType)
        : "breakfast1",
  );
  const [productId, setProductId] = useState<number | "">(initial?.product_id ?? "");
  const [search, setSearch] = useState(initial?.product_name ?? "");
  const [quantity, setQuantity] = useState(String(initial?.quantity ?? 100));
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [listOpen, setListOpen] = useState(false);
  const [lines, setLines] = useState<EntryLine[]>([]);

  useEffect(() => {
    if (!initial) return;
    setMealType(normalizeMealType(initial.meal_type));
    setProductId(initial.product_id);
    setSearch(initial.product_name);
    setQuantity(String(initial.quantity));
    setNotes(initial.notes ?? "");
  }, [initial]);

  useEffect(() => {
    if (isEdit) return;
    setLines([]);
    setSearch("");
    setNotes("");
    setMealType(defaultMealType ? normalizeMealType(defaultMealType) : "breakfast1");
  }, [date, isEdit, defaultMealType]);

  useEffect(() => {
    if (isEdit || !defaultMealType) return;
    setMealType(normalizeMealType(defaultMealType));
  }, [defaultMealType, isEdit]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 30);
  }, [products, search]);

  const selected = products.find((p) => p.id === productId) ?? null;
  const qtyNum = parseQty(quantity);
  const editPreview = selected && qtyNum > 0 ? previewMacros(selected, qtyNum) : null;

  const addToList = (p: FoodProduct) => {
    setLines((prev) => {
      if (prev.some((line) => line.productId === p.id)) return prev;
      return [...prev, newLine(p)];
    });
    setSearch("");
    setListOpen(false);
  };

  const updateLineQty = (key: string, quantityValue: string) => {
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, quantity: quantityValue } : line)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  };

  const batchPreview = useMemo(() => {
    const totals = { protein: 0, fat: 0, carbs: 0, fiber: 0, calories: 0 };
    for (const line of lines) {
      const product = products.find((p) => p.id === line.productId);
      const qty = parseQty(line.quantity);
      if (!product || qty <= 0) continue;
      const part = previewMacros(product, qty);
      totals.protein += part.protein;
      totals.fat += part.fat;
      totals.carbs += part.carbs;
      totals.fiber += part.fiber ?? 0;
      totals.calories += part.calories;
    }
    if (lines.length === 0) return null;
    return {
      protein: Math.round(totals.protein * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fiber: Math.round(totals.fiber * 10) / 10,
      calories: Math.round(totals.calories * 10) / 10,
    };
  }, [lines, products]);

  const validLines = lines.filter((line) => parseQty(line.quantity) > 0);

  const isDirty = useMemo(() => {
    if (isEdit && initial) {
      return (
        normalizeMealType(mealType) !== normalizeMealType(initial.meal_type) ||
        Number(productId) !== initial.product_id ||
        qtyNum !== initial.quantity ||
        notes.trim() !== (initial.notes ?? "").trim()
      );
    }
    return lines.length > 0 || search.trim().length > 0 || notes.trim().length > 0;
  }, [isEdit, initial, mealType, productId, qtyNum, notes, lines.length, search]);

  const { requestClose, confirmOpen, confirmDiscard, cancelConfirm } = useConfirmClose(
    isDirty,
    onClose,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      if (!productId || !selected) {
        return;
      }
      if (qtyNum <= 0) return;
      onSubmit({
        product_id: Number(productId),
        quantity: qtyNum,
        meal_type: mealType,
        notes: notes.trim() || null,
      });
      return;
    }
    if (validLines.length === 0) return;
    onSubmit(
      validLines.map((line) => ({
        product_id: line.productId,
        quantity: parseQty(line.quantity),
        meal_type: mealType,
        notes: notes.trim() || null,
      })),
    );
  };

  return (
    <>
    <ModalShell
      open
      onClose={requestClose}
      dismissOnOverlay={false}
      title={isEdit ? "Редактировать запись" : "Добавить приём пищи"}
      size="md"
    >
        {formError && <ErrorAlert message={formError} />}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="text-sm block">
            Приём
            <select
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
              className="input-field mt-1"
            >
              {MEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          {isEdit ? (
            <>
              <label className="text-sm block relative">
                Продукт
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setProductId("");
                    setListOpen(true);
                  }}
                  onFocus={() => setListOpen(true)}
                  className="input-field mt-1"
                  placeholder="Начните вводить название…"
                  autoComplete="off"
                />
                {listOpen && filtered.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg bg-[rgb(var(--app-surface))] border-[rgb(var(--app-border))]">
                    {filtered.map((p) => (
                      <li key={p.id} className="flex items-stretch">
                        <button
                          type="button"
                          className="flex-1 text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={() => {
                            setProductId(p.id);
                            setSearch(p.name);
                            setQuantity(
                              String(
                                p.default_portion_g != null && p.default_portion_g > 0
                                  ? p.default_portion_g
                                  : 100,
                              ),
                            );
                            setListOpen(false);
                          }}
                        >
                          {p.name}
                          {p.is_composite && (
                            <span className="ml-1 text-xs text-brand-600">(блюдо)</span>
                          )}
                          {p.is_alcohol && (
                            <span className="ml-1 text-xs text-rose-500">(алк.)</span>
                          )}
                        </button>
                        {p.is_composite && onEditComposite && (
                          <EditCompositeButton onClick={() => onEditComposite(p)} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </label>
              {selected?.is_composite && onEditComposite && (
                <button
                  type="button"
                  className="text-sm text-brand-600 hover:underline"
                  onClick={() => onEditComposite(selected)}
                >
                  Редактировать рецепт блюда
                </button>
              )}
              <label className="text-sm block">
                Количество, г
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="input-field mt-1"
                />
              </label>
              {editPreview && (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  На порцию ({formatFoodWeight(qtyNum)}): {formatMacroPreview(
                    editPreview.protein,
                    editPreview.fat,
                    editPreview.carbs,
                    editPreview.calories,
                    editPreview.fiber ?? 0,
                  )}
                </p>
              )}
            </>
          ) : (
            <>
              <label className="text-sm block relative">
                Добавить продукт или блюдо
                <input
                  type="text"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setListOpen(true);
                  }}
                  onFocus={() => setListOpen(true)}
                  className="input-field mt-1"
                  placeholder="Поиск и добавление в список…"
                  autoComplete="off"
                />
                {listOpen && filtered.length > 0 && (
                  <ul className="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-auto rounded-lg border shadow-lg bg-[rgb(var(--app-surface))] border-[rgb(var(--app-border))]">
                    {filtered.map((p) => (
                      <li key={p.id} className="flex items-stretch">
                        <button
                          type="button"
                          className="flex-1 text-left px-3 py-2.5 min-h-[44px] text-sm hover:bg-slate-100 dark:hover:bg-slate-700"
                          onClick={() => addToList(p)}
                        >
                          {p.name}
                          {p.is_composite && (
                            <span className="ml-1 text-xs text-brand-600">(блюдо)</span>
                          )}
                          {p.is_alcohol && (
                            <span className="ml-1 text-xs text-rose-500">(алк.)</span>
                          )}
                          <span className="text-[rgb(var(--app-text-muted))] ml-2 text-xs">
                            {formatProductPer100(p)}
                          </span>
                        </button>
                        {p.is_composite && onEditComposite && (
                          <EditCompositeButton onClick={() => onEditComposite(p)} />
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </label>

              {lines.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-medium">Список ({lines.length})</p>
                  <ul className="space-y-2">
                    {lines.map((line) => (
                      <li
                        key={line.key}
                        className="flex flex-wrap items-center gap-2 border rounded-lg p-2 bg-[rgb(var(--app-surface-muted))]"
                      >
                        <span className="text-sm flex-1 min-w-[8rem]">
                          {line.productName}
                          {line.isComposite && (
                            <span className="ml-1 text-xs text-brand-600">(блюдо)</span>
                          )}
                        </span>
                        {line.isComposite && onEditComposite && (
                          <EditCompositeButton
                            onClick={() => {
                              const product = products.find((p) => p.id === line.productId);
                              if (product) onEditComposite(product);
                            }}
                          />
                        )}
                        <label className="text-xs flex items-center gap-1">
                          г
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(e) => updateLineQty(line.key, e.target.value)}
                            className="input-field text-sm w-20 py-1"
                          />
                        </label>
                        <button
                          type="button"
                          className="btn-secondary text-xs py-1 sm:w-auto"
                          onClick={() => removeLine(line.key)}
                        >
                          Удалить
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  Найдите продукт или блюдо в поиске и нажмите, чтобы добавить в список.
                </p>
              )}

              {batchPreview && (
                <p className="text-xs text-[rgb(var(--app-text-muted))]">
                  Итого: {formatMacroPreview(
                    batchPreview.protein,
                    batchPreview.fat,
                    batchPreview.carbs,
                    batchPreview.calories,
                    batchPreview.fiber,
                  )}
                </p>
              )}
            </>
          )}

          <label className="text-sm block">
            Заметки
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="input-field mt-1 resize-y"
            />
          </label>

          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="submit"
              disabled={isPending || (isEdit ? !productId : validLines.length === 0)}
              className="btn-primary sm:w-auto"
            >
              {isPending
                ? "Сохранение…"
                : isEdit
                  ? "Сохранить"
                  : validLines.length <= 1
                    ? "Добавить"
                    : `Добавить ${validLines.length} поз.`}
            </button>
            <button type="button" onClick={requestClose} className="btn-secondary sm:w-auto">
              Отмена
            </button>
          </div>
        </form>
    </ModalShell>
    <ConfirmModal
      open={confirmOpen}
      title="Закрыть без сохранения?"
      message="Введённые данные будут потеряны."
      confirmLabel="Закрыть"
      danger
      onCancel={cancelConfirm}
      onConfirm={confirmDiscard}
    />
    </>
  );
}
