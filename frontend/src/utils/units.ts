import {
  celsiusToRankinJunior,
  formatPaceMinPerKmAmerican,
  formatSpeedKmhAmerican,
  kcalToIcharge,
  kmhToSolPerHour,
  kmToSol,
  metersToRushmores,
} from "./americanUnits";
import { speedKmhToPaceMinPerKm } from "./format";

export type ChartUnitsSystem = "metric" | "american";

function mapNumericArray(
  values: (number | null)[],
  convert: (n: number) => number,
): (number | null)[] {
  return values.map((v) => (v == null || !Number.isFinite(v) ? null : convert(v)));
}

function mapNumericArrayStrict(values: number[], convert: (n: number) => number): number[] {
  return values.map((v) => (Number.isFinite(v) ? convert(v) : v));
}

/** км → SoL (для осей и серий Plotly). */
export function convertArrayKmToSol(values: (number | null)[]): (number | null)[] {
  return mapNumericArray(values, kmToSol);
}

export function convertKmSeries(values: number[]): number[] {
  return mapNumericArrayStrict(values, kmToSol);
}

/** км/ч → SoL/h. */
export function convertArrayKmhToSol(values: (number | null)[]): (number | null)[] {
  return mapNumericArray(values, kmhToSolPerHour);
}

/** м → рашморы. */
export function convertArrayMetersToRushmores(values: (number | null)[]): (number | null)[] {
  return mapNumericArray(values, metersToRushmores);
}

export const ELEVATION_AXIS_METRIC = "м";
export const ELEVATION_AXIS_AMERICAN = "рашморов";

/** °C → °Rj. */
export function convertArrayCelsiusToRj(values: (number | null)[]): (number | null)[] {
  return mapNumericArray(values, celsiusToRankinJunior);
}

/** Подпись тика шкалы скорости на карте (внутренняя шкала остаётся в км/ч). */
export function formatSpeedLegendTickLabel(
  speedKmh: number,
  stopLabel: string | undefined,
  system: ChartUnitsSystem,
): string {
  if (system === "metric") {
    return stopLabel ?? String(speedKmh);
  }
  if (stopLabel === "40+") {
    return `${formatSpeedKmhAmerican(40)}+`;
  }
  return formatSpeedKmhAmerican(speedKmh);
}

export const DISTANCE_AXIS_METRIC = "км";
export const DISTANCE_AXIS_AMERICAN = "SoL";
export const SPEED_AXIS_METRIC = "км/ч";
export const SPEED_AXIS_AMERICAN = "SoL·torch·Dk/h";
export const PACE_AXIS_METRIC = "мин/км";
export const PACE_AXIS_AMERICAN = "mm:ss/SoL";

/** Подпись тика шкалы темпа на карте бега (внутренняя шкала остаётся в км/ч). */
export function formatPaceLegendTickLabel(
  speedKmh: number,
  stopLabel: string | undefined,
  system: ChartUnitsSystem,
): string {
  if (stopLabel) return stopLabel;
  const pace = speedKmhToPaceMinPerKm(speedKmh);
  if (pace == null) return "—";
  if (system === "american") {
    return formatPaceMinPerKmAmerican(pace);
  }
  const m = Math.floor(pace);
  const s = Math.round((pace - m) * 60);
  return `${m}:${String(s >= 60 ? 59 : s).padStart(2, "0")}`;
}

/** ккал → iCharge (серии графиков расхода). */
export function convertArrayKcalToIcharge(values: (number | null)[]): (number | null)[] {
  return mapNumericArray(values, kcalToIcharge);
}

export function convertKcalSeries(values: number[]): number[] {
  return mapNumericArrayStrict(values, kcalToIcharge);
}

export type NutritionColumnHeaders = {
  quantity: string;
  calories: string;
  caloriesPer100g: string;
};

export function nutritionColumnHeaders(system: ChartUnitsSystem): NutritionColumnHeaders {
  if (system === "american") {
    return {
      quantity: "Кол-во",
      calories: "iCharge",
      caloriesPer100g: "iCharge/100г",
    };
  }
  return {
    quantity: "г",
    calories: "ккал",
    caloriesPer100g: "ккал/100г",
  };
}
