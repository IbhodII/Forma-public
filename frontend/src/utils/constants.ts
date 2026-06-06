export const PAGE_SIZE = 20;

/** Fallback when API has no presets — no built-in strength types (Desktop v1). */
export const WORKOUT_TYPES = [] as const;

/** Значение type в БД */
export const CARDIO_BIKE = "вело";
export const CARDIO_POOL = "бассейн";
export const CARDIO_RUN = "бег";

/** data_source в cardio_workouts после import_polar_historical.py */
export const CARDIO_SOURCE_POLAR = "polar_historical";
export const CARDIO_SOURCE_FIT = "fit_coospo";

/** Подпись в интерфейсе */
export const CARDIO_BIKE_LABEL = "Велосипед";

export function cardioTypeLabel(dbType: string): string {
  if (dbType === CARDIO_BIKE) return CARDIO_BIKE_LABEL;
  return dbType;
}

/** Порядок подвкладок кардио (бег — в конце) */
export const CARDIO_TAB_ORDER = [CARDIO_BIKE, CARDIO_POOL, CARDIO_RUN] as const;

/** Префикс id архивной вкладки кардио в URL */
export const CARDIO_ARCHIVED_TAB_PREFIX = "cardio-archived:";

/** Allowed manual cardio types (backend ALLOWED_CARDIO_TYPES) */
export const CARDIO_TYPES = [...CARDIO_TAB_ORDER] as const;

/** id служебных вкладок на странице «Тренировки» */
export const WORKOUTS_EXERCISES_TAB = "exercises";
export const WORKOUTS_PRESETS_TAB = "presets";

/** Подпись вкладки на странице «Тренировки» */
export function cardioTabLabel(dbType: string): string {
  if (dbType === CARDIO_BIKE) return CARDIO_BIKE_LABEL;
  if (dbType === CARDIO_POOL) return "Бассейн";
  if (dbType === CARDIO_RUN) return "Бег";
  return cardioTypeLabel(dbType);
}
