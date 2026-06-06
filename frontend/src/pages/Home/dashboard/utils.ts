import { METRIC_TEXT_CLASS, tsbColorLevel } from "../../Analytics/utils/metricColors";

export function tsbRecoveryLabel(tsb: number | null | undefined): string {
  if (tsb == null || !Number.isFinite(tsb)) return "нет данных";
  if (tsb > 10) return "отличное восстановление";
  if (tsb < -15) return "перетренированность";
  if (tsb < -5) return "усталость";
  return "баланс";
}

export function tsbValueClass(tsb: number | null | undefined): string {
  return METRIC_TEXT_CLASS[tsbColorLevel(tsb)];
}

export function formatSleepHours(h: number | null | undefined): string {
  if (h == null || !Number.isFinite(h)) return "—";
  const hrs = Math.floor(h);
  const mins = Math.round((h - hrs) * 60);
  return mins > 0 ? `${hrs}ч ${mins}м` : `${hrs}ч`;
}

export function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function pickLatestWorkout(
  strengthDate: string | null | undefined,
  strengthTitle: string | null | undefined,
  cardioDate: string | null | undefined,
): { date: string | null; label: string | null; kind: "strength" | "cardio" | null } {
  const s = strengthDate?.trim() || null;
  const c = cardioDate?.trim() || null;
  if (!s && !c) return { date: null, label: null, kind: null };
  if (s && (!c || s >= c)) {
    return { date: s, label: strengthTitle?.trim() || "Силовая", kind: "strength" };
  }
  return { date: c, label: "Кардио", kind: "cardio" };
}

export function weightDeltaLabel(
  current: number | null | undefined,
  series: Array<{ date: string; weight_kg: number }>,
  today: string,
): string | null {
  if (current == null || !series.length) return null;
  const sorted = [...series].sort((a, b) => b.date.localeCompare(a.date));
  const prev = sorted.find((p) => p.date < today && p.weight_kg != null);
  if (!prev) return null;
  const d = current - prev.weight_kg;
  if (Math.abs(d) < 0.05) return "без изменений";
  const sign = d > 0 ? "+" : "";
  return `${sign}${d.toFixed(1)} кг от вчера`;
}

/** Дата для плитки «Тренировка» на главной: 30.05.26 */
export function formatDashboardWorkoutDate(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  const raw = iso.trim();
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1].slice(-2)}`;
  const d = new Date(raw.includes("T") ? raw : `${raw}T12:00:00`);
  if (Number.isNaN(d.getTime())) return raw.slice(0, 10);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

export function formatSyncTimeShort(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16).replace("T", " ");
  const today = new Date();
  const isToday =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const time = d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  if (isToday) return `сегодня ${time}`;
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
