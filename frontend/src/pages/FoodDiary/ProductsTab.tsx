import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { foodApi, formatProductExistsMessage, type FoodProduct } from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { SubTabs } from "../../components/SubTabs";
import { useToast } from "../../components/Toast";
import { queryKeys } from "../../hooks/queryKeys";
import { useUnits } from "../../hooks/useUnits";
import { nutritionColumnHeaders } from "../../utils/units";
import { getApiStatus, parseApiError } from "../../utils/validation";
import { AddProductModal } from "./AddProductModal";
import { CompositeProductModal } from "./CompositeProductModal";
import { EditCompositeButton } from "./EditCompositeButton";
import { DataTable } from "../../components/ui/data-table";
import { EmptyState } from "../../components/ui/empty-state";

const CATALOG_TABS = [
  { id: "products", label: "Продукты" },
  { id: "dishes", label: "Блюда" },
] as const;

type CatalogTab = (typeof CATALOG_TABS)[number]["id"];

function ProductTable({
  items,
  onEdit,
  colHeaders,
  formatFoodWeight,
  formatEnergy,
}: {
  items: FoodProduct[];
  onEdit: (product: FoodProduct) => void;
  colHeaders: ReturnType<typeof nutritionColumnHeaders>;
  formatFoodWeight: (grams: number) => string;
  formatEnergy: (kcal: number) => string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Нет продуктов"
        description="Добавьте вручную кнопкой «Добавить продукт»."
      />
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Название</th>
          <th className="text-right">Б</th>
          <th className="text-right">Ж</th>
          <th className="text-right">У</th>
          <th className="text-right">Порция</th>
          <th className="text-right">{colHeaders.caloriesPer100g}</th>
          <th className="w-24 text-right" />
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}>
            <td>
              {p.name}
              {p.is_alcohol && <span className="ml-1 text-xs text-rose-500">(алк.)</span>}
            </td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.protein)}</td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.fat)}</td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.carbs)}</td>
            <td className="text-right tabular-nums text-[rgb(var(--app-text-muted))]">
              {p.default_portion_g != null && p.default_portion_g > 0
                ? formatFoodWeight(p.default_portion_g)
                : "—"}
            </td>
            <td className="text-right tabular-nums font-medium">{formatEnergy(p.calories)}</td>
            <td className="text-right">
              <div className="inline-flex items-center justify-end gap-0.5">
                <EditCompositeButton
                  onClick={() => onEdit(p)}
                  label="Редактировать продукт"
                />
                <button
                  type="button"
                  className="btn-secondary text-xs py-1"
                  onClick={() => onEdit(p)}
                >
                  Редактировать
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

function DishesTable({
  items,
  onEdit,
  colHeaders,
  formatFoodWeight,
  formatEnergy,
}: {
  items: FoodProduct[];
  onEdit: (product: FoodProduct) => void;
  colHeaders: ReturnType<typeof nutritionColumnHeaders>;
  formatFoodWeight: (grams: number) => string;
  formatEnergy: (kcal: number) => string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        title="Нет составных блюд"
        description="Создайте первое блюдо из простых продуктов."
      />
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <th>Название</th>
          <th className="text-right">Б</th>
          <th className="text-right">Ж</th>
          <th className="text-right">У</th>
          <th className="text-right">{colHeaders.caloriesPer100g}</th>
          <th className="w-24 text-right" />
        </tr>
      </thead>
      <tbody>
        {items.map((p) => (
          <tr key={p.id}>
            <td>
              {p.name}
              {p.is_alcohol && <span className="ml-1 text-xs text-rose-500">(алк.)</span>}
            </td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.protein)}</td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.fat)}</td>
            <td className="text-right tabular-nums">{formatFoodWeight(p.carbs)}</td>
            <td className="text-right tabular-nums font-medium">{formatEnergy(p.calories)}</td>
            <td className="text-right">
              <div className="inline-flex items-center justify-end gap-0.5">
                <EditCompositeButton onClick={() => onEdit(p)} />
                <button
                  type="button"
                  className="btn-secondary text-xs py-1"
                  onClick={() => onEdit(p)}
                >
                  Редактировать
                </button>
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </DataTable>
  );
}

