import {isNativeCloudConfigured} from '../config/cloudOAuth';
import {CloudOAuthError} from '../services/cloudOAuthErrors';
const OFFLINE_MSG = 'OFFLINE';

/** Actionable Russian messages for release builds (no bare "Network Error"). */

export function missingYandexClientIdHelp(): string {
  return (
    'OAuth Яндекса не настроен в этой сборке APK. Скопируйте mobile/.env.example → mobile/.env, ' +
    'задайте EXPO_PUBLIC_YANDEX_CLIENT_ID и EXPO_PUBLIC_YANDEX_REDIRECT_URI, зарегистрируйте Redirect URI myhealthdashboard://oauth/yandex ' +
    'и пересоберите: npm run android:release'
  );
}

/** Safe string for UI — never returns "[object Object]". */
export function errorToDisplay(err: unknown): string {
  if (err == null) {
    return 'Неизвестная ошибка';
  }
  if (err instanceof Error) {
    return err.message || 'Неизвестная ошибка';
  }
  if (typeof err === 'string') {
    return err;
  }
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    if (typeof o.message === 'string' && o.message.trim()) {
      const code = typeof o.code === 'string' || typeof o.code === 'number' ? ` (${o.code})` : '';
      return `${o.message}${code}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return 'Неизвестная ошибка';
    }
  }
  return String(err);
}

export function formatUserFacingError(err: unknown): string {
  if (err == null) {
    return 'Неизвестная ошибка';
  }

  const msg = errorToDisplay(err);
  const lower = msg.toLowerCase();

  if (msg === OFFLINE_MSG || lower.includes('offline')) {
    return 'Нет подключения к интернету. Данные на устройстве сохранены; синхронизация продолжится при сети.';
  }

  if (lower.includes('expo_public_yandex') || lower.includes('client_id')) {
    return missingYandexClientIdHelp();
  }

  if (!isNativeCloudConfigured('yandex') && lower.includes('oauth')) {
    return missingYandexClientIdHelp();
  }

  if (err instanceof CloudOAuthError) {
    return err.message;
  }

  if (lower.includes('вход отменён пользователем')) {
    return msg;
  }

  if (lower.includes('не получен callback')) {
    return msg;
  }

  if (lower.includes('redirect uri не совпадает')) {
    return msg;
  }

  if (lower.includes('вход отменён') || (lower.includes('авторизация') && lower.includes('отмен'))) {
    return msg;
  }

  if (lower.includes('network request failed') || lower.includes('failed to fetch')) {
    return `Сеть недоступна: ${msg}. Проверьте Wi‑Fi или мобильный интернет.`;
  }

  if (lower.includes('не задан адрес api')) {
    return msg;
  }

  if (lower.includes('sha256') || lower.includes('checksum') || lower.includes('corrupt')) {
    return `${msg} Локальная база не изменена — попробуйте повторить загрузку с Диска.`;
  }

  if (lower.includes('permission') || lower.includes('разрешен')) {
    return `${msg} Откройте настройки Android → Health Connect → разрешения для Forma.`;
  }

  if (lower.includes('нет локальных данных') || lower.includes('nothing to upload')) {
    return msg;
  }

  return msg;
}
