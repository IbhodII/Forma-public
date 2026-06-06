let syncInFlight = false;

export function isFormaSyncInFlight(): boolean {
  return syncInFlight;
}

export async function withFormaSyncLock<T>(fn: () => Promise<T>): Promise<T> {
  if (syncInFlight) {
    throw new Error('Синхронизация уже выполняется');
  }
  syncInFlight = true;
  try {
    return await fn();
  } finally {
    syncInFlight = false;
  }
}
