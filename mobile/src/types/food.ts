export interface FoodProduct {
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
}

export type FoodPhase = 'cut' | 'bulk';

export type MacroTotals = {
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  fiber: number;
};

export interface OpenFoodFactsPreview {
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

export interface OpenFoodFactsBarcodeResponse {
  found: boolean;
  barcode?: string | null;
  source: string;
  message?: string | null;
  preview?: OpenFoodFactsPreview | null;
  existing_product?: FoodProduct | null;
  local_name_matches: FoodProduct[];
}

export interface OpenFoodFactsSearchItem {
  name: string;
  barcode?: string | null;
  calories?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  fiber?: number | null;
}

export interface OpenFoodFactsSearchResponse {
  found: boolean;
  source: string;
  message?: string | null;
  items: OpenFoodFactsSearchItem[];
  local_matches: FoodProduct[];
}

export interface FoodProductCreatePayload {
  name: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber_g: number;
  calories?: number;
  is_alcohol?: boolean;
  external_id?: string;
  contribute_to_openfoodfacts?: boolean;
  brand?: string;
}

export interface OpenFoodFactsContributePayload {
  barcode: string;
  name: string;
  brand?: string;
  protein: number;
  fat: number;
  carbs: number;
  fiber_g: number;
  calories: number;
}

export interface OpenFoodFactsContributeResponse {
  ok: boolean;
  message: string;
  barcode?: string;
}

export interface FoodEntry {
  id: number;
  date: string;
  phase: FoodPhase;
  product_id: number;
  product_name: string;
  quantity: number;
  meal_type: string;
  protein: number;
  fat: number;
  carbs: number;
  calories: number;
  fiber: number;
}

export interface FoodEntryCreatePayload {
  date: string;
  phase: FoodPhase;
  product_id: number;
  quantity: number;
  meal_type: string;
}

export interface FoodDayResponse {
  date: string;
  phase: FoodPhase;
  entries: FoodEntry[];
  by_meal: Record<string, FoodEntry[]>;
  daily_totals: MacroTotals;
}

export interface FoodWeekDaySummary {
  date: string;
  daily_totals: MacroTotals;
}

export interface FoodWeekResponse {
  week_start: string;
  week_end: string;
  phase: FoodPhase;
  days: FoodWeekDaySummary[];
}

export interface DailyExpenditureItem {
  date: string;
  total_expenditure: number | null;
}

export interface WeekDailyExpenditureResponse {
  items: DailyExpenditureItem[];
}

export interface DailyBraceletCalories {
  date: string;
  total_calories: number;
}
