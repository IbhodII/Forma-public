/**
 * Абсолютная шкала цветов скорости для GPS-треков.
 * Одинаковая скорость → одинаковый цвет на всех тренировках одного типа.
 *
 * Велосипед: км/ч (0–45).
 * Бег: км/ч внутри, подписи legend — темп (мин/км).
 */

import { CARDIO_RUN } from "../utils/constants";
import { speedKmhToPaceMinPerKm } from "../utils/format";

export type SpeedColorProfile = "global" | "road" | "mtb" | "indoor" | "commuting" | "running";

/** @deprecated use SpeedColorProfile */
export type CyclingWorkoutProfile = SpeedColorProfile;

export interface SpeedColorStop {
  /** Нижняя граница диапазона, км/ч */
  speedKmh: number;
  rgb: [number, number, number];
  /** Подпись в legend (км/ч или темп) */
  label?: string;
}

/** Шаг квантизации скорости перед расчётом цвета — стабильный merge сегментов */
export const SPEED_COLOR_QUANT_KMH = 0.5;

/** Верхняя граница шкалы велосипеда для CSS-gradient legend (км/ч) */
export const SPEED_SCALE_MAX_KMH = 45;

/** Верхняя граница шкалы бега для CSS-gradient legend (км/ч ≈ 3:20 /км) */
export const RUNNING_SCALE_MAX_KMH = 18;

const GLOBAL_STOPS: SpeedColorStop[] = [
  { speedKmh: 0, rgb: [30, 58, 138], label: "0" },
  { speedKmh: 10, rgb: [6, 182, 212], label: "10" },
  { speedKmh: 18, rgb: [34, 197, 94], label: "18" },
  { speedKmh: 25, rgb: [234, 179, 8], label: "25" },
  { speedKmh: 32, rgb: [249, 115, 22], label: "32" },
  { speedKmh: 40, rgb: [220, 38, 38], label: "40+" },
];

/** Бег: цвет по км/ч, подписи — темп мин/км (медленнее → быстрее слева направо). */
const RUNNING_STOPS: SpeedColorStop[] = [
  { speedKmh: 0, rgb: [30, 58, 138], label: "10:00+" },
  { speedKmh: 6, rgb: [6, 182, 212], label: "10:00" },
  { speedKmh: 8, rgb: [34, 197, 94], label: "7:30" },
  { speedKmh: 10, rgb: [234, 179, 8], label: "6:00" },
  { speedKmh: 12, rgb: [249, 115, 22], label: "5:00" },
  { speedKmh: 14, rgb: [220, 38, 38], label: "4:15" },
  { speedKmh: 16, rgb: [185, 28, 28], label: "3:45" },
  { speedKmh: 18, rgb: [127, 29, 29], label: "3:20" },
];

export const SPEED_COLOR_PROFILES: Record<SpeedColorProfile, SpeedColorStop[]> = {
  global: GLOBAL_STOPS,
  road: GLOBAL_STOPS,
  mtb: GLOBAL_STOPS,
  indoor: GLOBAL_STOPS,
  commuting: GLOBAL_STOPS,
  running: RUNNING_STOPS,
};

/** Диапазоны для подписей legend велосипеда (км/ч) */
export const SPEED_RANGE_LABELS: { from: number; to: number | null; label: string }[] = [
  { from: 0, to: 10, label: "0–10" },
  { from: 10, to: 18, label: "10–18" },
  { from: 18, to: 25, label: "18–25" },
  { from: 25, to: 32, label: "25–32" },
  { from: 32, to: 40, label: "32–40" },
  { from: 40, to: null, label: "40+" },
];

function rgbToCss(rgb: [number, number, number]): string {
  return `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
}

function lerpRgb(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  const w = Math.max(0, Math.min(1, t));
  return [
    Math.round(a[0] + (b[0] - a[0]) * w),
    Math.round(a[1] + (b[1] - a[1]) * w),
    Math.round(a[2] + (b[2] - a[2]) * w),
  ];
}

export function isRunningSpeedProfile(profile: SpeedColorProfile): boolean {
  return profile === "running";
}

export function getScaleMaxKmh(profile: SpeedColorProfile = "global"): number {
  return profile === "running" ? RUNNING_SCALE_MAX_KMH : SPEED_SCALE_MAX_KMH;
}

export function getSpeedColorStops(profile: SpeedColorProfile = "global"): SpeedColorStop[] {
  return SPEED_COLOR_PROFILES[profile] ?? SPEED_COLOR_PROFILES.global;
}

export function resolveSpeedColorProfile(workoutType?: string | null): SpeedColorProfile {
  if (workoutType === CARDIO_RUN) return "running";
  return "global";
}

function quantizeSpeed(speedKmh: number): number {
  if (!Number.isFinite(speedKmh) || speedKmh <= 0) return 0;
  return Math.round(speedKmh / SPEED_COLOR_QUANT_KMH) * SPEED_COLOR_QUANT_KMH;
}

/** Плавная интерполяция RGB между фиксированными stops по абсолютной скорости. */
export function speedToColor(speedKmh: number, profile: SpeedColorProfile = "global"): string {
  const stops = getSpeedColorStops(profile);
  if (stops.length === 0) return "#059669";

  const speed = quantizeSpeed(speedKmh);
  if (speed <= stops[0].speedKmh) return rgbToCss(stops[0].rgb);

  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i];
    const b = stops[i + 1];
    if (speed <= b.speedKmh) {
      const span = b.speedKmh - a.speedKmh;
      const w = span > 0 ? (speed - a.speedKmh) / span : 0;
      return rgbToCss(lerpRgb(a.rgb, b.rgb, w));
    }
  }

  return rgbToCss(stops[stops.length - 1].rgb);
}

/** CSS linear-gradient для legend-бара (абсолютная шкала). */
export function speedScaleGradientCss(profile: SpeedColorProfile = "global"): string {
  const stops = getSpeedColorStops(profile);
  const max = getScaleMaxKmh(profile);
  const parts = stops.map((s) => {
    const pct = Math.min(100, (s.speedKmh / max) * 100);
    return `${speedToColor(s.speedKmh, profile)} ${pct}%`;
  });
  parts.push(`${speedToColor(max, profile)} 100%`);
  return `linear-gradient(to right, ${parts.join(", ")})`;
}

export interface SpeedLegendTick {
  speedKmh: number;
  label: string;
  color: string;
  positionPct: number;
}

export function getSpeedLegendTicks(profile: SpeedColorProfile = "global"): SpeedLegendTick[] {
  const stops = getSpeedColorStops(profile);
  const max = getScaleMaxKmh(profile);
  return stops.map((s) => ({
    speedKmh: s.speedKmh,
    label: s.label ?? String(s.speedKmh),
    color: speedToColor(s.speedKmh + 0.01, profile),
    positionPct: Math.min(100, (s.speedKmh / max) * 100),
  }));
}

/** Цвет для диапазона (середина интервала) — для списка диапазонов в legend */
export function speedRangeMidColor(
  from: number,
  to: number | null,
  profile: SpeedColorProfile = "global",
): string {
  const mid = to != null ? (from + to) / 2 : from + 5;
  return speedToColor(mid, profile);
}

/** Темп мин/км для подписи legend бега (без единиц). */
export function paceMinPerKmLabel(speedKmh: number): string {
  const pace = speedKmhToPaceMinPerKm(speedKmh);
  if (pace == null) return "—";
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  const sec = s >= 60 ? 59 : s;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
