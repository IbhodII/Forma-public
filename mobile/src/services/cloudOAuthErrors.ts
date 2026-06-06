export type CloudOAuthFailureReason =
  | 'user_cancelled'
  | 'dismiss_no_callback'
  | 'redirect_mismatch'
  | 'access_denied'
  | 'no_token'
  | 'token_exchange_failed'
  | 'provider_error'
  | 'misconfigured';

export class CloudOAuthError extends Error {
  readonly reason: CloudOAuthFailureReason;
  readonly detail?: string;

  constructor(reason: CloudOAuthFailureReason, message: string, detail?: string) {
    super(message);
    this.name = 'CloudOAuthError';
    this.reason = reason;
    this.detail = detail;
  }
}

export function cloudOAuthUserMessage(err: unknown): string {
  if (err instanceof CloudOAuthError) {
    if (err.reason === 'redirect_mismatch') {
      return `${err.message} Проверьте EXPO_PUBLIC_YANDEX_REDIRECT_URI и intent-filter (scheme/host/path).`;
    }
    if (err.reason === 'dismiss_no_callback') {
      return `${err.message} Браузер не вернул deep link в приложение.`;
    }
    if (err.reason === 'token_exchange_failed') {
      return `${err.message} Client secret в мобильном приложении не используется; должен работать PKCE.`;
    }
    return err.message;
  }
  if (err instanceof Error && err.message.trim()) {
    if (err.name === 'TimeoutError' || err.message.startsWith('Timeout:')) {
      return 'Авторизация заняла слишком много времени. Повторите попытку.';
    }
    return err.message;
  }
  return 'Ошибка авторизации облака';
}
