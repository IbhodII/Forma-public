import { apiClient } from "./client";

export type MealType = "breakfast1" | "breakfast2" | "lunch" | "dinner" | "snack";

/** Устаревшее значение API/БД до миграции v17 */
export type LegacyMealType = MealType | "breakfast";
export type FoodPhase = "cut" | "bulk";

/** Текст detail при POST /food/products, если имя уже занято. */
export const FOOD_PRODUCT_EXISTS_DETAIL = "Product already exists";
export const FOOD_PRODUCT_BARCODE_EXISTS_DETAIL =
  "Product with this barcode already exists";

export function formatProductExistsMessage(detail: string): string {
  if (detail === FOOD_PRODUCT_EXISTS_DETAIL) {
    return "Продукт с таким названием уже есть в справочнике.";
  }
  if (detail === FOOD_PRODUCT_BARCODE_EXISTS_DETAIL) {
    return "Продукт с этим штрихкодом уже есть в справочнике.";
  }
  return detail;
}

export interface FoodProductMicroFields {
  vitamin_c_mg?: number;
  vitamin_d_mcg?: number;
  vitamin_b12_mcg?: number;
  calcium_mg?: number;
  iron_mg?: number;
  magnesium_mg?: number;
  zinc_mg?: number;
  potassium_mg?: number;
  sodium_mg?: number;
}

export interface FoodProduct extends FoodProductMicroFields {
  id: number;
  name: string;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  fiber_g: number;
  unit: string;
  is_composite: boolean;
  is_alcohol: boolean;
  external_id?: string | null;
  default_portion_g?: number | null;
}

export interface OpenFoodFactsPreview extends FoodProductMicroFields {
  name: string;
  external_id?: string | null;
  brand?: string | null;
  image_url?: string | null;
  protein: number;
  fat: number;
  carbs: number;
  fiber_g: number;
  calories: number;
  is_alcohol: boolean;
}

/** Краткая сводка из API (by-barcode product / search items). */
export interface OpenFoodFactsProductSummary {
  name: string;
  barcode?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  fiber?: number | null;
}

export interface OpenFoodFactsBarcodeResponse {
  found: boolean;
  barcode?: string | null;
  source: "local" | "cache" | "api" | "none";
  message?: string | null;
  product?: OpenFoodFactsProductSummary | null;
  preview?: OpenFoodFactsPreview | null;
  existing_product?: FoodProduct | null;
  local_name_matches: FoodProduct[];
}

export interface OpenFoodFactsSearchResponse {
  found: boolean;
  source: "cache" | "api" | "none";
  message?: string | null;
  items: OpenFoodFactsProductSummary[];
  local_matches: FoodProduct[];
}

export interface MicroNutrientRow {
  key: string;
  label: string;
  unit: string;
  consumed: number;
  goal: number;
  daily_goal?: number | null;
  percent: number | null;
  has_data: boolean;
}

export interface MicrosDayResponse {
  date: string;
  phase: FoodPhase;
  nutrients: MicroNutrientRow[];
  has_entries: boolean;
  has_any_micro_data: boolean;
}

export interface MicrosWeekResponse {
  anchor_date: string;
  week_start: string;
  week_end: string;
  phase: FoodPhase;
  nutrients: MicroNutrientRow[];
  has_entries: boolean;
  has_any_micro_data: boolean;
  days_with_entries: number;
}

export interface MicroGoalItem {
  key: string;
  label: string;
  unit: string;
  goal: number;
}

export interface MicroGoalsResponse {
  nutrients: MicroGoalItem[];
  goals: Record<string, number>;
}

export type MicroGoalsSavePayload = {
  goals: Record<string, number | null>;
};

export interface FoodEntry {
  id: number;
  date: string;
  phase: FoodPhase;
  product_id: number;
  product_name: string;
  quantity: number;
  meal_type: MealType;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  fiber: number;
  is_alcohol: boolean;
  notes?: string | null;
}

export interface MacroTotals {
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  fiber: number;
}

export interface NutritionGoals {
  date: string;
  phase: FoodPhase;
  protein_goal?: number | null;
  fat_goal?: number | null;
  carbs_goal?: number | null;
  calories_goal?: number | null;
}

export interface GoalPercents {
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  calories?: number | null;
}

export interface ExpenditureInfo {
  bmr: number | null;
  cardio_kcal: number;
  strength_kcal: number;
  workout_kcal: number;
  activity_kcal: number;
  tef_kcal: number;
  total_burn: number | null;
  balance: number | null;
  bmr_available: boolean;
  bmr_note?: string | null;
  sex_used: string;
  weight_kg?: number | null;
  height_cm?: number | null;
  age_years?: number | null;
}