export function ProductsTab() {
  const { showToast } = useToast();
  const { system, formatFoodWeight, formatEnergy } = useUnits();
  const colHeaders = nutritionColumnHeaders(system);
  const qc = useQueryClient();
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("products");
  const [search, setSearch] = useState("");
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [editProduct, setEditProduct] = useState<FoodProduct | null>(null);
  const [compositeOpen, setCompositeOpen] = useState(false);
  const [editComposite, setEditComposite] = useState<FoodProduct | null>(null);
  const [compositeFormError, setCompositeFormError] = useState<string | null>(null);

  const {
    data: products = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.foodProducts(),
    queryFn: () => foodApi.getProducts(),
    retry: 1,
  });

  const createCompositeMut = useMutation({
    mutationFn: (body: Parameters<typeof foodApi.createCompositeProduct>[0]) =>
      foodApi.createCompositeProduct(body),
    onSuccess: () => {
      void refetch();
      void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
      setCompositeOpen(false);
      setCompositeFormError(null);
      setCatalogTab("dishes");
      showToast("Блюдо добавлено", "success");
    },
    onError: (e) => {
      const msg = formatProductExistsMessage(parseApiError(e));
      setCompositeFormError(msg);
      if (getApiStatus(e) === 409) {
        showToast(`${msg} Измените название или откройте вкладку «Блюда» в справочнике.`, "error");
      } else {
        showToast(msg, "error");
      }
    },
  });

  const updateCompositeMut = useMutation({
    mutationFn: ({
      id,
      body,
    }: {
      id: number;
      body: Parameters<typeof foodApi.updateCompositeProduct>[1];
    }) => foodApi.updateCompositeProduct(id, body),
    onSuccess: (_, { id }) => {
      void refetch();
      void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
      void qc.invalidateQueries({ queryKey: queryKeys.foodProduct(id, true) });
      setEditComposite(null);
      setCompositeFormError(null);
      showToast("Блюдо обновлено", "success");
    },
    onError: (e) => setCompositeFormError(parseApiError(e)),
  });

  const simpleProducts = useMemo(
    () => products.filter((p) => !p.is_composite),
    [products],
  );
  const compositeProducts = useMemo(
    () => products.filter((p) => p.is_composite),
    [products],
  );

  const q = search.trim().toLowerCase();
  const filteredSimple = useMemo(
    () =>
      q ? simpleProducts.filter((p) => p.name.toLowerCase().includes(q)) : simpleProducts,
    [simpleProducts, q],
  );
  const filteredDishes = useMemo(
    () =>
      q ? compositeProducts.filter((p) => p.name.toLowerCase().includes(q)) : compositeProducts,
    [compositeProducts, q],
  );

  const closeCompositeModal = () => {
    setCompositeOpen(false);
    setEditComposite(null);
    setCompositeFormError(null);
  };

  const openEditProduct = (product: FoodProduct) => {
    setAddProductOpen(false);
    setEditProduct(product);
  };

  const closeProductModal = () => {
    setAddProductOpen(false);
    setEditProduct(null);
  };

  const openEditComposite = (product: FoodProduct) => {
    setCompositeFormError(null);
    setEditComposite(product);
  };

  return (
    <div className="space-y-4">
      <SubTabs items={[...CATALOG_TABS]} activeId={catalogTab} onChange={(id) => setCatalogTab(id as CatalogTab)} />

      <div className="card-panel space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="text-sm block flex-1 min-w-[12rem]">
            Поиск
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field mt-1"
              placeholder="Название…"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditProduct(null);
                setAddProductOpen(true);
              }}
            >
              Добавить продукт
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setCompositeFormError(null);
                setCompositeOpen(true);
              }}
            >
              Создать блюдо
            </button>
          </div>
        </div>

        {isLoading && <Loader label="Загрузка справочника…" />}
        {isError && (
          <ErrorAlert
            message={`Не удалось загрузить справочник: ${parseApiError(error)}`}
          />
        )}

        {!isLoading && !isError && (
          <>
            <p className="text-xs text-[rgb(var(--app-text-muted))]">
              {catalogTab === "products"
                ? `Простых продуктов: ${filteredSimple.length}${q ? ` из ${simpleProducts.length}` : ""}`
                : `Блюд: ${filteredDishes.length}${q ? ` из ${compositeProducts.length}` : ""}`}
            </p>
            {catalogTab === "products" ? (
              <ProductTable
                items={filteredSimple}
                onEdit={openEditProduct}
                colHeaders={colHeaders}
                formatFoodWeight={formatFoodWeight}
                formatEnergy={formatEnergy}
              />
            ) : (
              <DishesTable
                items={filteredDishes}
                onEdit={openEditComposite}
                colHeaders={colHeaders}
                formatFoodWeight={formatFoodWeight}
                formatEnergy={formatEnergy}
              />
            )}
          </>
        )}
      </div>

      {(addProductOpen || editProduct) && (
        <AddProductModal
          products={products}
          existingProduct={editProduct}
          onClose={closeProductModal}
          onCreated={() => {
            void refetch();
            void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
          }}
          onUpdated={() => {
            void refetch();
            void qc.invalidateQueries({ queryKey: queryKeys.foodProducts() });
            if (editProduct) {
              void qc.invalidateQueries({
                queryKey: queryKeys.foodProduct(editProduct.id, false),
              });
            }
            setEditProduct(null);
          }}
          onEditExisting={(product) => {
            closeProductModal();
            setCatalogTab("dishes");
            openEditComposite(product);
          }}
        />
      )}

      {(compositeOpen || editComposite) && (
        <CompositeProductModal
          products={products}
          existingProduct={editComposite}
          onClose={closeCompositeModal}
          onOpenAddProduct={() => {
            setCompositeOpen(false);
            setEditComposite(null);
            setAddProductOpen(true);
          }}
          onSubmit={(body, editProductId) => {
            if (editProductId != null) {
              updateCompositeMut.mutate({ id: editProductId, body });
            } else {
              createCompositeMut.mutate(body);
            }
          }}
          isPending={createCompositeMut.isPending || updateCompositeMut.isPending}
          formError={compositeFormError}
        />
      )}
    </div>
  );
}
