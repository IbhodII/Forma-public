import type { CardioAvailability, CardioAvailabilityItem } from "../types";

export function buildAvailabilityMap(
  data: CardioAvailability | undefined,
): Map<number, CardioAvailabilityItem> {
  const map = new Map<number, CardioAvailabilityItem>();
  if (!data) return map;

  if (data.items?.length) {
    for (const item of data.items) {
      map.set(item.id, item);
    }
    return map;
  }

  const hr = new Set(data.heart_rate_ids);
  const gps = new Set(data.gps_ids);
  const sensors = new Set(data.sensor_ids ?? []);
  for (const id of new Set([...hr, ...gps, ...sensors])) {
    map.set(id, {
      id,
      has_hr: hr.has(id),
      has_gps: gps.has(id),
      has_sensors: sensors.has(id),
    });
  }
  return map;
}

export function emptyAvailabilityItem(id: number): CardioAvailabilityItem {
  return { id, has_hr: false, has_gps: false, has_sensors: false };
}
