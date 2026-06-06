const DEFAULT_CIRCUIT_KEY = "strength_default_circuit";
const BY_TYPE_KEY = "strength_circuit_by_type";

function readByTypeMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(BY_TYPE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof k === "string" && k.trim()) {
        out[k.trim()] = v === true || v === "1" || v === 1;
      }
    }
    return out;
  } catch {
    return {};
  }
}

function writeByTypeMap(map: Record<string, boolean>): void {
  try {
    localStorage.setItem(BY_TYPE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

/** Глобальный дефолт (вкладка «Набор упражнений»). */
export function loadDefaultCircuitMode(): boolean {
  try {
    return localStorage.getItem(DEFAULT_CIRCUIT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveDefaultCircuitMode(enabled: boolean): void {
  try {
    localStorage.setItem(DEFAULT_CIRCUIT_KEY, enabled ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Режим круга для типа тренировки (последний выбор пользователя). */
export function loadCircuitModeForWorkoutType(workoutTitle: string): boolean | null {
  const key = workoutTitle.trim();
  if (!key) return null;
  const map = readByTypeMap();
  if (!(key in map)) return null;
  return map[key];
}

export function saveCircuitModeForWorkoutType(workoutTitle: string, enabled: boolean): void {
  const key = workoutTitle.trim();
  if (!key) return;
  const map = readByTypeMap();
  map[key] = enabled;
  writeByTypeMap(map);
  saveDefaultCircuitMode(enabled);
}

export function resolveInitialCircuitMode(workoutTitle: string): boolean {
  const perType = loadCircuitModeForWorkoutType(workoutTitle);
  if (perType !== null) return perType;
  return loadDefaultCircuitMode();
}
