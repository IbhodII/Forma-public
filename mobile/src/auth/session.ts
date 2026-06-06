import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  normalizeOperatingMode,
  type OperatingMode,
} from '../mode/operatingMode';
import {clearYandexUid} from '../mode/yandexIdentity';

const USER_ID_KEY = 'mhd_user_id';
const USER_EMAIL_KEY = 'mhd_user_email';
const CLOUD_PROVIDER_KEY = 'mhd_cloud_provider';
const APP_MODE_KEY = 'mhd_app_mode';
const OPERATING_MODE_KEY = 'mhd_operating_mode';
const YANDEX_UID_KEY = 'mhd_yandex_uid';

/** @deprecated use operatingMode */
export type AppMode = 'api' | 'local_hc_test';

export type StoredSession = {
  userId: number;
  email?: string | null;
  cloudProvider?: string | null;
  /** @deprecated migrated to operatingMode */
  appMode?: AppMode;
  operatingMode?: OperatingMode;
  yandexUid?: string | null;
};

export function isLocalHcTestMode(session: StoredSession | null | undefined): boolean {
  return (
    session?.operatingMode === 'local_hc_test' || session?.appMode === 'local_hc_test'
  );
}

export function isApiMode(session: StoredSession | null | undefined): boolean {
  return session != null && !isLocalHcTestMode(session);
}

export async function getStoredOperatingMode(): Promise<OperatingMode | null> {
  const raw = await AsyncStorage.getItem(OPERATING_MODE_KEY);
  if (raw) {
    return normalizeOperatingMode(raw);
  }
  const legacy = await getStoredAppMode();
  if (legacy === 'local_hc_test') {
    return 'local_hc_test';
  }
  if (legacy === 'api') {
    return 'legacy_api';
  }
  return null;
}

export async function getStoredAppMode(): Promise<AppMode | null> {
  const mode = await getStoredOperatingMode();
  if (mode === 'local_hc_test') {
    return 'local_hc_test';
  }
  if (mode === 'legacy_api') {
    return 'api';
  }
  const raw = await AsyncStorage.getItem(APP_MODE_KEY);
  if (raw === 'local_hc_test' || raw === 'api') {
    return raw;
  }
  return null;
}

export async function getStoredSession(): Promise<StoredSession | null> {
  let idRaw = await AsyncStorage.getItem(USER_ID_KEY);
  if (!idRaw) {
    const legacy = await AsyncStorage.getItem('user_id');
    if (!legacy) {
      return null;
    }
    await AsyncStorage.setItem(USER_ID_KEY, legacy);
    idRaw = legacy;
  }
  const userId = Number(idRaw);
  if (!Number.isFinite(userId) || userId < 1) {
    return null;
  }
  const operatingMode =
    (await getStoredOperatingMode()) ??
    normalizeOperatingMode(null, (await AsyncStorage.getItem(APP_MODE_KEY)) ?? 'api');
  const legacyAppMode: AppMode =
    operatingMode === 'local_hc_test' ? 'local_hc_test' : 'api';
  return {
    userId,
    email: await AsyncStorage.getItem(USER_EMAIL_KEY),
    cloudProvider: await AsyncStorage.getItem(CLOUD_PROVIDER_KEY),
    appMode: legacyAppMode,
    operatingMode,
    yandexUid: await AsyncStorage.getItem(YANDEX_UID_KEY),
  };
}

export async function saveSession(session: StoredSession): Promise<void> {
  const operatingMode =
    session.operatingMode ??
    (session.appMode === 'local_hc_test' ? 'local_hc_test' : 'legacy_api');
  const legacyAppMode: AppMode =
    operatingMode === 'local_hc_test' ? 'local_hc_test' : 'api';

  await AsyncStorage.setItem(USER_ID_KEY, String(session.userId));
  await AsyncStorage.setItem('user_id', String(session.userId));
  await AsyncStorage.setItem(APP_MODE_KEY, legacyAppMode);
  await AsyncStorage.setItem(OPERATING_MODE_KEY, operatingMode);
  if (session.email) {
    await AsyncStorage.setItem(USER_EMAIL_KEY, session.email);
  } else {
    await AsyncStorage.removeItem(USER_EMAIL_KEY);
  }
  if (session.cloudProvider) {
    await AsyncStorage.setItem(CLOUD_PROVIDER_KEY, session.cloudProvider);
  } else {
    await AsyncStorage.removeItem(CLOUD_PROVIDER_KEY);
  }
  if (session.yandexUid) {
    await AsyncStorage.setItem(YANDEX_UID_KEY, session.yandexUid);
  }
}

export async function clearSession(): Promise<void> {
  await AsyncStorage.multiRemove([
    USER_ID_KEY,
    USER_EMAIL_KEY,
    CLOUD_PROVIDER_KEY,
    APP_MODE_KEY,
    OPERATING_MODE_KEY,
    'user_id',
  ]);
  await clearYandexUid();
}
