/**
 * Конвертация метрических величин в «американскую» пародийную систему (только отображение).
 * Данные в API и БД остаются в метрике.
 */

// ---- Вес еды (граммы -> граны, бандлы, мешки) ----
export const GRAMS_TO_GRAINS = 15.4323584;
export const GRAINS_PER_BUNDLE = 1256.5;
export const GRAINS_PER_BAG = 9985.33;

export function gramsToGrains(grams: number): number {
  return grams * GRAMS_TO_GRAINS;
}

export function gramsToBundles(grams: number): number {
  return gramsToGrains(grams) / GRAINS_PER_BUNDLE;
}

export function gramsToBags(grams: number): number {
  return gramsToGrains(grams) / GRAINS_PER_BAG;
}

// ---- Вес тела (кг -> японцы (Jp) или камри (Camry)) ----
export const KG_PER_JAPANESE = 62.5;
export const KG_PER_CAMRY = 1500.0;

export function kgToJapanese(kg: number): number {
  return kg / KG_PER_JAPANESE;
}

export function kgToCamry(kg: number): number {
  return kg / KG_PER_CAMRY;
}

export type BodyWeightUnit = "Jp" | "Camry";

export function formatBodyWeight(kg: number): { value: number; unit: BodyWeightUnit } {
  return kgToAmericanWeight(kg);
}

/** Вес снаряда / тела: Jp при kg < 80, иначе Camry. */
export function kgToAmericanWeight(kg: number): { value: number; unit: BodyWeightUnit } {
  if (kg < 80) {
    return { value: kgToJapanese(kg), unit: "Jp" };
  }
  return { value: kgToCamry(kg), unit: "Camry" };
}

export function japaneseToKg(jp: number): number {
  return jp * KG_PER_JAPANESE;
}

export function camryToKg(camry: number): number {
  return camry * KG_PER_CAMRY;
}

export function americanWeightToKg(value: number, unit: BodyWeightUnit): number {
  return unit === "Jp" ? japaneseToKg(value) : camryToKg(value);
}

// ---- Длина (см -> трампы (Tp) и дики (Dk)) ----
export const CM_PER_TRUMP = 190.5;
export const CM_PER_DICK = 13.5;

export function cmToTrump(cm: number): number {
  return cm / CM_PER_TRUMP;
}

export function trumpToCm(trump: number): number {
  return trump * CM_PER_TRUMP;
}

export function cmToDick(cm: number): number {
  return cm / CM_PER_DICK;
}

// ---- Температура (°C -> °Rj) ----
export function celsiusToRankinJunior(c: number): number {
  try {
    const term1 = 100 * Math.sin(((c + 10) * Math.PI) / 180);
    const term2 = c + 20 > 0 ? 50 * Math.log(c + 20) : 0;
    return term1 + term2 + 20;
  } catch {
    return 0;
  }
}

// ---- Объём (мл -> шприцы, syr) ----
export function mlToSyringes(ml: number): number {
  return 0.5 * (Math.sqrt(ml) + 2) * 1.8;
}

// ---- Энергия (ккал -> зарядки айфона, iCharge) ----
export const KCAL_PER_ICHARGE = 12.74;

export function kcalToIcharge(kcal: number): number {
  return kcal / KCAL_PER_ICHARGE;
}

// ---- Время (секунды -> серии друзей (FEP), рекламные блоки (SB)) ----
export const SECONDS_PER_FEP = 22 * 60;
export const SECONDS_PER_SB = 30;

export function secondsToFep(sec: number): number {
  return sec / SECONDS_PER_FEP;
}

export function secondsToSb(sec: number): number {
  return sec / SECONDS_PER_SB;
}

// ---- Темп похудения (граммы в день -> граны в час) ----
export function gPerDayToGrainsPerHour(gPerDay: number): number {
  return (gPerDay * GRAMS_TO_GRAINS) / 24;
}

// ---- Высота (метры -> рашморы, Rushmores) ----
/** Одна гора Рашмор = 1745 м (5725 футов). */
export const METERS_PER_RUSHMORE = 1745.0;

export function metersToRushmores(m: number): number {
  return m / METERS_PER_RUSHMORE;
}

// ---- Дистанция (метры -> статуи Свободы / факелы) ----
export const METERS_PER_SOL = 93.0;
export const METERS_PER_TORCH = METERS_PER_SOL / 10;

export function metersToSol(meters: number): number {
  return meters / METERS_PER_SOL;
}

