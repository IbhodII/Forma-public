/**
 * Значения = query-параметр `downsample` на API кардио:
 * - 1 — все точки из FIT (без прореживания)
 * - 0 — 1 точка в секунду (1 Гц)
 * - 2+ — 1 точка каждые N секунд (по умолчанию API: 2)
 */
export const CARDIO_DOWNSAMPLE_ALL_POINTS = 1 as const;
export const CARDIO_DOWNSAMPLE_ONE_PER_SEC = 0 as const;
export const CARDIO_DOWNSAMPLE_EVERY_2_SEC = 2 as const;

export type CardioDataInterval =
  | typeof CARDIO_DOWNSAMPLE_ALL_POINTS
  | typeof CARDIO_DOWNSAMPLE_ONE_PER_SEC
  | typeof CARDIO_DOWNSAMPLE_EVERY_2_SEC;

export const CARDIO_INTERVAL_STORAGE_KEY = "cardio.dataInterval";

/** По умолчанию — 1 точка/2 сек (как API без параметра). */
export const CARDIO_INTERVAL_DEFAULT: CardioDataInterval = CARDIO_DOWNSAMPLE_EVERY_2_SEC;

export const CARDIO_INTERVAL_OPTIONS: {
  value: CardioDataInterval;
  label: string;
  hint: string;
}[] = [
  {
    value: CARDIO_DOWNSAMPLE_ALL_POINTS,
    label: "Все точки",
    hint: "Все GPS и датчики из FIT; может быть медленно",
  },
  {
    value: CARDIO_DOWNSAMPLE_ONE_PER_SEC,
    label: "1 точка/сек",
    hint: "downsample=0 — одна фиксация на секунду elapsed",
  },
  {
    value: CARDIO_DOWNSAMPLE_EVERY_2_SEC,
    label: "1 точка/2 сек",
    hint: "downsample=2 — баланс скорости и детализации (по умолчанию)",
  },
];

export function isAllPointsInterval(value: CardioDataInterval): boolean {
  return value === CARDIO_DOWNSAMPLE_ALL_POINTS;
}

export function loadCardioDataInterval(): CardioDataInterval {
  try {
    const raw = localStorage.getItem(CARDIO_INTERVAL_STORAGE_KEY);
    if (raw === "0" || raw === "1" || raw === "2") {
      return Number(raw) as CardioDataInterval;
    }
  } catch {
    /* ignore */
  }
  return CARDIO_INTERVAL_DEFAULT;
}

export function saveCardioDataInterval(value: CardioDataInterval): void {
  try {
    localStorage.setItem(CARDIO_INTERVAL_STORAGE_KEY, String(value));
  } catch {
    /* ignore */
  }
}
