import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  calcMacroCalories,
  foodApi,
  formatProductExistsMessage,
  type FoodProduct,
  type FoodProductCreatePayload,
  type FoodProductUpdatePayload,
  type OpenFoodFactsPreview,
  type OpenFoodFactsProductSummary,
} from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { ConfirmModal } from "../../components/ConfirmModal";
import { Loader } from "../../components/Loader";
import { useConfirmClose } from "../../hooks/useConfirmClose";
import { queryKeys } from "../../hooks/queryKeys";
import { useToast } from "../../components/Toast";
import { useUnits } from "../../hooks/useUnits";
import { checkCalorieMacroMismatch } from "../../utils/nutritionValidation";
import {
  MICRO_NUTRIENTS,
  type MicroNutrientKey,
} from "../../shared/microNutrients";
import { ModalShell } from "../../components/ui/modal";
import { getApiStatus, parseApiError } from "../../utils/validation";
import {
  fieldsFromFoodProduct,
  fieldsFromOpenFoodFactsPreview,
  summaryToPreview,
  hasAnyMicro,
  isUsableOffPreview,
  isUsableOffSummary,
  previewToMicroStrings,
  type PreviewFormFields,
} from "./foodPreviewForm";

function parseNum(s: string): number {
  const n = parseFloat(s.replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function findProductByName(products: FoodProduct[], name: string): FoodProduct | null {
  const key = name.trim();
  return products.find((p) => p.name.trim() === key) ?? null;
}

function applyFormFields(
  f: PreviewFormFields,
  setters: {
    setName: (v: string) => void;
    setProtein: (v: string) => void;
    setFat: (v: string) => void;
    setCarbs: (v: string) => void;
    setFiber: (v: string) => void;
    setCalories: (v: string) => void;
    setAutoKcal: (v: boolean) => void;
    setIsAlcohol: (v: boolean) => void;
    setExternalId: (v: string | undefined) => void;
    setDefaultPortion: (v: string) => void;
    setMicros: (v: Partial<Record<MicroNutrientKey, string>>) => void;
    setMicrosOpen: (v: boolean) => void;
  },
) {
  setters.setName(f.name);
  setters.setProtein(f.protein);
  setters.setFat(f.fat);
  setters.setCarbs(f.carbs);
  setters.setFiber(f.fiber);
  setters.setCalories(f.calories);
  setters.setAutoKcal(f.autoKcal);
  setters.setIsAlcohol(f.isAlcohol);
  setters.setExternalId(f.externalId);
  setters.setDefaultPortion(f.defaultPortion);
  setters.setMicros(f.micros);
  setters.setMicrosOpen(f.microsOpen);
}

function formFieldsSnapshot(
  name: string,
  protein: string,
  fat: string,
  carbs: string,
  fiber: string,
  defaultPortion: string,
  calories: string,
  autoKcal: boolean,
  isAlcohol: boolean,
  externalId: string | undefined,
  micros: Partial<Record<MicroNutrientKey, string>>,
  microsOpen: boolean,
): PreviewFormFields {
  return {
    name,
    protein,
    fat,
    carbs,
    fiber,
    defaultPortion,
    calories,
    autoKcal,
    isAlcohol,
    externalId,
    micros,
    microsOpen,
  };
}

function formsEqual(a: PreviewFormFields, b: PreviewFormFields): boolean {
  if (
    a.name !== b.name ||
    a.protein !== b.protein ||
    a.fat !== b.fat ||
    a.carbs !== b.carbs ||
    a.fiber !== b.fiber ||
    a.defaultPortion !== b.defaultPortion ||
    a.calories !== b.calories ||
    a.autoKcal !== b.autoKcal ||
    a.isAlcohol !== b.isAlcohol ||
    a.externalId !== b.externalId ||
    a.microsOpen !== b.microsOpen
  ) {
    return false;
  }
  for (const n of MICRO_NUTRIENTS) {
    if ((a.micros[n.key] ?? "") !== (b.micros[n.key] ?? "")) return false;
  }
  return true;
}

export function AddProductModal({
  onClose,
  onCreated,
  onUpdated,
  products = [],
  onEditExisting,
  existingProduct = null,
  initialPreview = null,
  title,
}: {
  onClose: () => void;
  onCreated?: (product: FoodProduct) => void;
  onUpdated?: (product: FoodProduct) => void;
  products?: FoodProduct[];
  /** Открыть редактор существующего составного блюда (409). */
  onEditExisting?: (product: FoodProduct) => void;
  /** Редактирование существующего простого продукта. */
  existingProduct?: FoodProduct | null;
  /** Предзаполнение из Open Food Facts / сканера. */
  initialPreview?: OpenFoodFactsPreview | null;
  title?: string;
}) {
  const { showToast } = useToast();
  const { formatFoodWeight, formatEnergy } = useUnits();
  const editId = existingProduct?.id ?? null;
  const isEdit = editId != null;
  const modalTitle = title ?? (isEdit ? "Редактировать продукт" : "Новый продукт");

  const { data: productDetail, isLoading: detailLoading } = useQuery({
    queryKey: queryKeys.foodProduct(editId ?? 0, false),
    queryFn: () => foodApi.getProduct(editId!, false),
    enabled: isEdit,
  });

  const [initialized, setInitialized] = useState(!isEdit);
  const baselineRef = useRef<PreviewFormFields | null>(null);

  const [offMode, setOffMode] = useState(false);
  const [offSearchType, setOffSearchType] = useState<"barcode" | "name">("barcode");
  const [offQuery, setOffQuery] = useState("");
  const [offMessage, setOffMessage] = useState<string | null>(null);
  const [offResults, setOffResults] = useState<OpenFoodFactsProductSummary[]>([]);
  const [offLocalMatches, setOffLocalMatches] = useState<FoodProduct[]>([]);
  const [offExisting, setOffExisting] = useState<FoodProduct | null>(null);
  const [offSource, setOffSource] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [protein, setProtein] = useState("");
  const [fat, setFat] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fiber, setFiber] = useState("");
  const [defaultPortion, setDefaultPortion] = useState("");
  const [calories, setCalories] = useState("");
  const [autoKcal, setAutoKcal] = useState(true);
  const [isAlcohol, setIsAlcohol] = useState(false);
  const [externalId, setExternalId] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [conflictProduct, setConflictProduct] = useState<FoodProduct | null>(null);
  const [microsOpen, setMicrosOpen] = useState(false);
  const [micros, setMicros] = useState<Partial<Record<MicroNutrientKey, string>>>({});

  const formSetters = {
    setName,
    setProtein,
    setFat,
    setCarbs,
    setFiber,
    setCalories,
    setAutoKcal,
    setIsAlcohol,
    setExternalId,
    setDefaultPortion,
    setMicros,
    setMicrosOpen,
  };

  useEffect(() => {
    if (!isEdit) {
      baselineRef.current = null;
      setInitialized(true);
      return;
    }
    setInitialized(false);
  }, [editId, isEdit]);

  useEffect(() => {
    if (!isEdit || !productDetail) return;
    const fields = fieldsFromFoodProduct(productDetail);
    applyFormFields(fields, formSetters);
    baselineRef.current = fields;
    setFormError(null);
    setConflictProduct(null);
    setInitialized(true);
  }, [isEdit, productDetail]);

  useEffect(() => {
    if (!initialPreview || isEdit) return;
    const f = fieldsFromOpenFoodFactsPreview(initialPreview);
    applyFormFields(f, formSetters);
    setOffMode(false);
  }, [initialPreview, isEdit]);

  const buildMacroBody = (
    p: number,
    f: number,
    c: number,
    kcal: number,
  ): Pick<
    FoodProductCreatePayload,
    "protein" | "fat" | "carbs" | "fiber_g" | "is_alcohol" | "calories"
  > => ({
    protein: p,
    fat: f,
    carbs: c,
    fiber_g: parseNum(fiber),
    is_alcohol: isAlcohol,
    calories: kcal,
  });

  const appendMicroFields = (
    body: FoodProductCreatePayload | FoodProductUpdatePayload,
  ) => {
    if (isEdit || microsOpen) {
      for (const n of MICRO_NUTRIENTS) {
        body[n.key] = parseNum(micros[n.key] ?? "");
      }
      return;
    }
    for (const n of MICRO_NUTRIENTS) {
      const raw = micros[n.key]?.trim();
      if (raw) {
        const val = parseNum(raw);
        if (val > 0) {
          body[n.key] = val;
        }
      }
    }
  };

  const switchToManualForm = (barcode?: string) => {
    setOffMode(false);
    if (barcode) {
      setExternalId(barcode);
    }
  };

  const applyPreview = (preview: OpenFoodFactsPreview) => {
    setName(preview.name);
    setProtein(String(preview.protein));
    setFat(String(preview.fat));
    setCarbs(String(preview.carbs));
    setFiber(String(preview.fiber_g ?? 0));
    setCalories(String(preview.calories));
    setAutoKcal(false);
    setIsAlcohol(preview.is_alcohol ?? false);
    setExternalId(preview.external_id ?? undefined);
    const microVals = previewToMicroStrings(preview);
    setMicros(microVals);
    if (hasAnyMicro(preview)) {
      setMicrosOpen(true);
    }
    setFormError(null);
    setConflictProduct(null);
  };

  const offSearchMut = useMutation({
    mutationFn: async () => {
      const q = offQuery.trim();
      if (offSearchType === "barcode") {
        return foodApi.openFoodFactsByBarcode(q);
      }
      return foodApi.openFoodFactsSearch(q);
    },
    onSuccess: (data) => {
      setOffLocalMatches(
        "local_matches" in data ? data.local_matches : data.local_name_matches ?? [],
      );
      setOffSource(data.source);

      if ("existing_product" in data && data.existing_product) {
        setOffExisting(data.existing_product);
        setOffMessage(data.message ?? null);
        const preview =
          data.preview ??
          (data.product ? summaryToPreview(data.product) : null);
        if (preview) {
          applyPreview(preview);
        }
        setOffResults([]);
        return;
      }
      setOffExisting(null);

      if ("items" in data) {
        if (!data.found || data.items.length === 0) {
          setOffMessage(
            data.message ??
              "Ничего не найдено. Попробуйте другое название или создайте продукт вручную.",
          );
          setOffResults([]);
          return;
        }
        setOffMessage(null);
        setOffResults(data.items);
        if (data.items.length === 1) {
          const preview = summaryToPreview(data.items[0]);
          if (isUsableOffSummary(data.items[0])) {
            applyPreview(preview);
          } else {
            setOffMessage("У найденного продукта нет данных о калориях или БЖУ.");
          }
        }
        return;
      }

      if (!data.found) {
        const code =
          data.barcode ??
          (offQuery.replace(/\D/g, "").slice(0, 14) || undefined);
        setOffMessage(
          "Продукт с таким штрихкодом не найден в общей базе. Вы можете создать его вручную, заполнив поля ниже.",
        );
        setOffResults([]);
        switchToManualForm(code);
        return;
      }

      setOffMessage(data.message ?? null);
      const preview =
        data.preview ?? (data.product ? summaryToPreview(data.product) : null);
      if (preview) {
        if (isUsableOffPreview(preview)) {
          setOffResults([]);
          applyPreview(preview);
        } else {
          setOffMessage("У найденного продукта нет данных о калориях или БЖУ.");
          setOffResults([]);
        }
      } else {
        setOffResults([]);
      }
    },
    onError: (err) => {
      const status = getApiStatus(err);
      const msg = parseApiError(err);
      setOffMessage(msg);
      setOffResults([]);
      setOffLocalMatches([]);
      setOffExisting(null);
      if (status === 429) {
        showToast("Слишком много запросов к Open Food Facts. Подождите и повторите.", "error");
      } else if (status === 400) {
        showToast(msg, "error");
      } else if (status === 404) {
        showToast("Продукт не найден в Open Food Facts", "error");
      } else if (!status) {
        showToast("Нет связи с Open Food Facts. Проверьте интернет.", "error");
      } else {
        showToast(msg, "error");
      }
    },
  });

  const createMut = useMutation({
    mutationFn: (body: FoodProductCreatePayload) => foodApi.createProduct(body),
    onSuccess: (product) => {
      setFormError(null);
      setConflictProduct(null);
      onCreated?.(product);
      onClose();
      if (!initialPreview) {
        showToast("Продукт добавлен", "success");
      }
    },
    onError: (err, body) => {
      if (getApiStatus(err) === 409) {
        const raw = parseApiError(err);
        setFormError(formatProductExistsMessage(raw));
        setConflictProduct(findProductByName(products, body.name));
        showToast(formatProductExistsMessage(raw), "error");
        return;
      }
      const msg = parseApiError(err);
      setFormError(msg);
      setConflictProduct(null);
      showToast(msg, "error");
    },
  });

  const updateMut = useMutation({
    mutationFn: (body: FoodProductUpdatePayload) => foodApi.updateProduct(editId!, body),
    onSuccess: (product) => {
      setFormError(null);
      setConflictProduct(null);
      onUpdated?.(product);
      onClose();
      showToast("Продукт обновлён", "success");
    },
    onError: (err, body) => {
      if (getApiStatus(err) === 409) {
        const raw = parseApiError(err);
        setFormError(formatProductExistsMessage(raw));
        if (body.name) {
          setConflictProduct(findProductByName(products, body.name));
        }
        showToast(formatProductExistsMessage(raw), "error");
        return;
      }
      const msg = parseApiError(err);
      setFormError(msg);
      setConflictProduct(null);
      showToast(msg, "error");
    },
  });

  const savePending = createMut.isPending || updateMut.isPending;

  const proteinN = parseNum(protein);
  const fatN = parseNum(fat);
  const carbsN = parseNum(carbs);
  const enteredKcal =
    autoKcal || !calories.trim() ? calcMacroCalories(proteinN, fatN, carbsN) : parseNum(calories);
  const simplePreviewKcal = enteredKcal;
  const macroMismatch = checkCalorieMacroMismatch(
    proteinN,
    fatN,
    carbsN,
    enteredKcal,
    isAlcohol,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setFormError(null);
    setConflictProduct(null);
    const p = parseNum(protein);
    const f = parseNum(fat);
    const c = parseNum(carbs);
    const kcal = autoKcal || !calories.trim() ? calcMacroCalories(p, f, c) : parseNum(calories);
    const mismatch = checkCalorieMacroMismatch(p, f, c, kcal, isAlcohol);
    if (mismatch) {
      setFormError(mismatch);
      return;
    }
    if (!isAlcohol && p <= 0 && f <= 0 && c <= 0 && kcal <= 0) {
      setFormError("Укажите КБЖУ — продукт без макросов не будет сохранён.");
      return;
    }

    if (isEdit) {
      const body: FoodProductUpdatePayload = {
        name: name.trim(),
        ...buildMacroBody(p, f, c, kcal),
        external_id: externalId?.trim() || null,
        default_portion_g: (() => {
          const portion = parseNum(defaultPortion);
          return portion > 0 ? portion : null;
        })(),
      };
      appendMicroFields(body);
      updateMut.mutate(body);
      return;
    }

    const body: FoodProductCreatePayload = {
      name: name.trim(),
      ...buildMacroBody(p, f, c, kcal),
    };
    if (externalId?.trim()) {
      body.external_id = externalId.trim();
    }
    const portion = parseNum(defaultPortion);
    if (portion > 0) {
      body.default_portion_g = portion;
    }
    if (!autoKcal && calories.trim()) {
      body.calories = parseNum(calories);
    } else if (isAlcohol && kcal > 0) {
      body.calories = kcal;
    } else if (autoKcal) {
      delete body.calories;
    }
    appendMicroFields(body);
    createMut.mutate(body);
  };

  const handleEditExisting = () => {
    if (!conflictProduct) return;
    onEditExisting?.(conflictProduct);
    onClose();
  };

  const saveAsNewVariant = () => {
    setExternalId(undefined);
    setOffExisting(null);
    showToast("Штрихкод сброшен — можно сохранить под другим названием", "info");
  };

  const isDirty = useMemo(() => {
    if (isEdit && baselineRef.current) {
      const current = formFieldsSnapshot(
        name,
        protein,
        fat,
        carbs,
        fiber,
        defaultPortion,
        calories,
        autoKcal,
        isAlcohol,
        externalId,
        micros,
        microsOpen,
      );
      return !formsEqual(current, baselineRef.current);
    }
    if (initialPreview) {
      return (
        name.trim().length > 0 ||
        protein.trim().length > 0 ||
        fat.trim().length > 0 ||
        carbs.trim().length > 0 ||
        calories.trim().length > 0
      );
    }
    return (
      name.trim().length > 0 ||
      protein.trim().length > 0 ||
      fat.trim().length > 0 ||
      carbs.trim().length > 0 ||
      calories.trim().length > 0 ||
      fiber.trim().length > 0 ||
      defaultPortion.trim().length > 0 ||
      offQuery.trim().length > 0 ||
      offResults.length > 0 ||
      Object.values(micros).some((v) => (v ?? "").trim().length > 0)
    );
  }, [
    isEdit,
    initialPreview,
    name,
    protein,
    fat,
    carbs,
    fiber,
    defaultPortion,
    calories,
    autoKcal,
    isAlcohol,
    externalId,
    micros,
    microsOpen,
    offQuery,
    offResults.length,
  ]);

  const canSubmit =
    name.trim().length > 0 &&
    (!isEdit || (initialized && !detailLoading)) &&
    !(offExisting && externalId && !isEdit);

  const submitLabel = isEdit
    ? savePending
      ? "Сохранение…"
      : "Сохранить изменения"
    : savePending
      ? "Сохранение…"
      : "Сохранить";

  const { requestClose, confirmOpen, confirmDiscard, cancelConfirm } = useConfirmClose(
    isDirty,
    onClose,
  );

  return (
    <>
    <ModalShell open onClose={requestClose} dismissOnOverlay={false} title={modalTitle} size="md" zIndex={50}>
      {!initialPreview && !isEdit && (
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            className={offMode ? "btn-secondary text-sm" : "btn-primary text-sm"}
            onClick={() => setOffMode(false)}
          >
            Вручную
          </button>
          <button
            type="button"
            className={offMode ? "btn-primary text-sm" : "btn-secondary text-sm"}
            onClick={() => setOffMode(true)}
          >
            Open Food Facts
          </button>
        </div>
      )}
      {initialPreview && (
        <p className="text-xs text-[rgb(var(--app-text-muted))] mb-3">
          Данные из штрихкода — проверьте и сохраните, затем продукт попадёт в приём пищи.
        </p>
      )}

      {offMode && !isEdit && (
        <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] p-3 mb-3 space-y-2">
          <div className="flex gap-2 text-sm">
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={offSearchType === "barcode"}
                onChange={() => setOffSearchType("barcode")}
              />
              Штрихкод
            </label>
            <label className="flex items-center gap-1">
              <input
                type="radio"
                checked={offSearchType === "name"}
                onChange={() => setOffSearchType("name")}
              />
              Название
            </label>
          </div>
          <div className="flex gap-2">
            <input
              value={offQuery}
              onChange={(e) => setOffQuery(e.target.value)}
              className="input-field flex-1"
              placeholder={
                offSearchType === "barcode" ? "4607019751002" : "гречка"
              }
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={
                offSearchMut.isPending ||
                (offSearchType === "barcode"
                  ? offQuery.replace(/\D/g, "").length < 8
                  : offQuery.trim().length < 2)
              }
              onClick={() => offSearchMut.mutate()}
            >
              {offSearchMut.isPending ? "…" : "Искать"}
            </button>
          </div>
          {offSource === "local" && offExisting && (
            <p className="text-sm text-amber-800 dark:text-amber-200 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
              Продукт «{offExisting.name}» уже в справочнике (штрихкод {offExisting.external_id}).
              Данные подставлены ниже — используйте существующую запись или сохраните под другим
              именем.
              <button
                type="button"
                className="btn-secondary text-xs mt-2 block"
                onClick={saveAsNewVariant}
              >
                Сохранить как новый (без штрихкода)
              </button>
            </p>
          )}
          {offMessage && !offSearchMut.isPending && (
            <p className="text-sm text-[rgb(var(--app-text-muted))]">{offMessage}</p>
          )}
          {offLocalMatches.length > 0 && (
            <div className="text-xs text-[rgb(var(--app-text-muted))]">
              В справочнике:{" "}
              {offLocalMatches.map((p) => p.name).join(", ")}
            </div>
          )}
          {(offResults.length > 0 || offMessage) && (
            <div className="flex flex-wrap gap-2 border-t border-[rgb(var(--app-border)/0.45)] pt-2">
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={() => {
                  const code =
                    offSearchType === "barcode"
                      ? offQuery.replace(/\D/g, "").slice(0, 14) || undefined
                      : undefined;
                  switchToManualForm(code);
                }}
              >
                Заполнить вручную
              </button>
            </div>
          )}
          {offResults.length > 0 && (
            <ul className="max-h-40 overflow-y-auto space-y-1 text-sm">
              {offResults.map((item) => {
                const usable = isUsableOffSummary(item);
                return (
                <li key={item.barcode ?? item.name}>
                  <button
                    type="button"
                    disabled={!usable}
                    className={`w-full text-left px-2 py-1.5 rounded-lg ${
                      usable
                        ? "hover:bg-[rgb(var(--app-surface-subtle)/0.6)]"
                        : "opacity-50 cursor-not-allowed"
                    }`}
                    onClick={() => usable && applyPreview(summaryToPreview(item))}
                  >
                    <span className="font-medium">{item.name}</span>
                    <span className="block text-xs text-[rgb(var(--app-text-muted))]">
                      {usable ? (
                        <>
                          {item.protein != null && `Б ${item.protein} `}
                          {item.fat != null && `Ж ${item.fat} `}
                          {item.carbs != null && `У ${item.carbs}`}
                          {item.calories != null && ` · ${item.calories} ккал`}
                          {item.barcode ? ` · ${item.barcode}` : ""}
                        </>
                      ) : (
                        "Нет данных КБЖУ — выберите другой результат или заполните вручную"
                      )}
                    </span>
                  </button>
                </li>
              );
              })}
            </ul>
          )}
        </div>
      )}

      {formError && <ErrorAlert message={formError} />}
      {isEdit && detailLoading && <Loader label="Загрузка продукта…" />}
      {conflictProduct && (
        <div className="text-sm rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2 space-y-2">
          {conflictProduct.is_composite && onEditExisting ? (
            <>
              <p>
                «{conflictProduct.name}» уже есть как составное блюдо. Отредактируйте его или задайте
                другое название.
              </p>
              <button type="button" className="btn-secondary text-sm" onClick={handleEditExisting}>
                Редактировать «{conflictProduct.name}»
              </button>
            </>
          ) : (
            <p>
              «{conflictProduct.name}» уже есть в справочнике — найдите строку в таблице выше и
              используйте существующую запись. Либо измените название нового продукта.
            </p>
          )}
        </div>
      )}
      {(createMut.isError || updateMut.isError) &&
        getApiStatus(createMut.error ?? updateMut.error) === 409 &&
        !conflictProduct && (
          <p className="text-sm text-[rgb(var(--app-text-muted))] rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 px-3 py-2">
            Измените название или откройте вкладку «Продукты» / «Блюда», чтобы найти существующую
            запись.
          </p>
        )}
      <form onSubmit={handleSubmit} className="space-y-3">
        <label className="text-sm block">
          Штрихкод (опционально)
          <div className="flex gap-2 mt-1">
            <input
              value={externalId ?? ""}
              onChange={(e) =>
                setExternalId(e.target.value.replace(/\D/g, "").slice(0, 14) || undefined)
              }
              className="input-field flex-1"
              placeholder="4607019751002"
              inputMode="numeric"
            />
            {externalId && (
              <button
                type="button"
                className="btn-secondary text-xs shrink-0"
                onClick={() => setExternalId(undefined)}
              >
                убрать
              </button>
            )}
          </div>
        </label>
        <label className="text-sm block">
          Название
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (conflictProduct) setConflictProduct(null);
            }}
            className="input-field mt-1"
            required
          />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="text-sm block">
            Белки/100г
            <input
              type="number"
              min={0}
              step="0.1"
              value={protein}
              onChange={(e) => setProtein(e.target.value)}
              className="input-field mt-1"
            />
          </label>
          <label className="text-sm block">
            Жиры/100г
            <input
              type="number"
              min={0}
              step="0.1"
              value={fat}
              onChange={(e) => setFat(e.target.value)}
              className="input-field mt-1"
            />
          </label>
          <label className="text-sm block">
            Углев./100г
            <input
              type="number"
              min={0}
              step="0.1"
              value={carbs}
              onChange={(e) => setCarbs(e.target.value)}
              className="input-field mt-1"
            />
          </label>
        </div>
        <label className="text-sm block">
          Клетчатка/100г
          <input
            type="number"
            min={0}
            step="0.1"
            value={fiber}
            onChange={(e) => setFiber(e.target.value)}
            className="input-field mt-1"
          />
        </label>
        <label className="text-sm block">
          Стандартная порция, г
          <input
            type="number"
            min={0}
            step="1"
            value={defaultPortion}
            onChange={(e) => setDefaultPortion(e.target.value)}
            className="input-field mt-1"
            placeholder="100"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isAlcohol}
            onChange={(e) => setIsAlcohol(e.target.checked)}
            className="rounded border-slate-300"
          />
          Это алкоголь (калории не проверяются по БЖУ)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={autoKcal} onChange={(e) => setAutoKcal(e.target.checked)} />
          Ккал на 100 г: Б×4 + Ж×9 + У×4 ({formatEnergy(simplePreviewKcal)})
          <span className="text-[rgb(var(--app-text-muted))]">
            {" "}
            · Б {formatFoodWeight(proteinN)} Ж {formatFoodWeight(fatN)} У{" "}
            {formatFoodWeight(carbsN)}
          </span>
        </label>
        {macroMismatch && !isAlcohol && (
          <p className="text-sm text-amber-700 dark:text-amber-300">{macroMismatch}</p>
        )}
        {!autoKcal && (
          <label className="text-sm block">
            Калории на 100 г
            <input
              type="number"
              min={0}
              value={calories}
              onChange={(e) => setCalories(e.target.value)}
              className="input-field mt-1"
            />
          </label>
        )}
        <div className="rounded-xl border border-[rgb(var(--app-border)/0.6)] overflow-hidden">
          <button
            type="button"
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-left hover:bg-[rgb(var(--app-surface-subtle)/0.5)]"
            onClick={() => setMicrosOpen((v) => !v)}
          >
            Микронутриенты на 100 г
            <span className="text-[rgb(var(--app-text-muted))] text-xs font-normal">
              {microsOpen ? "скрыть" : "опционально"}
            </span>
          </button>
          {microsOpen && (
            <div className="px-3 pb-3 grid grid-cols-2 gap-2 border-t border-[rgb(var(--app-border)/0.45)] pt-3">
              {MICRO_NUTRIENTS.map((n) => (
                <label key={n.key} className="text-xs block">
                  {n.label} ({n.unit})
                  <input
                    type="number"
                    min={0}
                    step="any"
                    value={micros[n.key] ?? ""}
                    onChange={(e) =>
                      setMicros((m) => ({ ...m, [n.key]: e.target.value }))
                    }
                    className="input-field mt-1 text-sm"
                    placeholder="0"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          {isEdit
            ? "Изменения применятся к справочнику; записи в дневнике используют актуальные данные продукта."
            : "Продукт попадёт в общий справочник (доступен и для сушки, и для набора)."}
        </p>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={savePending || !canSubmit}
            className="btn-primary"
          >
            {submitLabel}
          </button>
          <button type="button" onClick={requestClose} className="btn-secondary">
            Отмена
          </button>
        </div>
      </form>
    </ModalShell>
    <ConfirmModal
      open={confirmOpen}
      title="Закрыть без сохранения?"
      message="Введённые данные продукта будут потеряны."
      confirmLabel="Закрыть"
      danger
      onCancel={cancelConfirm}
      onConfirm={confirmDiscard}
    />
    </>
  );
}