export function metersToTorch(meters: number): number {
  return meters / METERS_PER_TORCH;
}

/** < 0.5 SoL — факелы, иначе статуи. */
export function formatDistanceMeters(meters: number): string {
  if (!Number.isFinite(meters)) return "—";
  const sol = metersToSol(meters);
  if (sol < 0.5) {
    return `${metersToTorch(meters).toFixed(1)} torch`;
  }
  return `${sol.toFixed(2)} SoL`;
}

export function kmToSol(km: number): number {
  return metersToSol(km * 1000);
}

export function kmToTorch(km: number): number {
  return metersToTorch(km * 1000);
}

/** Дистанция для UI; вход в километрах. */
export function formatDistanceKm(km: number): string {
  return formatDistanceMeters(km * 1000);
}

// ---- Скорость (км/ч -> статуи Свободы в час, SoL/h) ----
export function kmhToSolPerHour(kmh: number): number {
  return (kmh * 1000) / METERS_PER_SOL;
}

// ---- Темп (мин/км -> мин/статую) ----
export const PACE_KM_TO_SOL = 93 / 1000;

export function paceMinPerKmToMinPerSol(minPerKm: number): number {
  return minPerKm * PACE_KM_TO_SOL;
}

// ---- Мощность (Вт -> iCharge/мин) ----
const JOULES_PER_KCAL = 4184;

export function wattsToIchargePerMin(watts: number): number {
  const kcalPerMin = (watts * 60) / JOULES_PER_KCAL;
  return kcalPerMin / KCAL_PER_ICHARGE;
}

// ---- Плавание: скорость (км/ч -> звенья цепи в минуту, link/min) ----
export const METERS_PER_LINK = 0.201168;

export function kmhToLinksPerMin(kmh: number): number {
  return (kmh * 1000) / (METERS_PER_LINK * 60);
}

// ---- Форматирование для UI (знаки после запятой по типу величины) ----

export type AmericanFormatKind =
  | "bundles"
  | "japanese"
  | "camry"
  | "syringes"
  | "fep"
  | "sb"
  | "grains"
  | "icharge"
  | "default";

const FORMAT_DIGITS: Record<AmericanFormatKind, number> = {
  bundles: 3,
  japanese: 3,
  camry: 3,
  syringes: 2,
  fep: 1,
  sb: 1,
  grains: 1,
  icharge: 2,
  default: 2,
};

export function formatAmericanNumber(
  value: number,
  kind: AmericanFormatKind = "default",
): string {
  if (!Number.isFinite(value)) return "—";
  return value.toFixed(FORMAT_DIGITS[kind]);
}

export function formatBundles(grams: number): string {
  return formatAmericanNumber(gramsToBundles(grams), "bundles");
}

/** Пороги отображения веса еды: граны / бандлы / мешки. */
export const FOOD_GRAIN_THRESHOLD_G = 100;
export const FOOD_BUNDLE_THRESHOLD_G = 5000;

/** БЖУ и количество продуктов (граммы → граны / бандлы / мешки). */
export function formatFoodWeightAmerican(grams: number): string {
  if (!Number.isFinite(grams)) return "—";
  if (grams < FOOD_GRAIN_THRESHOLD_G) {
    return `${formatAmericanNumber(gramsToGrains(grams), "grains")} гран`;
  }
  if (grams < FOOD_BUNDLE_THRESHOLD_G) {
    return `${formatAmericanNumber(gramsToBundles(grams), "bundles")} бандл.`;
  }
  return `${formatAmericanNumber(gramsToBags(grams), "bundles")} меш.`;
}

export function formatJapanese(kg: number): string {
  return formatAmericanNumber(kgToJapanese(kg), "japanese");
}

export function formatCamry(kg: number): string {
  return formatAmericanNumber(kgToCamry(kg), "camry");
}

export function formatSyringes(ml: number): string {
  return formatAmericanNumber(mlToSyringes(ml), "syringes");
}

export function formatFep(seconds: number): string {
  return formatAmericanNumber(secondsToFep(seconds), "fep");
}

export function formatSb(seconds: number): string {
  return formatAmericanNumber(secondsToSb(seconds), "sb");
}

/** Строка «значение + единица» для веса тела. */
export function formatBodyWeightLabel(kg: number): string {
  const { value, unit } = formatBodyWeight(kg);
  const digits = unit === "Jp" ? "japanese" : "camry";
  return `${formatAmericanNumber(value, digits)} ${unit}`;
}
