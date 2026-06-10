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
/** 1 Dk = 13.5 см = 0.135 м (скорость в Dk/h). */
export const METERS_PER_DK = CM_PER_DICK / 100;

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
    return `${formatAmericanNumber(metersToTorch(meters), "default")} torch`;
  }
  return `${formatAmericanNumber(sol, "default")} SoL`;
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

// ---- Скорость (км/ч -> SoL + torch + Dk в час) ----
export function kmhToSolPerHour(kmh: number): number {
  return (kmh * 1000) / METERS_PER_SOL;
}

export interface AmericanSpeedMixed {
  sol: number;
  torch: number;
  dk: number;
}

/** Разложение км/ч на целые SoL, torch и Dk в час (для отображения). */
export function kmhToAmericanSpeedMixed(kmh: number): AmericanSpeedMixed {
  if (!Number.isFinite(kmh) || kmh <= 0) {
    return { sol: 0, torch: 0, dk: 0 };
  }
  const metersPerHour = kmh * 1000;
  const sol = Math.floor(metersPerHour / METERS_PER_SOL);
  let rem = metersPerHour - sol * METERS_PER_SOL;
  const torch = Math.floor(rem / METERS_PER_TORCH);
  rem -= torch * METERS_PER_TORCH;
  const dk = Math.floor(rem / METERS_PER_DK);
  return { sol, torch, dk };
}

/** Смешанная скорость: «107 SoL 5 torch 18 Dk/h». */
export function formatSpeedKmhAmerican(kmh: number): string {
  if (!Number.isFinite(kmh)) return "—";
  const { sol, torch, dk } = kmhToAmericanSpeedMixed(kmh);
  return `${sol} SoL ${torch} torch ${dk} Dk/h`;
}

// ---- Темп (мин/км -> мин/статую) ----
export const PACE_KM_TO_SOL = 93 / 1000;

export function paceMinPerKmToMinPerSol(minPerKm: number): number {
  return minPerKm * PACE_KM_TO_SOL;
}

