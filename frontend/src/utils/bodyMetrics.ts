import type { BodyMetricCreate } from "../types";
import { formatDateRu } from "./format";

/** Точность контрольных замеров: ввод/хранение/отображение до 0.01. */
export const BODY_METRIC_DECIMALS = 2;
export const BODY_METRIC_STEP = 0.01;
/** Порог «без изменений» для дельт (половина шага ввода). */
export const BODY_METRIC_STABLE_DELTA = 0.005;

const BODY_METRIC_INPUT_RE = /^\d+(\.\d{1,2})?$/;

export function isValidBodyMetricInput(raw: string): boolean {
  return raw === "" || BODY_METRIC_INPUT_RE.test(raw);
}

function formatBodyMetricNumber(n: number, maxDecimals = BODY_METRIC_DECIMALS): string {
  if (!Number.isFinite(n)) return "—";
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  if (rounded === 0) return "0";
  if (Number.isInteger(rounded)) return String(rounded);
  return rounded
    .toFixed(maxDecimals)
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}

/** Формат положительного замера (таблица, карточки, подсказки). */
export function formatBodyMetricValue(v: unknown, suffix = ""): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const s = formatBodyMetricNumber(n);
  return suffix ? `${s}${suffix}` : s;
}

/** Формат изменения замера со знаком (+/-). */
export function formatBodyMetricSigned(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) < BODY_METRIC_STABLE_DELTA) return "0";
  const sign = n > 0 ? "+" : "-";
  return `${sign}${formatBodyMetricNumber(Math.abs(n))}`;
}

/** Поля ручного замера (как в Streamlit ui/body_tab.py). Средние считает бэкенд. */

export type BodyMetricFieldKey =
  | "weight_kg"
  | "body_fat_percent"
  | "muscle_mass_kg"
  | "chest_inhale_cm"
  | "chest_exhale_cm"
  | "bicep_relaxed_cm"
  | "bicep_tense_cm"
  | "forearm_relaxed_cm"
  | "forearm_tense_cm"
  | "wrist_cm"
  | "thigh_relaxed_cm"
  | "thigh_tense_cm"
  | "calf_relaxed_cm"
  | "calf_tense_cm"
  | "ankle_cm"
  | "waist_cm"
  | "hips_cm"
  | "neck_cm";

export interface BodyMetricFieldDef {
  key: BodyMetricFieldKey;
  label: string;
  max: number;
  step?: number;
  unit?: string;
}

export interface BodyMetricFormSection {
  title: string;
  hint?: string;
  columns: 2 | 3 | 5;
  fields: BodyMetricFieldDef[];
}

export const BODY_METRIC_FORM_SECTIONS: BodyMetricFormSection[] = [
  {
    title: "Вес и состав",
    columns: 3,
    fields: [
      { key: "weight_kg", label: "Вес, кг", max: 300, step: BODY_METRIC_STEP, unit: "кг" },
      { key: "body_fat_percent", label: "Жир, %", max: 60, step: BODY_METRIC_STEP, unit: "%" },
      { key: "muscle_mass_kg", label: "Мышцы, кг", max: 150, step: BODY_METRIC_STEP, unit: "кг" },
    ],
  },
  {
    title: "Грудь",
    hint: "Средняя считается: (вдох + выдох) / 2",
    columns: 2,
    fields: [
      { key: "chest_inhale_cm", label: "Вдох, см", max: 200, step: BODY_METRIC_STEP, unit: "см" },
      { key: "chest_exhale_cm", label: "Выдох, см", max: 200, step: BODY_METRIC_STEP, unit: "см" },
    ],
  },
  {
    title: "Руки",
    hint: "Р — расслабление, Н — напряжение",
    columns: 5,
    fields: [
      { key: "bicep_relaxed_cm", label: "Бицепс Р", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "bicep_tense_cm", label: "Бицепс Н", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "forearm_relaxed_cm", label: "Предпл. Р", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "forearm_tense_cm", label: "Предпл. Н", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "wrist_cm", label: "Запястье", max: 80, step: BODY_METRIC_STEP, unit: "см" },
    ],
  },
  {
    title: "Ноги",
    columns: 5,
    fields: [
      { key: "thigh_relaxed_cm", label: "Бедро Р", max: 120, step: BODY_METRIC_STEP, unit: "см" },
      { key: "thigh_tense_cm", label: "Бедро Н", max: 120, step: BODY_METRIC_STEP, unit: "см" },
      { key: "calf_relaxed_cm", label: "Икра Р", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "calf_tense_cm", label: "Икра Н", max: 80, step: BODY_METRIC_STEP, unit: "см" },
      { key: "ankle_cm", label: "Лодыжка", max: 80, step: BODY_METRIC_STEP, unit: "см" },
    ],
  },
  {
    title: "Талия / бёдра / шея",
    columns: 3,
    fields: [
      { key: "waist_cm", label: "Талия, см", max: 200, step: BODY_METRIC_STEP, unit: "см" },
      { key: "hips_cm", label: "Бёдра, см", max: 200, step: BODY_METRIC_STEP, unit: "см" },
      { key: "neck_cm", label: "Шея, см", max: 80, step: BODY_METRIC_STEP, unit: "см" },
    ],
  },
];

