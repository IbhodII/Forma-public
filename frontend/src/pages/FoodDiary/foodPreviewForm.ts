import {
  calcMacroCalories,
  type FoodProduct,
  type OpenFoodFactsPreview,
  type OpenFoodFactsProductSummary,
} from "../../api/food";
import {
  MICRO_NUTRIENTS,
  type MicroNutrientKey,
} from "../../shared/microNutrients";

export type MicroFormState = Partial<Record<MicroNutrientKey, string>>;

export function previewToMicroStrings(
  preview: OpenFoodFactsPreview,
): MicroFormState {
  const out: MicroFormState = {};
  for (const n of MICRO_NUTRIENTS) {
    const val = preview[n.key];
    if (val != null && val > 0) {
      out[n.key] = String(val);
    }
  }
  return out;
}

export function hasAnyMicro(preview: OpenFoodFactsPreview): boolean {
  return MICRO_NUTRIENTS.some((n) => (preview[n.key] ?? 0) > 0);
}

/** OFF preview with name and at least one macro/calorie value. */
export function isUsableOffPreview(
  preview: Pick<
    OpenFoodFactsPreview | OpenFoodFactsProductSummary,
    "name" | "protein" | "fat" | "carbs" | "calories"
  >,
): boolean {
  const name = String(preview.name ?? "").trim();
  if (!name) return false;
  const protein = Number(preview.protein) || 0;
  const fat = Number(preview.fat) || 0;
  const carbs = Number(preview.carbs) || 0;
  const calories = Number(preview.calories) || 0;
  return calories > 0 || protein > 0 || fat > 0 || carbs > 0;
}

export function isUsableOffSummary(summary: OpenFoodFactsProductSummary): boolean {
  return isUsableOffPreview(summary);
}

export type PreviewFormFields = {
  name: string;
  protein: string;
  fat: string;
  carbs: string;
  fiber: string;
  calories: string;
  autoKcal: boolean;
  isAlcohol: boolean;
  externalId?: string;
  defaultPortion: string;
  micros: MicroFormState;
  microsOpen: boolean;
};

export function summaryToPreview(
  summary: OpenFoodFactsProductSummary,
): OpenFoodFactsPreview {
  return {
    name: summary.name,
    external_id: summary.barcode ?? null,
    protein: summary.protein ?? 0,
    fat: summary.fat ?? 0,
    carbs: summary.carbs ?? 0,
    fiber_g: summary.fiber ?? 0,
    calories: summary.calories ?? 0,
    is_alcohol: false,
  };
}

export function productToMicroStrings(product: FoodProduct): MicroFormState {
  const out: MicroFormState = {};
  for (const n of MICRO_NUTRIENTS) {
    const val = product[n.key];
    if (val != null && val > 0) {
      out[n.key] = String(val);
    }
  }
  return out;
}

export function hasAnyMicroOnProduct(product: FoodProduct): boolean {
  return MICRO_NUTRIENTS.some((n) => (product[n.key] ?? 0) > 0);
}

export function fieldsFromOpenFoodFactsPreview(
  preview: OpenFoodFactsPreview,
): PreviewFormFields {
  return {
    name: preview.name,
    protein: String(preview.protein),
    fat: String(preview.fat),
    carbs: String(preview.carbs),
    fiber: String(preview.fiber_g ?? 0),
    calories: String(preview.calories),
    autoKcal: false,
    isAlcohol: preview.is_alcohol ?? false,
    externalId: preview.external_id ?? undefined,
    defaultPortion: "",
    micros: previewToMicroStrings(preview),
    microsOpen: hasAnyMicro(preview),
  };
}

export function fieldsFromFoodProduct(product: FoodProduct): PreviewFormFields {
  const calcKcal = calcMacroCalories(product.protein, product.fat, product.carbs);
  const denom = Math.max(calcKcal, product.calories, 1);
  const autoKcal = Math.abs(product.calories - calcKcal) / denom <= 0.1;
  return {
    name: product.name,
    protein: String(product.protein),
    fat: String(product.fat),
    carbs: String(product.carbs),
    fiber: String(product.fiber_g ?? 0),
    calories: autoKcal ? "" : String(product.calories),
    autoKcal,
    isAlcohol: product.is_alcohol ?? false,
    externalId: product.external_id ?? undefined,
    defaultPortion:
      product.default_portion_g != null && product.default_portion_g > 0
        ? String(product.default_portion_g)
        : "",
    micros: productToMicroStrings(product),
    microsOpen: hasAnyMicroOnProduct(product),
  };
}
