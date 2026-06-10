import { useMutation } from "@tanstack/react-query";
import { ScanLine } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
  foodApi,
  type FoodProduct,
  type MealType,
  type OpenFoodFactsPreview,
} from "../../api/food";
import { ErrorAlert } from "../../components/ErrorAlert";
import { Loader } from "../../components/Loader";
import { useToast } from "../../components/Toast";
import { ModalShell } from "../../components/ui/modal";
import "./food-diary-layout.css";
import {
  MEAL_MODAL_PANEL_CLASS,
  MEAL_MODAL_SIZE_COMPACT,
} from "./mealModalLayout";
import { getApiStatus, parseApiError } from "../../utils/validation";
import { MEAL_TYPE_OPTIONS } from "./FoodEntryModal";

const BarcodeCameraView = lazy(() =>
  import("./BarcodeCameraView").then((m) => ({ default: m.BarcodeCameraView })),
);

function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

function inferDefaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return "breakfast1";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  if (h < 22) return "dinner";
  return "snack";
}

type LookupStatus = "idle" | "scanning" | "looking" | "done";

export function BarcodeScannerModal({
  onClose,
  onAddExisting,
  onCreateNew,
}: {
  onClose: () => void;
  /** Продукт уже в справочнике — добавить в приём. */
  onAddExisting: (product: FoodProduct, mealType: MealType, quantityG: number) => void;
  /** Найден в OFF, но не в БД — открыть форму создания. */
  onCreateNew: (preview: OpenFoodFactsPreview, mealType: MealType, quantityG: number) => void;
}) {
  const { showToast } = useToast();
  const [mealType, setMealType] = useState<MealType>(inferDefaultMealType);
  const [quantity, setQuantity] = useState("100");
  const [manualCode, setManualCode] = useState("");
  const [status, setStatus] = useState<LookupStatus>("scanning");
  const [message, setMessage] = useState<string | null>(null);
  const [lastProductName, setLastProductName] = useState<string | null>(null);
  const lastCodeRef = useRef<string>("");
  const lastAtRef = useRef(0);
  const pausedRef = useRef(false);

  const lookupMut = useMutation({
    mutationFn: (barcode: string) => foodApi.openFoodFactsByBarcode(barcode),
    onMutate: () => {
      setStatus("looking");
      setMessage(null);
    },
    onSuccess: (data) => {
      setStatus("done");
      if (data.existing_product) {
        const q = parseFloat(quantity.replace(",", ".")) || 100;
        setLastProductName(data.existing_product.name);
        onAddExisting(data.existing_product, mealType, q);
        return;
      }
      const preview =
        data.preview ??
        (data.product
          ? {
              name: data.product.name,
              external_id: data.product.barcode ?? null,
              protein: data.product.protein ?? 0,
              fat: data.product.fat ?? 0,
              carbs: data.product.carbs ?? 0,
              fiber_g: data.product.fiber ?? 0,
              calories: data.product.calories ?? 0,
              is_alcohol: false,
            }
          : null);
      if (data.found && preview) {
        const q = parseFloat(quantity.replace(",", ".")) || 100;
        setLastProductName(preview.name);
        onCreateNew(preview, mealType, q);
        return;
      }
      setMessage(
        data.message ?? "Продукт не найден. Заполните вручную или попробуйте другой штрихкод.",
      );
      pausedRef.current = false;
      setStatus("scanning");
    },
    onError: (err) => {
      const msg = parseApiError(err);
      setMessage(msg);
      pausedRef.current = false;
      setStatus("scanning");
      if (getApiStatus(err) === 429) {
        showToast(msg, "error");
      }
    },
  });

  const runLookup = useCallback(
    (raw: string) => {
      const code = normalizeBarcode(raw);
      if (code.length < 8 || code.length > 14) {
        setMessage("Штрихкод: от 8 до 14 цифр");
        return;
      }
      const now = Date.now();
      if (code === lastCodeRef.current && now - lastAtRef.current < 2500) {
        return;
      }
      if (pausedRef.current || lookupMut.isPending) return;

      lastCodeRef.current = code;
      lastAtRef.current = now;
      pausedRef.current = true;
      lookupMut.mutate(code);
    },
    [lookupMut],
  );

  const handleDetected = useCallback(
    (code: string) => {
      if (status === "looking") return;
      runLookup(code);
    },
    [runLookup, status],
  );

  useEffect(() => {
    return () => {
      pausedRef.current = true;
    };
  }, []);

  const cameraActive = status === "scanning" && !lookupMut.isPending;

  return (
    <ModalShell
      open
      onClose={onClose}
      title="Сканер штрихкода"
      size={MEAL_MODAL_SIZE_COMPACT}
      className={MEAL_MODAL_PANEL_CLASS}
      zIndex={55}
    >
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm block">
            Приём пищи
            <select
              className="input-field mt-1 w-full"
              value={mealType}
              onChange={(e) => setMealType(e.target.value as MealType)}
            >
              {MEAL_TYPE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm block">
            Грамм
            <input
              type="number"
              min={1}
              step={1}
              className="input-field mt-1 w-full"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </label>
        </div>

        <Suspense
          fallback={
            <div className="flex items-center justify-center rounded-xl bg-black/80 aspect-[4/3] max-h-64">
              <Loader label="Камера…" />
            </div>
          }
        >
          <BarcodeCameraView active={cameraActive} onDetected={handleDetected} />
        </Suspense>

        {lookupMut.isPending && (
          <p className="text-sm text-center text-[rgb(var(--app-text-muted))]">
            <ScanLine className="inline h-4 w-4 mr-1 animate-pulse" />
            Поиск продукта…
          </p>
        )}

        {lastProductName && lookupMut.isSuccess && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300 text-center">
            {lastProductName}
          </p>
        )}

        {message && <ErrorAlert message={message} />}

        <div className="border-t border-[rgb(var(--app-border)/0.5)] pt-3">
          <p className="text-xs text-[rgb(var(--app-text-muted))] mb-2">
            Нет камеры или не сканируется — введите код вручную:
          </p>
          <div className="flex gap-2">
            <input
              className="input-field flex-1"
              inputMode="numeric"
              placeholder="4607019751002"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
            />
            <button
              type="button"
              className="btn-primary shrink-0"
              disabled={lookupMut.isPending}
              onClick={() => runLookup(manualCode)}
            >
              Найти
            </button>
          </div>
        </div>

        <p className="text-xs text-[rgb(var(--app-text-muted))]">
          Для камеры нужен HTTPS или localhost. Держите штрихкод в рамке.
        </p>

        <div className="flex justify-end pt-1">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Закрыть
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
