export const BODY_TAB_OVERVIEW = "overview";
export const BODY_TAB_METRICS = "metrics";
export const BODY_TAB_WEIGHT = "weight";
export const BODY_TAB_STEPS = "steps";
export const BODY_TAB_SLEEP = "sleep";
export const BODY_TAB_PULSE = "pulse";
export const BODY_TAB_ACTIVITY = "activity";
export const BODY_TAB_HEALTH_CONNECT = "health-connect";

export const BODY_TABS = [
  { id: BODY_TAB_OVERVIEW, label: "Обзор" },
  { id: BODY_TAB_METRICS, label: "Контрольные замеры" },
  { id: BODY_TAB_WEIGHT, label: "Ежедневный вес" },
  { id: BODY_TAB_STEPS, label: "Шаги" },
  { id: BODY_TAB_SLEEP, label: "Сон" },
  { id: BODY_TAB_PULSE, label: "Пульс" },
  { id: BODY_TAB_ACTIVITY, label: "Активность" },
  { id: BODY_TAB_HEALTH_CONNECT, label: "Health Connect" },
] as const;

export type BodyTabId = (typeof BODY_TABS)[number]["id"];

const TAB_SET = new Set<string>(BODY_TABS.map((t) => t.id));

export function resolveBodyTab(param: string | null): BodyTabId {
  if (param && TAB_SET.has(param)) return param as BodyTabId;
  return BODY_TAB_OVERVIEW;
}
