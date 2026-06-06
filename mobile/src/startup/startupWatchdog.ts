/** Time-bounded async helpers for cold start / onboarding gates. */

export const STARTUP_WATCHDOG_MS = 5000;
export const ONBOARDING_HYDRATE_MS = 3000;
export const BOOTSTRAP_AUTH_MS = 5000;
export const ONBOARDING_PC_SYNC_MS = 5000;

export class StartupWatchdogError extends Error {
  readonly label: string;

  constructor(label: string, message = `Timeout: ${label}`) {
    super(message);
    this.name = 'StartupWatchdogError';
    this.label = label;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new StartupWatchdogError(label));
    }, ms);
    promise
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
}