/** Темп бега в american: mm:ss/SoL (вход — мин/км). */
export function formatPaceMinPerKmAmerican(minPerKm: number): string {
  if (!Number.isFinite(minPerKm) || minPerKm <= 0) return "—";
  const minPerSol = paceMinPerKmToMinPerSol(minPerKm);
  const totalSec = Math.round(minPerSol * 60);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, "0")}/SoL`;
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

export type FormatAmericanNumberOptions = {
  /**
   * Упрощённая дробь для |value| < 0.1 (только отображение).
   * false — всегда fixed decimal (поля ввода, parse).
   */
  allowFraction?: boolean;
};

/** Порог: american display values ниже этого — дробь вместо decimal. */
export const AMERICAN_FRACTION_DISPLAY_THRESHOLD = 0.1;

/** Максимальный знаменатель упрощённой дроби. */
export const AMERICAN_FRACTION_MAX_DENOMINATOR = 1000;

export interface SimplifiedFraction {
  numerator: number;
  denominator: number;
}

function gcdInt(a: number, b: number): number {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

type FractionCandidate = {
  numerator: number;
  denominator: number;
  error: number;
};

const FRACTION_EXACT_EPS = 1e-9;
/** Точная дробь с знаменателем ≤ этого — всегда предпочтительна. */
const FRACTION_EXACT_MAX_DENOM = 500;
/** Предпочитаем читаемый знаменатель вместо «десятичного» 1000. */
const FRACTION_READABLE_MAX_DENOM = 100;
const FRACTION_READABLE_MAX_ERROR = 0.001;

function collectFractionCandidates(
  target: number,
  maxDenominator: number,
): FractionCandidate[] {
  const seen = new Set<string>();
  const out: FractionCandidate[] = [];

  for (let den = 1; den <= maxDenominator; den++) {
    const rawNum = Math.round(target * den);
    if (rawNum === 0) continue;

    const g = gcdInt(rawNum, den);
    const num = rawNum / g;
    const reducedDen = den / g;
    const key = `${num}/${reducedDen}`;
    if (seen.has(key)) continue;
    seen.add(key);

    out.push({
      numerator: num,
      denominator: reducedDen,
      error: Math.abs(target - num / reducedDen),
    });
  }
  return out;
}

function isUglyDecimalDenominator(denominator: number): boolean {
  return denominator % 10 === 0 && denominator >= 100;
}

function pickBestFractionCandidate(candidates: FractionCandidate[]): FractionCandidate | null {
  if (!candidates.length) return null;

  const readable = candidates
    .filter(
      (c) =>
        c.denominator <= FRACTION_READABLE_MAX_DENOM &&
        c.error <= FRACTION_READABLE_MAX_ERROR,
    )
    .sort((a, b) => a.error - b.error || a.denominator - b.denominator);
  if (readable.length) return readable[0];

  const exact = candidates.filter((c) => c.error < FRACTION_EXACT_EPS);
  const cleanExact = exact
    .filter(
      (c) =>
        c.denominator <= FRACTION_EXACT_MAX_DENOM &&
        !isUglyDecimalDenominator(c.denominator),
    )
    .sort((a, b) => a.denominator - b.denominator || a.error - b.error);
  if (cleanExact.length) return cleanExact[0];

  const uglyExact = exact
    .filter(
      (c) =>
        c.denominator <= FRACTION_EXACT_MAX_DENOM &&
        isUglyDecimalDenominator(c.denominator),
    )
    .sort((a, b) => a.denominator - b.denominator || a.error - b.error);
  if (uglyExact.length) return uglyExact[0];

  if (exact.length) {
    return exact.sort((a, b) => a.denominator - b.denominator || a.error - b.error)[0];
  }

  const denomWeight = 1e-5;
  return candidates.reduce((best, c) => {
    const cost = c.error + denomWeight * c.denominator;
    const bestCost = best.error + denomWeight * best.denominator;
    if (cost < bestCost - 1e-15) return c;
    if (Math.abs(cost - bestCost) < 1e-15 && c.denominator < best.denominator) return c;
    return best;
  });
}

/**
 * Приближение decimal → p/q с целыми p,q, знаменатель ≤ maxDenominator, сокращение по НОД.
 * Избегает «57/1000» в пользу «2/35», но сохраняет точные 1/200, 1/500.
 */
export function approximateAmericanFraction(
  value: number,
  maxDenominator = AMERICAN_FRACTION_MAX_DENOMINATOR,
): SimplifiedFraction | null {
  if (!Number.isFinite(value) || value === 0) return null;

  const sign = value < 0 ? -1 : 1;
  const target = Math.abs(value);
  const picked = pickBestFractionCandidate(
    collectFractionCandidates(target, maxDenominator),
  );
  if (!picked) return null;

  return {
    numerator: sign * picked.numerator,
    denominator: picked.denominator,
  };
}

/** Простые дроби (1/3, 2/3) — даже при value ≥ 0.1, но < 1. */
const FRACTION_CLASSIC_MAX_DENOM = 12;

/** |value| < 0.1 или классическая дробь → упрощённое отображение, иначе null. */
export function formatAmericanSmallFraction(value: number): string | null {
  if (!Number.isFinite(value) || value === 0) return null;
  const abs = Math.abs(value);
  if (abs >= 1) return null;

  const frac = approximateAmericanFraction(value);
  if (!frac) return null;

  const approx = Math.abs(frac.numerator) / frac.denominator;
  const error = Math.abs(abs - approx);
  const classic =
    abs > AMERICAN_FRACTION_DISPLAY_THRESHOLD &&
    frac.denominator <= FRACTION_CLASSIC_MAX_DENOM &&
    error <= FRACTION_READABLE_MAX_ERROR;

  if (abs >= AMERICAN_FRACTION_DISPLAY_THRESHOLD && !classic) return null;
  return `${frac.numerator}/${frac.denominator}`;
}

export function formatAmericanNumber(
  value: number,
  kind: AmericanFormatKind = "default",
  options?: FormatAmericanNumberOptions,
): string {
  if (!Number.isFinite(value)) return "—";
  const allowFraction = options?.allowFraction !== false;
  if (allowFraction) {
    const frac = formatAmericanSmallFraction(value);
    if (frac) return frac;
  }
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
