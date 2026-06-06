import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  compositePer100,
  foodApi,
  type FoodCompositePayload,
  type FoodProduct,
} from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { queryKeys } from "../../hooks/queryKeys";
import { ModalShell } from "../../components/ui/modal";
import { useUnits } from "../../hooks/useUnits";

type ComponentRow = {
  key: string;
  productId: number | "";
  search: string;
  quantity: string;
  listOpen: boolean;
};

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function newRow(): ComponentRow {
  return {
    key: String(Date.now()) + Math.random(),
    productId: "",
    search: "",
    quantity: "",
    listOpen: false,
  };
}

function rowsFromComponents(
  components: { product_id: number; product_name: string; quantity_g: number }[],
): ComponentRow[] {
  return components.map((c) => ({
    key: `c-${c.product_id}-${c.quantity_g}`,
    productId: c.product_id,
    search: c.product_name,
    quantity: String(c.quantity_g),
    listOpen: false,
  }));
}

function ComponentProductPicker({
  products,
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  products: FoodProduct[];
  row: ComponentRow;
  onChange: (patch: Partial<ComponentRow>) => void;
  onRemove: () => void;
  canRemove: boolean;
}) {
  const filtered = useMemo(() => {
    const q = row.search.trim().toLowerCase();
    if (!q) return products.slice(0, 20);
    return products.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, row.search]);

  const pick = (p: FoodProduct) => {
    onChange({ productId: p.id, search: p.name, listOpen: false });
  };

  return (
    <div className="flex flex-wrap items-start gap-2 border rounded-lg p-3 bg-[rgb(var(--app-surface-muted))]">
      <div className="flex-1 min-w-[12rem] relative">
        <label className="text-xs text-[rgb(var(--app-text-muted))] block mb-1">Продукт</label>
        <input
          className="input-field text-sm w-full"
          placeholder="Поиск…"
          value={row.search}
          onChange={(e) =>
            onChange({
              search: e.target.value,
              productId: "",
              listOpen: true,
            })
          }
          onFocus={() => onChange({ listOpen: true })}
        />
        {row.listOpen && filtered.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-[rgb(var(--app-border))] bg-[rgb(var(--app-surface))] shadow-lg text-sm">
            {filtered.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2.5 min-h-[44px] hover:bg-[rgb(var(--app-surface-muted))]"
                  onClick={() => pick(p)}
                >
                  {p.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <label className="text-xs w-full sm:w-24 shrink-0">
        <span className="text-[rgb(var(--app-text-muted))] block mb-1">г</span>
        <input
          type="number"
          min={0}
          step="1"
          className="input-field text-sm w-full"
          value={row.quantity}
          onChange={(e) => onChange({ quantity: e.target.value })}
        />
      </label>
      <button
        type="button"
        disabled={!canRemove}
        className="btn-secondary text-xs py-2 mt-0 sm:mt-5 shrink-0 disabled:opacity-40 sm:w-auto"
        onClick={onRemove}
      >
        Удалить
      </button>
    </div>
  );
}

export function CompositeProductModal(props: {
  products: FoodProduct[];
  existingProduct?: FoodProduct | null;
  onClose: () => void;
  onSubmit: (body: FoodCompositePayload, editProductId?: number) => void;
  onOpenAddProduct: () => void;
  isPending: boolean;
  formError: string | null;
}) {
  const {
    products,
    existingProduct = null,
    onClose,
    onSubmit,
    onOpenAddProduct,
    isPending,
    formError,
  } = props;

  const { formatFoodWeight, formatEnergy } = useUnits();
  const editId = existingProduct?.id ?? null;
  const isEdit = editId != null;

  const { data: productDetail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.foodProduct(editId ?? 0, true),
    queryFn: () => foodApi.getProduct(editId!, true),
    enabled: isEdit,
  });

  const [name, setName] = useState("");
  const [rows, setRows] = useState<ComponentRow[]>(() => [newRow()]);
  const [totalWeight, setTotalWeight] = useState("");
  const [useCustomWeight, setUseCustomWeight] = useState(false);
  const [initialized, setInitialized] = useState(!isEdit);

  useEffect(() => {
    if (!isEdit) {
      setName("");
      setRows([newRow()]);
      setTotalWeight("");
      setUseCustomWeight(false);
      setInitialized(true);
      return;
    }
    if (!productDetail) return;
    setName(productDetail.name);
    const comps = productDetail.components ?? [];
    setRows(comps.length > 0 ? rowsFromComponents(comps) : [newRow()]);
    setTotalWeight("");
    setUseCustomWeight(false);
    setInitialized(true);
  }, [isEdit, productDetail]);

  useEffect(() => {
    if (isEdit) setInitialized(false);
  }, [editId, isEdit]);

  const ingredientProducts = useMemo(
    () => products.filter((p) => !p.is_composite),
    [products],
  );

  const componentPayload = useMemo(
    () =>
      rows
        .filter((r) => r.productId !== "" && parseNum(r.quantity) > 0)
        .map((r) => ({ product_id: Number(r.productId), quantity_g: parseNum(r.quantity) })),
    [rows],
  );

  const componentWeightSum = useMemo(
    () => componentPayload.reduce((s, c) => s + c.quantity_g, 0),
    [componentPayload],
  );

  const preview = useMemo(() => {
    if (!componentPayload.length) return null;
    const total = useCustomWeight && parseNum(totalWeight) > 0 ? parseNum(totalWeight) : undefined;
    return compositePer100(componentPayload, products, total);
  }, [componentPayload, products, useCustomWeight, totalWeight]);

  const canSubmit =
    name.trim().length > 0 &&
    componentPayload.length >= 1 &&
    preview != null &&
    (!isEdit || (initialized && !detailLoading));

  const updateRow = (key: string, patch: Partial<ComponentRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const body: FoodCompositePayload = {
      name: name.trim(),
      components: componentPayload,
    };
    if (useCustomWeight && parseNum(totalWeight) > 0) {
      body.total_weight_g = parseNum(totalWeight);
    }
    onSubmit(body, editId ?? undefined);
  };

  const title = isEdit ? "Редактировать блюдо" : "Создать блюдо";
  const submitLabel = isEdit ? "Сохранить изменения" : "Сохранить блюдо";

  return (
    <ModalShell open onClose={onClose} dataEntry title={title} size="md" zIndex={60}>
        {formError && <ErrorAlert message={formError} />}
        {isEdit && detailLoading && <Loader label="Загрузка состава…" />}
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="text-sm block">
            Название блюда
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field mt-1"
              required
            />
          </label>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">Компоненты</span>
              <button
                type="button"
                className="btn-secondary text-xs py-1 sm:w-auto"
                onClick={() => setRows((prev) => [...prev, newRow()])}
              >
                + Компонент
              </button>
            </div>
            {rows.map((row) => (
              <ComponentProductPicker
                key={row.key}
                products={ingredientProducts}
                row={row}
                onChange={(patch) => updateRow(row.key, patch)}
                onRemove={() => setRows((prev) => prev.filter((r) => r.key !== row.key))}
                canRemove={rows.length > 1}
              />
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useCustomWeight}
              onChange={(e) => setUseCustomWeight(e.target.checked)}
            />
            Указать итоговый вес вручную (сейчас {formatFoodWeight(componentWeightSum)})
          </label>
          {useCustomWeight && (
            <label className="text-sm block">
              Итоговый вес, г
              <input
                type="number"
                min={1}
                step="1"
                value={totalWeight}
                onChange={(e) => setTotalWeight(e.target.value)}
                className="input-field mt-1"
              />
            </label>
          )}
          {preview && (
            <p className="text-xs text-[rgb(var(--app-text-muted))] rounded-lg border p-3 bg-[rgb(var(--app-surface-muted))]">
              На 100 г: Б {formatFoodWeight(preview.protein)} · Ж {formatFoodWeight(preview.fat)} · У{" "}
              {formatFoodWeight(preview.carbs)} · {formatEnergy(preview.calories)}
            </p>
          )}
          <p className="text-xs text-[rgb(var(--app-text-muted))]">
            Нет нужного продукта?{" "}
            <button type="button" className="text-brand-600 underline" onClick={onOpenAddProduct}>
              Добавить в справочник
            </button>
          </p>
          <div className="flex flex-col sm:flex-row gap-2 pt-2">
            <button
              type="submit"
              disabled={isPending || !canSubmit}
              className="btn-primary sm:w-auto"
            >
              {isPending ? "Сохранение…" : submitLabel}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary sm:w-auto">
              Отмена
            </button>
          </div>
        </form>
    </ModalShell>
  );
}
