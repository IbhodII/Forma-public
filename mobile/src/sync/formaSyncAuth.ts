import {
  setFormaSyncLastError,
  setFormaSyncTokenExpired,
} from './syncMeta';

export {isFormaSyncTokenExpired} from './syncMeta';

export function isYandexTokenExpiredError(err: unknown): boolean {
  if (!(err instanceof Error)) {
    return false;
  }
  if (err.message === 'YANDEX_TOKEN_EXPIRED') {
    return true;
  }
  const status = (err as Error & {status?: number}).status;
  return status === 401 || /401/.test(err.message);
}

export async function recordFormaSyncAuthFailure(err: unknown): Promise<boolean> {
  if (!isYandexTokenExpiredError(err)) {
    return false;
  }
  await setFormaSyncTokenExpired(true);
  return true;
}

export async function clearFormaSyncAuthFailure(): Promise<void> {
  await setFormaSyncTokenExpired(false);
  await setFormaSyncLastError(null);
}
