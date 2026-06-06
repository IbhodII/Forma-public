/** Export/import/warmup polling can run many minutes; per-request timeout and DB-lock retries. */
export const LONG_TASK_TIMEOUT_MS = 300_000;

const DB_LOCK_RETRY_MS = 2000;
const DB_LOCK_MAX_ATTEMPTS = 150;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function responseDetailText(data: unknown): string {
  if (typeof data === "string") return data;
  if (typeof data === "object" && data !== null && "message" in data) {
    const msg = (data as { message?: unknown }).message;
    return typeof msg === "string" ? msg : "";
  }
  return "";
}

export function isDbLockedError(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  const res = (err as {
    response?: { status?: number; data?: { error_code?: string; detail?: unknown } };
  }).response;
  if (res?.status === 503) return true;
  if (res?.data?.error_code === "db_locked") return true;
  if (res?.data?.error_code === "import_in_progress") return true;
  const detailText = responseDetailText(res?.data?.detail);
  if (res?.status === 500 && detailText.toLowerCase().includes("locked")) return true;
  return detailText.toLowerCase().includes("database is locked");
}

export async function fetchWithDbLockRetry<T>(
  fetchFn: () => Promise<T>,
  maxAttempts = DB_LOCK_MAX_ATTEMPTS,
): Promise<T> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fetchFn();
    } catch (err) {
      if (!isDbLockedError(err) || attempt >= maxAttempts - 1) throw err;
      await sleep(DB_LOCK_RETRY_MS);
    }
  }
  throw new Error("База занята, повторите позже");
}
