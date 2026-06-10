/** Formatting helpers */

export function formatDateRu(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  if (!y || !m || !d) return iso;
  return `${d}.${m}.${y}`;
}

export function formatDuration(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  return `${m}:${String(r).padStart(2, "0")}`;
}

export function formatNumber(v: number | null | undefined, digits = 1): string {
  if (v == null || Number.isNaN(v)) return "—";
  return Number(v).toFixed(digits);
}

export function cardioCalories(w: {
  calories?: number | null;
  calories_chest?: number | null;
  calories_watch?: number | null;
}): number | null {
  return w.calories_chest ?? w.calories ?? w.calories_watch ?? null;
}

/** Ккал с пульсометра: Polar/FIT → calories_chest, иначе legacy calories. */
export function chestStrapKcal(w: {
  calories_chest?: number | null;
  calories?: number | null;
}): number | null {
  return w.calories_chest ?? w.calories ?? null;
}

export function speedKmh(
  distanceKm: number,
  durationSec: number,
  avgSpeed?: number | null,
): number | null {
  if (avgSpeed != null && avgSpeed > 0) return avgSpeed;
  if (durationSec <= 0 || distanceKm <= 0) return null;
  return distanceKm / (durationSec / 3600);
}

/** Pace min/km for run/bike */
export function paceMinPerKm(distanceKm: number, durationSec: number): number | null {
  if (distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / 60 / distanceKm;
}

/** Темп (мин/км) из мгновенной скорости км/ч. */
export function speedKmhToPaceMinPerKm(speedKmh: number): number | null {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return null;
  return 60 / speedKmh;
}

/** Pace sec/100m for pool */
export function paceSecPer100m(
  distanceKm: number,
  durationSec: number,
  fromApi?: number | null,
): number | null {
  if (fromApi != null && fromApi > 0) return fromApi;
  if (distanceKm <= 0 || durationSec <= 0) return null;
  return durationSec / (distanceKm * 10);
}

export function formatPace100m(sec: number | null): string {
  if (sec == null || sec <= 0) return "—";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} / 100м`;
}

/** Pace as m:ss (e.g. 5:30), input is decimal minutes per km. */
export function formatPaceMinPerKm(
  minPerKm: number | null | undefined,
  unitSuffix = "мин/км",
): string {
  if (minPerKm == null || !Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const totalSec = Math.round(minPerKm * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")} ${unitSuffix}`;
}

/** Локальная календарная дата (совпадает с date.today() на backend). */
export function localTodayIso(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function todayIso(): string {
  return localTodayIso();
}

export function defaultDateRange(days = 30): { from: string; to: string } {
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  };
}