export interface TefInfo {
  base_calories: number;
  tef_kcal: number;
  net_calories: number;
  protein_tef: number;
  fat_tef: number;
  carbs_tef: number;
}

export interface MacroCalorieShare {
  key: string;
  label: string;
  grams: number;
  kcal: number;
  percent: number;
}

export interface PerKgMacro {
  key: string;
  label: string;
  current_g_per_kg: number | null;
  target_g_per_kg: number | null;
  status: "ok" | "low" | "high" | "unknown" | string;
}

export interface NutritionInsights {
  tef: TefInfo;
  tef_help?: import("../modules/nutrition/analytics/types").TefHelp | null;
  macro_calorie_shares: MacroCalorieShare[];
  per_kg: PerKgMacro[];
}

export interface BodyNutritionSummary {
  weight_kg: number | null;
  body_fat_percent: number | null;
  lean_mass_kg: number | null;
  goal_label: string;
  phase: FoodPhase;
}

export interface DayExpenditureBreakdown {
  date: string;
  bmr: number | null;
  activity_kcal: number;
  workout_kcal: number;
  tef_kcal: number;
  total_out_kcal: number | null;
  intake_kcal: number;
  balance_kcal: number | null;
}

export interface WeekExpenditureTotals {
  bmr: number;
  activity_kcal: number;
  workout_kcal: number;
  tef_kcal: number;
  total_out_kcal: number;
  intake_kcal: number;
  balance_kcal: number;
}

export interface DailyFiberTarget {
  recommended_grams: number;
  current_grams?: number | null;
}

export interface FoodDayResponse {
  date: string;
  phase: FoodPhase;
  entries: FoodEntry[];
  by_meal: Record<MealType, FoodEntry[]>;
  by_meal_totals: Partial<Record<MealType, MacroTotals>>;
  daily_totals: MacroTotals;
  alcohol_calories?: number;
  goals: NutritionGoals | null;
  goal_percent: GoalPercents | null;
  expenditure: ExpenditureInfo;
  body_summary: BodyNutritionSummary;
  insights: NutritionInsights;
  daily_fiber_target?: DailyFiberTarget;
  current_fiber?: number;
  suggested_meal_plan_id?: number | null;
  suggested_meal_plan_name?: string | null;
  suggested_plan_reason?: string | null;
}

export type FoodEntryPayload = {
  date: string;
  phase: FoodPhase;
  product_id: number;
  quantity: number;
  meal_type: MealType;
  notes?: string | null;
};

export type FoodEntryUpdatePayload = {
  product_id?: number;
  quantity?: number;
  meal_type?: MealType;
  notes?: string | null;
};

export type GoalsPayload = {
  protein_goal?: number | null;
  fat_goal?: number | null;
  carbs_goal?: number | null;
  calories_goal?: number | null;
};

export type FoodCompositePayload = {
  name: string;
  components: { product_id: number; quantity_g: number }[];
  total_weight_g?: number;
};

export type FoodCompositeUpdatePayload = {
  name?: string;
  components: { product_id: number; quantity_g: number }[];
  total_weight_g?: number;
};

export interface FoodCompositeComponentDetail {
  product_id: number;
  product_name: string;
  quantity_g: number;
}

export interface FoodProductDetail extends FoodProduct {
  components?: FoodCompositeComponentDetail[];
}

export type FoodProductCreatePayload = {
  name: string;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber_g?: number;
  calories?: number;
  is_alcohol?: boolean;
  external_id?: string | null;
  components?: { product_id: number; quantity: number }[];
  total_weight_g?: number;
  default_portion_g?: number | null;
} & FoodProductMicroFields;

export type FoodProductUpdatePayload = {
  name?: string;
  protein?: number;
  fat?: number;
  carbs?: number;
  fiber_g?: number;
  calories?: number;
  is_alcohol?: boolean;
  external_id?: string | null;
  default_portion_g?: number | null;
} & Partial<FoodProductMicroFields>;

export interface FoodWeekDaySummary {
  date: string;
  daily_totals: MacroTotals;
  is_sunday: boolean;
  expenditure?: DayExpenditureBreakdown | null;
}

export type {
  WeekNutritionAnalytics,
  HealthWarning,
  BodyFatScale,
} from "../modules/nutrition/analytics/types";