/** Колонки таблицы: без средних по конечностям; грудь — только ср.; остальное — Р/Н. */
export const BODY_TABLE_COLUMNS: { key: string; label: string; title?: string }[] = [
  { key: "date", label: "Дата", title: "Дата замера" },
  { key: "weight_kg", label: "Вес", title: "Вес, кг" },
  { key: "body_fat_percent", label: "Жир%", title: "Жир, %" },
  { key: "muscle_mass_kg", label: "Мышцы", title: "Мышцы, кг" },
  { key: "chest_avg_cm", label: "Грудь ср.", title: "Грудь средняя, см" },
  { key: "bicep_relaxed_cm", label: "Биц. Р", title: "Бицепс, расслабление, см" },
  { key: "bicep_tense_cm", label: "Биц. Н", title: "Бицепс, напряжение, см" },
  { key: "forearm_relaxed_cm", label: "Пред. Р", title: "Предплечье, расслабление, см" },
  { key: "forearm_tense_cm", label: "Пред. Н", title: "Предплечье, напряжение, см" },
  { key: "wrist_cm", label: "Зап.", title: "Запястье, см" },
  { key: "thigh_relaxed_cm", label: "Бед. Р", title: "Бедро, расслабление, см" },
  { key: "thigh_tense_cm", label: "Бед. Н", title: "Бедро, напряжение, см" },
  { key: "calf_relaxed_cm", label: "Икр. Р", title: "Икра, расслабление, см" },
  { key: "calf_tense_cm", label: "Икр. Н", title: "Икра, напряжение, см" },
  { key: "ankle_cm", label: "Лод.", title: "Лодыжка, см" },
  { key: "waist_cm", label: "Талия", title: "Талия, см" },
  { key: "hips_cm", label: "Бёдра", title: "Бёдра, см" },
  { key: "neck_cm", label: "Шея", title: "Шея, см" },
];

export function formatBodyTableCell(row: Record<string, unknown>, key: string): string {
  if (key === "date") {
    return formatDateRu(String(row.date ?? ""));
  }
  const v = row[key];
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  if (n <= 0) return "—";
  return formatBodyMetricValue(n);
}

export function bodyFieldsFromLatest(
  latest: Record<string, unknown> | null | undefined,
): Partial<Record<BodyMetricFieldKey, number>> {
  if (!latest) return {};
  const out: Partial<Record<BodyMetricFieldKey, number>> = {};
  for (const section of BODY_METRIC_FORM_SECTIONS) {
    for (const f of section.fields) {
      const v = latest[f.key];
      if (v != null && Number(v) > 0) {
        out[f.key] = Number(v);
      }
    }
  }
  return out;
}

/** Поля для модального окна «Детали» (все измерения + вычисляемые). */
export const BODY_DETAIL_SECTIONS: { title: string; fields: { key: string; label: string }[] }[] = [
  {
    title: "Вес и состав",
    fields: [
      { key: "weight_kg", label: "Вес, кг" },
      { key: "body_fat_percent", label: "Жир, %" },
      { key: "muscle_mass_kg", label: "Мышцы, кг" },
    ],
  },
  {
    title: "Грудь",
    fields: [
      { key: "chest_inhale_cm", label: "Вдох, см" },
      { key: "chest_exhale_cm", label: "Выдох, см" },
      { key: "chest_avg_cm", label: "Грудь ср., см" },
    ],
  },
  {
    title: "Руки",
    fields: [
      { key: "bicep_relaxed_cm", label: "Бицепс Р, см" },
      { key: "bicep_tense_cm", label: "Бицепс Н, см" },
      { key: "forearm_relaxed_cm", label: "Предплечье Р, см" },
      { key: "forearm_tense_cm", label: "Предплечье Н, см" },
      { key: "wrist_cm", label: "Запястье, см" },
    ],
  },
  {
    title: "Ноги",
    fields: [
      { key: "thigh_relaxed_cm", label: "Бедро Р, см" },
      { key: "thigh_tense_cm", label: "Бедро Н, см" },
      { key: "calf_relaxed_cm", label: "Икра Р, см" },
      { key: "calf_tense_cm", label: "Икра Н, см" },
      { key: "ankle_cm", label: "Лодыжка, см" },
    ],
  },
  {
    title: "Талия / бёдра / шея",
    fields: [
      { key: "waist_cm", label: "Талия, см" },
      { key: "hips_cm", label: "Бёдра, см" },
      { key: "neck_cm", label: "Шея, см" },
    ],
  },
];

export type BodyChartPeriod = "30d" | "90d" | "180d" | "365d" | "all";

