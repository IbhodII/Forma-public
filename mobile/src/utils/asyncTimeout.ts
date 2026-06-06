/** Promise timeout helper for mobile data loads and OAuth. */

export class TimeoutError extends Error {
  readonly label: string;

  constructor(label: string, ms: number) {
    super(`Timeout: ${label} (${ms}ms)`);
    this.name = 'TimeoutError';
    this.label = label;
  }
}

export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = 'operation',
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new TimeoutError(label, ms));
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

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