import type { WeekNutritionAnalytics } from "../modules/nutrition/analytics/types";

export interface FoodWeekResponse {
  week_start: string;
  week_end: string;
  week_number: number;
  phase: FoodPhase;
  days: FoodWeekDaySummary[];
  week_totals: MacroTotals;
  alcohol_calories?: number;
  week_daily_average: MacroTotals;
  body_summary: BodyNutritionSummary;
  insights: NutritionInsights;
  expenditure_by_day: DayExpenditureBreakdown[];
  week_expenditure_totals: WeekExpenditureTotals;
  analytics?: WeekNutritionAnalytics | null;
  daily_fiber_target?: DailyFiberTarget;
  current_fiber?: number;
}

export interface MealTemplateSummary {
  id: number;
  name: string;
  meal_type: MealType;
  phase: FoodPhase;
  items_count: number;
}

export interface MealTemplateItem {
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface MealTemplateDetail {
  id: number;
  name: string;
  meal_type: MealType;
  phase: FoodPhase;
  items: MealTemplateItem[];
}

export type MealTemplateUpdatePayload = {
  name?: string;
  items?: { product_id: number; quantity: number }[];
};

export interface ApplyTemplatePayload {
  template_id: number;
  date: string;
  phase: FoodPhase;
  meal_type?: MealType;
}

export interface ApplyTemplateResponse {
  added: number;
  entries: FoodEntry[];
  meal_type: MealType;
  template_name: string;
}

export interface MealPlanSummary {
  id: number;
  name: string;
  phase: FoodPhase;
  description?: string | null;
  meals_count: number;
  is_custom?: boolean;
  is_weekly?: boolean;
  uses_templates?: boolean;
}

export interface MealPlanItem {
  product_id: number;
  product_name: string;
  quantity: number;
}

export interface MealPlanMeal {
  meal_type: MealType;
  items: MealPlanItem[];
}

export interface MealPlanDay {
  day_offset: number;
  meals: MealPlanMeal[];
}

export interface MealPlanDetail {
  id: number;
  name: string;
  phase: FoodPhase;
  description?: string | null;
  is_custom?: boolean;
  is_weekly?: boolean;
  uses_templates?: boolean;
  days: MealPlanDay[];
  templates: {
    template_id: number;
    template_name: string;
    meal_type: MealType;
    sort_order: number;
    items_count: number;
  }[];
}

export type MealPlanItemPayload = {
  product_id: number;
  quantity: number;
};

export type MealPlanMealPayload = {
  meal_type: MealType;
  items: MealPlanItemPayload[];
};

export type MealPlanDayPayload = {
  day_offset: number;
  meals: MealPlanMealPayload[];
};

export type MealPlanCreatePayload = {
  name: string;
  phase: FoodPhase;
  description?: string | null;
  is_weekly?: boolean;
  days: MealPlanDayPayload[];
  template_ids?: number[];
};

export type MealPlanUpdatePayload = {
  name?: string;
  description?: string | null;
  is_weekly?: boolean;
  days?: MealPlanDayPayload[];
  template_ids?: number[];
};

export interface ApplyMealPlanRangePayload {
  start_date: string;
  end_date?: string | null;
  phase: FoodPhase;
  overwrite?: boolean;
}

export interface WeeklyScheduleItem {
  day_of_week: number;
  meal_plan_id: number | null;
  meal_plan_name?: string | null;
}

export type WeeklyScheduleSavePayload = {
  days: { day_of_week: number; meal_plan_id: number | null }[];
};

export interface ApplyMealPlanPayload {
  plan_id: number;
  date: string;
  phase: FoodPhase;
  apply_week?: boolean;
  replace_existing?: boolean;
}

export interface ApplyMealPlanResponse {
  plan_id: number;
  plan_name: string;
  date: string;
  phase: FoodPhase;
  apply_week?: boolean;
  week_start?: string | null;
  week_end?: string | null;
  days_cleared?: number;
  total_added: number;
  meals?: { template_id: number; template_name: string; meal_type: MealType; added: number }[];
  days?: { date: string; added: number }[];
  entries: FoodEntry[];
  week_stats?: FoodWeekResponse | null;
}

export const STANDARD_MEAL_PLAN_NAMES: Record<FoodPhase, string> = {
  cut: "Стандартная сушка",
  bulk: "Стандартный набор",
};

export const foodApi = {
  getProducts: async (q?: string) => {
    const { data } = await apiClient.get<FoodProduct[]>("/food/products", {
      params: q ? { q } : {},
    });
    return data;
  },
  openFoodFactsByBarcode: async (barcode: string) => {
    const { data } = await apiClient.get<OpenFoodFactsBarcodeResponse>(
      "/food/openfoodfacts/by-barcode",
      { params: { barcode } },
    );
    return data;
  },
  openFoodFactsSearch: async (query: string) => {
    const { data } = await apiClient.get<OpenFoodFactsSearchResponse>(
      "/food/openfoodfacts/search",
      { params: { query } },
    );
    return data;
  },
  getDay: async (date: string, phase: FoodPhase) => {
    const { data } = await apiClient.get<FoodDayResponse>("/food/entries", {
      params: { date, phase },
    });
    return data;
  },
  getWeek: async (date: string, phase: FoodPhase) => {
    const { data } = await apiClient.get<FoodWeekResponse>("/food/entries/week", {
      params: { date, phase },
    });
    return data;
  },
  clearDay: async (date: string, phase: FoodPhase) => {
    const { data } = await apiClient.delete<{ deleted: number; date: string; phase: FoodPhase }>(
      "/food/entries",
      { params: { date, phase } },
    );
    return data;
  },
  addEntry: async (entry: FoodEntryPayload) => {
    const { data } = await apiClient.post<FoodEntry>("/food/entries", entry);
    return data;
  },
  updateEntry: async (id: number, entry: FoodEntryUpdatePayload) => {
    const { data } = await apiClient.put<FoodEntry>(`/food/entries/${id}`, entry);
    return data;
  },
  deleteEntry: async (id: number) => {
    await apiClient.delete(`/food/entries/${id}`);
  },
  getGoals: async (date: string, phase: FoodPhase) => {
    const { data } = await apiClient.get<NutritionGoals | null>(`/food/goals/${date}`, {
      params: { phase },
    });
    return data;
  },
  saveGoals: async (date: string, phase: FoodPhase, goals: GoalsPayload) => {
    const { data } = await apiClient.post<NutritionGoals>(`/food/goals/${date}`, goals, {
      params: { phase },
    });
    return data;
  },
  createProduct: async (body: FoodProductCreatePayload) => {
    const { data } = await apiClient.post<FoodProduct>("/food/products", body);
    return data;
  },
  updateProduct: async (id: number, body: FoodProductUpdatePayload) => {
    const { data } = await apiClient.put<FoodProduct>(`/food/products/${id}`, body);
    return data;
  },
  createCompositeProduct: async (body: FoodCompositePayload) => {
    const { data } = await apiClient.post<FoodProduct>("/food/composite", body);
    return data;
  },
  getProduct: async (id: number, includeComponents = false) => {
    const { data } = await apiClient.get<FoodProductDetail>(`/food/products/${id}`, {
      params: includeComponents ? { include_components: true } : {},
    });
    return data;
  },
  updateCompositeProduct: async (id: number, body: FoodCompositeUpdatePayload) => {
    const { data } = await apiClient.put<FoodProduct>(`/food/composite/${id}`, body);
    return data;
  },
  getTemplates: async (phase: FoodPhase) => {
    const { data } = await apiClient.get<MealTemplateSummary[]>("/food/templates", {
      params: { phase },
    });
    return data;
  },
  getTemplate: async (templateId: number) => {
    const { data } = await apiClient.get<MealTemplateDetail>(`/food/templates/${templateId}`);
    return data;
  },
  updateTemplate: async (templateId: number, body: MealTemplateUpdatePayload) => {
    const { data } = await apiClient.put<MealTemplateDetail>(
      `/food/templates/${templateId}`,
      body,
    );
    return data;
  },
  applyTemplate: async (body: ApplyTemplatePayload) => {
    const { data } = await apiClient.post<ApplyTemplateResponse>(
      "/food/entries/from_template",
      body,
    );
    return data;
  },
  getMealPlans: async (phase?: FoodPhase, includeCustom = true) => {
    const { data } = await apiClient.get<MealPlanSummary[]>("/food/meal-plans", {
      params: {
        ...(phase ? { phase } : {}),
        include_custom: includeCustom,
      },
    });
    return data;
  },
  getMealPlan: async (planId: number) => {
    const { data } = await apiClient.get<MealPlanDetail>(`/food/meal-plans/${planId}`);
    return data;
  },
  createMealPlan: async (body: MealPlanCreatePayload) => {
    const { data } = await apiClient.post<MealPlanDetail>("/food/meal-plans", body);
    return data;
  },
  updateMealPlan: async (planId: number, body: MealPlanUpdatePayload) => {
    const { data } = await apiClient.put<MealPlanDetail>(`/food/meal-plans/${planId}`, body);
    return data;
  },
  deleteMealPlan: async (planId: number) => {
    const { data } = await apiClient.delete<{ deleted: boolean; id: number; name: string }>(
      `/food/meal-plans/${planId}`,
    );
    return data;
  },
  getWeeklySchedule: async () => {
    const { data } = await apiClient.get<WeeklyScheduleItem[]>("/food/weekly-schedule");
    return data;
  },
  saveWeeklySchedule: async (body: WeeklyScheduleSavePayload) => {
    const { data } = await apiClient.post<WeeklyScheduleItem[]>("/food/weekly-schedule", body);
    return data;
  },
  applyMealPlan: async (body: ApplyMealPlanPayload) => {
    const { data } = await apiClient.post<ApplyMealPlanResponse>(
      "/food/apply-meal-plan",
      {
        apply_week: true,
        replace_existing: true,
        ...body,
      },
    );
    return data;
  },
  applyMealPlanRange: async (planId: number, body: ApplyMealPlanRangePayload) => {
    const { data } = await apiClient.post<ApplyMealPlanResponse>(
      `/food/meal-plans/${planId}/apply`,
      body,
    );
    return data;
  },
  getMicrosDay: async (date: string, phase: FoodPhase) => {
    const { data } = await apiClient.get<MicrosDayResponse>(`/food/micros/day/${date}`, {
      params: { phase },
    });
    return data;
  },
  getMicrosWeek: async (anchorDate: string, phase: FoodPhase) => {
    const { data } = await apiClient.get<MicrosWeekResponse>(`/food/micros/week/${anchorDate}`, {
      params: { phase },
    });
    return data;
  },
  getMicroGoals: async () => {
    const { data } = await apiClient.get<MicroGoalsResponse>("/food/micros/goals");
    return data;
  },
  saveMicroGoals: async (body: MicroGoalsSavePayload) => {
    const { data } = await apiClient.put<MicroGoalsResponse>("/food/micros/goals", body);
    return data;
  },
};

/** Ккал из БЖУ на 100 г (4/9/4). */
export function calcMacroCalories(protein: number, fat: number, carbs: number): number {
  return Math.round((protein * 4 + fat * 9 + carbs * 4) * 10) / 10;
}

export function previewMacros(product: FoodProduct, quantityG: number): MacroTotals {
  const f = Math.max(0, quantityG) / 100;
  if (product.is_alcohol) {
    const calories =
      product.calories > 0 ? Math.round(product.calories * f * 10) / 10 : 0;
    return { protein: 0, fat: 0, carbs: 0, calories, fiber: 0 };
  }
  const protein = Math.round(product.protein * f * 10) / 10;
  const fat = Math.round(product.fat * f * 10) / 10;
  const carbs = Math.round(product.carbs * f * 10) / 10;
  const fiber = Math.round((product.fiber_g ?? 0) * f * 10) / 10;
  const calories =
    product.calories > 0
      ? Math.round(product.calories * f * 10) / 10
      : Math.round((protein * 4 + fat * 9 + carbs * 4) * 10) / 10;
  return { protein, fat, carbs, calories, fiber };
}

export function compositePer100(
  components: { product_id: number; quantity_g: number }[],
  products: FoodProduct[],
  totalWeightG?: number,
): MacroTotals | null {
  if (components.length === 0) return null;
  const batch = { protein: 0, fat: 0, carbs: 0, calories: 0, fiber: 0 };
  let componentWeight = 0;
  for (const item of components) {
    const product = products.find((p) => p.id === item.product_id);
    if (!product || item.quantity_g <= 0) return null;
    const part = previewMacros(product, item.quantity_g);
    batch.protein += part.protein;
    batch.fat += part.fat;
    batch.carbs += part.carbs;
    batch.calories += part.calories;
    batch.fiber += part.fiber;
    componentWeight += item.quantity_g;
  }
  const batchWeight = totalWeightG && totalWeightG > 0 ? totalWeightG : componentWeight;
  if (batchWeight <= 0) return null;
  const factor = 100 / batchWeight;
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return {
    protein: round1(batch.protein * factor),
    fat: round1(batch.fat * factor),
    carbs: round1(batch.carbs * factor),
    calories: round1(batch.calories * factor),
    fiber: round1(batch.fiber * factor),
  };
}
