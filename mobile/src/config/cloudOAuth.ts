import Constants from 'expo-constants';

export type CloudProvider = 'yandex' | 'google';

const DEFAULT_YANDEX_REDIRECT_URI = 'myhealthdashboard://oauth/yandex';
export const GOOGLE_REDIRECT_URI = 'myhealthdashboard://oauth/google';

type CloudOAuthExtra = {
  yandexClientId?: string;
  yandexRedirectUri?: string;
  googleClientId?: string;
  googleAndroidRedirectScheme?: string;
};

function readExtra(): CloudOAuthExtra {
  const extra = Constants.expoConfig?.extra as {cloudOAuth?: CloudOAuthExtra} | undefined;
  return extra?.cloudOAuth ?? {};
}

export function getYandexClientId(): string {
  return (
    process.env.EXPO_PUBLIC_YANDEX_CLIENT_ID?.trim() ||
    readExtra().yandexClientId?.trim() ||
    ''
  );
}

export function getYandexRedirectUri(): string {
  return (
    process.env.EXPO_PUBLIC_YANDEX_REDIRECT_URI?.trim() ||
    readExtra().yandexRedirectUri?.trim() ||
    DEFAULT_YANDEX_REDIRECT_URI
  );
}

/** OAuth 2.0 client ID (Web application) for Google Drive. */
export function getGoogleClientId(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim() ||
    readExtra().googleClientId?.trim() ||
    ''
  );
}

/**
 * Optional reversed Android client scheme, e.g. com.googleusercontent.apps.123456-abc
 * Used as redirect scheme when set; otherwise myhealthdashboard://oauth/google
 */
export function getGoogleAndroidRedirectScheme(): string {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_REDIRECT_SCHEME?.trim() ||
    readExtra().googleAndroidRedirectScheme?.trim() ||
    ''
  );
}

export function isNativeCloudConfigured(provider: CloudProvider): boolean {
  if (provider === 'yandex') {
    return Boolean(getYandexClientId() && getYandexRedirectUri());
  }
  return Boolean(getGoogleClientId());
}

export const YANDEX_REDIRECT_URI = getYandexRedirectUri();

export const CLOUD_BACKUP_FOLDER = 'FormaBackups';
