import type {FoodDayResponse, FoodPhase} from '../types/food';
import {getDayEntries as apiGetDayEntries} from '../api/food';
import {dayCacheKey, getFoodCache} from '../database/foodStore';
import {requiresPcApi, type OperatingMode} from '../mode/operatingMode';

export async function getFoodDayLocalFirst(
  date: string,
  phase: FoodPhase,
  opts: {mode: OperatingMode; apiReachable: boolean},
): Promise<FoodDayResponse> {
  const cacheKey = dayCacheKey(date, phase);
  const empty: FoodDayResponse = {
    date,
    phase,
    entries: [],
    by_meal: {},
    daily_totals: {protein: 0, fat: 0, carbs: 0, calories: 0, fiber: 0},
  };

  if (!requiresPcApi(opts.mode)) {
    return (await getFoodCache<FoodDayResponse>(cacheKey)) ?? empty;
  }

  if (opts.apiReachable) {
    return apiGetDayEntries(date, phase);
  }

  return (await getFoodCache<FoodDayResponse>(cacheKey)) ?? empty;
}
