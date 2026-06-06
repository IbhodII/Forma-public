import {apiFetch} from './client';
import {
  dayCacheKey,
  enqueueFoodEntry,
  updateLocalFoodEntry,
  deleteLocalFoodEntry,
  getFoodCache,
  enqueueBraceletCalories,
  getCachedBraceletCalories,
  setFoodCache,
  weekCacheKey,
} from '../database/foodStore';
import {isOnline} from '../services/network';
import {requireOnline} from '../services/onlineOnly';
import {localFirstWrite} from '../sync/localFirstWrite';
import {addDaysIso, getWeekStart} from '../utils/formaWeek';
import type {
  DailyBraceletCalories,
  FoodDayResponse,
  FoodEntry,
  FoodEntryCreatePayload,
  FoodPhase,
  FoodProduct,
  FoodProductCreatePayload,
  OpenFoodFactsBarcodeResponse,
  OpenFoodFactsSearchResponse,
  OpenFoodFactsContributePayload,
  OpenFoodFactsContributeResponse,
  WeekDailyExpenditureResponse,
  FoodWeekResponse,
} from '../types/food';

export async function lookupByBarcode(
  barcode: string,
): Promise<OpenFoodFactsBarcodeResponse> {
  await requireOnline('Поиск по штрихкоду доступен только онлайн');
  const res = await apiFetch(
    `/api/food/openfoodfacts/by-barcode?barcode=${encodeURIComponent(barcode)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function searchOpenFoodFacts(
  query: string,
): Promise<OpenFoodFactsSearchResponse> {
  await requireOnline('Поиск Open Food Facts доступен только онлайн');
  const res = await apiFetch(
    `/api/food/openfoodfacts/search?query=${encodeURIComponent(query)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getProducts(query?: string): Promise<FoodProduct[]> {
  const suffix = query ? `?q=${encodeURIComponent(query)}` : '';
  const res = await apiFetch(`/api/food/products${suffix}`);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getWeekEntries(
  date: string,
  phase: FoodPhase,
): Promise<FoodWeekResponse> {
  const weekStart = getWeekStart(date);
  const cacheKey = weekCacheKey(weekStart, phase);
  const emptyDayTotals = {
    protein: 0,
    fat: 0,
    carbs: 0,
    calories: 0,
    fiber: 0,
  };
  if (await isOnline()) {
    try {
      const res = await apiFetch(
        `/api/food/entries/week?date=${encodeURIComponent(weekStart)}&phase=${phase}`,
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as FoodWeekResponse;
      await setFoodCache(cacheKey, data);
      return data;
    } catch {
      const cached = await getFoodCache<FoodWeekResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }
  }

  const cached = await getFoodCache<FoodWeekResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  // Офлайн fallback: собираем неделю из day-кэша.
  const dayDates = Array.from({length: 7}, (_, i) => addDaysIso(weekStart, i));
  const days = await Promise.all(
    dayDates.map(async dayDate => {
      const dayCache = await getFoodCache<FoodDayResponse>(
        dayCacheKey(dayDate, phase),
      );
      return {
        date: dayDate,
        daily_totals: dayCache?.daily_totals ?? emptyDayTotals,
      };
    }),
  );

  return {
    week_start: weekStart,
    week_end: addDaysIso(weekStart, 6),
    phase,
    days,
  };
}

export async function getDayEntries(
  date: string,
  phase: FoodPhase,
): Promise<FoodDayResponse> {
  const cacheKey = dayCacheKey(date, phase);
  const emptyDailyTotals = {
    protein: 0,
    fat: 0,
    carbs: 0,
    calories: 0,
    fiber: 0,
  };
  if (await isOnline()) {
    try {
      const res = await apiFetch(
        `/api/food/entries?date=${encodeURIComponent(date)}&phase=${phase}`,
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as FoodDayResponse;
      await setFoodCache(cacheKey, data);
      return data;
    } catch {
      const cached = await getFoodCache<FoodDayResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }
  }
  const cached = await getFoodCache<FoodDayResponse>(cacheKey);
  if (cached) {
    return cached;
  }
  return {
    date,
    phase,
    entries: [],
    by_meal: {},
    daily_totals: emptyDailyTotals,
  };
}

export async function addFoodEntry(
  body: FoodEntryCreatePayload,
): Promise<FoodEntry> {
  return localFirstWrite({
    persist: async () => {
      const localId = await enqueueFoodEntry(body, body.phase);
      return {
        id: -localId,
        date: body.date,
        phase: body.phase,
        product_id: body.product_id,
        product_name: 'Сохранено',
        quantity: body.quantity,
        meal_type: body.meal_type,
        protein: 0,
        fat: 0,
        carbs: 0,
        fiber: 0,
        calories: 0,
      } satisfies FoodEntry;
    },
  });
}

export async function updateFoodEntry(
  id: number,
  body: Partial<Pick<FoodEntryCreatePayload, 'product_id' | 'quantity' | 'meal_type'>>,
): Promise<FoodEntry> {
  if (id < 0) {
    return localFirstWrite({
      persist: () => updateLocalFoodEntry(-id, body),
    });
  }
  if (!(await isOnline())) {
    throw new Error('Нет сети — редактирование синхронизированной записи доступно только онлайн');
  }
  const res = await apiFetch(`/api/food/entries/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function deleteFoodEntry(id: number): Promise<void> {
  if (id < 0) {
    await localFirstWrite({
      persist: async () => {
        await deleteLocalFoodEntry(-id);
      },
    });
    return;
  }
  if (!(await isOnline())) {
    throw new Error('Нет сети — удаление синхронизированной записи доступно только онлайн');
  }
  const res = await apiFetch(`/api/food/entries/${id}`, {method: 'DELETE'});
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
}

export async function getWeekExpenditure(
  anchorDate: string,
  phase: FoodPhase,
  preferChest: boolean,
): Promise<WeekDailyExpenditureResponse> {
  if (!(await isOnline())) {
    return {items: []};
  }
  const res = await apiFetch(
    `/api/analytics/daily-expenditure/week?anchor_date=${encodeURIComponent(anchorDate)}&phase=${phase}&prefer_chest=${preferChest}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function getDailyBraceletCalories(
  from: string,
  to: string,
): Promise<DailyBraceletCalories[]> {
  if (!(await isOnline())) {
    return getCachedBraceletCalories(from, to);
  }
  const res = await apiFetch(
    `/api/analytics/daily-bracelet-calories?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.items || [];
}

export async function saveDailyBraceletCalories(
  date: string,
  totalCalories: number,
): Promise<DailyBraceletCalories> {
  return localFirstWrite({
    persist: async () => {
      await enqueueBraceletCalories(date, totalCalories);
      return {date, total_calories: totalCalories};
    },
  });
}

export async function createProduct(
  body: FoodProductCreatePayload,
): Promise<FoodProduct> {
  await requireOnline('Создание продукта на сервере доступно только онлайн');
  const res = await apiFetch('/api/food/products', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function updateProduct(
  id: number,
  body: Partial<FoodProductCreatePayload>,
): Promise<FoodProduct> {
  await requireOnline('Редактирование продукта доступно только онлайн');
  const res = await apiFetch(`/api/food/products/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export type FoodCompositeComponent = {
  product_id: number;
  quantity_g: number;
};

export type FoodCompositePayload = {
  name: string;
  components: FoodCompositeComponent[];
  total_weight_g?: number;
};

export type FoodCompositeUpdatePayload = {
  name?: string;
  components: FoodCompositeComponent[];
  total_weight_g?: number;
};

export type FoodProductDetail = FoodProduct & {
  components?: Array<{
    product_id: number;
    product_name: string;
    quantity_g: number;
  }>;
};

export async function getProduct(id: number, includeComponents = false): Promise<FoodProductDetail> {
  await requireOnline();
  const sp = includeComponents ? '?include_components=true' : '';
  const res = await apiFetch(`/api/food/products/${id}${sp}`);
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function createCompositeProduct(body: FoodCompositePayload): Promise<FoodProduct> {
  await requireOnline();
  const res = await apiFetch('/api/food/composite', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function updateCompositeProduct(
  id: number,
  body: FoodCompositeUpdatePayload,
): Promise<FoodProduct> {
  await requireOnline();
  const res = await apiFetch(`/api/food/composite/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}

export async function contributeToOpenFoodFacts(
  body: OpenFoodFactsContributePayload,
): Promise<OpenFoodFactsContributeResponse> {
  await requireOnline();
  const res = await apiFetch('/api/food/openfoodfacts/contribute', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}

export async function offContributeConfigured(): Promise<boolean> {
  if (!(await isOnline())) {
    return false;
  }
  const res = await apiFetch('/api/food/openfoodfacts/contribute/status');
  if (!res.ok) {
    return false;
  }
  const data = await res.json();
  return Boolean(data.configured);
}

export type MicroNutrientRow = {
  key: string;
  label: string;
  unit: string;
  consumed: number | null;
  goal: number;
  percent: number | null;
  has_data: boolean;
};

export type MicrosWeekResponse = {
  week_start: string;
  week_end: string;
  phase: FoodPhase;
  days: Array<{date: string; nutrients: MicroNutrientRow[]}>;
};

export type MealPlanSummary = {
  id: number;
  name: string;
  phase: FoodPhase;
  description?: string | null;
  meals_count?: number;
  is_custom?: boolean;
  is_weekly?: boolean;
  uses_templates?: boolean;
};

export type MealPlanItemPayload = {
  product_id: number;
  quantity: number;
};

export type MealPlanDayPayload = {
  day_offset: number;
  meals: Array<{
    meal_type: string;
    items: MealPlanItemPayload[];
  }>;
};

export type MealPlanCreatePayload = {
  name: string;
  phase: FoodPhase;
  description?: string | null;
  is_weekly?: boolean;
  days: MealPlanDayPayload[];
};

export type MealPlanDetail = MealPlanSummary & {
  days: Array<{
    day_offset: number;
    meals: Array<{
      meal_type: string;
      items: Array<{product_id: number; product_name?: string; quantity: number}>;
    }>;
  }>;
  templates: Array<{
    template_id: number;
    template_name: string;
    meal_type: string;
    sort_order: number;
    items_count: number;
  }>;
};

export type MealTemplateDetail = {
  id: number;
  name: string;
  meal_type: string;
  phase: FoodPhase;
  items: Array<{product_id: number; product_name: string; quantity: number}>;
};

export type WeeklyScheduleItem = {
  day_of_week: number;
  meal_plan_id: number | null;
  meal_plan_name?: string | null;
};

export async function fetchMicrosWeek(anchorDate: string, phase: FoodPhase) {
  const weekStart = getWeekStart(anchorDate);
  const cacheKey = `micros-week:${weekStart}:${phase}`;
  if (await isOnline()) {
    try {
      const res = await apiFetch(
        `/api/food/micros/week/${encodeURIComponent(weekStart)}?phase=${phase}`,
      );
      if (!res.ok) {
        throw new Error(await res.text());
      }
      const data = (await res.json()) as MicrosWeekResponse;
      await setFoodCache(cacheKey, data);
      return data;
    } catch {
      const cached = await getFoodCache<MicrosWeekResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }
  }
  return (
    (await getFoodCache<MicrosWeekResponse>(cacheKey)) ?? {
      week_start: weekStart,
      week_end: addDaysIso(weekStart, 6),
      phase,
      days: [],
    }
  );
}

export async function fetchMealPlans() {
  if (!(await isOnline())) {
    return [] as MealPlanSummary[];
  }
  const res = await apiFetch('/api/food/meal-plans');
  return jsonOrThrow<MealPlanSummary[]>(res);
}

export async function fetchMealPlan(planId: number) {
  await requireOnline();
  const res = await apiFetch(`/api/food/meal-plans/${planId}`);
  return jsonOrThrow<MealPlanDetail>(res);
}

export async function createMealPlan(body: MealPlanCreatePayload) {
  await requireOnline();
  const res = await apiFetch('/api/food/meal-plans', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<MealPlanDetail>(res);
}

export async function updateMealPlan(planId: number, body: MealPlanCreatePayload) {
  await requireOnline();
  const res = await apiFetch(`/api/food/meal-plans/${planId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<MealPlanDetail>(res);
}

export async function deleteMealPlan(planId: number) {
  await requireOnline();
  const res = await apiFetch(`/api/food/meal-plans/${planId}`, {method: 'DELETE'});
  return jsonOrThrow<{deleted: boolean; id: number; name: string}>(res);
}

export async function fetchMealTemplate(templateId: number) {
  await requireOnline();
  const res = await apiFetch(`/api/food/templates/${templateId}`);
  return jsonOrThrow<MealTemplateDetail>(res);
}

export async function updateMealTemplate(
  templateId: number,
  body: {items: MealPlanItemPayload[]},
) {
  await requireOnline();
  const res = await apiFetch(`/api/food/templates/${templateId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  return jsonOrThrow<MealTemplateDetail>(res);
}

export async function fetchWeeklySchedule() {
  if (!(await isOnline())) {
    return [] as WeeklyScheduleItem[];
  }
  const res = await apiFetch('/api/food/weekly-schedule');
  return jsonOrThrow<WeeklyScheduleItem[]>(res);
}

export async function saveWeeklySchedule(
  days: Array<{day_of_week: number; meal_plan_id: number | null}>,
) {
  await requireOnline();
  const res = await apiFetch('/api/food/weekly-schedule', {
    method: 'POST',
    body: JSON.stringify({days}),
  });
  return jsonOrThrow<WeeklyScheduleItem[]>(res);
}

export async function applyMealPlanToDay(body: {
  plan_id: number;
  date: string;
  phase: FoodPhase;
  replace_existing?: boolean;
}) {
  await requireOnline();
  const res = await apiFetch('/api/food/apply-meal-plan', {
    method: 'POST',
    body: JSON.stringify({
      plan_id: body.plan_id,
      date: body.date,
      phase: body.phase,
      apply_week: false,
      replace_existing: body.replace_existing ?? true,
    }),
  });
  return jsonOrThrow<{total_added: number; plan_name: string}>(res);
}

async function jsonOrThrow<T>(res: Response): Promise<T> {
  if (!res.ok) {
    throw new Error(await res.text());
  }
  return res.json();
}
