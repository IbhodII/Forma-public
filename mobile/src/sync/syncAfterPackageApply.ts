import {cacheBodyMetricRow} from '../database/bodyStore';
import {executeSql} from '../database/index';
import {refreshFoodDayCacheFromEntries} from '../database/foodStore';
import type {BodyMetricRow} from '../types/body';
import type {FoodPhase} from '../types/food';

/**
 * After FormaSync download, UI reads food_cache / body_metrics_cache while
 * packageApplier writes food_entries / body_metrics — refresh caches here.
 */
export async function syncAfterPackageApply(): Promise<void> {
  const foodRs = await executeSql(
    'SELECT DISTINCT date, phase FROM food_entries WHERE deleted = 0',
  );
  for (let i = 0; i < foodRs.rows.length; i++) {
    const row = foodRs.rows.item(i);
    await refreshFoodDayCacheFromEntries(
      row.date as string,
      row.phase as FoodPhase,
    );
  }

  const bodyRs = await executeSql(
    'SELECT DISTINCT date, payload_json FROM body_metrics WHERE deleted = 0',
  );
  for (let i = 0; i < bodyRs.rows.length; i++) {
    const row = bodyRs.rows.item(i);
    try {
      const payload = JSON.parse(row.payload_json as string) as Record<string, unknown>;
      const metric: BodyMetricRow = {
        date: String(row.date).slice(0, 10),
        weight_kg: (payload.weight_kg as number) ?? null,
        body_fat_percent: (payload.body_fat_percent as number) ?? null,
        muscle_mass_kg: (payload.muscle_mass_kg as number) ?? null,
      };
      await cacheBodyMetricRow(metric);
    } catch {
      // skip corrupt payloads
    }
  }
}