export const BODY_CHART_PERIOD_OPTIONS: { id: BodyChartPeriod; label: string }[] = [
  { id: "30d", label: "30 дн" },
  { id: "90d", label: "3 мес" },
  { id: "180d", label: "6 мес" },
  { id: "365d", label: "Год" },
  { id: "all", label: "Всё время" },
];

export const BODY_COMPOSITION_CHART_LINES: { key: string; label: string; color: string }[] = [
  { key: "weight_kg", label: "Вес, кг", color: "#059669" },
  { key: "body_fat_percent", label: "Жир, %", color: "#dc2626" },
  { key: "muscle_mass_kg", label: "Мышцы, кг", color: "#2563eb" },
];

export const BODY_CIRCUMFERENCE_CHART_LINES: { key: string; label: string; color: string }[] = [
  { key: "waist_cm", label: "Талия, см", color: "#7c3aed" },
  { key: "hips_cm", label: "Бёдра, см", color: "#db2777" },
  { key: "chest_avg_cm", label: "Грудь ср., см", color: "#ea580c" },
];

const COMPOSITION_LS_KEY = "body-chart-composition-lines";
const CIRCUMFERENCE_LS_KEY = "body-chart-circumference-lines";

export function loadChartLinePrefs(
  storageKey: string,
  defaults: string[],
): string[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : defaults;
  } catch {
    return defaults;
  }
}

export function saveChartLinePrefs(storageKey: string, keys: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

export { COMPOSITION_LS_KEY, CIRCUMFERENCE_LS_KEY };

export function chartPeriodToRange(period: BodyChartPeriod): { date_from?: string; date_to?: string } {
  if (period === "all") return {};
  const days =
    period === "30d" ? 30 : period === "90d" ? 90 : period === "180d" ? 180 : 365;
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - days);
  return {
    date_from: from.toISOString().slice(0, 10),
    date_to: to.toISOString().slice(0, 10),
  };
}

export function formatMetricNum(v: unknown, unit = ""): string {
  if (v == null || v === "") return "—";
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "—";
  const s = formatBodyMetricValue(n);
  if (s === "—") return "—";
  return unit ? `${s} ${unit}` : s;
}

/** Форматтеры отображения замеров тела (данные в API — метрика). */
export type BodyUnitsFormatProps = {
  formatBodyWeight: (kg: number) => string;
  formatBarbellWeight: (kg: number) => string;
  formatWeightChange: (kgChange: number) => string;
  formatHeight: (cm: number) => string;
  formatCircumference: (cm: number) => string;
  formatCircumferenceChange: (cmChange: number) => string;
};

export function formatBodyDetailValue(
  key: string,
  value: unknown,
  units: BodyUnitsFormatProps,
): string {
  if (value == null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (key === "weight_kg") return units.formatBodyWeight(n);
  if (key === "muscle_mass_kg") return units.formatBodyWeight(n);
  if (key === "body_fat_percent") return formatMetricNum(n, "%");
  if (key.endsWith("_cm")) return units.formatCircumference(n);
  return formatMetricNum(n);
}

export interface MetricDelta {
  diff: number;
  pct: number;
  improved: boolean;
}

/** Разница с предыдущим замером; improved — «лучше» по знаку метрики. */
export function calcMetricDelta(
  current: unknown,
  previous: unknown,
  higherIsBetter = false,
): MetricDelta | null {
  const c = Number(current);
  const p = Number(previous);
  if (!Number.isFinite(c) || !Number.isFinite(p) || p <= 0) return null;
  const diff = c - p;
  const pct = (diff / p) * 100;
  const improved = higherIsBetter ? diff > 0 : diff < 0;
  if (Math.abs(diff) < BODY_METRIC_STABLE_DELTA) return { diff: 0, pct: 0, improved: true };
  return { diff, pct, improved };
}

export function bodyFieldsFromRow(
  row: Record<string, unknown>,
): Partial<Record<BodyMetricFieldKey, number>> {
  const out: Partial<Record<BodyMetricFieldKey, number>> = {};
  for (const section of BODY_METRIC_FORM_SECTIONS) {
    for (const f of section.fields) {
      const v = row[f.key];
      if (v != null && Number(v) > 0) {
        out[f.key] = Number(v);
      }
    }
  }
  return out;
}

export function sortRowsByDateAsc(rows: Record<string, unknown>[]) {
  return [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

export function buildBodyMetricPayload(
  date: string,
  allowReplace: boolean,
  values: Partial<Record<BodyMetricFieldKey, number | null | undefined>>,
): BodyMetricCreate {
  const payload: BodyMetricCreate = {
    date,
    allow_replace: allowReplace,
  };
  for (const section of BODY_METRIC_FORM_SECTIONS) {
    for (const f of section.fields) {
      const v = values[f.key];
      if (v != null && Number.isFinite(v) && v > 0) {
        payload[f.key] = v;
      }
    }
  }
  return payload;
}
