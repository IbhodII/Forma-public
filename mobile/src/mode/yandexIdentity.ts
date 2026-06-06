import AsyncStorage from '@react-native-async-storage/async-storage';

const YANDEX_UID_KEY = 'mhd_yandex_uid';

export type YandexIdentity = {
  yandexUid: string;
  displayName?: string | null;
  login?: string | null;
};

export async function getStoredYandexUid(): Promise<string | null> {
  return AsyncStorage.getItem(YANDEX_UID_KEY);
}

export async function saveYandexUid(uid: string): Promise<void> {
  await AsyncStorage.setItem(YANDEX_UID_KEY, uid);
}

export async function clearYandexUid(): Promise<void> {
  await AsyncStorage.removeItem(YANDEX_UID_KEY);
}

/** Fetch stable uid from Yandex Disk API (same as desktop cloud_identity_service). */
export async function fetchYandexIdentity(accessToken: string): Promise<YandexIdentity> {
  const res = await fetch('https://cloud-api.yandex.net/v1/disk/', {
    headers: {
      Authorization: `OAuth ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Yandex Disk HTTP ${res.status}`);
  }
  const data = (await res.json()) as {
    user?: {uid?: string | number; login?: string; display_name?: string};
  };
  const user = data.user;
  if (!user) {
    throw new Error('Yandex Disk не вернул профиль пользователя');
  }
  const uid = String(user.uid ?? user.login ?? '').trim();
  if (!uid) {
    throw new Error('Не удалось определить yandex_uid');
  }
  await saveYandexUid(uid);
  return {
    yandexUid: uid,
    displayName: user.display_name ?? null,
    login: user.login ?? null,
  };
}
