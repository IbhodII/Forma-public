/** Optional load lifecycle logging for diagnosing stuck spinners. */

function enabled(): boolean {
  return __DEV__ || process.env.EXPO_PUBLIC_LOAD_DEBUG === '1';
}

function fmtMeta(meta?: Record<string, unknown>): string {
  if (!meta || Object.keys(meta).length === 0) {
    return '';
  }
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return '';
  }
}

export function logLoadStart(block: string, meta?: Record<string, unknown>): void {
  if (!enabled()) return;
  console.log(`[load] start ${block}${fmtMeta(meta)}`);
}

export function logLoadEnd(block: string, meta?: Record<string, unknown>): void {
  if (!enabled()) return;
  console.log(`[load] end ${block}${fmtMeta(meta)}`);
}

export function logLoadError(block: string, err: unknown): void {
  if (!enabled()) return;
  console.warn(`[load] error ${block}`, err);
}

export function logLoadTimeout(block: string, ms: number): void {
  if (!enabled()) return;
  console.warn(`[load] timeout ${block} after ${ms}ms`);
}

export function logLoadReset(block: string): void {
  if (!enabled()) return;
  console.log(`[load] reset ${block}`);
}
